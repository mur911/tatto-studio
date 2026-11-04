import processes
"""Build all named folders into one CCXL mod; update its Vortex staging copy."""
import copy,hashlib,json,pathlib,re,shutil,subprocess,threading,time,zipfile
import library,settings,profiles,publishstate,resource_session
import tattoo_regions
import snapshot_identity
from render_versions import WARP_VERSION,stale_warp
from storage_paths import BAKED_TEXTURES_NAME
from native_compression import ensure_native_codec, verify_texture, TEXTURE_CODEC_VERSION
from texture_padding import PADDING_VERSION,write_padded_png
from xml.sax.saxutils import escape

ROOT=pathlib.Path(__file__).parent.resolve();WORK=settings.DATA_ROOT/'library-build'
CLI=settings.CLI
OLD=r'tatto_studio\diy_tattoo_rb_v01';BASE=r'tatto_studio\tattoo_library_v03'
ARCHIVE='tatto_studio_tattoo_library.archive';MARKER='tatto_studio_tattoo_library.owner.json'
OWNER='tatto_studio-tattoo-library-v03';PUBLISH_LOCK=threading.Lock()
STAGING=settings.STAGING
OUTPUT=settings.OUTPUT
TEXTURE_PIPELINE_VERSION=TEXTURE_CODEC_VERSION+':'+PADDING_VERSION

def run(args,log):
    ensure_native_codec(settings.GAME)
    p=processes.run([str(CLI)]+list(map(str,args)),capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=1200 if args[0]=='import' else 240)
    with log.open('a',encoding='utf-8') as f:f.write(p.stdout+p.stderr+'\n')
    if p.returncode or re.search(r'\bError\b',p.stdout) or "Oodle couldn't be loaded" in p.stdout+p.stderr:raise RuntimeError('资源构建失败，请查看 library-build/build.log')

def valid_resource(path,stamp,expected):
    try:
        value=json.loads(stamp.read_text(encoding='utf-8'))
        return value['source']==expected and resource_session.sha(path)==value['sha256']
    except (OSError,ValueError,KeyError,TypeError):return False

def resource_stamp(path,stamp,expected):
    library.atomic(stamp,{'source':expected,'sha256':resource_session.sha(path)})

def valid_cache(folder):
    try:
        checks=json.loads((folder/'resource-checksums.json').read_text(encoding='utf-8'))
        return bool(checks) and all(resource_session.sha(folder/'source'/name)==digest for name,digest in checks.items())
    except (OSError,ValueError,KeyError):return False


def rewrite(value,prefix,slug,id_offset):
    if isinstance(value,str):
        if value.startswith('7812330769892') and value.isdecimal():return str(int(value)+id_offset)
        return value.replace(OLD,prefix).replace('tatto_studio_diy_rb',slug)
    if isinstance(value,list):return [rewrite(v,prefix,slug,id_offset) for v in value]
    if isinstance(value,dict):return {k:rewrite(v,prefix,slug,id_offset) for k,v in value.items()}
    return value

def installed_targets():
    return publishstate.targets()


def cname(value):return {'$type':'CName','$storage':'string','$value':value}

def publish(progress=lambda _:None, *, acknowledgment=None):
    if not PUBLISH_LOCK.acquire(blocking=False):raise ValueError('已有发布任务，请等待')
    session=resource_session.begin()
    try:
        comparison=snapshot_identity.authorize(library,acknowledgment)
        # Validate dependency provenance before considering reuse of the whole package.
        for ident in sorted({c['model'] for c in comparison['checks']}):profiles.prepare(ident,progress)
        installed_targets()  # Resolve ambiguity before any conversion work.
        publishstate.bootstrap()
        signature=publishstate.fingerprint(library,ROOT,profiles.VERSION,TEXTURE_PIPELINE_VERSION+':warp-'+str(WARP_VERSION))
        previous=publishstate.verified()
        if previous and previous[1].get('fingerprint')==signature:
            progress('Reusing the last successful game library…')
            restored=publishstate.restore()
            old=WORK/'last-publish.json'
            result=json.loads(old.read_text(encoding='utf-8')) if old.is_file() else {}
            result['snapshot_comparison']=comparison
            result.update(package=str(OUTPUT),updated_staging=restored['restored'],library_installed=bool(publishstate.targets()),publish_target=str(publishstate.targets()[0]),reused=True,timestamp=time.time())
            return result
        result=_publish(progress,include_collector=False)
        # The collector or library may have changed during a lengthy build.
        final=snapshot_identity.authorize(library,acknowledgment)
        if final['signature']!=comparison['signature']:
            raise ValueError('The character snapshot changed during publishing. Review it and try again.')
        result['snapshot_comparison']=final
        signature=publishstate.fingerprint(library,ROOT,profiles.VERSION,TEXTURE_PIPELINE_VERSION+':warp-'+str(WARP_VERSION))
        selected=publishstate.targets()
        result['updated_staging']=publishstate.deploy(result['package'],selected)
        result['library_installed']=bool(selected)
        result['publish_target']=str(selected[0]) if len(selected)==1 else ''
        if len(selected)==1:publishstate.confirm(selected[0])
        publishstate.checkpoint(result['package'],signature)
        library.atomic(WORK/'last-publish.json',result)
        publishstate.prune_build_cache(WORK)
        return result
    finally:
        resource_session.end(session)
        PUBLISH_LOCK.release()

