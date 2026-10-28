from pathlib import Path
import argparse, hashlib, json, zipfile

ROOT=Path(__file__).resolve().parent.parent
def verify(archive_path):
    metadata=json.loads((ROOT/'source-map.json').read_text(encoding='utf-8'))
    actual=hashlib.sha256(Path(archive_path).read_bytes()).hexdigest()
    if actual!=metadata['release_sha256']:raise ValueError('Archive SHA-256 does not match this source release.')
    with zipfile.ZipFile(archive_path) as archive:
        if archive.testzip() is not None:raise ValueError('Invalid ZIP CRC.')
        for item in metadata['files']:
            source=(ROOT/item['repository_path']).read_bytes()
            if hashlib.sha256(source).hexdigest()!=item['sha256']:raise ValueError('Repository source changed: '+item['repository_path'])
            if archive.read(item['release_path'])!=source:raise ValueError('Archive/source mismatch: '+item['release_path'])
    return metadata
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('archive');args=parser.parse_args()
    metadata=verify(args.archive)
    print('Verified '+str(len(metadata['files']))+' source files and the complete release SHA-256.')
