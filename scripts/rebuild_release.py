from pathlib import Path
import argparse, hashlib, json, zipfile
from verify_release import verify, ROOT

parser=argparse.ArgumentParser();parser.add_argument('--base',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
base=Path(args.base).resolve();output=Path(args.output).resolve()
if output==base or output.exists():raise ValueError('Choose a new output path; existing files are never overwritten.')
metadata=verify(base)
with zipfile.ZipFile(base) as archive:entries={name:archive.read(name) for name in archive.namelist()}
for item in metadata['files']:entries[item['release_path']]=(ROOT/item['repository_path']).read_bytes()
prefix='tools/tatto studio/'
manifest={'application':'tatto studio','version':'1.0.0','build':'2026-10-28-python-launcher','files':[{'path':name[len(prefix):],'sha256':hashlib.sha256(data).hexdigest()} for name,data in sorted(entries.items()) if name.startswith(prefix) and name!=prefix+'FILES.sha256.json']}
entries[prefix+'FILES.sha256.json']=(json.dumps(manifest,indent=2)+'\n').encode()
with output.open('xb') as target:
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for name,data in sorted(entries.items()):
            info=zipfile.ZipInfo(name,(2026,10,28,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,data,compresslevel=6)
actual=hashlib.sha256(output.read_bytes()).hexdigest()
if actual!=metadata['release_sha256']:raise ValueError('Rebuilt hash differs; keep the file for inspection. SHA-256: '+actual)
print('Exact release reconstructed. SHA-256: '+actual)