def _publish(progress,*,library_api=None,work=None,output=None,standalone_id=None,update_staging=True,include_collector=False):
    # Inject an isolated one-design library for standalone export. Never swap
    # module globals: normal requests must keep seeing the user's real library.
    library=library_api if library_api is not None else globals()['library']
    WORK=pathlib.Path(work) if work is not None else globals()['WORK']
    OUTPUT=pathlib.Path(output) if output is not None else globals()['OUTPUT']
    BASE=globals()['BASE'] if standalone_id is None else 'tatto_studio\\tattoo_standalone_'+standalone_id
    ARCHIVE=globals()['ARCHIVE'] if standalone_id is None else 'twb_'+standalone_id+'.archive'
    if standalone_id is not None and (update_staging or not re.fullmatch(r'[0-9a-f]{16}',standalone_id)):
        raise ValueError('独立模组导出不能更新纹身库暂存目录')
    # Keep one visible selector per folder, with native linked selectors for
    # render scopes that belong to a different character part.
    publication_groups=[];model_genders={}
    for group in library.groups():
        gender_designs={'female':[],'male':[]};domains={'female':set(),'male':set()}
        group_meta=json.loads((library.group_folder(group['id'])/'group.json').read_text(encoding='utf-8'))
        for design in group['designs']:
            if not design['enabled'] or design.get('draft'):continue
            data=library.load(group['id'],design['id'])
            if stale_warp(data):raise ValueError('设计“'+design['title']+'”需要重新保存曲面贴合贴图，请打开设计后保存，再更新游戏纹身库。')
            ident=data.get('model',{}).get('id','')
            if not re.fullmatch(r'character-[0-9a-f]{12}',ident):
                raise ValueError('设计“'+design['title']+'”使用了导入模型，其游戏纹身层尚未适配；请先停用该设计的发布勾选。')
            if ident not in model_genders:model_genders[ident]=profiles.gender(ident)
            body_gender=model_genders[ident];gender_designs[body_gender].append(design)
            meta=tattoo_regions.update_metadata(profiles.model_folder(ident))
            if any(p.get('tattooExcludedRanges') for p in meta['parts']) and data.get('bakeVersion',0)<tattoo_regions.MIN_BAKE_VERSION:
                raise ValueError('设计“'+design['title']+'”需要重新烘焙肩部贴图。请刷新编辑器后点击“更新游戏纹身库”，会自动重新烘焙。')
            for file in (library.design_path(group['id'],design['id']).parent/BAKED_TEXTURES_NAME).glob('*.png'):
                if resource_session.ink(file):domains[body_gender].add('head' if file.stem.split('_')[0] in ('head','neck') else 'body')
        for body_gender,designs in gender_designs.items():
            if not designs:continue
            previous=group_meta.get('last_domains',{}).get(body_gender,group_meta.get('last_domain','body'))
            selector_domain=('body' if 'body' in domains[body_gender] else 'head') if domains[body_gender] else previous
            publication_groups.append({**group,'designs':designs,'body_gender':body_gender,'selector_domain':selector_domain})
    WORK.mkdir(exist_ok=True);log=WORK/'build.log';log.write_text('',encoding='utf-8')
    source=WORK/'source';source.mkdir(exist_ok=True)
    # Fresh build generation avoids keeping removed designs in the published archive.
    generation=WORK/('generation-'+str(time.time_ns()));generation.mkdir()
    source=generation/'source';source.mkdir()
    templates=ROOT/'templates/json'
    infos={};group_maps={};head_group_maps={}
    for body_gender in ('female','male'):
        info=json.loads((templates/'diy_pwa.inkcharcustomization.json').read_text(encoding='utf-8'))
        root=info['Data']['RootChunk'];root['bodyCustomizationOptions']=[];root['bodyGroups']=[];root['headCustomizationOptions']=[];root['headGroups']=[]
        infos[body_gender]=info;group_maps[body_gender]={};head_group_maps[body_gender]={}
    all_slugs=[];report=[];handle=0;captured_aliases=[]
    for group in publication_groups:
        body_gender=group['body_gender'];root=infos[body_gender]['Data']['RootChunk']
        group_map=group_maps[body_gender];head_group_map=head_group_maps[body_gender]
        designs=[d for d in group['designs'] if d['enabled'] and not d.get('draft')]
        if not designs:continue
        group_id=group['id'];gp=library.group_folder(group_id)
        meta=json.loads((gp/'group.json').read_text(encoding='utf-8'))
        if meta.get('last_domains',{}).get(body_gender)!=group['selector_domain']:
            meta.setdefault('last_domains',{})[body_gender]=group['selector_domain']
            if body_gender=='female' or 'last_domain' not in meta:meta['last_domain']=group['selector_domain']
            library.atomic(gp/'group.json',meta)
        if 'switch_index' not in meta:
            # Persist assigned numeric indices; folder renames never change identity.
            used=[]
            for other in library.groups():
                m=json.loads((library.group_folder(other['id'])/'group.json').read_text(encoding='utf-8'))
                if 'switch_index' in m:used.append(m['switch_index'])
            meta['switch_index']=max(used,default=3599)+1;library.atomic(gp/'group.json',meta)
        template_info=json.loads((templates/'diy_pwa.inkcharcustomization.json').read_text(encoding='utf-8'))['Data']['RootChunk']
        # Keep existing female names stable for saved games. Male selectors
        # have a separate identity and never reference female mesh variants.
        group_slug='tatto_studio_lib_'+group_id+('_male' if body_gender=='male' else '')
        group_domain=group['selector_domain'];switches={};group_options={};off_names={}
        for scope in ('body','head'):
            switch=copy.deepcopy(template_info['bodyCustomizationOptions'][0]['Data'])
            identity=group_slug+('' if scope==group_domain else '_'+scope)
            switch['localizedName']=group['name'];switch['index']=meta['switch_index'];switch['name']=cname(identity+'_switch')
            switch['uiSlot']=cname(identity+'_switcher');switch['uiSlots']=[];switch['options']=[]
            switch['hidden']=int(scope!=group_domain)
            switch['enabled']=1
            switches[scope]=switch;group_options[scope]=[];off_names[scope]=[]
        for i,design in enumerate(designs):
            data=library.load(group_id,design['id']);design_file=library.design_path(group_id,design['id'])
            if 'game_option_index' not in data:
                used_indices=[library.load(group_id,d['id']).get('game_option_index',0) for d in group['designs']]
                data['game_option_index']=max(used_indices,default=0)+1
                library.atomic(design_file,data)
            model=data.get('model',{})
            captured=bool(re.fullmatch(r'character-[0-9a-f]{12}',model.get('id','')))
            if not captured:
                raise ValueError('设计“'+design['title']+'”使用了导入模型，其游戏纹身层尚未适配；请先停用该设计的发布勾选。')
            atlases=design_file.parent/BAKED_TEXTURES_NAME
            atlas_parts=('body','left_arm','right_arm');design_templates=templates;domain='body';option_domain='body'
            if captured:
                generated=WORK/'profiles'/model['id']/group_id/design['id']
                manifest=profiles.generate(model['id'],atlases,generated,progress,allow_blank=library.hidden_only(data),blank_domain=group_domain)
                if manifest['body_gender']!=body_gender:raise ValueError('角色快照包含互相冲突的身体类型，请重新读取完整角色快照。')
                atlas_parts=manifest['atlases'];design_templates=generated;domain=manifest['domain'];option_domain=manifest.get('option_domain',domain)
            template_info=json.loads((design_templates/'diy_pwa.inkcharcustomization.json').read_text(encoding='utf-8'))['Data']['RootChunk']
            template_options=template_info[option_domain+'CustomizationOptions']
            if not all((atlases/(p+'.png')).exists() for p in atlas_parts):raise ValueError('请在编辑器打开并重新保存设计：'+design['title'])
            prefix=BASE+'\\'+group_id+'\\'+design['id'];slug=group_slug+'_'+design['id'];all_slugs.append(slug)
            if captured:
                captured_aliases.extend([{**a,'overlay':a['overlay'].replace('tatto_studio_diy_rb',slug)} for a in manifest['aliases']])
            offset=(int(hashlib.sha256(slug.encode()).hexdigest()[:10],16)+1)*1000
            cache=WORK/'cache'/group_id/design['id'];cache.mkdir(parents=True,exist_ok=True)
            if captured:
                cache=cache/(model['id']+'-v'+str(manifest.get('cache_version',profiles.VERSION))+'-'+hashlib.sha256(','.join(atlas_parts).encode()).hexdigest()[:8]);cache.mkdir(exist_ok=True)
            atlas_hashes={p:resource_session.sha(atlases/(p+'.png')) for p in atlas_parts}
            template_hash=hashlib.sha256(b''.join(f.name.encode()+resource_session.read(f) for f in sorted(design_templates.glob('*.json')))).hexdigest()
            digest=hashlib.sha256((TEXTURE_PIPELINE_VERSION+template_hash+json.dumps(atlas_hashes,sort_keys=True)).encode()).hexdigest()
            if not (cache/'stamp').exists() or (cache/'stamp').read_text()!=digest or not valid_cache(cache):
                progress('准备 '+group['name']+' / '+design['title'])
                geometry_jobs=[];json_input=cache/'json-input';flat_output=cache/'cooked-flat'
                json_input.mkdir(exist_ok=True);flat_output.mkdir(exist_ok=True)
                for file in design_templates.glob('*.json'):
                    if not file.name.endswith(('.app.json','.mesh.json','.morphtarget.json')):continue
                    relative=('appearances/' if file.name.endswith('.app.json') else 'meshes/')+file.name[:-5]
                    cooked=cache/'source'/prefix/relative
                    geometry_stamp=cooked.with_suffix(cooked.suffix+'.template-hash')
                    if cooked.exists() and geometry_stamp.exists() and geometry_stamp.read_text(encoding='utf-8')==template_hash:continue
                    doc=rewrite(json.loads(file.read_text(encoding='utf-8')),prefix,slug,offset)
                    cooked.parent.mkdir(parents=True,exist_ok=True)
                    doc['Header']['ArchiveFileName']=str(cooked)
                    jp=json_input/(file.name);jp.write_text(json.dumps(doc,ensure_ascii=False),encoding='utf-8')
                    geometry_jobs.append((flat_output/file.name[:-5],cooked))
                if geometry_jobs:
                    run(['cr2w',json_input,'-d','-o',flat_output,'-v','Normal'],log)
                    for built,cooked in geometry_jobs:
                        if not built.exists():raise RuntimeError('批量构建缺少资源：'+built.name)
                        shutil.copyfile(built,cooked)
                        resource_stamp(cooked,cooked.with_suffix(cooked.suffix+'.template-hash'),template_hash)
                tex=cache/'source'/prefix/'textures';tex.mkdir(exist_ok=True)
                texture_jobs=[]
                for part in atlas_parts:
                    texture_hash=TEXTURE_PIPELINE_VERSION+':'+atlas_hashes[part]
                    texture_stamp=cache/(part+'.texture-hash')
                    if valid_resource(tex/(part+'.xbm'),texture_stamp,texture_hash):continue
                    progress('转换 '+design['title']+' / '+part)
                    template=ROOT/'templates/source'/OLD/'textures'/((part if not captured else 'body')+'.xbm')
                    if not template.exists():template=settings.TEXTURES/((part if not captured else 'body')+'.xbm')
                    shutil.copyfile(template,tex/(part+'.xbm'))
                    texture_jobs.append((part,texture_hash))
                if texture_jobs:
                    inputs=[]
                    for part,_ in texture_jobs:
                        progress('补齐纹身接缝：'+design['title']+' / '+part)
                        padded=cache/'padded-input'/(part+'.png')
                        write_padded_png(atlases/(part+'.png'),profiles.model_folder(model['id']),part,padded,WORK/'uv-padding'/model['id'])
                        inputs.append(padded)
                    run(['import',*inputs,'-o',tex,'-k','-v','Normal'],log)
                    for part,texture_hash in texture_jobs:
                        verify_texture(tex/(part+'.xbm'),settings.GAME)
                        resource_stamp(tex/(part+'.xbm'),cache/(part+'.texture-hash'),texture_hash)
                checks={f.relative_to(cache/'source').as_posix():resource_session.sha(f) for f in (cache/'source').rglob('*') if f.is_file() and not f.name.endswith('.template-hash')}
                library.atomic(cache/'resource-checksums.json',checks)
                (cache/'stamp').write_text(digest)
            shutil.copytree(cache/'source',source,dirs_exist_ok=True,ignore=shutil.ignore_patterns('*.template-hash'))
            for scope in ('body','head'):
                switch=switches[scope]
                scoped=template_info[scope+'CustomizationOptions']
                # Every linked selector needs the same indices, including a
                # clear-only choice when this design has no ink in its scope.
                chosen=copy.deepcopy(template_options[0]['Data']['options'][0]);chosen['names']=[]
                if scoped:
                    options=rewrite(scoped[1:],prefix,slug,offset)
                    off_names[scope].extend(o['Data']['name']['$value'] for o in options if o['Data']['name']['$value'].endswith('_off'))
                    for o in options:
                        o['HandleId']=str(handle);handle+=1;group_options[scope].append(o)
                        slot=o['Data']['uiSlot']
                        if slot not in switch['uiSlots']:switch['uiSlots'].append(slot)
                    chosen=rewrite(scoped[0]['Data']['options'][1],prefix,slug,offset)
                    template_switch=rewrite(scoped[0]['Data']['name'],prefix,slug,offset)
                    for bg in rewrite(template_info[scope+'Groups'],prefix,slug,offset):
                        key=bg['name']['$value']
                        target=(head_group_map if scope=='head' else group_map).setdefault(key,{'$type':'gameuiOptionsGroup','name':cname(key),'options':[]})
                        for opt in bg['options']:
                            if opt==template_switch:opt=switch['name']
                            if opt not in target['options']:target['options'].append(opt)
                chosen['localizedName']=design['title'];chosen['index']=data['game_option_index']
                switch['options'].append(chosen)
            report.append({'folder':group['name'],'folder_id':group_id,'design':design['title'],'design_id':design['id'],'component_prefix':slug,'model':model.get('id','rb'),'body_gender':body_gender,'domain':domain,'selector_domain':group_domain,'experimental':captured,'overlay_profile_version':manifest['cache_version'] if captured else None,'resource_identity':manifest.get('resource_identity'),'deformation':manifest.get('deformation')})
        linked=all(group_options.values())
        for scope,switch in switches.items():
            if not group_options[scope]:continue
            if linked:
                switch['link']=cname(group_slug+'_selection_link')
                switch['linkController']=int(scope==group_domain)
            for option in switch['options']:
                active={n['$value'] for n in option['names']}
                # Clear other variants only within the same render scope.
                option['names'] += [cname(n) for n in off_names[scope] if n.rsplit('_off',1)[0]+'_on' not in active and n not in active]
            empty=copy.deepcopy(template_options[0]['Data']['options'][0]);empty['names']=[cname(n) for n in off_names[scope]]
            switch['options'].sort(key=lambda o:o['index'])
            switch['options'].insert(0,empty)
            root[scope+'CustomizationOptions'].append({'HandleId':str(handle),'Data':switch});handle+=1
            root[scope+'CustomizationOptions'].extend(group_options[scope])
    # An empty library is valid: the collector remains installed without demo menus.
    customizations={}
    progress('生成义体医生分组选项…')
    for body_gender,info in infos.items():
        if publication_groups and not any(g['body_gender']==body_gender for g in publication_groups):continue
        if not publication_groups and body_gender=='male':continue
        root=info['Data']['RootChunk'];root['bodyGroups']=list(group_maps[body_gender].values());root['headGroups']=list(head_group_maps[body_gender].values())
        filename='library'+('_male' if body_gender=='male' else '')+'.inkcharcustomization'
        dest=source/BASE/filename;dest.parent.mkdir(parents=True,exist_ok=True)
        info['Header']['ArchiveFileName']=str(dest);jp=generation/(filename+'.json');jp.write_text(json.dumps(info,ensure_ascii=False),encoding='utf-8')
        run(['cr2w',jp,'-d','-o',dest.parent,'-v','Normal'],log)
        customizations[body_gender]=BASE+'\\'+filename
    xl=(ROOT/'templates/diy_tattoo_rb.archive.xl').read_text(encoding='utf-8')
    # ArchiveXL merges male/female resources independently. Never register a
    # female customization resource for a male body, even in a mixed folder.
    xl='customizations:\n'+''.join('  '+gender+': '+path+'\n' for gender,path in customizations.items())+xl[xl.index('overrides:'):]
    # Add private hide rules alongside the complete original native mappings.
    lines=[]
    for line in xl.splitlines():
        if re.match(r'\s+tatto_studio_diy_rb',line):
            # Captured meshes add their own rules from actual original names.
            for slug in [r['component_prefix'] for r in report if not r['experimental']]:lines.append(line.replace('tatto_studio_diy_rb',slug))
        else:lines.append(line)
    if captured_aliases:
        lines=profiles.hide_rules(lines,captured_aliases)
    package=generation/'package';mod=package/'archive/pc/mod';mod.mkdir(parents=True,exist_ok=True)
    packed=generation/'packed';packed.mkdir();progress('打包统一纹身库…');run(['pack',source,'-o',packed,'-v','Normal'],log)
    shutil.copyfile(packed/'source.archive',mod/ARCHIVE)
    (mod/(ARCHIVE+'.xl')).write_text('\n'.join(lines)+'\n',encoding='utf-8')
    if standalone_id is None:library.atomic(mod/MARKER,{'owner':OWNER,'version':'1.0.1','kind':'game-library'})
    collector=ROOT/'collector/package'
    if include_collector and collector.exists():shutil.copytree(collector,package,dirs_exist_ok=True)
    licenses=ROOT/'third-party-licenses'
    if licenses.exists():shutil.copytree(licenses,package/'licenses',dirs_exist_ok=True)
    updated=[]  # Deploy only after the complete package passes validation.
    if standalone_id is not None:
        fomod=package/'fomod';fomod.mkdir(exist_ok=True)
        package_name=escape(library.groups()[0]['name']+' — tatto studio')
        package_description='Standalone tattoo for the selected body profile.'
        bin_entry='<folder source="bin" destination="bin" priority="0" />' if include_collector and (package/'bin').exists() else ''
        script_entry='<folder source="r6" destination="r6" priority="0" />' if include_collector and (package/'r6').exists() else ''
        (fomod/'ModuleConfig.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://qconsulting.ca/fo3/ModConfig5.0.xsd"><moduleName>'+package_name+'</moduleName><requiredInstallFiles><folder source="archive" destination="archive" priority="0" />'+bin_entry+script_entry+('<folder source="licenses" destination="licenses" priority="0" />' if (package/'licenses').is_dir() else '')+'</requiredInstallFiles></config>',encoding='utf-8')
        (fomod/'info.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><fomod><Name>'+package_name+'</Name><Author>tatto studio</Author><Version>1.0.1</Version><Description>'+package_description+'</Description></fomod>',encoding='utf-8')
    output=OUTPUT
    output.parent.mkdir(parents=True,exist_ok=True)
    temporary_zip=generation/'tatto_studio_Library.pending.zip'
    with zipfile.ZipFile(temporary_zip,'w',zipfile.ZIP_DEFLATED) as z:
        for file in package.rglob('*'):
            if file.is_file():z.write(file,file.relative_to(package).as_posix())
    if standalone_id is None:publishstate.validate_package(temporary_zip)
    temporary_zip.replace(output)
    result={'package':str(output),'updated_staging':updated,'designs':report,'game_tested':False,'deployed':False,'timestamp':time.time()}
    library.atomic(WORK/'last-publish.json',result)
    return result
