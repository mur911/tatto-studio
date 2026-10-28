"""Local-only skin reference extraction. Never included in tattoo bake/output."""
import hashlib,json,pathlib,re,shutil,struct,subprocess,threading,time
import numpy as np
from PIL import Image
import models,profiles,library
from archive_order import ordered_mods

VERSION=3
LOCK=threading.Lock()

def path_value(value):
    if not isinstance(value,dict):return ''
    return value.get('DepotPath',value).get('$value','')

def root(doc):return doc['Data']['RootChunk']

class Resources:
    def __init__(self,folder,progress):
        self.folder=folder;self.progress=progress;self.docs={};self.embedded={};self.files={};self.errors={};self.origins={};self.indices=[];self.resolutions={}
        for area in ('archive/pc/mod','archive/pc/ep1','archive/pc/content'):
            for archive in ordered_mods(models.GAME) if area.endswith('/mod') else sorted((models.GAME/area).glob('*.archive')):
                try:
                    with archive.open('rb') as f:
                        header=f.read(40)
                        if header[:4]!=b'RDAR':continue
                        f.seek(struct.unpack_from('<Q',header,8)[0]);table=f.read(28);count=struct.unpack_from('<I',table,16)[0]
                        if count>5_000_000:continue
                        data=f.read(count*56)
                        hashes=np.ndarray((count,),'<u8',buffer=data,strides=(56,)).copy()
                    self.indices.append((archive,hashes,area.endswith('/mod')))
                except (OSError,ValueError,struct.error):continue
        for name in ('raw','cooked','json','export'):(folder/name).mkdir(parents=True,exist_ok=True)
    def run(self,args):
        p=subprocess.run([str(models.CLI),*map(str,args),'-v','Normal'],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=240)
        with (self.folder/'build.log').open('a',encoding='utf-8') as f:f.write(p.stdout+p.stderr+'\n')
        if p.returncode or re.search(r'\bError\b',p.stdout):raise ValueError('皮肤资源转换失败，详见 skin/build.log')
    def archive(self,path):
        h=models.fnv(path);hits=[(a,mod) for a,hashes,mod in self.indices if np.any(hashes==h)]
        mods=[a for a,mod in hits if mod]
        if len(mods)>1:self.resolutions[path]={'selected':mods[0].name,'overridden':[a.name for a in mods[1:]],'rule':'modlist.txt' if (models.GAME/'archive/pc/mod/modlist.txt').is_file() else 'ASCII first wins'}
        if mods:return mods[0]
        if hits:return hits[0][0]
        raise ValueError('找不到资源：'+path)
    def fetch(self,paths,docs=False):
        batches={};new=[]
        for path in set(paths):
            if not path or path in self.errors or path in (self.docs if docs else self.files) or docs and path in self.embedded:continue
            depot=pathlib.PureWindowsPath(path)
            if '..' in depot.parts or depot.is_absolute() or depot.drive:self.errors[path]='资源路径无效';continue
            try:
                archive=self.archive(path);batches.setdefault(archive,[]).append(path);self.origins[path]=archive.name
            except ValueError as e:self.errors[path]=str(e)
        for archive,entries in batches.items():
            batch=hashlib.sha256((str(archive)+''.join(sorted(entries))).encode()).hexdigest()[:14]
            out=self.folder/'raw'/batch;out.mkdir(exist_ok=True);hashfile=out/'hashes.txt';hashfile.write_text('\n'.join(str(models.fnv(p)) for p in entries),encoding='utf-8')
            self.progress('读取皮肤资源：'+archive.name);self.run(['unbundle',archive,'--hash',hashfile,'-o',out])
            for path in entries:
                source=out.joinpath(*pathlib.PureWindowsPath(path).parts)
                if not source.exists():source=out/(str(models.fnv(path))+'.bin')
                if not source.exists():self.errors[path]='资源未能提取：'+path;continue
                dest=self.folder/'cooked'/(str(models.fnv(path))+pathlib.PureWindowsPath(path).suffix)
                shutil.copyfile(source,dest);self.files[path]=dest;new.append((path,dest))
        if docs and new:
            # Numeric names are unique even when resource basenames collide.
            self.run(['cr2w',*[file for _,file in new],'-s','-o',self.folder/'json'])
            for path,file in new:
                result=self.folder/'json'/(file.name+'.json')
                if not result.exists():self.errors[path]='未生成材质JSON：'+path;continue
                doc=profiles.load(result);self.docs[path]=root(doc)
                for item in doc['Data'].get('EmbeddedFiles',[]):self.embedded[path_value(item['FileName'])]=item['Content']
    def material(self,local,seen=None):
        seen=set() if seen is None else seen
        parent=path_value(local.get('baseMaterial'))
        if parent in seen:raise ValueError('材质引用形成循环')
        values={}
        if parent.endswith('.mi'):
            base=self.embedded.get(parent,self.docs.get(parent))
            if base is None:raise ValueError(self.errors.get(parent,'未读取材质：'+parent))
            values.update(self.material(base,seen|{parent}))
        elif parent.endswith('.mt'):
            base=self.docs.get(parent,{})
            for group in base.get('parameters',{}).get('Elements',[]):
                for handle in group:
                    parameter=handle.get('Data',{});name=parameter.get('parameterName',{}).get('$value')
                    for key in ('texture','color','scalar','vector'):
                        if name and key in parameter:values[name]=parameter[key];break
        for entry in local.get('values',[]):values.update({k:v for k,v in entry.items() if k!='$type'})
        return values

