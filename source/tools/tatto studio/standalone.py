"""Build a standalone current-design mod without changing the user's library."""
from storage_paths import BAKED_TEXTURES_NAME
import base64,copy,hashlib,io,json,pathlib,re,zipfile
from PIL import Image
import library,publisher,models

class SingleDesignLibrary:
    atomic=staticmethod(library.atomic)
    def __init__(self,root,group,design):self.root=root;self.group=group;self.design=design
    def groups(self):return [copy.deepcopy(self.group)]
    def group_folder(self,ident):
        if ident!=self.group['id']:raise ValueError('导出分组无效')
        return self.root
    def design_path(self,group_id,design_id):
        self.group_folder(group_id)
        if design_id!=self.design['id']:raise ValueError('导出设计无效')
        return self.root/'design'/'design.tattoo.json'
    def load(self,group_id,design_id):return json.loads(self.design_path(group_id,design_id).read_text(encoding='utf-8'))

def build(folder,payload,progress=lambda _:None):
    folder=pathlib.Path(folder).resolve();folder.mkdir(parents=True,exist_ok=True)
    project=copy.deepcopy(payload['project']);library.validate(project)
    title=library.name(project.get('title') or 'Untitled Tattoo')
    source_id=project.get('assetId')
    if not isinstance(source_id,str) or not 1<=len(source_id)<=180:raise ValueError('缺少有效的设计标识，请重新导出')
    ident=hashlib.sha256(source_id.encode()).hexdigest()[:16]
    gid='g'+ident[:10];did='d'+ident[6:16]
    model=project.get('model',{});model_id=model.get('id','rb')
    if not re.fullmatch(r'character-[0-9a-f]{12}',model_id):raise ValueError('请选择本机可输出的角色快照')
    isolated=folder/'isolated-library';design_dir=isolated/'design';atlases=design_dir/BAKED_TEXTURES_NAME;atlases.mkdir(parents=True,exist_ok=True)
    has_ink=False
    for key,value in payload.get('atlases',{}).items():
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}',key) or not isinstance(value,str) or not value.startswith('data:image/png;base64,') or len(value)>34*1024*1024:raise ValueError('导出贴图无效')
        raw=base64.b64decode(value.split(',',1)[1],validate=True)
        with Image.open(io.BytesIO(raw)) as image:
            if image.format!='PNG' or image.size!=(project.get('bakeResolution',2048),)*2:raise ValueError('导出贴图尺寸无效')
            has_ink=has_ink or image.convert('RGBA').getchannel('A').getbbox() is not None
        (atlases/(key+'.png')).write_bytes(raw)
    if not has_ink and not (library.hidden_only(project) and any(atlases.glob('*.png'))):raise ValueError('没有纹身落在模型上，请先放置图片')
    value={**project,'id':did,'group_id':gid,'title':title,'enabled':True,'draft':False,'game_option_index':1}
    library.atomic(design_dir/'design.tattoo.json',value)
    # Stable identities let re-export replace this design without replacing the shared library.
    library.atomic(isolated/'group.json',{'id':gid,'switch_index':36000+int(ident[:6],16)})
    entry={'id':did,'title':title,'enabled':True,'draft':False}
    group={'id':gid,'name':title,'designs':[entry]}
    facade=SingleDesignLibrary(isolated,group,entry)
    build_dir=folder/'build';output=folder/('Tattoo_'+ident+'.zip')
    if not publisher.PUBLISH_LOCK.acquire(blocking=False):raise ValueError('已有纹身构建任务，请稍后再导出')
    try:
        result=publisher._publish(progress,library_api=facade,work=build_dir,output=output,standalone_id=ident,update_staging=False,include_collector=False)
    finally:publisher.PUBLISH_LOCK.release()
    dependencies=[]
    if model_id!='rb':
        source=models.MODELS/model_id/'sources.json'
        if source.exists():dependencies=sorted({pathlib.PureWindowsPath(r.get('archive','')).name for r in json.loads(source.read_text(encoding='utf-8')) if r.get('archive')})
    manifest={'format':'tattoo-workbench-standalone','version':1,'assetId':source_id,'title':title,'model':model,'body_archives':dependencies,'body_specific':True,'native_clothing_hide_rules':True,'collector_required':False,'editor_service_required':False,'game_tested':False,'archive':'twb_'+ident+'.archive'}
    # _publish already closed its ZIP. Append only portable assets and metadata.
    with zipfile.ZipFile(output,'a',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('design.tattoo.json',json.dumps(project,ensure_ascii=False,indent=2))
        archive.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2))
    (folder/'design.tattoo.json').write_text(json.dumps(project,ensure_ascii=False,indent=2),encoding='utf-8')
    library.atomic(folder/'verification.json',manifest)
    return {'package':str(output),'file':output.name,'title':title,'model':model.get('name',model_id),'updated_staging':[],'game_tested':False,'deployed':False,'designs':result['designs']}
