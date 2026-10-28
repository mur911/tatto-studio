"""Named tattoo folders, immutable IDs, and atomic project persistence."""
import base64,hashlib,io,json,math,pathlib,re,secrets,shutil,threading,time,unicodedata
from PIL import Image
from userdata import DATA_ROOT
from storage_paths import LIBRARY_NAME,SOURCE_IMAGES_NAME,BAKED_TEXTURES_NAME,LIBRARY_BACKUPS_NAME

ROOT=pathlib.Path(__file__).parent.resolve()
LIBRARY=DATA_ROOT/LIBRARY_NAME
LIBRARY.mkdir(exist_ok=True)
LOCK=threading.RLock()

def name(value):
    value=unicodedata.normalize('NFC',str(value)).strip()
    if not value or len(value)>60 or any(c in value for c in '<>:"/\\|?*') or any(ord(c)<32 for c in value) or value.endswith(('.', ' ')):
        raise ValueError('名称请用 1–60 个字符，不含路径符号')
    if value.casefold() in ('.','..','.trash') or value.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*[f'COM{i}' for i in range(1,10)],*[f'LPT{i}' for i in range(1,10)]}:
        raise ValueError('此名称不能作为文件夹名')
    return value

def atomic(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(path.name+'.'+secrets.token_hex(4)+'.tmp')
    temp.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    temp.replace(path)

def groups():
    result=[]
    for folder in sorted(LIBRARY.iterdir(),key=lambda p:p.name.casefold()):
        if not folder.is_dir() or folder.is_symlink():continue
        meta=folder/'group.json'
        if not meta.exists():continue
        record=json.loads(meta.read_text(encoding='utf-8'))
        designs=[]
        for path in sorted(folder.glob('*/design.tattoo.json')):
            if path.parent.is_symlink():continue
            design=json.loads(path.read_text(encoding='utf-8'))
            designs.append({'id':design['id'],'title':path.parent.name,'enabled':design.get('enabled',True),'draft':design.get('draft',False),'updated':design.get('updated',0),'path':str(path.parent),'layer_count':len(design.get('layers',[])),'thumbnail':'/api/library/thumbnail/'+record['id']+'/'+design['id'],'model':design.get('model',{}).get('name','RB Female'),'has_uv':any(l.get('projection')=='uv' for l in design.get('layers',[]))})
        result.append({'id':record['id'],'name':folder.name,'path':str(folder),'designs':sorted(designs,key=lambda d:d['title'].casefold())})
    ordering=read_order()
    def ranked(items,ids):
        rank={ident:i for i,ident in enumerate(ids)}
        return sorted(items,key=lambda item:rank.get(item['id'],len(rank)))
    for group in result:group['designs']=ranked(group['designs'],ordering.get('designs',{}).get(group['id'],[]))
    return ranked(result,ordering.get('groups',[]))

def read_order():
    path=LIBRARY/'.order.json'
    if not path.exists():return {'groups':[],'designs':{}}
    value=json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(value,dict) or not isinstance(value.get('groups',[]),list) or not isinstance(value.get('designs',{}),dict):raise ValueError('纹身库排序文件无效')
    return value

def reorder(kind,ids,group_id=None):
    if not isinstance(ids,list) or any(not isinstance(x,str) for x in ids) or len(ids)!=len(set(ids)):raise ValueError('排序清单不能重复')
    with LOCK:
        current=groups()
        if kind=='groups':expected=[g['id'] for g in current]
        elif kind=='designs':
            group=next((g for g in current if g['id']==group_id),None)
            if group is None:raise ValueError('纹身文件夹不存在')
            expected=[d['id'] for d in group['designs']]
        else:raise ValueError('排序类别无效')
        if set(expected)!=set(ids):raise ValueError('列表已发生变化，请刷新后重试排序')
        value=read_order()
        if kind=='groups':value['groups']=ids
        else:value.setdefault('designs',{})[group_id]=ids
        atomic(LIBRARY/'.order.json',value)
    return {'ordered':ids}

def group_folder(ident):
    for folder in LIBRARY.iterdir():
        meta=folder/'group.json'
        if folder.is_dir() and not folder.is_symlink() and meta.exists() and json.loads(meta.read_text(encoding='utf-8')).get('id')==ident:return folder
    raise ValueError('纹身文件夹不存在')

def create_group(title):
    title=name(title)
    with LOCK:
        folder=LIBRARY/title
        if folder.exists():raise ValueError('文件夹名称已存在')
        folder.mkdir();ident='g'+secrets.token_hex(5)
        atomic(folder/'group.json',{'id':ident,'created':time.time()})
    return {'id':ident,'name':title,'path':str(folder)}

def rename_group(ident,title):
    title=name(title)
    with LOCK:
        folder=group_folder(ident);target=LIBRARY/title
        if target.exists() and target!=folder:raise ValueError('文件夹名称已存在')
        if target!=folder:folder.rename(target)
    return {'id':ident,'name':title}

def hidden_only(project):
    placed=[layer for layer in project.get('layers',[]) if layer.get('placed')]
    return bool(placed) and all(layer.get('visible') is False for layer in placed)


def validate(project):
    if not isinstance(project,dict) or not isinstance(project.get('layers'),list):raise ValueError('设计文件内容无效')
    if project.get('bakeResolution',2048) not in (2048,4096):raise ValueError('输出清晰度无效')
    for layer in project['layers']:
        warp=layer.get('warp')
        if warp is not None:
            if not isinstance(warp,dict) or type(warp.get('version')) is not int or warp['version']!=1 or not isinstance(warp.get('points'),list) or len(warp['points'])!=9 or any(not isinstance(p,list) or len(p)!=2 or any(not isinstance(v,(int,float)) or isinstance(v,bool) or not math.isfinite(v) or abs(v)>8 for v in p) for p in warp['points']):raise ValueError('曲面贴合控制点无效')
            for y in range(2):
                for x in range(2):
                    for ids in ((y*3+x,y*3+x+1,(y+1)*3+x+1),(y*3+x,(y+1)*3+x+1,(y+1)*3+x)):
                        a,b,c=(warp['points'][i] for i in ids)
                        if (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<.004:raise ValueError('曲面贴合控制点不能互相穿越')
        liquify=layer.get('liquify')
        if liquify is not None:
            if not isinstance(liquify,dict) or type(liquify.get('version')) is not int or liquify['version']!=1 or not isinstance(liquify.get('strokes'),list) or len(liquify['strokes'])>256:raise ValueError('液化数据无效')
            for stroke in liquify['strokes']:
                if not isinstance(stroke,dict):raise ValueError('液化数据无效')
                for key in ('center','delta','radius','normal'):
                    a=stroke.get(key)
                    if not isinstance(a,list) or len(a)!=3 or any(not isinstance(v,(int,float)) or isinstance(v,bool) or not math.isfinite(v) or abs(v)>1e6 or key=='radius' and v<1e-6 for v in a) or key=='normal' and math.hypot(*a)<1e-6:raise ValueError('液化数据无效')
        if layer.get('placementPose','rest') not in ('rest','tpose'):raise ValueError('图层姿势参数无效')
        for flag in ('visible','backfaceCulling','surfaceFollow'):
            if flag in layer and not isinstance(layer[flag],bool):raise ValueError('图层开关参数无效：'+flag)
        for key,lo,hi in [('width',.1,100),('height',.1,100),('angle',-180,180),('opacity',0,100),('depth',.1,math.inf)]:
            v=layer.get(key)
            if not isinstance(v,(int,float)) or not math.isfinite(v) or not lo<=v<=hi:raise ValueError('图层参数无效：'+key)
        for key in ('center','right','up','normal'):
            a=layer.get(key)
            if not isinstance(a,list) or len(a)!=3 or any(not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>20 for v in a):raise ValueError('位置参数无效：'+key)
        value=layer.get('image','')
        if not value.startswith('data:image/png;base64,') or len(value)>34*1024*1024:raise ValueError('图层需要 PNG 原图')
        raw=base64.b64decode(value.split(',',1)[1],validate=True)
        with Image.open(io.BytesIO(raw)) as image:
            if image.format!='PNG' or image.width*image.height>32_000_000:raise ValueError('PNG 尺寸过大')
        if layer.get('projection','surface') not in ('surface','uv','cylindrical','spherical','triplanar','warp'):raise ValueError('投射方式无效')
        if layer.get('blendMode','normal') not in ('normal','multiply','darken','screen','overlay','softlight'):raise ValueError('图层混合模式无效')
        if layer.get('blendTarget','layers') not in ('skin','layers'):raise ValueError('混合对象无效')
        if 'blur' in layer and (not isinstance(layer['blur'],(int,float)) or isinstance(layer['blur'],bool) or not math.isfinite(layer['blur']) or not 0<=layer['blur']<=64):raise ValueError('模糊半径须在 0–64 像素之间')
        if 'removeWhite' in layer and not isinstance(layer['removeWhite'],bool):raise ValueError('去白底设置无效')
        for key,lo,hi in [('radius',.1,100),('wrapAngle',1,360),('sphereAngle',1,180),('blendSharpness',1,16)]:
            if key in layer and (not isinstance(layer[key],(int,float)) or not math.isfinite(layer[key]) or not lo<=layer[key]<=hi):raise ValueError('映射参数无效：'+key)
        if layer.get('wrapMode','clip') not in ('clip','repeat','mirror'):raise ValueError('纹理重复方式无效')
        if 'repeat' in layer and (not isinstance(layer['repeat'],list) or len(layer['repeat'])!=2 or any(not isinstance(v,(int,float)) or not math.isfinite(v) or not .1<=v<=20 for v in layer['repeat'])):raise ValueError('纹理重复次数无效')
        for scale_key in ('cylinderScale','sphereScale','projectionScale'):
            if scale_key in layer and (not isinstance(layer[scale_key],list) or len(layer[scale_key])!=(3 if scale_key=='projectionScale' else 2) or any(not isinstance(v,(int,float)) or isinstance(v,bool) or not math.isfinite(v) or not .001<=v<=1000 for v in layer[scale_key])):raise ValueError('图案缩放参数无效')
        if 'targetAtlas' in layer and (not isinstance(layer['targetAtlas'],str) or not re.fullmatch(r'[a-zA-Z0-9_-]{0,80}',layer['targetAtlas'])):raise ValueError('映射部位无效')
        if layer.get('projection')=='uv':
            for key,count in [('uvCenter',2),('uvSize',2)]:
                a=layer.get(key)
                if not isinstance(a,list) or len(a)!=count or any(not isinstance(v,(int,float)) or not math.isfinite(v) or abs(v)>4 for v in a):raise ValueError('UV 参数无效')
            if min(layer['uvSize'])<=0:raise ValueError('UV 尺寸必须大于零')
    return project

def design_path(group_id,design_id):
    folder=group_folder(group_id)
    for path in folder.glob('*/design.tattoo.json'):
        if path.parent.is_symlink():continue
        if json.loads(path.read_text(encoding='utf-8')).get('id')==design_id:return path
    raise ValueError('纹身设计不存在')

def save(group_id,title,project,design_id=None,atlases=None,require_ink=False):
    validate(project);title=name(title)
    checked_atlases={};has_ink=False
    for key,png in (atlases or {}).items():
        if not re.fullmatch('[a-zA-Z0-9_-]{1,80}',key):raise ValueError('贴图名称无效')
        if not isinstance(png,str) or not png.startswith('data:image/png;base64,') or len(png)>34*1024*1024:raise ValueError('烘焙贴图无效')
        raw=base64.b64decode(png.split(',',1)[1],validate=True)
        with Image.open(io.BytesIO(raw)) as image:
            if image.size!=(project.get('bakeResolution',2048),)*2 or image.format!='PNG':raise ValueError('烘焙贴图尺寸与所选输出清晰度不一致')
            has_ink=has_ink or image.convert('RGBA').getchannel('A').getbbox() is not None
        checked_atlases[key]=raw
    intentional_blank=hidden_only(project) and bool(checked_atlases)
    if require_ink and not has_ink and not intentional_blank:raise ValueError('「'+title+'」没有图案落在当前模型上，已停止适配且未覆盖该设计')
    draft=not has_ink and not intentional_blank
    with LOCK:
        folder=group_folder(group_id);target=folder/title
        previous=design_path(group_id,design_id) if design_id else None
        if target.exists() and (previous is None or target!=previous.parent):raise ValueError('同名纹身已存在，请选择原设计或换一个名字')
        if previous and previous.parent!=target:previous.parent.rename(target)
        ident=design_id or 'd'+secrets.token_hex(5)
        old_project=target/'design.tattoo.json'
        previous_data=json.loads(old_project.read_text(encoding='utf-8')) if old_project.exists() else {}
        enabled=False if draft else True if previous_data.get('draft') else previous_data.get('enabled',True)
        value={**project,'version':4,'id':ident,'title':title,'group_id':group_id,'enabled':enabled,'draft':draft,'updated':time.time()}
        if 'game_option_index' in previous_data:value['game_option_index']=previous_data['game_option_index']
        target.mkdir(exist_ok=True);images=target/SOURCE_IMAGES_NAME;images.mkdir(exist_ok=True)
        for i,layer in enumerate(value['layers']):
            raw=base64.b64decode(layer['image'].split(',',1)[1]);(images/f'{i+1:02d}.png').write_bytes(raw)
        if atlases:
            atlas_dir=target/BAKED_TEXTURES_NAME;atlas_dir.mkdir(exist_ok=True)
            for key,raw in checked_atlases.items():
                (atlas_dir/(key+'.png')).write_bytes(raw)
            value['atlas_keys']=list(atlases)
        atomic(target/'design.tattoo.json',value)
        return {'id':ident,'group_id':group_id,'title':title,'path':str(target),'draft':draft,'updated':value['updated']}

def load(group_id,design_id):return json.loads(design_path(group_id,design_id).read_text(encoding='utf-8'))

def rename_design(group_id,design_id,title):
    title=name(title)
    with LOCK:
        previous=design_path(group_id,design_id);target=previous.parent.with_name(title)
        if target.exists() and target!=previous.parent:raise ValueError('同名纹身已存在')
        value=json.loads(previous.read_text(encoding='utf-8'))
        if target!=previous.parent:previous.parent.rename(target)
        value['title']=title;value['updated']=time.time();atomic(target/'design.tattoo.json',value)
    return {'id':design_id,'title':title,'path':str(target)}


def backup_group(group_id):
    """Keep an independent complete copy before replacing a group's baked maps."""
    with LOCK:
        source=group_folder(group_id)
        if any(p.is_symlink() for p in source.rglob('*')):raise ValueError('分组含链接文件，暂不能自动备份')
        destination=LIBRARY.parent/LIBRARY_BACKUPS_NAME/('migration-'+secrets.token_hex(8))/source.name
        destination.parent.mkdir(parents=True)
        shutil.copytree(source,destination)
    return {'path':str(destination)}

def delete(group_id,design_id=None):
    """Move into a local recoverable bin; never recursively erase user designs."""
    with LOCK:
        source=design_path(group_id,design_id).parent if design_id else group_folder(group_id)
        if source.is_symlink() or not source.resolve().is_relative_to(LIBRARY.resolve()):raise ValueError('目录位置无效')
        ticket=secrets.token_hex(12);trash=LIBRARY/'.trash'/ticket
        if not trash.resolve().is_relative_to(LIBRARY.resolve()):raise ValueError('已删除目录位置无效')
        trash.mkdir(parents=True)
        record={'relative':source.relative_to(LIBRARY).as_posix(),'name':source.name,'group_id':group_id,'design_id':design_id,'time':time.time()}
        atomic(trash/'record.json',record);source.rename(trash/'content')
    return {**record,'ticket':ticket}

def restore(ticket):
    if not isinstance(ticket,str) or not re.fullmatch(r'[0-9a-f]{24}',ticket):raise ValueError('删除记录无效')
    with LOCK:
        trash=LIBRARY/'.trash'/ticket
        if trash.is_symlink() or not trash.resolve().is_relative_to((LIBRARY/'.trash').resolve()):raise ValueError('目录位置无效')
        record=json.loads((trash/'record.json').read_text(encoding='utf-8'))
        target=LIBRARY/record['relative'];source=trash/'content'
        if not target.resolve().is_relative_to(LIBRARY.resolve()) or target.resolve().is_relative_to((LIBRARY/'.trash').resolve()) or source.is_symlink():raise ValueError('恢复位置无效')
        if target.exists():raise ValueError('同名文件夹已存在，请先改名再恢复')
        if not target.parent.is_dir():raise ValueError('请先恢复所属分组')
        if not source.is_dir():raise ValueError('这项内容已经恢复')
        source.rename(target)
    return record

def enable(group_id,design_id,enabled):
    with LOCK:
        p=design_path(group_id,design_id);d=json.loads(p.read_text(encoding='utf-8'))
        if enabled and d.get('draft'):raise ValueError('这是已保存的草稿；请先把图案放到模型上并保存，才可加入游戏')
        d['enabled']=bool(enabled);atomic(p,d)
    return {'enabled':bool(enabled)}
