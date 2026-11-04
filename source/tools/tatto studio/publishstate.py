"""Publish into the installed editor mod; keep verified success outside it."""
import hashlib
import json
from pathlib import Path
import shutil
import time
import uuid
import zipfile
import settings

ARCHIVE='tatto_studio_tattoo_library.archive'
MARKER='tatto_studio_tattoo_library.owner.json'
OWNER='tatto_studio-tattoo-library-v03'
EDITOR_MARKER='tatto_studio_editor.owner.json'
EDITOR_OWNER='tatto_studio-editor-v1'


def editor_target(folder):
    """A current editor marker, never an old generated-library marker alone."""
    try:
        folder=Path(folder).resolve();root=folder.parents[2]
        return (json.loads((folder/EDITOR_MARKER).read_text(encoding='utf-8')).get('owner')==EDITOR_OWNER
                and json.loads((root/'tools/tatto studio/release.json').read_text(encoding='utf-8')).get('library_publish_mode')=='editor-mod')
    except (OSError,ValueError,IndexError,AttributeError):return False


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def snapshot_dir():
    return settings.DATA_ROOT/'published-library'


def candidates():
    staging=settings.STAGING
    if not staging or not staging.is_dir():return []
    found=[]
    for marker in staging.glob('*/archive/pc/mod/'+EDITOR_MARKER):
        folder=marker.parent
        try:
            if not marker.resolve().is_relative_to(staging.resolve()) or marker.is_symlink():continue
            if editor_target(folder):found.append(str(folder.resolve()))
        except (OSError,ValueError):continue
    return sorted(found)


def valid_target(value):
    if not isinstance(value,str) or not value:return False
    target=Path(value).resolve()
    if settings.VALUES.get('installation_mode')=='manual':
        return settings.GAME is not None and target==(settings.GAME/'archive/pc/mod').resolve()
    if str(target) in candidates():return True
    return False


def confirm(target):
    values={**settings.read(),'library_publish_target':str(Path(target).resolve()),'library_publish_target_confirmed':True}
    temporary=settings.LOCAL.with_name(settings.LOCAL.name+'.'+uuid.uuid4().hex+'.pending')
    temporary.write_text(json.dumps(values,ensure_ascii=False,indent=2),encoding='utf-8');temporary.replace(settings.LOCAL)
    settings.VALUES=values


def deployed_targets(found):
    if not settings.GAME:return []
    for record_file in (settings.GAME/'vortex.deployment.json',settings.GAME/'archive/pc/mod/vortex.deployment.json'):
        try:
            record=json.loads(record_file.read_text(encoding='utf-8'))
            files=record.get('files',[]) if isinstance(record,dict) else []
            active={f.get('source') for f in files if f.get('relPath','').replace('\\','/').lower() in
                    ('tools/tatto studio/release.json','archive/pc/mod/'+EDITOR_MARKER)}
            selected=[Path(p) for p in found if Path(p).parents[2].name in active]
            if selected:return selected
        except (OSError,ValueError,AttributeError):continue
    return []


def _targets():
    configured=settings.VALUES.get('library_publish_target')
    if configured:
        if valid_target(configured):
            if settings.VALUES.get('installation_mode')!='manual':
                active=deployed_targets(candidates())
                if active and Path(configured).resolve() not in active:
                    raise ValueError('The selected game library target differs from the deployed library. Select the deployed target in Path settings.')
            return [Path(configured).resolve()]
        # Move away from the superseded two-mod workflow only when its owned
        # marker proves what the previous explicit target was. Preserve its files.
        try:legacy=json.loads((Path(configured)/MARKER).read_text(encoding='utf-8')).get('owner')==OWNER
        except (OSError,ValueError,AttributeError):legacy=False
        if not legacy:raise ValueError('The selected game library target is no longer valid. Check Path settings.')
    if settings.VALUES.get('installation_mode')=='manual':
        return [settings.GAME/'archive/pc/mod']
    found=candidates()
    deployed=deployed_targets(found)
    if len(deployed)==1:return deployed
    if len(deployed)>1:raise ValueError('Multiple game library targets were found. Select a publish target in Path settings.')
    own=(Path(__file__).resolve().parents[2]/'archive/pc/mod').resolve()
    if str(own) in found:return [own]
    if len(found)==1:return list(map(Path,found))
    if not found:raise ValueError('Deploy the current Tatto Studio editor, or select its archive/pc/mod folder in Path settings.')
    raise ValueError('Multiple game library targets were found. Select a publish target in Path settings.')


