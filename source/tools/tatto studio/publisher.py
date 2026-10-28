"""Build all named folders into one CCXL mod; update its Vortex staging copy."""
import copy,hashlib,json,pathlib,re,shutil,subprocess,threading,time,zipfile
import library,settings,profiles
import tattoo_regions
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
    p=subprocess.run([str(CLI)]+list(map(str,args)),capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=1200 if args[0]=='import' else 240)
    with log.open('a',encoding='utf-8') as f:f.write(p.stdout+p.stderr+'\n')
    if p.returncode or re.search(r'\bError\b',p.stdout) or "Oodle couldn't be loaded" in p.stdout+p.stderr:raise RuntimeError('资源构建失败，请查看 library-build/build.log')

def rewrite(value,prefix,slug,id_offset):
    if isinstance(value,str):
        if value.startswith('7812330769892') and value.isdecimal():return str(int(value)+id_offset)
        return value.replace(OLD,prefix).replace('tatto_studio_diy_rb',slug)
    if isinstance(value,list):return [rewrite(v,prefix,slug,id_offset) for v in value]
    if isinstance(value,dict):return {k:rewrite(v,prefix,slug,id_offset) for k,v in value.items()}
    return value

def installed_targets():
    found=[];preferred=[]
    if STAGING is not None and STAGING.exists():
        for path in STAGING.glob('*/archive/pc/mod/'+MARKER):
            try:
                if path.is_symlink() or not path.resolve().is_relative_to(STAGING.resolve()):continue
                marker=json.loads(path.read_text(encoding='utf-8'))
                if marker.get('owner')==OWNER:
                    found.append(path.parent)
                    if marker.get('preferred_publish_target') is True:preferred.append(path.parent)
            except (OSError,ValueError):pass
    return preferred or found

def cname(value):return {'$type':'CName','$storage':'string','$value':value}

def publish(progress=lambda _:None):
    if not PUBLISH_LOCK.acquire(blocking=False):raise ValueError('已有发布任务，请等待')
    try:return _publish(progress)
    finally:PUBLISH_LOCK.release()

