"""Reject adaptation/publication when a visible layer loses its body region."""
import json
import re
import models

ERROR='Some layers reference body parts missing from this snapshot. Capture a complete snapshot before adapting or publishing.'


def sources(ident):
    if not re.fullmatch(r'character-[0-9a-f]{12}',ident or ''):return []
    return json.loads((models.MODELS/ident/'sources.json').read_text(encoding='utf-8'))


def region(atlas):
    if atlas.startswith(('left_arm','right_arm')):return '_'.join(atlas.split('_')[:2])
    return atlas.split('_')[0]


def check(project, target=None, required_atlases=()):
    origin=project.get('adaptationSourceModel') or project.get('model',{}).get('id')
    saved=sources(origin)
    current=sources(target or project.get('model',{}).get('id'))
    if not current:return {'complete':True,'missing':[]}
    names={r['component']['name']:region(r['atlas']) for r in saved}
    available={region(r['atlas']) for r in current}
    missing=[]
    for index,layer in enumerate(project.get('layers',[])):
        if layer.get('visible') is False or not layer.get('placed'):continue
        part=layer.get('part') or ''
        needed=names.get(part) or models.kind({'name':part})
        if layer.get('projection')=='uv':needed=region(layer.get('uvAtlas',''))
        if needed and needed not in available:
            missing.append({'layer':index,'name':layer.get('name',''),'part':part,'region':needed})
    for atlas in required_atlases:
        needed=region(atlas)
        if needed not in available and not any(r['region']==needed for r in missing):
            missing.append({'layer':None,'name':'','part':atlas,'region':needed})
    return {'complete':not missing,'missing':missing}


def validate(project, target=None, required_atlases=()):
    result=check(project,target,required_atlases)
    if not result['complete']:
        print('[TS-COVERAGE] '+json.dumps(result,ensure_ascii=True),flush=True)
        raise ValueError(ERROR)
    return result
