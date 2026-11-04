"""Keep embedded non-skin hardware out of skin UV baking.

The vanilla/Hyst left arm includes a personal-link insert whose material uses
an independent texture. Its UVs overlap the shoulder skin. It must remain in
the character preview, but must not write into the skin tattoo atlas.
"""
import json
import re

VERSION = 1
MIN_BAKE_VERSION = 13


def cyberware_skin_candidate(component):
    """Only inspected holstered arm shells, never blades/devices/decals."""
    path=(component.get('path') or '').replace('/', '\\').lower()
    return bool(re.search(r'\\cyberware\\player\\a0_003__mantisblade\\entities\\meshes\\a0_003_(?:ma|wa)__mantisblade_holstered_(?:upperarm_)?(?:left|right)\.mesh$',path))


def cyberware_skin_mask(doc, appearance, mask):
    selected=next((a['Data'] for a in doc['Data']['RootChunk'].get('appearances',[]) if a['Data']['name']['$value']==appearance),None)
    if selected is None:return 0
    allowed=0
    for index,material in enumerate(selected['chunkMaterials']):
        name=material['$value'].lower()
        if re.fullmatch(r'(?:skin_forearm_\d+|(?:(?:forearm|arm)_)?\d{2}_(?:ca|bl)_[a-z0-9_]+)',name):allowed|=1<<index
    return mask & allowed


def excluded_chunks(doc, appearance):
    root = doc['Data']['RootChunk']
    apps = [a['Data'] for a in root.get('appearances', [])]
    selected = next((a for a in apps if a['name']['$value'] == appearance), None)
    if selected is None:
        return set()  # Do not guess when a material assignment is unknown.
    return {i for i, material in enumerate(selected['chunkMaterials'])
            if material['$value'].lower() == 'personal_link'}


def overlay_mask(doc, appearance, mask):
    for chunk in excluded_chunks(doc, appearance):
        mask &= ~(1 << chunk)
    return mask


def excluded_ranges(doc, appearance, mask):
    root = doc['Data']['RootChunk']
    blob = root.get('renderResourceBlob', {}).get('Data')
    if blob is None:
        return []
    excluded = excluded_chunks(doc, appearance)
    ranges, first = [], 0
    for i, chunk in enumerate(blob['header']['renderChunkInfos']):
        if chunk['lodMask'] != 1 or not (mask >> i) & 1:
            continue
        layout = chunk['chunkVertices']['vertexLayout']['slotStrides']['Elements']
        if len(layout) < 3 or min(layout[:3]) <= 0:
            continue
        count = chunk['numIndices']
        if i in excluded:
            ranges.append({'first': first, 'count': count, 'chunk': i})
        first += count
    return ranges


def update_metadata(folder):
    """Only annotate draw ranges; preserve vertex/triangle and anchor indices."""
    meta_path = folder / 'model.json'
    meta = json.loads(meta_path.read_text(encoding='utf-8-sig'))
    if meta.get('tattooRegionVersion') == VERSION:
        return meta
    source_path = folder / 'sources.json'
    if not source_path.exists():
        return meta
    sources = {r['atlas']: r for r in json.loads(source_path.read_text(encoding='utf-8-sig'))}
    for part in meta['parts']:
        source = sources.get(part['atlas'])
        if source:
            with open(source['mesh_json'], encoding='utf-8-sig') as f:
                doc = json.load(f)
            part['tattooExcludedRanges'] = excluded_ranges(doc, source['component'].get('appearance'), int(source['mask']))
    meta['tattooRegionVersion'] = VERSION
    # Atomic replacement avoids leaving a partial metadata file on interruption.
    temp = meta_path.with_suffix('.tattoo-regions.tmp')
    temp.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(meta_path)
    return meta
