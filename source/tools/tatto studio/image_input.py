"""Decode local raster artwork into the editor's existing PNG project format."""
import base64,io,warnings
from PIL import Image,ImageOps,UnidentifiedImageError

MAX_BYTES=24*1024*1024
MAX_PIXELS=32_000_000

def convert(value):
    if not isinstance(value,str) or len(value)>34*1024*1024 or not value.startswith('data:') or ';base64,' not in value:
        raise ValueError('图片数据无效；单张图片请控制在 24 MB 以内')
    try:
        raw=base64.b64decode(value.split(';base64,',1)[1],validate=True)
        if len(raw)>MAX_BYTES:raise ValueError('图片超过 24 MB')
        with warnings.catch_warnings():
            warnings.simplefilter('error',Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.width*source.height>MAX_PIXELS:raise ValueError('图片超过 3200 万像素，请缩小后重试')
                original_format=source.format
                animated=getattr(source,'n_frames',1)>1
                source.seek(0)
                image=ImageOps.exif_transpose(source).convert('RGBA')
                output=io.BytesIO();image.save(output,format='PNG',compress_level=4)
                data=output.getvalue()
                if len(data)>MAX_BYTES:raise ValueError('转换后的图片超过 24 MB，请缩小后重试')
                return {'image':'data:image/png;base64,'+base64.b64encode(data).decode('ascii'),'width':image.width,'height':image.height,'format':original_format,'animated':animated}
    except (UnidentifiedImageError,OSError,Image.DecompressionBombError,Image.DecompressionBombWarning) as error:
        raise ValueError('无法读取该图片格式或文件已损坏；可改用 PNG、JPG、WebP、BMP、GIF、TIFF 或 TGA') from error
