"""Read deployed mesh references from a CET snapshot; import resource rest meshes.

This deliberately labels imported geometry preview-only: resource geometry is
not the renderer's deformed skin, and an arbitrary body needs its own overlay.
"""
import base64,hashlib,json,mmap,pathlib,re,struct,subprocess,time
import numpy as np
import settings
from archive_order import ordered_mods
ROOT=pathlib.Path(__file__).parent.resolve();MODELS=settings.DATA_ROOT/'models';MODELS.mkdir(exist_ok=True)
GAME=settings.GAME
CLI=settings.CLI

def listed():
    result=[]
    for p in MODELS.glob('*/model.json'):
        d=json.loads(p.read_text(encoding='utf-8'));result.append({'id':d['id'],'name':d['body'],'url':'/models/'+d['id']+'/model.json','captured_at':d.get('captured_at',0)})
    return sorted(result,key=lambda item:item['captured_at'] or 0)

def select_snapshot(folder):
    """Prefer appearance capture within the newest session, never an older body."""
    records=[]
    for p in folder.glob('*-snapshot.json'):
        try:
            value=json.loads(p.read_text(encoding='utf-8-sig'))
            if isinstance(value,dict) and isinstance(value.get('components'),list) and value['components']:
                records.append((value,p))
        except (OSError,ValueError):continue
    status={}
    try:
        candidate=json.loads((folder/'snapshot-status.json').read_text(encoding='utf-8-sig'))
        if isinstance(candidate,dict):status=candidate
    except (OSError,ValueError):pass
    session=status.get('session_id')
    if not session:
        modern=[r for r in records if r[0].get('session_id')]
        if modern:session=max(modern,key=lambda r:r[0].get('captured_at',0))[0]['session_id']
    if session:
        records=[r for r in records if r[0].get('session_id')==session]
    if not records:
        if status.get('success') is False:
            raise ValueError('本次角色快照采集失败，未使用旧快照。'+str(status.get('message','')))
        raise ValueError('尚无本次角色快照，请部署采集器后进入义体医生编辑外貌停留十秒，再回来读取。')
    appearances=[r for r in records if r[1].name=='appearance-snapshot.json']
    value,p=max(appearances or records,key=lambda r:r[0].get('captured_at',r[1].stat().st_mtime))
    if status.get('success') is False and status.get('source')==value.get('source') and status.get('captured_at',0)>=value.get('captured_at',0):
        raise ValueError('本次角色快照采集失败，未使用旧快照。'+str(status.get('message','')))
    return value,p

def snapshot():
    if GAME is None:raise ValueError('请先在 settings.local.json 配置 game_directory 游戏目录。')
    folder=GAME/'bin/x64/plugins/cyber_engine_tweaks/mods/TattoStudio_Tattoo_Collector'
    return select_snapshot(folder)

def archive_hashes(path,wanted=None):
    with path.open('rb') as f:
        head=f.read(40)
        if len(head)<40 or head[:4]!=b'RDAR':return set()
        index=struct.unpack_from('<Q',head,8)[0];f.seek(index);table=f.read(28)
        if len(table)!=28:return set()
        count=struct.unpack_from('<I',table,16)[0]
        if count>5_000_000:raise ValueError('资源索引条目过多')
        data=f.read(count*56)
        if len(data)!=count*56:raise ValueError('资源索引不完整')
        values=np.ndarray((count,),dtype='<u8',buffer=data,strides=(56,))
        if wanted is not None:values=values[np.isin(values,np.array(list(wanted),dtype='<u8'))]
        return set(values.tolist())

def fnv(path):
    result=14695981039346656037
    for b in path.replace('/','\\').lower().encode('utf-8'):result=((result^b)*1099511628211)&0xffffffffffffffff
    return result

def kind(component):
    n=(component.get('name') or '').lower();path=(component.get('path') or '').lower()
    if 'shadow' in n or '_fpp' in n and 'neck' not in n or 'tatto_studio_' in n:return None
    if any(t in n for t in ('nails','makeup','eyelash','eyebrow','teeth','tongue')):return None
    if any(t in path for t in ('\\nails\\','_makeup_', '\\ht_', '\\he_', '\\heb_', '\\hx_', '\\hair\\','\\cyberware\\')):return None
    if '\\h0_' in path:return 'head'
    if n.startswith(('i0_','genital')) or any(x in path for x in ('genitals','penis','vagina')):return 'genitals'
    if n.startswith('h0_') or 'basehead' in n and not n.startswith(('ht_','hb_','heb_','hx_')):return 'head'
    if 'neck' in n or 'neck' in path:return 'neck'
    if n.startswith('a0_'):
        return 'left_arm' if re.search(r'(^|_)l($|_)',n) or 'left' in n or '_l.' in path else 'right_arm'
    if n.startswith(('t0_','l0_','n0_')):return 'body'
    return None