def targets():
    selected=_targets()
    if settings.VALUES.get('installation_mode')=='manual' or not settings.GAME or not settings.STAGING:return selected
    roots={p.parents[2].name for p in selected}
    for record_file in (settings.GAME/'vortex.deployment.json',settings.GAME/'archive/pc/mod/vortex.deployment.json'):
        try:
            record=json.loads(record_file.read_text(encoding='utf-8'))
            for entry in record.get('files',[]):
                if entry.get('relPath','').replace('\\','/').rsplit('/',1)[-1]!=ARCHIVE:continue
                source=entry.get('source','')
                if not source or source in roots or Path(source).name!=source:continue
                marker=settings.STAGING/source/'archive/pc/mod'/MARKER
                if json.loads(marker.read_text(encoding='utf-8')).get('owner')==OWNER:
                    raise ValueError('请先禁用旧的独立纹身库并部署当前 Tatto Studio，再更新纹身库。')
        except (OSError,json.JSONDecodeError,AttributeError,TypeError):continue
    return selected


def validate_package(path):
    with zipfile.ZipFile(path) as z:
        required=['archive/pc/mod/'+n for n in (ARCHIVE,ARCHIVE+'.xl',MARKER)]
        if not all(n in z.namelist() for n in required) or z.testzip() is not None:raise ValueError('The game library backup is incomplete or damaged.')
        if json.loads(z.read(required[2])).get('owner')!=OWNER:raise ValueError('The game library backup has an invalid owner.')
        if not z.getinfo(required[0]).file_size:raise ValueError('The game library archive is empty.')
    return True


def atomic_copy(source,dest):
    dest=Path(dest);dest.parent.mkdir(parents=True,exist_ok=True)
    temp=dest.with_name(dest.name+'.'+uuid.uuid4().hex+'.pending')
    shutil.copyfile(source,temp)
    if sha(source)!=sha(temp):raise ValueError('The published file could not be verified.')
    temp.replace(dest)


def checkpoint(package,fingerprint=None):
    validate_package(package)
    folder=snapshot_dir();folder.mkdir(parents=True,exist_ok=True)
    digest=sha(package);backup=folder/(digest+'.zip')
    if not backup.exists():atomic_copy(package,backup)
    value={'file':backup.name,'sha256':digest,'fingerprint':fingerprint,'timestamp':time.time()}
    temp=folder/'current.json.pending';temp.write_text(json.dumps(value),encoding='utf-8');temp.replace(folder/'current.json')
    # Keep the current and one previous success; never prune personal artwork.
    for old in sorted(folder.glob('*.zip'),key=lambda p:p.stat().st_mtime,reverse=True)[2:]:
        if old!=backup:old.unlink()
    return value


def verified():
    folder=snapshot_dir()
    try:
        meta=json.loads((folder/'current.json').read_text(encoding='utf-8'))
        file=folder/meta['file']
        if file.parent!=folder or sha(file)!=meta['sha256']:return None
        validate_package(file)
        return file,meta
    except (OSError,ValueError,KeyError,zipfile.BadZipFile):return None


