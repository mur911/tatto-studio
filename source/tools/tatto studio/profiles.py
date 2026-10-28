"""Build private decal resources from locally captured meshes, never a fixed body.

Files here are local generated content, not redistributable base-mod assets.
The rest-pose editor does not reconstruct a player's facial morph weights.
"""
import base64
import copy
import hashlib
import json
import pathlib
import re
import struct
import subprocess
import numpy as np
from PIL import Image
import models
import tattoo_regions
from archive_order import ordered_archives
from native_compression import ensure_native_codec

ROOT = pathlib.Path(__file__).resolve().parent
OLD = r'tatto_studio\diy_tattoo_rb_v01'
VERSION = 7


def load(file):
    return json.loads(file.read_text(encoding='utf-8-sig'))


def cname(value):
    return {'$type': 'CName', '$storage': 'string', '$value': value}


def resource(value, flags='Default'):
    return {'DepotPath': {'$type': 'ResourcePath', '$storage': 'string', '$value': value}, 'Flags': flags}


def model_folder(ident):
    if not re.fullmatch(r'character-[0-9a-f]{12}', ident or ''):
        raise ValueError('角色模型标识无效')
    folder = (models.MODELS / ident).resolve()
    if not folder.is_relative_to(models.MODELS.resolve()) or not (folder / 'sources.json').is_file():
        raise ValueError('角色资源缓存不在本机，请重新读取游戏角色快照')
    return folder


def run(args, log):
    ensure_native_codec(models.GAME)
    p = subprocess.run([str(models.CLI), *map(str, args)], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=240)
    with log.open('a', encoding='utf-8') as f:
        f.write(p.stdout + p.stderr + '\n')
    if p.returncode or re.search(r'\bError\b', p.stdout) or "Oodle couldn't be loaded" in p.stdout + p.stderr:
        raise ValueError('角色纹身资源转换失败，详见 ' + str(log))