def geometry(doc,mask=None):
    root=doc['Data']['RootChunk']
    if 'renderResourceBlob' in root:blob=root['renderResourceBlob']['Data']
    elif 'blob' in root:
        raw=root['blob']['Data'];blob=raw.get('baseBlob',{}).get('Data',raw.get('baseBlob',{}))
    else:raise ValueError('资源不含可读取的网格')
    header=blob['header'];buffer=base64.b64decode(blob['renderBuffer']['Bytes'])
    vertices=[];triangles=[];base=0
    for ci,c in enumerate(header['renderChunkInfos']):
        if c['lodMask']!=1 or mask is not None and not ((mask>>ci)&1):continue
        n=c['numVertices'];off=c['chunkVertices']['byteOffsets']['Elements'];stride=c['chunkVertices']['vertexLayout']['slotStrides']['Elements']
        if len(off)<3 or min(stride[:3])<=0:continue
        elements=c['chunkVertices']['vertexLayout'].get('elements',{}).get('Elements',[])
        layout={e.get('usage'):e.get('type') for e in elements if e.get('usageIndex',0)==0}
        for usage,packing in [('PS_Position','PT_Short4N'),('PS_TexCoord','PT_Float16_2'),('PS_Normal','PT_Dec4')]:
            if layout.get(usage)!=packing:raise ValueError('不支持的顶点布局：'+usage+' / '+str(layout.get(usage)))
        q=np.ndarray((n,4),'<i2',buffer=buffer,offset=off[0],strides=(stride[0],2))
        position=q[:,:3]/32767*np.array([header['quantizationScale'][k] for k in 'XYZ'])+np.array([header['quantizationOffset'][k] for k in 'XYZ'])
        uv=np.ndarray((n,2),'<f2',buffer=buffer,offset=off[1],strides=(stride[1],2)).astype('<f4')
        packed=np.ndarray((n,),'<u4',buffer=buffer,offset=off[2],strides=(stride[2],))
        normals=np.column_stack([((packed>>(i*10))&1023)/1023*2-1 for i in range(3)]);normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-9)
        tri=np.frombuffer(buffer,dtype='<u2',count=c['numIndices'],offset=header['indexBufferOffset']+c['chunkIndices']['teOffset']).astype('<u4')
        if len(tri) and tri.max()>=n:raise ValueError('网格索引超出范围')
        vertices.append(np.concatenate([position,normals,uv],axis=1).astype('<f4'));triangles.append(tri+base);base+=n
    if not vertices:raise ValueError('没有可见的一级网格')
    v=np.concatenate(vertices);t=np.concatenate(triangles)
    if not np.isfinite(v).all():raise ValueError('网格数据含无效数值')
    return struct.pack('<II',len(v),len(t))+v.tobytes()+t.tobytes(),len(v),len(t)//3