def chunks(doc,mask):
    r=root(doc);blob=r.get('renderResourceBlob',{}).get('Data')
    if blob is None:
        base=r['blob']['Data']['baseBlob'];blob=base.get('Data',base)
    result=[];offset=0
    for i,c in enumerate(blob['header']['renderChunkInfos']):
        if c['lodMask']!=1 or not (int(mask)>>i)&1:continue
        result.append({'first':offset,'count':c['numIndices'],'chunk':i});offset+=c['numIndices']
    return result

def selected_materials(doc,appearance):
    r=root(doc);apps=[v['Data'] for v in r.get('appearances',[])]
    match=next((a for a in apps if a['name']['$value']==appearance),None)
    if match is None:raise ValueError('网格中没有快照外观：'+appearance)
    table={v['name']['$value']:v for v in r.get('materialEntries',[])};local=r.get('localMaterialBuffer',{}).get('materials',[])
    result=[]
    for name in match['chunkMaterials']:
        entry=table.get(name['$value']);material=None
        if entry:
            index=entry['index']
            if entry['isLocalInstance'] and index<len(local):material=local[index]
            elif not entry['isLocalInstance'] and index<len(r.get('externalMaterials',[])):
                material={'baseMaterial':r['externalMaterials'][index],'values':[]}
        result.append(material)
    return result