def prepare(ident, progress=lambda _: None):
    """Extract only the native CMesh dependencies of captured morph resources."""
    folder = model_folder(ident)
    records = load(folder / 'sources.json')
    if not any('player_female_average' in r['component'].get('path','') or '_pwa_' in r['component'].get('name','') for r in records):
        raise ValueError('当前测试版的游戏选项仅支持女V；其他角色可预览，尚不能生成纹身输出。')
    work = folder / 'decal-profile'
    work.mkdir(exist_ok=True)
    (work / 'json').mkdir(exist_ok=True)
    dependencies = {}
    for record in records:
        doc = load(pathlib.Path(record['mesh_json']))
        root = doc['Data']['RootChunk']
        if root['$type'] != 'MorphTargetMesh':
            continue
        path = root['baseMesh']['DepotPath']['$value']
        h = models.fnv(path)
        output = work / 'json' / (pathlib.PureWindowsPath(path).name + '.json')
        if output.exists():
            dependencies[record['atlas']] = str(output)
            continue
        archive = next((p for p in ordered_archives(models.GAME) if h in models.archive_hashes(p, {h})), None)
        if archive is None:
            raise ValueError('Morph基础网格来源缺失：' + path)
        dependencies[record['atlas']] = {'archive': str(archive), 'hash': h, 'path': path, 'output': str(output)}
    batches = {}
    for value in dependencies.values():
        if isinstance(value, dict):
            batches.setdefault(value['archive'], []).append(value)
    for i, (archive, entries) in enumerate(batches.items()):
        progress('准备实际网格骨骼与变形：' + pathlib.Path(archive).name)
        raw = work / ('raw-' + str(i))
        raw.mkdir(exist_ok=True)
        hashes = work / ('hashes-' + str(i) + '.txt')
        hashes.write_text('\n'.join(str(e['hash']) for e in entries), encoding='utf-8')
        run(['unbundle', archive, '--hash', hashes, '-o', raw, '-v', 'Normal'], work / 'build.log')
        # Numeric-only unknown paths still contain an ordinary CMesh resource.
        for e in entries:
            unknown = raw / (str(e['hash']) + '.bin')
            if unknown.exists():
                unknown.rename(raw / (pathlib.PureWindowsPath(e['path']).name))
        run(['cr2w', raw, '-s', '-o', work / 'json', '-v', 'Normal'], work / 'build.log')
        for e in entries:
            files = list((work / 'json').rglob(pathlib.PureWindowsPath(e['path']).name + '.json'))
            if len(files) != 1:
                raise ValueError('未提取到实际基础网格：' + e['path'])
            dependencies[next(k for k, v in dependencies.items() if v is e)] = str(files[0])
    result = {'version': VERSION, 'bases': dependencies, 'experimental': True}
    (work / 'profile.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    meta = load(folder / 'model.json')
    meta['exportProfile'] = 'captured-decal-v1'
    meta['limitations'] = [x for x in meta.get('limitations', []) if '当前只预览' not in x and '头颈设计请单独建分组' not in x]
    warning = '实际网格纹身输出为测试版；支持头颈与身体同组，首次请核对第一人称显示；脸型预览仍为参考形状'
    if warning not in meta['limitations']:
        meta['limitations'].insert(0, warning)
    (folder / 'model.json').write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
    return result


def offset_blob(blob, distance=.00035):
    """Move only packed XYZ, preserving normals, UVs, skin weights and indices."""
    header = blob['header']
    data = bytearray(base64.b64decode(blob['renderBuffer']['Bytes']))
    scale = np.array([header['quantizationScale'][k] for k in 'XYZ'])
    center = np.array([header['quantizationOffset'][k] for k in 'XYZ'])
    chunks = []
    seen = set()
    for chunk in header['renderChunkInfos']:
        n = chunk['numVertices']
        offsets = chunk['chunkVertices']['byteOffsets']['Elements']
        strides = chunk['chunkVertices']['vertexLayout']['slotStrides']['Elements']
        if (offsets[0], n, strides[0]) in seen:
            continue
        seen.add((offsets[0], n, strides[0]))
        elements = chunk['chunkVertices']['vertexLayout']['elements']['Elements']
        layout = {e['usage']: e['type'] for e in elements if e.get('usageIndex', 0) == 0}
        if layout.get('PS_Position') != 'PT_Short4N' or layout.get('PS_Normal') != 'PT_Dec4':
            raise ValueError('该模型的顶点格式尚未支持')
        packed = np.ndarray((n, 4), '<i2', buffer=data, offset=offsets[0], strides=(strides[0], 2))
        normals = np.ndarray((n,), '<u4', buffer=data, offset=offsets[2], strides=(strides[2],))
        direction = np.column_stack([((normals >> (i * 10)) & 1023) / 1023 * 2 - 1 for i in range(3)])
        direction /= np.maximum(np.linalg.norm(direction, axis=1, keepdims=True), 1e-10)
        positions = packed[:, :3].astype(np.float64) / 32767 * scale + center + direction * distance
        chunks.append((packed, positions))
    lo = np.minimum.reduce([p.min(axis=0) for _, p in chunks])
    hi = np.maximum.reduce([p.max(axis=0) for _, p in chunks])
    new_center = (lo + hi) / 2
    new_scale = np.maximum((hi - lo) / 2 + .00001, 1e-6)
    for packed, positions in chunks:
        quantized = np.rint((positions - new_center) / new_scale * 32767)
        if np.max(np.abs(quantized)) > 32767:
            raise ValueError('网格量化超出范围，已停止输出')
        packed[:, :3] = quantized.astype('<i2')
    for i, key in enumerate('XYZ'):
        header['quantizationScale'][key] = float(new_scale[i])
        header['quantizationOffset'][key] = float(new_center[i])
    blob['renderBuffer']['Bytes'] = base64.b64encode(data).decode()


def decal_mesh(doc, atlas, source_blob=None):
    result = copy.deepcopy(doc)
    root = result['Data']['RootChunk']
    template = load(ROOT / 'templates/json/body.mesh.json')['Data']['RootChunk']
    if source_blob is not None:
        root['renderResourceBlob']['Data'] = copy.deepcopy(source_blob)
    offset_blob(root['renderResourceBlob']['Data'])
    chunks = len(root['renderResourceBlob']['Data']['header']['renderChunkInfos'])
    material = 'tatto_studio_diy_rb_' + atlas
    for key in ('appearances', 'materialEntries', 'localMaterialBuffer'):
        root[key] = copy.deepcopy(template[key])
    root['appearances'][0]['Data']['name'] = cname(material)
    root['appearances'][0]['Data']['chunkMaterials'] = [cname(material) for _ in range(chunks)]
    root['materialEntries'][0]['name'] = cname(material)
    root['localMaterialBuffer']['materials'][0]['values'][0]['DiffuseTexture'] = resource(OLD + '\\textures\\' + atlas + '.xbm')
    for key in ('externalMaterials', 'preloadExternalMaterials', 'preloadLocalMaterialInstances'):
        if key in root:
            root[key] = []
    # Preserve conservative source bounds, expanded by more than the decal offset.
    for side, sign in (('Min', -1), ('Max', 1)):
        for key in 'XYZ':
            root['boundingBox'][side][key] += sign * .001
    return result


def component_dependencies(components):
    """Preload actual component resources, not the fixed-body template's meshes."""
    refs = {}

    def visit(value):
        if isinstance(value, dict):
            depot = value.get('DepotPath')
            if isinstance(depot, dict):
                path = depot.get('$value')
                if path and path != '0':
                    refs[(depot.get('$storage'), str(path))] = {
                        'DepotPath': copy.deepcopy(depot), 'Flags': 'Soft'
                    }
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)

    visit(components)
    return [refs[key] for key in sorted(refs)]