def _publish(progress,*,library_api=None,work=None,output=None,standalone_id=None,update_staging=True,include_collector=True):
    # Inject an isolated one-design library for standalone export. Never swap
    # module globals: normal requests must keep seeing the user's real library.
    library=library_api if library_api is not None else globals()['library']
    WORK=pathlib.Path(work) if work is not None else globals()['WORK']
    OUTPUT=pathlib.Path(output) if output is not None else globals()['OUTPUT']
    BASE=globals()['BASE'] if standalone_id is None else 'tatto_studio\\tattoo_standalone_'+standalone_id
    ARCHIVE=globals()['ARCHIVE'] if standalone_id is None else 'twb_'+standalone_id+'.archive'
    if standalone_id is not None and (update_staging or not re.fullmatch(r'[0-9a-f]{16}',standalone_id)):
        raise ValueError('独立模组导出不能更新纹身库暂存目录')
    # Choose a single visible category for each folder. Private head resources
    # can share its selector while remaining outside the FPP appearance group.
    group_domains={}
    for group in library.groups():
        domains=set()
        for design in group['designs']:
            if not design['enabled'] or design.get('draft'):continue
            data=library.load(group['id'],design['id'])
            if not re.fullmatch(r'character-[0-9a-f]{12}',data.get('model',{}).get('id','')):
                domains.add('body');continue
            meta=tattoo_regions.update_metadata(profiles.model_folder(data['model']['id']))
            if any(p.get('tattooExcludedRanges') for p in meta['parts']) and data.get('bakeVersion',0)<tattoo_regions.MIN_BAKE_VERSION:
                raise ValueError('设计“'+design['title']+'”需要重新烘焙肩部贴图。请刷新编辑器后点击“更新游戏纹身库”，会自动重新烘焙。')
            for file in (library.design_path(group['id'],design['id']).parent/BAKED_TEXTURES_NAME).glob('*.png'):
                with profiles.Image.open(file) as image:
                    if image.convert('RGBA').getchannel('A').getbbox():domains.add('head' if file.stem.split('_')[0] in ('head','neck') else 'body')
        previous_domain=json.loads((library.group_folder(group['id'])/'group.json').read_text(encoding='utf-8')).get('last_domain','body')
        group_domains[group['id']]=('body' if 'body' in domains else 'head') if domains else previous_domain
    WORK.mkdir(exist_ok=True);log=WORK/'build.log';log.write_text('',encoding='utf-8')
    source=WORK/'source';source.mkdir(exist_ok=True)
    # Fresh build generation avoids keeping removed designs in the published archive.
    generation=WORK/('generation-'+str(time.time_ns()));generation.mkdir()
    source=generation/'source';source.mkdir()
    templates=ROOT/'templates/json'
    info=json.loads((templates/'diy_pwa.inkcharcustomization.json').read_text(encoding='utf-8'))
    root=info['Data']['RootChunk'];root['bodyCustomizationOptions']=[];root['bodyGroups']=[];root['headCustomizationOptions']=[];root['headGroups']=[]
    group_map={};head_group_map={};all_slugs=[];report=[];handle=0;captured_aliases=[]
    for group in library.groups():
        designs=[d for d in group['designs'] if d['enabled'] and not d.get('draft')]
        if not designs:continue
        group_id=group['id'];gp=library.group_folder(group_id)
        meta=json.loads((gp/'group.json').read_text(encoding='utf-8'))
        if meta.get('last_domain')!=group_domains[group_id]:
            meta['last_domain']=group_domains[group_id];library.atomic(gp/'group.json',meta)
        if 'switch_index' not in meta:
            # Persist assigned numeric indices; folder renames never change identity.
            used=[]
            for other in library.groups():
                m=json.loads((library.group_folder(other['id'])/'group.json').read_text(encoding='utf-8'))
                if 'switch_index' in m:used.append(m['switch_index'])
            meta['switch_index']=max(used,default=3599)+1;library.atomic(gp/'group.json',meta)
        template_info=json.loads((templates/'diy_pwa.inkcharcustomization.json').read_text(encoding='utf-8'))['Data']['RootChunk']
        group_slug='tatto_studio_lib_'+group_id
        switch=copy.deepcopy(template_info['bodyCustomizationOptions'][0]['Data'])
        switch['localizedName']=group['name'];switch['index']=meta['switch_index'];switch['name']=cname(group_slug+'_switch')
        switch['uiSlot']=cname(group_slug+'_switcher');switch['uiSlots']=[];switch['options']=[]
        group_options=[];off_names=[];group_domain=group_domains[group_id]
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
            digest=hashlib.sha256((TEXTURE_PIPELINE_VERSION.encode()+design_file.read_bytes()+b''.join((atlases/(p+'.png')).read_bytes() for p in atlas_parts))).hexdigest()
            if not (cache/'stamp').exists() or (cache/'stamp').read_text()!=digest:
                progress('准备 '+group['name']+' / '+design['title'])
                geometry_jobs=[];json_input=cache/'json-input';flat_output=cache/'cooked-flat'
                json_input.mkdir(exist_ok=True);flat_output.mkdir(exist_ok=True)
                for file in design_templates.glob('*.json'):
                    if not file.name.endswith(('.app.json','.mesh.json','.morphtarget.json')):continue
                    relative=('appearances/' if file.name.endswith('.app.json') else 'meshes/')+file.name[:-5]
                    cooked=cache/'source'/prefix/relative
                    if cooked.exists():continue
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
                tex=cache/'source'/prefix/'textures';tex.mkdir(exist_ok=True)
                texture_jobs=[]
                for part in atlas_parts:
                    texture_hash=TEXTURE_PIPELINE_VERSION+':'+hashlib.sha256((atlases/(part+'.png')).read_bytes()).hexdigest()
                    texture_stamp=cache/(part+'.texture-hash')
                    if texture_stamp.exists() and texture_stamp.read_text()==texture_hash and (tex/(part+'.xbm')).exists():continue
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
                        (cache/(part+'.texture-hash')).write_text(texture_hash)
                (cache/'stamp').write_text(digest)
            shutil.copytree(cache/'source',source,dirs_exist_ok=True)
            options=rewrite(template_options[1:],prefix,slug,offset)
            # Every variant has its own slots, all cleared by Off and other variants.
            by_name={o['Data']['name']['$value']:o for o in options}
            off=[o['Data']['name']['$value'] for o in options if o['Data']['name']['$value'].endswith('_off')]
            off_names.extend(off)
            for o in options:
                o['HandleId']=str(handle);handle+=1;group_options.append(o)
                slot=o['Data']['uiSlot'];
                if slot not in switch['uiSlots']:switch['uiSlots'].append(slot)
            chosen=rewrite(template_options[0]['Data']['options'][1 if captured else 2 if data.get('includePubic',True) else 1],prefix,slug,offset)
            chosen['localizedName']=design['title'];chosen['index']=data['game_option_index']
            switch['options'].append(chosen)
            for bg in rewrite(template_info[option_domain+'Groups'],prefix,slug,offset):
                key=bg['name']['$value']
                if group_domain=='body' and option_domain=='head':
                    # Render head-only variants in a mixed folder in TPP/creator, never FPP.
                    key={'TPP':'TPP_Body','TPP_photomode':'TPP_Body','character_customization':'character_creation'}.get(key)
                    if key is None:continue
                target=(head_group_map if group_domain=='head' else group_map).setdefault(key,{'$type':'gameuiOptionsGroup','name':cname(key),'options':[]})
                for opt in bg['options']:
                    if opt['$value'].endswith('_switch'):opt=cname(group_slug+'_switch')
                    if opt not in target['options']:target['options'].append(opt)
            report.append({'folder':group['name'],'folder_id':group_id,'design':design['title'],'design_id':design['id'],'component_prefix':slug,'model':model.get('id','rb'),'domain':domain,'selector_domain':group_domain,'experimental':captured,'overlay_profile_version':manifest['cache_version'] if captured else None})
        for option in switch['options']:
            active={n['$value'] for n in option['names']}
            # Disable every other variant's components explicitly.
            option['names'] += [cname(n) for n in off_names if n.rsplit('_off',1)[0]+'_on' not in active and n not in active]
        empty=copy.deepcopy(template_options[0]['Data']['options'][0]);empty['names']=[cname(n) for n in off_names]
        switch['options'].sort(key=lambda o:o['index'])
        switch['options'].insert(0,empty)
        root[group_domain+'CustomizationOptions'].append({'HandleId':str(handle),'Data':switch});handle+=1
        root[group_domain+'CustomizationOptions'].extend(group_options)
    # An empty library is valid: the collector remains installed without demo menus.
    root['bodyGroups']=list(group_map.values())
    root['headGroups']=list(head_group_map.values())
    dest=source/BASE/'library.inkcharcustomization';dest.parent.mkdir(parents=True,exist_ok=True)
    info['Header']['ArchiveFileName']=str(dest);jp=generation/'library.inkcharcustomization.json';jp.write_text(json.dumps(info,ensure_ascii=False),encoding='utf-8')
    progress('生成义体医生分组选项…');run(['cr2w',jp,'-d','-o',dest.parent,'-v','Normal'],log)
    xl=(ROOT/'templates/diy_tattoo_rb.archive.xl').read_text(encoding='utf-8')
    xl=xl.replace(OLD+'\\diy_pwa.inkcharcustomization',BASE+'\\library.inkcharcustomization')
    # Add private hide rules alongside the complete original native mappings.
    lines=[]
    for line in xl.splitlines():
        if re.match(r'\s+tatto_studio_diy_rb',line):
            # Captured meshes add their own rules from actual original names.
            for slug in [r['component_prefix'] for r in report if not r['experimental']]:lines.append(line.replace('tatto_studio_diy_rb',slug))
        else:lines.append(line)
    if captured_aliases:
        lines=profiles.hide_rules(lines,captured_aliases)
    package=WORK/'package';mod=package/'archive/pc/mod';mod.mkdir(parents=True,exist_ok=True)
    packed=generation/'packed';packed.mkdir();progress('打包统一纹身库…');run(['pack',source,'-o',packed,'-v','Normal'],log)
    shutil.copyfile(packed/'source.archive',mod/ARCHIVE)
    (mod/(ARCHIVE+'.xl')).write_text('\n'.join(lines)+'\n',encoding='utf-8')
    if standalone_id is None:library.atomic(mod/MARKER,{'owner':OWNER,'version':'0.3.0'})
    collector=ROOT/'collector/package'
    if include_collector and collector.exists():shutil.copytree(collector,package,dirs_exist_ok=True)
    licenses=ROOT/'third-party-licenses'
    if licenses.exists():shutil.copytree(licenses,package/'licenses',dirs_exist_ok=True)
    installed=installed_targets() if update_staging else []
    if len(installed)>1:raise ValueError('找到多个纹身库暂存目录，请移除多余的纹身库副本后再发布')
    updated=[]
    for target in installed:
        preferred=json.loads((target/MARKER).read_text(encoding='utf-8')).get('preferred_publish_target') is True
        for file in mod.iterdir():
            # Replacing, never overwriting an existing inode: Vortex may use hardlinks.
            temp=target/(file.name+'.studio-pending')
            if file.name==MARKER and preferred:
                marker=json.loads(file.read_text(encoding='utf-8'));marker['preferred_publish_target']=True
                temp.write_text(json.dumps(marker,ensure_ascii=False,indent=2),encoding='utf-8')
            else:shutil.copyfile(file,temp)
            temp.replace(target/file.name)
        updated.append(str(target))
        # Keep the read-only collector and its typed resource bridge together.
        # Atomic replacement avoids writing through Vortex deployment hardlinks.
        if include_collector and collector.exists():
            staging_root=target.parents[2]
            for file in collector.rglob('*'):
                if not file.is_file():continue
                destination=staging_root/file.relative_to(collector)
                destination.parent.mkdir(parents=True,exist_ok=True)
                temp=destination.with_name(destination.name+'.studio-pending')
                shutil.copyfile(file,temp);temp.replace(destination)
    fomod=package/'fomod';fomod.mkdir(exist_ok=True)
    package_name=escape(library.groups()[0]['name']+' — tatto studio') if standalone_id is not None else 'tatto studio'
    package_description='Standalone tattoo for the selected body profile.' if standalone_id is not None else 'External tattoo editor library and read-only character collector.'
    bin_entry='<folder source="bin" destination="bin" priority="0" />' if include_collector and (package/'bin').exists() else ''
    script_entry='<folder source="r6" destination="r6" priority="0" />' if include_collector and (package/'r6').exists() else ''
    (fomod/'ModuleConfig.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><config xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://qconsulting.ca/fo3/ModConfig5.0.xsd"><moduleName>'+package_name+'</moduleName><requiredInstallFiles><folder source="archive" destination="archive" priority="0" />'+bin_entry+script_entry+'</requiredInstallFiles></config>',encoding='utf-8')
    (fomod/'info.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><fomod><Name>'+package_name+'</Name><Author>tatto studio</Author><Version>0.3.0</Version><Description>'+package_description+'</Description></fomod>',encoding='utf-8')
    output=OUTPUT
    output.parent.mkdir(parents=True,exist_ok=True)
    temporary_zip=generation/'DIY_Tattoo_Library_0.3.0.zip'
    with zipfile.ZipFile(temporary_zip,'w',zipfile.ZIP_DEFLATED) as z:
        for file in package.rglob('*'):
            if file.is_file():z.write(file,file.relative_to(package).as_posix())
    temporary_zip.replace(output)
    result={'package':str(output),'updated_staging':updated,'designs':report,'game_tested':False,'deployed':False,'timestamp':time.time()}
    library.atomic(WORK/'last-publish.json',result)
    return result
