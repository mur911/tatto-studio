"""Per-build bounded bytes/hash/alpha memoization. No persistent stale-file keys."""
from collections import OrderedDict
from contextvars import ContextVar
import hashlib,io
from pathlib import Path
from PIL import Image

SESSION=ContextVar('resource_session',default=None)
def key(path):
    path=Path(path);stat=path.stat();return path,stat.st_mtime_ns,stat.st_size
def begin():return SESSION.set({'bytes':OrderedDict(),'hashes':{},'ink':{},'size':0})
def end(token):SESSION.reset(token)
def read(path):
    path=Path(path);session=SESSION.get();ident=key(path)
    if session is None:return path.read_bytes()
    if ident in session['bytes']:
        value=session['bytes'].pop(ident);session['bytes'][ident]=value;return value
    value=path.read_bytes()
    if len(value)<=32*1024*1024:
        while session['bytes'] and session['size']+len(value)>64*1024*1024:
            _,old=session['bytes'].popitem(last=False);session['size']-=len(old)
        session['bytes'][ident]=value;session['size']+=len(value)
    return value
def sha(path):
    path=Path(path);session=SESSION.get();ident=key(path)
    if session is not None and ident in session['hashes']:return session['hashes'][ident]
    if ident[2]>32*1024*1024:
        with path.open('rb') as stream:value=hashlib.file_digest(stream,'sha256').hexdigest()
    else:value=hashlib.sha256(read(path)).hexdigest()
    if session is not None:session['hashes'][ident]=value
    return value
def ink(path):
    path=Path(path);session=SESSION.get();ident=key(path)
    if session is not None and ident in session['ink']:return session['ink'][ident]
    with Image.open(io.BytesIO(read(path))) as image:value=image.convert('RGBA').getchannel('A').getbbox() is not None
    if session is not None:session['ink'][ident]=value
    return value