def appearance(components, name='tatto_studio_diy_rb_on'):
    app = load(ROOT / 'templates/json/tattoos.app.json')
    definition = app['Data']['RootChunk']['appearances'][0]['Data']
    definition['name'] = cname(name)
    definition['components'] = copy.deepcopy(components)
    package = definition['compiledData']['Data']
    package['Chunks'] = copy.deepcopy(components)
    package['CruidDict'] = {str(i): c['id'] for i, c in enumerate(components)}
    definition['resolvedDependencies'] = component_dependencies(components)
    definition['looseDependencies'] = []
    definition['partsOverrides'] = []
    definition['partsValues'] = []
    return app


def overlay_component_type(record, morph):
    """Keep the source deformation path, including ordinary seam-fix meshes.

    A garment component is not interchangeable with a plain skinned component:
    its mesh may carry garment support streams which the source did not use.
    Older snapshots without a type retain the existing template fallback.
    """
    if morph:
        return 'entMorphTargetSkinnedMeshComponent'
    source_type = record.get('component', {}).get('type')
    if source_type in ('entSkinnedMeshComponent', 'entGarmentSkinnedMeshComponent'):
        return source_type
    return 'entGarmentSkinnedMeshComponent'


def overlay_component_name(record):
    """Keep body-part garment classification as well as a private identity.

    No prefix means garment score zero; it is not equivalent to a0_/t0_.
    A copied arm with an unclassified name can shrink against its own skin.
    Preserve the source body prefix so both layers share the body exception.
    """
    source = record.get('component', {}).get('name', '')
    match = re.match(r'^([a-z]0_)', source, re.IGNORECASE)
    region = record['atlas'].split('_')[0]
    prefix = match[1] if match else {
        'head': 'h0_', 'neck': 'h0_', 'left': 'a0_',
        'right': 'a0_', 'genitals': 'i0_',
    }.get(region, 't0_')
    return prefix + 'tatto_studio_diy_rb_' + record['atlas']


def hide_rules(lines, aliases):
    """Keep complete native tag definitions; extend only with private names."""
    def blocks(text):
        result = {}
        tag = None
        for line in text:
            match = re.fullmatch(r'    ([\w_]+):', line)
            if match:
                tag = match[1]
                result[tag] = []
            elif tag and line.startswith('      '):
                result[tag].append(line)
        return result
    native = blocks((ROOT / 'templates/native-visual-tags.xl').read_text(encoding='utf-8').splitlines())
    current = blocks(lines)
    head = any(a['atlas'].split('_')[0] in ('head', 'neck') for a in aliases)
    if head and 'hide_Head' not in current:
        current['hide_Head'] = native['hide_Head'][:]
    for tag, entries in current.items():
        additions = []
        for entry in entries:
            match = re.match(r'      ([\w_]+):\s*(\{[^}]+\})', entry)
            if not match or 'tatto_studio_' in match[1]:
                continue
            for alias in aliases:
                if alias['original'].startswith(match[1]):
                    additions.append('      ' + alias['overlay'] + ': ' + match[2])
        for alias in aliases:
            if alias['atlas'].split('_')[0] == 'genitals' and tag in ('hide_Legs', 'hide_LowerAbdomen', 'hide_Torso'):
                additions.append('      ' + alias['overlay'] + ': {hide: 0}')
            if tag == 'hide_Head' and alias['atlas'].split('_')[0] in ('head', 'neck'):
                additions.append('      ' + alias['overlay'] + ': {hide: 0}')
        # One component can match both an exact and a prefix native rule.
        entries.extend(dict.fromkeys(additions))
    genital_names = [a['overlay'] for a in aliases if a['atlas'].split('_')[0] == 'genitals']
    if genital_names:
        current.setdefault('hide_Genitals', []).extend('      ' + n + ': {hide: 0}' for n in genital_names)
    prefix = lines[:next(i for i, line in enumerate(lines) if line == 'overrides:')]
    result = prefix + ['overrides:', '  tags:']
    for tag, entries in current.items():
        result.extend(['    ' + tag + ':', *dict.fromkeys(entries)])
    return result


