"""Publish-time UV gutters, including projects saved by older editor tabs."""
import hashlib,json,math,pathlib,struct
import numpy as np
from PIL import Image

PADDING_VERSION='uv-gutter-v2-skin-regions'

def rasterize_uv(parts,atlas,size):
    mask=np.zeros((size,size),dtype=np.bool_)
    for part in parts:
        if part['atlas']!=atlas:continue
        uv=np.asarray(part['vertices']).reshape(-1,8)[:,6:8].astype(np.float64)
        uv[:,0]*=size;uv[:,1]=(1-uv[:,1])*size
        for triangle in np.asarray(part['indices']).reshape(-1,3):
            points=uv[triangle].tolist()
            if not all(math.isfinite(v) for p in points for v in p):continue
            a,b,c=points
            if abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<1e-10:continue
            low=max(0,math.ceil(min(p[1] for p in points)-.5));high=min(size-1,math.floor(max(p[1] for p in points)-.5))
            edges=[]
            for i in range(3):
                a,b=points[i],points[(i+1)%3]
                if a[1]!=b[1]:edges.append((a[0],a[1],min(a[1],b[1]),max(a[1],b[1]),(b[0]-a[0])/(b[1]-a[1])))
            for y in range(low,high+1):
                scan=y+.5;xs=[x+(scan-start)*slope for x,start,lo,hi,slope in edges if lo<=scan<hi]
                if len(xs)<2:continue
                lo=max(0,math.ceil(min(xs)-.5-1e-7));hi=min(size-1,math.floor(max(xs)-.5+1e-7))
                if lo<=hi:mask[y,lo:hi+1]=True
    return mask

def extend_gutter(rgba,coverage,radius):
    """Nearest-ring propagation; never modifies a pixel inside a UV island."""
    result=np.array(rgba,dtype=np.uint8,copy=True)
    known=coverage.copy();frontier=coverage
    h,w=coverage.shape;directions=[(slice(None),slice(0,w-1),slice(None),slice(1,w)),(slice(None),slice(1,w),slice(None),slice(0,w-1)),(slice(0,h-1),slice(None),slice(1,h),slice(None)),(slice(1,h),slice(None),slice(0,h-1),slice(None))]
    for _ in range(radius):
        following=np.zeros_like(coverage)
        for sy,sx,dy,dx in directions:
            take=frontier[sy,sx]&~known[dy,dx]
            result[dy,dx][take]=result[sy,sx][take]
            known[dy,dx][take]=True;following[dy,dx][take]=True
        if not following.any():break
        frontier=following
    return result

def model_coverage(model_folder,atlas,size,cache_dir):
    model_folder=pathlib.Path(model_folder).resolve();meta=json.loads((model_folder/'model.json').read_text(encoding='utf-8-sig'))
    parts=[];stamp=hashlib.sha256((PADDING_VERSION+':'+atlas+':'+str(size)).encode())
    for part in meta['parts']:
        if part['atlas']!=atlas:continue
        # Captured mesh files must belong to this snapshot, never a client path.
        file=model_folder/pathlib.PurePosixPath(part['url']).name
        if not file.resolve().is_relative_to(model_folder) or not file.is_file():raise ValueError('接缝补边缺少当前角色网格')
        data=file.read_bytes();stamp.update(data);n,m=struct.unpack_from('<II',data)
        if len(data)!=8+n*32+m*4:raise ValueError('接缝补边网格数据无效')
        excluded=part.get('tattooExcludedRanges',[]);stamp.update(json.dumps(excluded,sort_keys=True).encode())
        indices=np.frombuffer(data,dtype='<u4',count=m,offset=8+n*32)
        if excluded:
            keep=np.ones(m,dtype=bool)
            for region in excluded:keep[region['first']:region['first']+region['count']]=False
            indices=indices[keep]
        parts.append({'atlas':atlas,'vertices':np.frombuffer(data,dtype='<f4',count=n*8,offset=8),'indices':indices})
    if not parts:raise ValueError('接缝补边找不到贴图对应的身体部位：'+atlas)
    cache_dir=pathlib.Path(cache_dir);cache_dir.mkdir(parents=True,exist_ok=True);cache=cache_dir/(stamp.hexdigest()+'.png')
    if cache.exists():
        with Image.open(cache) as image:
            if image.size==(size,size):return np.asarray(image.convert('L'))!=0
    coverage=rasterize_uv(parts,atlas,size);Image.fromarray(coverage.astype(np.uint8)*255).save(cache)
    return coverage

def write_padded_png(source,model_folder,atlas,destination,cache_dir):
    with Image.open(source) as image:
        if image.size not in ((2048,2048),(4096,4096)):raise ValueError('接缝补边只支持 2K 或 4K 输出')
        rgba=np.array(image.convert('RGBA'));size=image.width
    coverage=model_coverage(model_folder,atlas,size,cache_dir)
    result=extend_gutter(rgba,coverage,max(2,math.ceil(size/512)))
    destination=pathlib.Path(destination);destination.parent.mkdir(parents=True,exist_ok=True);Image.fromarray(result).save(destination)
    return {'padding':max(2,math.ceil(size/512)),'added_alpha_pixels':int(np.count_nonzero((rgba[:,:,3]==0)&(result[:,:,3]!=0))),'original_island_pixels_unchanged':bool(np.array_equal(rgba[coverage],result[coverage]))}
