"""Persistent per-user storage, independent of Vortex's replaceable program files."""
import json
import os
from pathlib import Path
import shutil
import time
import uuid
from storage_paths import LIBRARY_NAME,LAYOUT_VERSION,migrate_storage

APPLICATION_VERSION = '1.0.0'
DATA_SCHEMA = 1
from datalocation import PROGRAM_ROOT, ensure_data_directory
DATA_ROOT = ensure_data_directory()
VERSION_FILE = DATA_ROOT / 'data-version.json'


def atomic_json(path, value):
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


def upgrade_backup():
    """Back up authored work/configuration, not regenerable model/build caches."""
    folder = DATA_ROOT / 'backups' / ('upgrade-' + time.strftime('%Y%m%d-%H%M%S', time.gmtime()) + '-' + uuid.uuid4().hex[:8])
    folder.mkdir(parents=True)
    for name in (LIBRARY_NAME, 'settings.local.json', 'data-version.json'):
        source = DATA_ROOT / name
        if source.is_symlink():
            raise RuntimeError('Refusing to migrate a linked user-data entry: ' + name)
        if source.is_dir():
            shutil.copytree(source, folder / name, symlinks=True)
        elif source.is_file():
            shutil.copyfile(source, folder / name)
    return folder


def initialize():
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    if VERSION_FILE.exists():
        metadata = json.loads(VERSION_FILE.read_text(encoding='utf-8-sig'))
        version = metadata.get('schema_version')
        if not isinstance(version, int) or isinstance(version, bool) or version < 0:
            raise RuntimeError('Invalid user-data schema. Existing files were not changed.')
        if version > DATA_SCHEMA:
            raise RuntimeError('These data require a newer tatto studio version. Existing files were not changed.')
        if version < DATA_SCHEMA or metadata.get('application_version') != APPLICATION_VERSION:
            backup = upgrade_backup()
            # Schema 0 -> 1 adds metadata only. Existing designs/images are unchanged.
            metadata.update(schema_version=DATA_SCHEMA, application_version=APPLICATION_VERSION, last_upgrade_backup=backup.name)
            metadata.setdefault('workspace_id', uuid.uuid4().hex)
            atomic_json(VERSION_FILE, metadata)
    else:
        if (DATA_ROOT / LIBRARY_NAME).exists() or (DATA_ROOT / 'settings.local.json').exists():
            upgrade_backup()
        metadata = {'schema_version': DATA_SCHEMA, 'application_version': APPLICATION_VERSION, 'workspace_id': uuid.uuid4().hex}
        atomic_json(VERSION_FILE, metadata)
    migrate_storage(DATA_ROOT)
    if metadata.get('path_layout_version') != LAYOUT_VERSION:
        metadata['path_layout_version'] = LAYOUT_VERSION
        atomic_json(VERSION_FILE, metadata)
    return metadata


METADATA = initialize()
