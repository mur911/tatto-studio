from pathlib import Path
import argparse,copy,hashlib,json,zipfile,sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from verify_release import verify,ROOT

parser=argparse.ArgumentParser();parser.add_argument('--base',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
base=Path(args.base).resolve();output=Path(args.output).resolve()
if output==base or output.exists():raise ValueError('Choose a new output path; existing files are never overwritten.')
metadata=verify(base)
with zipfile.ZipFile(base) as archive:
    infos=archive.infolist();comment=archive.comment;entries={i.filename:archive.read(i) for i in infos}
for item in metadata['files']:entries[item['release_path']]=(ROOT/item['repository_path']).read_bytes()
prefix='tools/tatto studio/';name=prefix+'FILES.sha256.json'
original_manifest=entries[name];manifest=json.loads(original_manifest)
for entry in manifest['files']:entry['sha256']=hashlib.sha256(entries[prefix+entry['path']]).hexdigest()
entries[name]=(json.dumps(manifest,indent=2)+'\n').encode('utf-8')
if b'\r\n' in original_manifest:entries[name]=entries[name].replace(b'\n',b'\r\n')
with output.open('xb') as target:
    with zipfile.ZipFile(target,'w') as archive:
        archive.comment=comment
        for info in infos:archive.writestr(copy.copy(info),entries[info.filename],compresslevel=6)
actual=hashlib.sha256(output.read_bytes()).hexdigest()
if actual!=metadata['release_sha256']:raise ValueError('Rebuilt hash differs; keep the output for inspection. SHA-256: '+actual)
print('Exact release reconstructed. SHA-256: '+actual)
