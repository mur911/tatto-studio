"""Compare saved artwork resources with the live collector, without retargeting it."""
import hashlib
import json
import re
from pathlib import Path
import models
import resource_session


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def identity(component):
    raw=re.sub(r'[^0-9]', '', str(component.get('hash', '')))
    return {'resource': int(raw) if raw else models.fnv(component.get('path') or ''),
            'type': component.get('type'), 'parent': component.get('bind_name') or 'root',
            'skinning': component.get('skinning_bind') or 'root',
            'mask': int(re.sub(r'[^0-9]', '', str(component.get('chunk_mask', ''))) or '18446744073709551615') & 0x7fffffffffffffff}


def folder(ident):
    if not re.fullmatch(r'character-[0-9a-f]{12}', ident or ''):
        raise ValueError('Capture a character snapshot before comparing resources.')
    return models.MODELS/ident


def saved(ident, atlases=None):
    root=folder(ident)
    records=json.loads((root/'sources.json').read_text(encoding='utf-8'))
    context=json.loads((root/'snapshot-context.json').read_text(encoding='utf-8')) if (root/'snapshot-context.json').exists() else {}
    selected=[r for r in records if atlases is None or r['atlas'] in atlases]
    summary=[]
    for record in selected:
        comp=record['component']; source=Path(record['mesh_json'])
        summary.append({'atlas':record['atlas'], 'name':comp['name'], 'path':comp.get('path',''),
                        'identity':identity(comp), 'source_sha256':resource_session.sha(source),
                        'archive':record.get('archive'),'archive_stamp':record.get('archive_stamp')})
    return {'model':ident,'parts':summary,'animation_components':context.get('animation_components',[]),'animation_archives':context.get('resource_archive_stamps',{})}


def live():
    snap,_=models.snapshot()
    parts=[c for c in snap['components'] if models.kind(c) and c.get('enabled') is not False]
    stable={'components':sorted([identity(c) for c in parts],key=lambda c:json.dumps(c,sort_keys=True)),
            'animation_components':sorted(snap.get('animation_components',[]),key=lambda c:c.get('name',''))}
    # Session/time are not geometry; a new capture of the same character is compatible.
    return snap,parts,digest(stable)


def compare(ident, atlases=None):
    source=saved(ident,atlases); differences=[]
    try: snap,parts,stamp=live()
    except (ValueError,OSError) as error:
        return {'model':ident,'available':False,'compatible':False,'differences':[],
                'reason':str(error),'signature':digest({'saved':source,'live':None}), 'saved':source}
    rigs={r['name']:r for r in snap.get('animation_components',[])}
    old_rigs={r['name']:r for r in source['animation_components']}
    from archive_order import ordered_archives
    wanted={p['identity']['resource'] for p in source['parts']}
    origins={}
    for archive in ordered_archives(models.GAME):
        if not wanted:break
        found=models.archive_hashes(archive,wanted)
        for h in found:origins[h]=archive.resolve()
        wanted-=found
    for part in source['parts']:
        same=[c for c in parts if identity(c)==part['identity']]
        reason=[]
        if not same:reason.append('resource_or_binding')
        if part.get('archive') and origins.get(part['identity']['resource'])!=Path(part['archive']).resolve():reason.append('resource_origin')
        if part.get('archive_stamp'):
            try:
                stat=Path(part['archive']).stat()
                if part['archive_stamp']!={'size':stat.st_size,'mtime_ns':stat.st_mtime_ns}:reason.append('resource_changed')
            except OSError:reason.append('resource_missing')
        for path,expected in source.get('animation_archives',{}).items():
            try:
                stat=Path(path).stat()
                if expected!={'size':stat.st_size,'mtime_ns':stat.st_mtime_ns}:reason.append('animation_resource_changed')
            except OSError:reason.append('animation_resource_missing')
        for binding in ('parent','skinning'):
            name=part['identity'][binding]
            if name.lower() not in ('root','none') and old_rigs.get(name)!=rigs.get(name):reason.append('animation_source')
        if reason:
            region=part['atlas'].split('_')[0]
            candidates=[{'name':c['name'],'path':c.get('path','')} for c in parts if (models.kind(c) or '').split('_')[0]==region]
            differences.append({'atlas':part['atlas'],'saved':part['path'] or part['name'],'current':candidates,'reasons':sorted(set(reason))})
    if differences:
        print('[TS-SNAPSHOT] '+json.dumps({'model':ident,'differences':differences},ensure_ascii=True),flush=True)
    latest=None
    try:
        imported=json.loads((models.MODELS/'latest-import.json').read_text(encoding='utf-8'))
        if (folder(imported['id'])/'model.json').is_file():latest={**imported,'matches_live':imported['live_signature']==stamp}
    except (OSError,ValueError,KeyError):pass
    return {'model':ident,'available':True,'compatible':not differences,'differences':differences,
            'signature':digest({'saved':source,'live':stamp}),'live_signature':stamp,'latest':latest,'saved':source}


def design_atlases(library,group_id,design_id):
    from storage_paths import BAKED_TEXTURES_NAME
    return [p.stem for p in (library.design_path(group_id,design_id).parent/BAKED_TEXTURES_NAME).glob('*.png') if resource_session.ink(p)]


def preflight(library):
    checks=[]
    for group in library.groups():
        for design in group['designs']:
            if not design['enabled'] or design.get('draft'):continue
            project=library.load(group['id'],design['id']); ident=project.get('model',{}).get('id','')
            atlases=design_atlases(library,group['id'],design['id'])
            check=compare(ident,atlases)
            import design_coverage
            check['coverage']=design_coverage.check(project)
            check['compatible']=check['compatible'] and check['coverage']['complete']
            checks.append({'group_id':group['id'],'design_id':design['id'],'title':design['title'],**check})
    return {'checks':checks,'signature':digest([(c['group_id'],c['design_id'],c['signature']) for c in checks]),
            'requires_choice':any(not c['compatible'] for c in checks)}


def authorize(library, acknowledgment=None):
    report=preflight(library)
    if any(not c['coverage']['complete'] for c in report['checks']):
        import design_coverage
        raise ValueError(design_coverage.ERROR)
    if report['requires_choice'] and acknowledgment!=report['signature']:
        raise ValueError('Review snapshot differences before publishing. Adapt a copy or explicitly keep the original models.')
    return report
