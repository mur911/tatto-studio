"""Verified data relocation. Never merge or remove a user's existing files."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import uuid
from datalocation import PROGRAM_ROOT, _rewrite_paths


def locator_file():
    override = os.environ.get('TATTO_STUDIO_LOCATOR')
    return Path(override) if override else Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local'))) / 'Tatto Studio/locations.json'


def location_key():
    from datalocation import discover_staging
    staging = discover_staging(PROGRAM_ROOT)
    game = next((p for p in PROGRAM_ROOT.parents if (p/'bin/x64/Cyberpunk2077.exe').is_file()), None)
    return str(staging or game or PROGRAM_ROOT.parent).casefold()


def remembered():
    path = locator_file()
    if not path.exists():
        return None
    values = json.loads(path.read_text(encoding='utf-8'))
    value = values.get(location_key())
    if value and not Path(value).is_dir():
        raise ValueError('The selected personal data folder is unavailable. Connect its drive and try again.')
    return value


def remember(root):
    path = locator_file()
    values = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}
    values[location_key()] = str(Path(root).resolve())
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(values, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


def validate_root(target, source=None, staging=None, game=None):
    path = Path(target).expanduser()
    if not path.is_absolute():
        raise ValueError('Choose an absolute personal data path.')
    path = path.resolve()
    forbidden = [PROGRAM_ROOT]
    if staging:
        forbidden.append(Path(staging).resolve())
    if game:
        forbidden.append(Path(game).resolve())
    if any(path == p or path.is_relative_to(p) for p in forbidden):
        raise ValueError('Keep personal data outside the game and managed mod folders.')
    if source:
        old = Path(source).resolve()
        if path != old and (path.is_relative_to(old) or old.is_relative_to(path)):
            raise ValueError('The old and new data folders must not contain each other.')
    if path.exists() and not path.is_dir():
        raise ValueError('The personal data path must be a folder.')
    return path


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def prepare(source, target, *, use_existing=False, staging=None, game=None):
    source = Path(source).resolve()
    target = validate_root(target, source, staging, game)
    if source == target:
        return target
    if target.exists() and any(target.iterdir()):
        if not use_existing:
            raise ValueError('The destination contains data. Choose Use existing data or an empty folder.')
        metadata = json.loads((target/'data-version.json').read_text(encoding='utf-8'))
        if metadata.get('schema_version') != 1 or not isinstance(metadata.get('workspace_id'), str):
            raise ValueError('This folder is not a supported Tatto Studio data folder.')
        return target
    files = []
    for p in source.rglob('*'):
        if p.is_symlink() or p.is_junction() or not p.resolve().is_relative_to(source):
            raise ValueError('Linked entries cannot be relocated: ' + str(p))
        if p.is_file():
            files.append(p)
    ancestor = target.parent
    while not ancestor.exists():
        ancestor = ancestor.parent
    if shutil.disk_usage(ancestor).free < sum(p.stat().st_size for p in files) + 16*1024*1024:
        raise ValueError('There is not enough free space to copy the personal data.')
    temporary = target.with_name(target.name + '.copy-' + uuid.uuid4().hex)
    temporary.mkdir(parents=True)
    # The original stays intact, even if copying or verification fails.
    for p in files:
        dest = temporary / p.relative_to(source)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(p, dest)
        if digest(p) != digest(dest):
            raise ValueError('Data verification failed. The original folder is unchanged.')
    for p in temporary.rglob('*.json'):
        try:
            original = json.loads(p.read_text(encoding='utf-8-sig'))
        except (ValueError, UnicodeError):
            continue
        updated = _rewrite_paths(original, source, target)
        if updated != original:
            p.write_text(json.dumps(updated, ensure_ascii=False, indent=2), encoding='utf-8')
    if target.exists():
        target.rmdir()  # Only an empty directory, checked above.
    temporary.rename(target)
    return target