def generate(ident, atlas_dir, out, progress=lambda _: None, *, allow_blank=False, blank_domain='body'):
    folder = model_folder(ident)
    if not (folder / 'decal-profile/profile.json').exists():
        prepare(ident, progress)
    profile = load(folder / 'decal-profile/profile.json')
    sources = load(folder / 'sources.json')
    active = []
    for record in sources:
        file = atlas_dir / (record['atlas'] + '.png')
        if not file.exists():
            raise ValueError('设计缺少当前角色的烘焙贴图，请重新打开并保存')
        with Image.open(file) as image:
            if image.convert('RGBA').getchannel('A').getbbox():
                active.append(record)
    if not active and allow_blank:
        # Keep one transparent overlay so the same game option clears old ink.
        matching=[r for r in sources if ('head' if r['atlas'].split('_')[0] in ('head','neck') else 'body')==blank_domain]
        active=(matching or sources)[:1]
    if not active:
        raise ValueError('没有纹身落在当前角色上')
    domains = {'head' if r['atlas'].split('_')[0] in ('head', 'neck') else 'body' for r in active}
    out.mkdir(parents=True, exist_ok=True)
    # These are generated templates, not saved designs. Remove stale head parts
    # when a design later changes from mixed to body-only.
    for file in out.glob('*.json'):
        if file.name.endswith(('.mesh.json','.morphtarget.json','.app.json')):file.unlink()
    components = []
    head_components = []
    aliases = []
    for i, record in enumerate(active):
        atlas = record['atlas']
        original = load(pathlib.Path(record['mesh_json']))
        original_root = original['Data']['RootChunk']
        morph = original_root['$type'] == 'MorphTargetMesh'
        native_mesh = load(pathlib.Path(profile['bases'][atlas])) if morph else original
        blob = original_root['blob']['Data']['baseBlob']['Data'] if morph else None
        mesh = decal_mesh(native_mesh, atlas, blob)
        (out / (atlas + '.mesh.json')).write_text(json.dumps(mesh), encoding='utf-8')
        if morph:
            target = copy.deepcopy(original)
            root = target['Data']['RootChunk']
            root['baseMesh'] = resource(OLD + '\\meshes\\' + atlas + '.mesh')
            root['baseMeshAppearance'] = cname('tatto_studio_diy_rb_' + atlas)
            root['blob']['Data']['baseBlob']['Data'] = copy.deepcopy(mesh['Data']['RootChunk']['renderResourceBlob']['Data'])
            (out / (atlas + '.morphtarget.json')).write_text(json.dumps(target), encoding='utf-8')
        template = load(ROOT / ('templates/json/pubic.app.json' if morph else 'templates/json/tattoos.app.json'))
        component = copy.deepcopy(template['Data']['RootChunk']['appearances'][0]['Data']['compiledData']['Data']['Chunks'][0])
        component['$type'] = overlay_component_type(record, morph)
        component['id'] = str(7812330769892095700 + i)
        component['name'] = cname(overlay_component_name(record))
        component['meshAppearance'] = cname('tatto_studio_diy_rb_' + atlas)
        component['chunkMask'] = str(tattoo_regions.overlay_mask(original, record['component'].get('appearance'), int(record['mask'])) & 0x7fffffffffffffff)
        component['morphResource' if morph else 'mesh'] = resource(OLD + '\\meshes\\' + atlas + ('.morphtarget' if morph else '.mesh'))
        for j, key in enumerate(('parentTransform', 'skinning')):
            component[key]['HandleId'] = str(100 + i * 2 + j)
            component[key]['Data']['bindName'] = cname(record['component'].get('bind_name' if key == 'parentTransform' else 'skinning_bind') or 'root')
        # Keep supported native dangle bindings available across photo-mode
        # and perspective transitions, independently of the naked-body slot.
        if atlas.split('_')[0]=='genitals' and record['component'].get('skinning_bind')=='penis_dangles':
            rig=copy.deepcopy(next(c for c in load(ROOT/'templates/json/pubic.app.json')['Data']['RootChunk']['appearances'][0]['Data']['compiledData']['Data']['Chunks'] if c['$type']=='entAnimatedComponent'))
            rig_name='tatto_studio_diy_rb_'+atlas+'_rig';rig['name']=cname(rig_name);rig['id']=str(7812330769892095900+i)
            for j,key in enumerate(('parentTransform','controlBinding')):rig[key]['HandleId']=str(500+i*2+j)
            for key in ('parentTransform','skinning'):component[key]['Data']['bindName']=cname(rig_name)
            components.append(rig)
        if len(domains)>1 and atlas.split('_')[0] in ('head','neck'):head_components.append(component)
        else:components.append(component)
        aliases.append({'original': record['component']['name'], 'overlay': overlay_component_name(record), 'atlas': atlas})
    (out / 'tattoos.app.json').write_text(json.dumps(appearance(components)), encoding='utf-8')
    if head_components:
        (out / 'head_overlay.app.json').write_text(json.dumps(appearance(head_components,'tatto_studio_diy_rb_head_on')), encoding='utf-8')
    info = load(ROOT / 'templates/json/diy_pwa.inkcharcustomization.json')
    root = info['Data']['RootChunk']
    options = root['bodyCustomizationOptions'][:3]
    switch = options[0]['Data']
    switch['options'] = switch['options'][:2]
    switch['options'][0]['names'] = [cname('tatto_studio_diy_rb_off')]
    switch['options'][1]['names'] = [cname('tatto_studio_diy_rb_on')]
    switch['uiSlots'] = [options[1]['Data']['uiSlot']]
    if head_components:
        extra=copy.deepcopy(options[1:3])
        for suffix,entry in zip(('off','on'),extra):
            entry['Data']['name']=cname('tatto_studio_diy_rb_head_'+suffix)
            entry['Data']['uiSlot']=cname('tatto_studio_diy_rb_head_slot')
        extra[1]['Data']['resource']=resource(OLD+'\\appearances\\head_overlay.app','Soft')
        extra[1]['Data']['definitions'][0]['name']=cname('tatto_studio_diy_rb_head_on')
        for i,entry in enumerate(extra,3):entry['HandleId']=str(i)
        options.extend(extra)
        switch['uiSlots'].append(cname('tatto_studio_diy_rb_head_slot'))
        switch['options'][0]['names'].append(cname('tatto_studio_diy_rb_head_off'))
        switch['options'][1]['names'].append(cname('tatto_studio_diy_rb_head_on'))
    # One visible selector drives private body/head appearances in the same
    # customization category. FPP only enumerates the body appearance slots.
    names = [cname('tatto_studio_diy_rb_' + x) for x in ('switch', 'off', 'on')]
    combined_names=names+[cname('tatto_studio_diy_rb_head_'+x) for x in ('off','on')] if head_components else names
    group_names = ['TPP', 'TPP_photomode', 'character_customization'] if domains == {'head'} else ['FPP_Body', 'TPP_Body', 'character_creation']
    root['headCustomizationOptions'] = options if domains == {'head'} else []
    root['bodyCustomizationOptions'] = options if 'body' in domains else []
    root['headGroups'] = [{'$type': 'gameuiOptionsGroup', 'name': cname(g), 'options': names} for g in group_names] if domains == {'head'} else []
    root['bodyGroups'] = [{'$type': 'gameuiOptionsGroup', 'name': cname(g), 'options': names if g=='FPP_Body' else combined_names} for g in group_names] if 'body' in domains else []
    (out / 'diy_pwa.inkcharcustomization.json').write_text(json.dumps(info), encoding='utf-8')
    result = {'version': VERSION, 'cache_version':VERSION,'domain': 'mixed' if len(domains)>1 else next(iter(domains)), 'option_domain':'body' if 'body' in domains else 'head','domains':sorted(domains),'atlases': [r['atlas'] for r in active], 'aliases': aliases, 'experimental': True}
    (out / 'profile-manifest.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result
