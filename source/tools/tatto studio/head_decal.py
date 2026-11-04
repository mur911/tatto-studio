"""Convert a private skin head copy to the native facial-decal vertex layout.

Keep vertices, weights, UVs and index order. Skin-only garment morph offsets
and light-blocker input do not belong to a separate facial tattoo component.
"""
import base64
import copy

_SIZE={'PT_Short4N':8,'PT_UByte4':4,'PT_UByte4N':4,'PT_Float16_2':4,
       'PT_Dec4':4,'PT_Color':4,'PT_Float16_4':8,'PT_Float1':4,
       'PT_Float2':8,'PT_Float3':12,'PT_Float4':16,'PT_UInt4':16,'PT_Invalid':0}
_SKIN_ONLY={'PS_ExtraData','PS_LightBlockerIntensity'}


def _unsupported(detail):
    # Reuse the translated model-format message; keep the exact diagnostic
    # in the exception chain written to the backend log.
    raise ValueError('该模型的顶点格式尚未支持') from ValueError(detail)


def normalize(mesh):
    root=mesh['Data']['RootChunk'];blob=root['renderResourceBlob']['Data']
    header=blob['header'];chunks=header['renderChunkInfos']
    if not any(e['usage'] in _SKIN_ONLY for c in chunks for e in c['chunkVertices']['vertexLayout']['elements']['Elements']):
        return False
    source=base64.b64decode(blob['renderBuffer']['Bytes']);rebuilt=bytearray();shared={}
    index_start=header['indexBufferOffset'];index_size=header['indexBufferSize']
    if index_start+index_size!=len(source):_unsupported('Unsupported head render-buffer trailer')
    for chunk in chunks:
        vertices=chunk['chunkVertices'];layout=vertices['vertexLayout'];elements=layout['elements']['Elements']
        offsets=vertices['byteOffsets']['Elements'];strides=layout['slotStrides']['Elements']
        old_cursor={};kept=[];fields={};new_strides=[0]*8
        for element in elements:
            usage=element['usage'];stream=element['streamIndex'];packing=element['type']
            if packing not in _SIZE:_unsupported('Unsupported head vertex packing: '+packing)
            size=_SIZE[packing];relative=old_cursor.get(stream,0);old_cursor[stream]=relative+size
            if usage in _SKIN_ONLY:continue
            kept.append(copy.deepcopy(element));new_strides[stream]+=size
            if element['streamType']=='ST_PerVertex':fields.setdefault(stream,[]).append((relative,size))
        new_offsets=[0]*len(offsets)
        for stream,entries in fields.items():
            if stream>=len(offsets) or old_cursor[stream]!=strides[stream]:
                _unsupported('Unsupported padded head vertex stream')
            start=offsets[stream];count=chunk['numVertices'];stride=strides[stream]
            key=(start,count,stride,tuple(entries))
            if start+count*stride>index_start:_unsupported('Head vertex stream exceeds vertex buffer')
            if key not in shared:
                rebuilt.extend(b'\0'*((-len(rebuilt))%16));shared[key]=len(rebuilt)
                for index in range(count):
                    for relative,size in entries:
                        offset=start+index*stride+relative
                        rebuilt.extend(source[offset:offset+size])
            new_offsets[stream]=shared[key]
        layout['elements']['Elements']=kept
        layout['slotStrides']['Elements']=new_strides
        layout['slotMask']=sum(1<<i for i,stride in enumerate(new_strides) if stride)
        joint_streams=sum(e['usage']=='PS_SkinIndices' for e in kept)
        if joint_streams not in (1,2):_unsupported('Unsupported head skin weights')
        chunk['vertexFactory']=2+joint_streams
        # Native eight-weight facial tattoos use this exact standard layout.
        layout['hash']=3139477226 if joint_streams==2 and new_strides==[24,4,8,8,0,0,0,64] else 0
        vertices['byteOffsets']['Elements']=new_offsets
    header['vertexBufferSize']=len(rebuilt)
    rebuilt.extend(b'\0'*((-len(rebuilt))%1024))
    header['indexBufferOffset']=len(rebuilt)
    rebuilt.extend(source[index_start:index_start+index_size])
    blob['renderBuffer']['Bytes']=base64.b64encode(rebuilt).decode('ascii')
    root['parameters']=[p for p in root.get('parameters',[]) if p.get('Data',{}).get('$type')!='meshMeshParamGarmentSupport']
    return True