def deploy(package,selected=None):
    validate_package(package);selected=targets() if selected is None else selected
    updated=[]
    with zipfile.ZipFile(package) as z:
        for target in selected:
            if not valid_target(str(target)):raise ValueError('The game library target is no longer valid. Check Path settings.')
            target.mkdir(parents=True,exist_ok=True)
            pending=[]
            for name in (ARCHIVE,ARCHIVE+'.xl',MARKER):
                raw=z.read('archive/pc/mod/'+name);dest=target/name
                if dest.is_file() and hashlib.sha256(dest.read_bytes()).digest()==hashlib.sha256(raw).digest():continue
                temp=dest.with_name(name+'.'+uuid.uuid4().hex+'.pending');temp.write_bytes(raw)
                if temp.read_bytes()!=raw:raise ValueError('The published file could not be verified.')
                pending.append((temp,dest))
            backups=[];committed=[]
            try:
                for temp,dest in pending:
                    backup=dest.with_name(dest.name+'.'+uuid.uuid4().hex+'.rollback')
                    if dest.exists():shutil.copyfile(dest,backup)
                    backups.append((backup,dest,dest.exists()))
                for temp,dest in pending:temp.replace(dest);committed.append(dest)
            except OSError:
                for backup,dest,existed in reversed(backups):
                    if dest in committed:
                        if existed:backup.replace(dest)
                        else:dest.unlink(missing_ok=True)
                raise
            finally:
                for backup,_,_ in backups:backup.unlink(missing_ok=True)
                for temp,_ in pending:temp.unlink(missing_ok=True)
            if pending:updated.append(str(target))
    return updated


def restore():
    result=verified()
    if result is None:return {'restored':[],'available':False}
    file,_=result
    updated=deploy(file)
    if not settings.OUTPUT.exists() or sha(settings.OUTPUT)!=sha(file):atomic_copy(file,settings.OUTPUT)
    return {'restored':updated,'available':True,'package':str(settings.OUTPUT)}


def bootstrap():
    if verified():return
    # Prefer the last generated package; fall back to the editor's own build cache
    # or the currently deployed owned resources. Never pick a random editor copy.
    source=settings.OUTPUT
    try:validate_package(source)
    except (OSError,ValueError,zipfile.BadZipFile):
        selected=None
        for folder in [settings.DATA_ROOT/'library-build/package/archive/pc/mod',settings.GAME/'archive/pc/mod' if settings.GAME else None]:
            if folder is None:continue
            try:
                if json.loads((folder/MARKER).read_text(encoding='utf-8')).get('owner')==OWNER and all((folder/n).is_file() for n in (ARCHIVE,ARCHIVE+'.xl',MARKER)):
                    selected=folder;break
            except (OSError,ValueError):continue
        if selected is None:return
        folder=snapshot_dir();folder.mkdir(parents=True,exist_ok=True);source=folder/'legacy-recovery.pending'
        with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED) as z:
            for name in (ARCHIVE,ARCHIVE+'.xl',MARKER):z.write(selected/name,'archive/pc/mod/'+name)
    try:
        validate_package(source)
        folder=snapshot_dir();folder.mkdir(parents=True,exist_ok=True);temp=folder/'upgrade.pending'
        with zipfile.ZipFile(source) as old,zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as new:
            for name in old.namelist():
                if name.startswith(('archive/','licenses/')) and not name.endswith('/'):new.writestr(name,old.read(name))
        validate_package(temp);checkpoint(temp);atomic_copy(temp,settings.OUTPUT);temp.unlink()
    except (OSError,ValueError,zipfile.BadZipFile):return