def import_current(progress=lambda _:None):
    snap,path=snapshot();merged={}
    for c in snap.get('components',[]):
        region=kind(c)
        if not region or c.get('enabled') is False:continue
        text=re.sub(r'[^0-9]','',str(c.get('hash','')));h=int(text) if text else fnv(c.get('path') or '')
        masktext=re.sub(r'[^0-9]','',str(c.get('chunk_mask','')));mask=int(masktext) if masktext else 0xffffffffffffffff
        if h>0xffffffffffffffff or mask>0xffffffffffffffff:raise ValueError('快照中的资源编号或网格掩码超出64位范围，请重新采集')
        if not h or not mask:continue
        key=(h,region,c.get('appearance'),c.get('skinning_bind'))
        if key in merged:merged[key]['mask']|=mask
        else:merged[key]={'component':dict(c),'region':region,'hash':h,'mask':mask}
    items=list(merged.values())
    if not items:raise ValueError('快照中没有可读取的身体组件，请在义体医生编辑外貌时重新采集')
    progress('读取实际部署的资源索引…');indices=[];wanted={item['hash'] for item in items}
    mod=ordered_mods(GAME)
    base=sorted((GAME/'archive/pc/ep1').glob('*.archive'))+sorted((GAME/'archive/pc/content').glob('*.archive'))
    for archive in mod+base:
        try:indices.append((archive,archive_hashes(archive,wanted),archive in mod))
        except (OSError,ValueError):continue
    signature={'importer_version':2,'components':sorted([item['component'] for item in items],key=lambda c:(c.get('name',''),c.get('path',''))),'archives':[(str(a),a.stat().st_size,a.stat().st_mtime_ns) for a,hashes,_ in indices if hashes]}
    ident='character-'+hashlib.sha256(json.dumps(signature,sort_keys=True).encode()).hexdigest()[:12]
    folder=MODELS/ident;folder.mkdir(exist_ok=True);log=folder/'import.log'
    parts=[];issues=[];sources=[];batches={};resolutions=[]
    for item in items:
        c=item['component'];h=item['hash'];candidates=[(a,ismod) for a,hashes,ismod in indices if h in hashes]
        selected_mod=[a for a,ismod in candidates if ismod]
        if len(selected_mod)>1:
            resolutions.append({'component':c['name'],'selected':selected_mod[0].name,'overridden':[a.name for a in selected_mod[1:]]})
        archive=selected_mod[0] if selected_mod else next((a for a,ismod in candidates if not ismod),None)
        if archive is None:issues.append(c['name']+'：找不到部署资源');continue
        batches.setdefault(archive,[]).append(item)
    def run(args):
        p=subprocess.run([str(CLI)]+list(map(str,args)),capture_output=True,text=True,encoding="utf-8",errors="replace",timeout=240)
        with log.open('a',encoding='utf-8') as f:f.write(p.stdout+p.stderr+'\n')
        if p.returncode or re.search(r'\bError\b',p.stdout):raise RuntimeError('模型资源转换失败，请查看 '+str(log))
    for index,(archive,records) in enumerate(batches.items()):
        progress('批量提取 '+archive.name)
        out=folder/('raw-archive-'+str(index));out.mkdir(exist_ok=True)
        hashfile=folder/('hashes-'+str(index)+'.txt');hashfile.write_text('\n'.join(str(item['hash']) for item in records),encoding='utf-8')
        run(['unbundle',archive,'--hash',hashfile,'-o',out,'-v','Normal'])
        cooked=[];by_hash={}
        for file in out.rglob('*'):
            if not file.is_file() or file.suffix not in ('.mesh','.morphtarget','.bin'):continue
            rel=str(file.relative_to(out));h=int(file.stem) if file.stem.isdecimal() else fnv(rel)
            if h not in wanted:continue
            if file.suffix=='.bin':
                typ=next((x['component']['type'] for x in records if x['hash']==h),'')
                renamed=file.with_suffix('.morphtarget' if 'MorphTarget' in typ else '.mesh');file.replace(renamed);file=renamed
            cooked.append(file);by_hash[h]=file
            if not file.stem.isdecimal():
                for item in records:
                    if item['hash']==h and not item['component'].get('path'):
                        item['component']['path']=rel
        jsonout=folder/('json-archive-'+str(index));jsonout.mkdir(exist_ok=True)
        run(['cr2w',out,'-s','-o',jsonout,'-v','Normal'])
        jsonfiles={p.name:p for p in jsonout.rglob('*.json')}
        for item in records:
            c=item['component'];h=item['hash'];region=item['region']
            try:
                file=by_hash.get(h)
                if file is None:raise ValueError('未找到提取的网格')
                jp=jsonfiles.get(file.name+'.json')
                if jp is None:raise ValueError('网格转换未产生 JSON')
                doc=json.loads(jp.read_text(encoding='utf-8-sig'));binary,n,tri=geometry(doc,item['mask'])
                filename='part-'+str(len(parts))+'.bin';(folder/filename).write_bytes(binary)
                atlas=region if not any(p['atlas']==region for p in parts) else region+'_'+str(len(parts))
                parts.append({'name':c['name'],'label':c['name'],'atlas':atlas,'url':'/models/'+ident+'/'+filename,'vertices':n,'triangles':tri,'source_resource':c.get('path'),'source_archive':archive.name})
                sources.append({'component':c,'archive':str(archive),'mesh_json':str(jp),'cooked':str(file),'atlas':atlas,'mask':str(item['mask'])})
            except Exception as e:issues.append(c['name']+'：'+str(e))
    if not parts:raise ValueError('没有成功导入网格：'+'；'.join(issues[:3]))
    meta={'id':ident,'body':'游戏角色资源 / '+time.strftime('%H:%M'),'exportProfile':'preview-only','parts':parts,'snapshot_source':snap.get('source'),'captured_at':snap.get('captured_at'),'resource_resolutions':resolutions,'limitations':['资源参考姿势，未还原实时骨骼与 Morph 变形','不同身体与头颈/生殖器的纹身层尚需适配；当前只预览',*issues]}
    (folder/'model.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8');(folder/'sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2),encoding='utf-8')
    return {'id':ident,'url':'/models/'+ident+'/model.json','parts':len(parts),'issues':issues}
