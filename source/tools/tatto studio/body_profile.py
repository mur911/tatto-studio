"""Identify the captured body's physical rig, independently of voice or genitals."""
import json
from pathlib import Path
import re
import resource_session


def _hint(value):
    text=str(value or '').lower().replace('/', '\\')
    result=set()
    if re.search(r'(^|[_\\])pma([_\\.]|$)|player_(?:man|male)_',text):result.add('male')
    if re.search(r'(^|[_\\])pwa([_\\.]|$)|player_(?:woman|female)_',text):result.add('female')
    return result


def _region(record):
    component=record.get('component',{})
    atlas=record.get('atlas','').lower()
    name=str(component.get('name') or '').lower()
    path=str(component.get('path') or '').lower()
    # A female body may use a penis and a male body may use a vagina. Neither
    # these parts nor a shared/custom genital rig identify the host body.
    if atlas.startswith('genitals') or name.startswith('i0_') or any(x in name+path for x in ('genitals','penis','vagina')):return None
    if name.startswith(('t0_','n0_')):return 0
    if name.startswith('l0_'):return 2
    if name.startswith('a0_') or atlas.startswith(('left_arm','right_arm')):return 1
    if name.startswith('h0_') or atlas.startswith(('head','neck')):return 3
    if atlas.startswith('body'):return 0
    return None


def _resource_hints(value):
    if isinstance(value,dict):
        if value.get('$type')=='ResourcePath':return _hint(value.get('$value'))
        result=set()
        for key,child in value.items():
            if key not in ('blob','renderResourceBlob','localMaterialBuffer','targets'):
                result.update(_resource_hints(child))
        return result
    if isinstance(value,list):
        result=set()
        for child in value:result.update(_resource_hints(child))
        return result
    return set()


def detect(records, fallback=None):
    """Prefer torso bindings, then arms, legs and head; reject ambiguous rigs.

    Component names identify the host slot even when a mod reuses a mesh from
    another body. Resource refs are the fallback for anonymous components.
    """
    tiers={i:[] for i in range(4)}
    for record in records:
        rank=_region(record)
        if rank is not None:tiers[rank].append(record)
    for rank in tiers:
        for source in ('name','path','mesh'):
            hints=set()
            for record in tiers[rank]:
                component=record.get('component',{})
                if source=='mesh':
                    file=record.get('mesh_json')
                    if file and Path(file).is_file():
                        doc=json.loads(resource_session.read(Path(file)).decode('utf-8-sig'))
                        hints.update(_resource_hints(doc['Data']['RootChunk']))
                else:hints.update(_hint(component.get(source)))
            if len(hints)>1:raise ValueError('角色快照包含互相冲突的身体类型，请重新读取完整角色快照。')
            if hints:return next(iter(hints))
    if fallback in ('female','male'):return fallback
    raise ValueError('无法识别当前角色的身体类型，请重新读取完整角色快照。')


def context(folder):
    file=Path(folder)/'snapshot-context.json'
    return json.loads(resource_session.read(file).decode('utf-8-sig')) if file.is_file() else {}
