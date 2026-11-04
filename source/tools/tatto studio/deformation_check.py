"""Validate animation data before publishing an independently rendered decal."""
import base64
import hashlib
import json


def root(doc):return doc['Data']['RootChunk']
def blob(r):return r['blob']['Data']['baseBlob']['Data'] if r['$type']=='MorphTargetMesh' else r['renderResourceBlob']['Data']


def summary(mesh):
    r=root(mesh);b=blob(r)
    return {'bones':[n['$value'] for n in r.get('boneNames',[])],
            'vertices':sum(c['numVertices'] for c in b['header']['renderChunkInfos']),
            'indices':sum(c['numIndices'] for c in b['header']['renderChunkInfos']),
            'geometry_sha256':hashlib.sha256(base64.b64decode(b['renderBuffer']['Bytes'])).hexdigest()}


def verify(source_mesh, source_morph, output_mesh, output_morph=None):
    src=root(source_mesh);dst=root(output_mesh)
    for key in ('boneNames','boneRigMatrices','lodBoneMask'):
        if src.get(key)!=dst.get(key):raise ValueError('Tattoo animation data validation failed. Original game resources were preserved.')
    a=blob(root(source_morph)) if source_morph else blob(src);b=blob(dst)
    if len(a['header'].get('bonePositions',[]))!=len(src.get('boneNames',[])):
        raise ValueError('Tattoo animation data validation failed. Original game resources were preserved.')
    # The decal offset changes only position XYZ and quantization. Compare the
    # entire remaining buffer: indices, weights, UVs and all other vertex data.
    ah=a['header'];bh=b['header']
    aa=bytearray(base64.b64decode(a['renderBuffer']['Bytes']));bb=bytearray(base64.b64decode(b['renderBuffer']['Bytes']))
    if ah['renderChunkInfos']!=bh['renderChunkInfos'] or len(aa)!=len(bb):raise ValueError('Tattoo animation data validation failed. Original game resources were preserved.')
    for chunk in ah['renderChunkInfos']:
        cv=chunk['chunkVertices'];start=cv['byteOffsets']['Elements'][0];stride=cv['vertexLayout']['slotStrides']['Elements'][0]
        for i in range(chunk['numVertices']):aa[start+i*stride:start+i*stride+6]=bb[start+i*stride:start+i*stride+6]=b'\0'*6
    if aa!=bb:raise ValueError('Tattoo animation data validation failed. Original game resources were preserved.')
    if source_morph:
        sm=root(source_morph);om=root(output_morph)
        for key in ('targets','resourceVersion'):
            if sm.get(key)!=om.get(key):raise ValueError('Tattoo animation data validation failed. Original game resources were preserved.')
        # Preserve delta buffers, target headers and their independent bone palettes.
        for key,value in sm['blob']['Data'].items():
            if key!='baseBlob' and value!=om['blob']['Data'].get(key):raise ValueError('Tattoo animation data validation failed. Original game resources were preserved.')
    return summary(output_mesh)
