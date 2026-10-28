"""Keep user data outside Vortex-managed mod/version directories."""
import json
import os
from pathlib import Path

PROGRAM_ROOT = Path(__file__).resolve().parent
DATA_NAME = 'tatto studio User Data'


def discover_staging(program_root):
    # A staging copy has an unambiguous Vortex marker above its mod directory.
    for parent in program_root.parents:
        if (parent / '__vortex_staging_folder').is_file():
            return parent
    # Handles a deployed game/tools copy without depending on that version's files.
    try:
        from vortex_paths import read_paths
        state = Path(os.environ.get('APPDATA', '')) / 'Vortex/state.v2'
        value = read_paths(state).get('vortex_staging_directory')
        if value and Path(value).is_absolute():
            return Path(value).resolve()
    except (ImportError, OSError, ValueError):
        pass
    # One-time hint for an existing installation before its data are moved.
    config = program_root.parent / DATA_NAME / 'settings.local.json'
    if config.is_file():
        try:
            value = json.loads(config.read_text(encoding='utf-8-sig')).get('vortex_staging_directory')
            if value and Path(value).is_absolute():
                return Path(value).resolve()
        except (OSError, ValueError, AttributeError):
            pass
    return None


def data_directory(program_root=PROGRAM_ROOT, override=None):
    program_root = Path(program_root).resolve()
    if override is None:
        override = os.environ.get('TATTO_STUDIO_DATA_DIR')
    if override:
        if not Path(override).is_absolute():
            raise RuntimeError('TATTO_STUDIO_DATA_DIR must be an absolute path.')
        root = Path(override).resolve()
    else:
        staging = discover_staging(program_root)
        if staging is not None:
            root = staging.parent / DATA_NAME
        elif program_root.parent.name.casefold() == 'tools':
            # A manual game installation must also survive deleting its editor.
            local = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / 'AppData/Local')))
            root = local / DATA_NAME
        else:
            root = program_root.parent / DATA_NAME
        root = root.resolve()
    if root == program_root or root.is_relative_to(program_root):
        raise RuntimeError('User data must be outside the installed program folder.')
    return root


def _rewrite_paths(value, old_root, new_root):
    if isinstance(value, str):
        normalized = value.replace('\\', '/').casefold()
        prefix = str(old_root).replace('\\', '/').casefold()
        if normalized == prefix or normalized.startswith(prefix + '/'):
            return str(new_root) + value[len(str(old_root)):].replace('/', os.sep)
    elif isinstance(value, list):
        return [_rewrite_paths(item, old_root, new_root) for item in value]
    elif isinstance(value, dict):
        return {key: _rewrite_paths(item, old_root, new_root) for key, item in value.items()}
    return value


def _finish_migration(root):
    marker = root / 'data-location.json'
    if not marker.is_file():
        return
    state = json.loads(marker.read_text(encoding='utf-8-sig'))
    if state.get('state') != 'pending':
        return
    previous = Path(state['previous_directory'])
    for path in root.rglob('*.json'):
        if path == marker:
            continue
        if path.is_symlink() or not path.resolve().is_relative_to(root):
            raise RuntimeError('Cannot migrate a linked data file: ' + str(path))
        try:
            original = json.loads(path.read_text(encoding='utf-8-sig'))
        except (ValueError, UnicodeError):
            continue
        updated = _rewrite_paths(original, previous, root)
        if updated != original:
            temporary = path.with_name(path.name + '.location.tmp')
            temporary.write_text(json.dumps(updated, ensure_ascii=False, indent=2), encoding='utf-8')
            temporary.replace(path)
    state.update(state='complete', data_directory=str(root))
    temporary = marker.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(marker)


def ensure_data_directory(program_root=PROGRAM_ROOT, override=None):
    program_root = Path(program_root).resolve()
    root = data_directory(program_root, override)
    legacy = (program_root.parent / DATA_NAME).resolve()
    explicit_override = bool(override or os.environ.get('TATTO_STUDIO_DATA_DIR'))
    if not explicit_override and legacy != root and legacy.exists():
        if legacy.is_symlink() or not legacy.is_dir() or root.is_relative_to(legacy):
            raise RuntimeError('The previous data directory cannot be migrated safely.')
        if root.exists() and any(root.iterdir()):
            if any(legacy.iterdir()):
                raise RuntimeError('Both data locations contain files. Neither was overwritten: ' + str(root))
            legacy.rmdir()
        else:
            root.parent.mkdir(parents=True, exist_ok=True)
            if root.exists():
                root.rmdir()  # Only an empty target can be replaced.
            marker = legacy / 'data-location.json'
            marker.write_text(json.dumps({'state': 'pending', 'previous_directory': str(legacy)}, indent=2), encoding='utf-8')
            legacy.rename(root)
    root.mkdir(parents=True, exist_ok=True)
    _finish_migration(root)
    return root


if __name__ == '__main__':
    print(json.dumps(str(ensure_data_directory()), ensure_ascii=True))
