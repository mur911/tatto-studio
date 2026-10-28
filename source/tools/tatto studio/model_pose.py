"""Generate a local T-pose from the captured mesh's actual skin weights."""
import base64
import json
from pathlib import Path
import re
import struct
import numpy as np
import models
import profiles

VERSION = 1


def root(file):
    return json.loads(Path(file).read_text(encoding='utf-8-sig'))['Data']['RootChunk']


def mesh_blob(doc):
    if 'renderResourceBlob' in doc:
        return doc['renderResourceBlob']['Data']
    return doc['blob']['Data']['baseBlob']['Data']


def bone_positions(doc):
    names = [name['$value'] for name in doc.get('boneNames', [])]
    matrices = doc.get('boneRigMatrices', [])
    if len(names) != len(matrices):
        raise ValueError('骨骼绑定数据不完整，无法生成 T Pose')
    positions = {}
    for name, matrix in zip(names, matrices):
        inverse_bind = np.array([[matrix[c][r] for c in 'XYZW'] for r in 'XYZW'], dtype=np.float64)
        positions[name] = np.linalg.inv(inverse_bind)[:3, 3]
    return names, positions


def rotation_between(a, b):
    a = a / max(np.linalg.norm(a), 1e-12)
    b = b / max(np.linalg.norm(b), 1e-12)
    cross = np.cross(a, b); cosine = float(np.clip(a @ b, -1, 1))
    if cosine > 1-1e-10:
        return np.eye(3)
    if cosine < -1+1e-8:
        axis = np.cross(a, [0, 0, 1] if abs(a[2]) < .8 else [0, 1, 0])
        axis /= np.linalg.norm(axis)
        return 2*np.outer(axis, axis)-np.eye(3)
    x, y, z = cross
    skew = np.array([[0,-z,y],[z,0,-x],[-y,x,0]])
    return np.eye(3)+skew+skew@skew/(1+cosine)


def rigid(rotation, before, after):
    matrix = np.eye(4);matrix[:3,:3] = rotation
    matrix[:3,3] = after-rotation@before
    return matrix


def arm_transforms(joints):
    transforms = {}; targets = {}
    for side, prefix in (('Left','l_'),('Right','r_')):
        required = [side+name for name in ('Arm','ForeArm','Hand')]
        if not all(name in joints for name in required):
            raise ValueError('快照缺少完整手臂骨骼，无法生成 T Pose')
        shoulder, elbow, wrist = [joints[name] for name in required]
        direction = np.array([-1. if side=='Left' else 1., 0., 0.])
        upper = rotation_between(elbow-shoulder, direction)
        lower = rotation_between(wrist-elbow, direction)
        new_elbow = shoulder+np.linalg.norm(elbow-shoulder)*direction
        new_wrist = new_elbow+np.linalg.norm(wrist-elbow)*direction
        palm = joints.get(side+'HandMiddle1')
        hand = rotation_between(palm-wrist, direction) if palm is not None else lower
        upper_matrix = rigid(upper, shoulder, shoulder)
        lower_matrix = rigid(lower, elbow, new_elbow)
        hand_matrix = rigid(hand, wrist, new_wrist)
        for name in joints:
            if name==side+'Arm' or name.startswith(prefix+'SHL'):
                transforms[name] = upper_matrix
            elif name==side+'ForeArm' or name.startswith((prefix+'Wrist',prefix+'wrist',prefix+'elbow')):
                transforms[name] = lower_matrix
            elif name.startswith((side+'Hand',side+'InHand')) or name.startswith(tuple(prefix+p for p in ('thumb','ind_','mid_','ring_','pinky'))):
                transforms[name] = hand_matrix
            elif name.startswith(tuple(prefix+p for p in ('deltoid','biceps','triceps'))):
                transforms[name] = upper_matrix
        # Straighten the four main fingers around their real bind-pose joints.
        for finger in ('Index','Middle','Ring','Pinky'):
            names = [side+'Hand'+finger+str(i) for i in (1,2,3)]
            if not all(name in joints for name in names):
                continue
            p1,p2,p3 = [joints[name] for name in names]
            q1 = hand@(p1-wrist)+new_wrist
            q2 = q1+np.linalg.norm(p2-p1)*direction
            q3 = q2+np.linalg.norm(p3-p2)*direction
            transforms[names[0]] = rigid(rotation_between(p2-p1,direction),p1,q1)
            finger_rotation = rotation_between(p3-p2,direction)
            transforms[names[1]] = rigid(finger_rotation,p2,q2)
            transforms[names[2]] = rigid(finger_rotation,p3,q3)
        targets[side] = {'shoulder':shoulder.tolist(),'elbow':new_elbow.tolist(),'wrist':new_wrist.tolist()}
    return transforms, targets


PACKING = {'PT_Short4N':8,'PT_UByte4':4,'PT_UByte4N':4,'PT_Float16_2':4,'PT_Dec4':4,'PT_Color':4,'PT_Float16_4':8,'PT_Float4':16,'PT_UInt4':16}