def prune_build_cache(work,limit=1536*1024*1024):
    """Delete only regenerable, owned build folders; retain the latest generations."""
    work=Path(work).resolve()
    generations=sorted(work.glob('generation-*'),key=lambda p:p.stat().st_mtime,reverse=True)
    for old in generations[2:]:
        if old.is_dir() and not old.is_symlink() and old.resolve().parent==work:shutil.rmtree(old)
    cache=work/'cache'
    if not cache.is_dir() or cache.is_symlink():return
    folders=[]
    for stamp in cache.glob('*/*/character-*/stamp'):
        folder=stamp.parent
        if folder.is_symlink() or not folder.resolve().is_relative_to(cache):continue
        size=sum(p.stat().st_size for p in folder.rglob('*') if p.is_file())
        folders.append((stamp.stat().st_mtime,folder,size))
    for stamp in (work/'profiles').glob('character-*/*/*/profile-manifest.json'):
        folder=stamp.parent
        if folder.is_symlink() or not folder.resolve().is_relative_to(work/'profiles'):continue
        size=sum(p.stat().st_size for p in folder.rglob('*') if p.is_file())
        folders.append((stamp.stat().st_mtime,folder,size))
    total=sum(size for _,_,size in folders)
    for _,folder,size in sorted(folders):
        if total<=limit:break
        shutil.rmtree(folder);total-=size


def fingerprint(library,root,profile_version,pipeline):
    import resource_session
    digest=hashlib.sha256(('resources-v1:'+str(profile_version)+pipeline).encode())
    for file in sorted((root/'templates').rglob('*')):
        if file.is_file():digest.update(str(file.relative_to(root)).encode());digest.update(bytes.fromhex(resource_session.sha(file)))
    models={}
    def model_digest(ident):
        if ident in models:return models[ident]
        folder=settings.DATA_ROOT/'models'/ident;value=hashlib.sha256();files=set()
        meta_file=folder/'model.json'
        if meta_file.is_file():
            meta=json.loads(resource_session.read(meta_file).decode('utf-8-sig'))
            # Pose/skin preview caches and UI labels do not change cooked geometry.
            geometry={k:meta.get(k) for k in ('id','exportProfile','tattooRegionVersion','body_gender')}
            geometry['parts']=[{k:p.get(k) for k in ('atlas','url','vertices','triangles','tattooExcludedRanges')} for p in meta.get('parts',[])]
            value.update(json.dumps(geometry,sort_keys=True).encode())
            files.update(folder/Path(part['url']).name for part in meta.get('parts',[]) if part.get('url'))
        for file,key in [(folder/'sources.json','mesh_json'),(folder/'decal-profile/profile.json','bases')]:
            if not file.is_file():continue
            files.add(file);metadata=json.loads(resource_session.read(file).decode('utf-8-sig'))
            if key=='mesh_json':files.update(Path(record[key]) for record in metadata if record.get(key))
            else:files.update(Path(path) for path in metadata.get('bases',{}).values())
        if (folder/'snapshot-context.json').is_file():files.add(folder/'snapshot-context.json')
        for file in sorted(files):
            value.update(str(file).encode())
            value.update(bytes.fromhex(resource_session.sha(file)) if file.is_file() else b'missing')
        models[ident]=value.digest();return models[ident]
    for group in library.groups():
        metadata=json.loads((library.group_folder(group['id'])/'group.json').read_text(encoding='utf-8'))
        digest.update(json.dumps([group['id'],group['name'],metadata.get('switch_index'),metadata.get('last_domain'),metadata.get('last_domains')],ensure_ascii=False).encode())
        for design in group['designs']:
            if not design['enabled'] or design.get('draft'):continue
            saved=library.load(group['id'],design['id'])
            value={k:saved.get(k) for k in ('id','title','includePubic','game_option_index','bakeVersion','bakeResolution')}
            if any(layer.get('projection')=='warp' and layer.get('placed') and layer.get('visible') is not False for layer in saved.get('layers',[])):value['warpVersion']=saved.get('warpVersion',0)
            model=saved.get('model') or {};value['model']={k:model.get(k) for k in ('id','exportProfile')}
            value['hidden_only']=library.hidden_only(saved)
            digest.update(json.dumps(value,sort_keys=True,ensure_ascii=False).encode())
            folder=library.design_path(group['id'],design['id']).parent
            for file in sorted((folder/'Baked Textures').glob('*.png')):digest.update(file.name.encode());digest.update(bytes.fromhex(resource_session.sha(file)))
            digest.update(model_digest(model.get('id','invalid')))
    return digest.hexdigest()
