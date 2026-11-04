"""Bind overlays to the captured actor's live auxiliary skeletons."""
import math
import json
from pathlib import PureWindowsPath


def reference(value, flags='Obligatory'):
    if 'hash' in value:
        resolved=str(value['hash'])
        if not resolved.isdecimal() or not 0<=int(resolved)<=0xffffffffffffffff:raise ValueError('快照中的骨骼资源编号无效')
        # The engine's full-width ID remains valid even if its path registry
        # cannot resolve the mod's custom name. Never hash a display label.
        return {'DepotPath':{'$type':'ResourcePath','$storage':'uint64','$value':resolved},'Flags':flags if resolved!='0' else 'Soft'}
    path=value.get('path')
    if path:
        if not isinstance(path,str) or '\0' in path:raise ValueError('快照中的骨骼资源路径无效')
        depot=PureWindowsPath(path)
        if depot.is_absolute() or depot.drive or '..' in depot.parts:raise ValueError('快照中的骨骼资源路径无效')
        storage='string';resolved=path
    else:
        resolved=str(value.get('hash','0'))
        if not resolved.isdecimal() or not 0<=int(resolved)<=0xffffffffffffffff:raise ValueError('快照中的骨骼资源编号无效')
        storage='uint64'
    return {'DepotPath':{'$type':'ResourcePath','$storage':storage,'$value':resolved},'Flags':flags if resolved!='0' else 'Soft'}


def transform(value):
    if not value:return None
    position=value.get('position',{});orientation=value.get('orientation',{})
    if any(not isinstance(position.get(k),int) or not -2147483648<=position[k]<=2147483647 for k in 'xyz'):raise ValueError('快照中的骨骼局部位置无效')
    if any(not isinstance(orientation.get(k),(int,float)) or not math.isfinite(orientation[k]) for k in 'ijkr'):raise ValueError('快照中的骨骼局部旋转无效')
    return {'$type':'WorldTransform','Position':{'$type':'WorldPosition',**{k:{'$type':'FixedPoint','Bits':position[k]} for k in 'xyz'}},'Orientation':{'$type':'Quaternion',**{k:orientation[k] for k in 'ijkr'}}}


class Bindings:
    def __init__(self,context,gender,template):
        entries=context.get('animation_components',[])
        if not isinstance(entries,list) or len(entries)>256:raise ValueError('快照中的骨骼组件无效')
        self.records={};self.validated=set();self.active=set();self.components={'body':[],'head':[]}
        for entry in entries:
            name=entry.get('name')
            if not isinstance(name,str) or not name or len(name)>256:raise ValueError('快照中的骨骼组件名称无效')
            if name in self.records and self.records[name]!=entry:raise ValueError('快照中的骨骼组件名称无效')
            self.records[name]=entry

    def bind(self,name,domain):
        # A second animated component owns a separate simulation. Reusing its
        # rig/graph assets cannot follow the source's current dangle pose.
        # Resolve the existing actor component by its captured name instead,
        # including legacy snapshots without animation_components metadata.
        if name and (not isinstance(name,str) or len(name)>256 or '\0' in name):
            raise ValueError('快照中的骨骼绑定名称无效')
        if not name or name.lower() in ('root','none'):return name or 'root'
        if name in self.active:raise ValueError('快照中的骨骼绑定存在循环，请重新读取角色快照')
        if name in self.validated:return name
        record=self.records.get(name)
        if record is None:return name
        self.active.add(name)
        try:
            reference(record['rig']);reference(record.get('graph',{}))
            transform(record.get('local_transform'))
            for source in ('parent_bind','control_bind'):
                binding=record.get(source) or 'root'
                self.bind(binding,domain)
            self.validated.add(name)
        finally:
            self.active.remove(name)
        return name


def snapshot_context(snapshot):
    entries=snapshot.get('animation_components',[])
    if not isinstance(entries,list) or len(entries)>256 or any(not isinstance(entry,dict) for entry in entries):raise ValueError('快照中的骨骼组件无效')
    # Enumeration order is not a resource dependency. Canonicalize it before
    # choosing the model ID so identical captures can reuse geometry caches.
    canonical={json.dumps(entry,sort_keys=True,ensure_ascii=False):entry for entry in entries}
    return {'body_gender_hint':snapshot.get('body_gender_hint'),'animation_components':[canonical[key] for key in sorted(canonical)]}