def prepare(ident,progress=lambda _:None,force=False):
    folder=profiles.model_folder(ident);work=folder/'skin';meta=profiles.load(folder/'model.json')
    cached=work/'skin.json'
    if not force and cached.exists():
        data=profiles.load(cached)
        if data.get('version')==VERSION:return data
    with LOCK:
        if models.GAME is None:raise ValueError('请先配置游戏目录，再读取皮肤参考')
        if not models.CLI.is_file():raise ValueError('找不到WolvenKit工具，请先配置工具路径')
        work.mkdir(exist_ok=True);resources=Resources(work,progress)
        source=profiles.load(folder/'sources.json');profile=profiles.load(folder/'decal-profile/profile.json')
        plans={};issues=[];shared=set()
        for record in source:
            atlas=record['atlas'];geometry=profiles.load(pathlib.Path(record['mesh_json']))
            mesh=geometry
            if root(geometry)['$type']=='MorphTargetMesh':mesh=profiles.load(pathlib.Path(profile['bases'][atlas]))
            appearance=record['component'].get('appearance','default')
            try:
                mats=selected_materials(mesh,appearance)
                plans[atlas]={'appearance':appearance,'chunks':chunks(geometry,record['mask']),'materials':mats}
                if not any(mats):
                    sibling=record['component'].get('path','')
                    if sibling.endswith(('__l.mesh','__r.mesh')):shared.add(sibling[:-8]+'__full.mesh')
            except (KeyError,ValueError) as e:issues.append(atlas+'：'+str(e))
        # Some split arm meshes omit their shared material table; inspect the
        # actual matching full-arms resource, never invent another skin texture.
        resources.fetch(shared,docs=True)
        for atlas,plan in plans.items():
            if any(plan['materials']):continue
            record=next(r for r in source if r['atlas']==atlas);path=record['component'].get('path','')
            sibling=path[:-8]+'__full.mesh' if path.endswith(('__l.mesh','__r.mesh')) else ''
            if sibling in resources.docs:
                try:plan['materials']=selected_materials({'Data':{'RootChunk':resources.docs[sibling]}},plan['appearance'])
                except ValueError:pass
        pending={path_value(m.get('baseMaterial')) for p in plans.values() for m in p['materials'] if m}
        # Breadth-first extraction batches all parents from the same archive.
        for _ in range(16):
            pending={p for p in pending if p.endswith(('.mi','.mt')) and p not in resources.docs and p not in resources.embedded and p not in resources.errors}
            if pending:resources.fetch(pending,docs=True)
            parents={path_value(d.get('baseMaterial')) for d in [*resources.docs.values(),*resources.embedded.values()] if d.get('$type')=='CMaterialInstance'}
            next_pending={p for p in parents if p.endswith(('.mi','.mt')) and p not in resources.docs and p not in resources.embedded and p not in resources.errors}
            if not next_pending:break
            pending=next_pending
        textures=set()
        for atlas,plan in plans.items():
            plan['values']=[]
            for m in plan['materials']:
                try:values=resources.material(m) if m else {};plan['values'].append(values)
                except ValueError as e:plan['values'].append({});issues.append(atlas+'：'+str(e));continue
                for name in ('Albedo','SecondaryAlbedo','Normal','DetailNormal','MicroDetail','TintColorMask','Roughness'):
                    path=path_value(values.get(name))
                    if path.endswith('.xbm'):textures.add(path)
        resources.fetch(textures)
        available=[(p,resources.files[p]) for p in textures if p in resources.files]
        if available:
            progress('转换皮肤颜色和细节贴图…');resources.run(['export',*[file for _,file in available],'-o',work/'export','--uext','png','--gamepath',models.GAME])
        def image(path):
            file=work/'export'/(str(models.fnv(path))+'.png')
            return Image.open(file).convert('RGBA') if path in resources.files and file.exists() else None
        texture_cache={}
        def texture_info(values):
            signature=hashlib.sha256(json.dumps(values,sort_keys=True).encode()).hexdigest()[:16]
            if signature in texture_cache:return texture_cache[signature]
            albedo_path=path_value(values.get('Albedo'));albedo=image(albedo_path)
            tint=values.get('TintColor',{'Red':255,'Green':255,'Blue':255})
            color=np.array([tint.get(k,255)/255 for k in ('Red','Green','Blue')],dtype=np.float32)
            output={'tint':color.tolist(),'roughness':.65,'appearance':'','sources':{}}
            rough=values.get('Roughness')
            if isinstance(rough,(int,float)):output['roughness']=max(.05,min(1,float(rough)))
            elif isinstance(rough,dict):
                roughness=image(path_value(rough))
                if roughness is not None:output['roughness']=max(.05,min(1,float(np.median(np.array(roughness)[:,:,0])/255)))
            if albedo is not None:
                albedo.thumbnail((2048,2048));pixels=np.array(albedo,dtype=np.float32)/255
                secondary=image(path_value(values.get('SecondaryAlbedo')))
                if secondary is not None:
                    secondary=secondary.resize(albedo.size,Image.Resampling.LANCZOS);s=np.array(secondary,dtype=np.float32)/255
                    alpha=s[:,:,3:4]*float(values.get('SecondaryAlbedoInfluence',1));pixels[:,:,:3]=pixels[:,:,:3]*(1-alpha)+s[:,:,:3]*alpha
                mask=image(path_value(values.get('TintColorMask')))
                amount=np.array(mask.resize(albedo.size),dtype=np.float32)[:,:,:1]/255 if mask is not None else 1
                pixels[:,:,:3]*=(1-amount)+amount*color;pixels[:,:,3]=1
                file=work/(signature+'-albedo.png');Image.fromarray(np.uint8(np.clip(pixels*255,0,255))).save(file)
                output['albedo']='/models/'+ident+'/skin/'+file.name;output['tint']=[1,1,1];output['sources']['albedo']={'path':albedo_path,'archive':resources.origins.get(albedo_path)}
                output['fallback_color']=np.median(pixels[:,:,:3].reshape(-1,3),axis=0).tolist()
            for name,key in [('Normal','normal'),('MicroDetail','micro')]:
                path=path_value(values.get(name));pic=image(path)
                if pic is None:continue
                pic.thumbnail((2048,2048))
                detail=image(path_value(values.get('DetailNormal'))) if name=='Normal' else None
                if detail is not None:
                    pixels=np.array(pic,dtype=np.float32)/255;extra=np.array(detail.resize(pic.size),dtype=np.float32)/255
                    xy=(pixels[:,:,:2]*2-1)+(extra[:,:,:2]*2-1)*float(values.get('DetailNormalInfluence',1))
                    length=np.maximum(1,np.sqrt(np.sum(xy*xy,axis=2,keepdims=True)));xy/=length
                    pixels[:,:,:2]=xy*.5+.5;pixels[:,:,2]=np.sqrt(np.maximum(0,1-np.sum(xy*xy,axis=2)));pixels[:,:,3]=1
                    pic=Image.fromarray(np.uint8(np.clip(pixels*255,0,255)))
                file=work/(signature+'-'+key+'.png');pic.save(file)
                output[key]='/models/'+ident+'/skin/'+file.name;output['sources'][key]={'path':path,'archive':resources.origins.get(path)}
            output['micro_scale']=float(values.get('MicroDetailUVScale01',20));output['micro_strength']=float(values.get('MicroDetailInfluence',.25))
            texture_cache[signature]=output;return output
        result={'version':VERSION,'model':ident,'created_at':time.time(),'parts':{},'issues':issues,'preview_only':True,
                'limitations':['近似皮肤预览，不复制游戏灯光或运行时材质覆盖','本机提取的皮肤资源不进入纹身输出或发行包']}
        for atlas,plan in plans.items():
            segments=[]
            for chunk in plan['chunks']:
                index=chunk['chunk'];values=plan['values'][index] if index<len(plan['values']) else {}
                skin=texture_info(values);segments.append({**chunk,**skin,'appearance':plan['appearance']})
            result['parts'][atlas]=segments
            if not any(s.get('albedo') for s in segments):issues.append(atlas+'：未解析到皮肤颜色贴图，使用参考颜色')
        result['issues']+=sorted(set(resources.errors.values()))
        result['load_order_resolutions']=resources.resolutions
        fallback=next((s['fallback_color'] for values in result['parts'].values() for s in values if s.get('fallback_color')),[.68,.71,.63])
        result['fallback_color']=fallback
        for segments in result['parts'].values():
            for s in segments:
                if not s.get('albedo'):s['tint']=fallback
        result['status']='ready' if not result['issues'] else 'partial'
        library.atomic(cached,result);meta['skin']={'version':VERSION,'url':'/models/'+ident+'/skin/skin.json','status':result['status']};library.atomic(folder/'model.json',meta)
        return result