def posed_binary(doc, bind_doc, mask, transforms):
    binary,count,triangles = models.geometry({'Data':{'RootChunk':doc}},mask)
    original = np.frombuffer(binary,dtype='<f4',count=count*8,offset=8).reshape(count,8)
    result = original.copy()
    names,joints = bone_positions(bind_doc)
    blob = mesh_blob(doc);header = blob['header'];buffer = base64.b64decode(blob['renderBuffer']['Bytes'])
    if len(header.get('bonePositions',[])) != len(names):
        raise ValueError('网格权重与骨骼数量不匹配')
    for i,name in enumerate(names):
        position=np.array([header['bonePositions'][i][k] for k in 'XYZ'])
        if np.linalg.norm(position-joints[name]) > .002:
            raise ValueError('网格权重与骨骼顺序不匹配')
    matrices = np.array([transforms.get(name,np.eye(4)) for name in names])
    cursor = 0
    for ci,chunk in enumerate(header['renderChunkInfos']):
        if chunk['lodMask']!=1 or not ((mask>>ci)&1):
            continue
        offsets=chunk['chunkVertices']['byteOffsets']['Elements'];strides=chunk['chunkVertices']['vertexLayout']['slotStrides']['Elements']
        if len(offsets)<3 or min(strides[:3])<=0:
            continue
        fields={};stream_offsets={}
        for element in chunk['chunkVertices']['vertexLayout']['elements']['Elements']:
            if element.get('streamType')!='ST_PerVertex':continue
            stream=element['streamIndex'];packing=element['type']
            if packing not in PACKING:raise ValueError('暂不支持此网格的权重布局：'+packing)
            offset=stream_offsets.get(stream,0);fields[(element['usage'],element.get('usageIndex',0))]=(stream,offset,packing)
            stream_offsets[stream]=offset+PACKING[packing]
        n=chunk['numVertices'];indices=[];weights=[]
        for usage_index in (0,1):
            index_field=fields.get(('PS_SkinIndices',usage_index));weight_field=fields.get(('PS_SkinWeights',usage_index))
            if not index_field and not weight_field:continue
            if not index_field or not weight_field or index_field[2]!='PT_UByte4' or weight_field[2]!='PT_UByte4N':
                raise ValueError('暂不支持此网格的骨骼权重格式')
            arrays=[]
            for stream,local,_ in (index_field,weight_field):
                arrays.append(np.ndarray((n,4),dtype=np.uint8,buffer=buffer,offset=offsets[stream]+local,strides=(strides[stream],1)))
            indices.append(arrays[0]);weights.append(arrays[1]/255.)
        if not indices:
            cursor+=n;continue
        indices=np.concatenate(indices,axis=1);weights=np.concatenate(weights,axis=1)
        if np.any((indices>=len(names))&(weights>0)):raise ValueError('骨骼权重索引超出范围')
        total=weights.sum(axis=1);valid=total>1e-6
        weights=weights/np.maximum(total[:,None],1e-6)
        position=original[cursor:cursor+n,:3].astype(np.float64);normal=original[cursor:cursor+n,3:6].astype(np.float64)
        output=np.zeros_like(position);out_normal=np.zeros_like(normal)
        for influence in range(weights.shape[1]):
            selected=matrices[np.minimum(indices[:,influence],len(names)-1)]
            weight=weights[:,influence,None]
            output+=(np.einsum('nij,nj->ni',selected[:,:3,:3],position)+selected[:,:3,3])*weight
            out_normal+=np.einsum('nij,nj->ni',selected[:,:3,:3],normal)*weight
        output[~valid]=position[~valid];out_normal[~valid]=normal[~valid]
        out_normal/=np.maximum(np.linalg.norm(out_normal,axis=1,keepdims=True),1e-8)
        result[cursor:cursor+n,:3]=output;result[cursor:cursor+n,3:6]=out_normal;cursor+=n
    if cursor!=count or not np.isfinite(result).all():raise ValueError('T Pose 网格数据无效')
    assert np.array_equal(result[:,6:8],original[:,6:8])
    return struct.pack('<II',count,triangles*3)+result.astype('<f4').tobytes()+binary[8+count*32:]


def prepare(ident, progress=lambda _:None):
    folder=profiles.model_folder(ident);meta=profiles.load(folder/'model.json')
    existing=meta.get('poses',{}).get('tpose')
    if existing and existing.get('version')==VERSION and all((folder/Path(url).name).is_file() for url in existing.get('parts',{}).values()):
        return existing
    if not (folder/'decal-profile/profile.json').is_file():profiles.prepare(ident,progress)
    profile=profiles.load(folder/'decal-profile/profile.json');records=profiles.load(folder/'sources.json')
    documents={};binds={};joints={}
    for record in records:
        atlas=record['atlas'];doc=root(record['mesh_json']);documents[atlas]=doc
        bind=root(profile['bases'][atlas]) if doc['$type']=='MorphTargetMesh' else doc
        binds[atlas]=bind
        _,positions=bone_positions(bind)
        for name,position in positions.items():joints.setdefault(name,position)
    transforms,targets=arm_transforms(joints);outputs={}
    for record in records:
        atlas=record['atlas'];progress('准备 T Pose：'+atlas)
        binary=posed_binary(documents[atlas],binds[atlas],int(record['mask']),transforms)
        file=folder/('tpose-'+atlas+'.bin');temporary=file.with_suffix('.tmp');temporary.write_bytes(binary);temporary.replace(file)
        outputs[atlas]='/models/'+ident+'/'+file.name
    result={'version':VERSION,'experimental':True,'parts':outputs,'joints':targets}
    meta.setdefault('poses',{})['tpose']=result
    temporary=folder/'model.pose.tmp';temporary.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8');temporary.replace(folder/'model.json')
    return result
