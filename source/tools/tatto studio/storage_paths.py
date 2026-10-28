"""Language-independent storage names and lossless legacy directory renames."""
from pathlib import Path

LIBRARY_NAME = 'Tattoo Library'
SOURCE_IMAGES_NAME = 'Source Images'
BAKED_TEXTURES_NAME = 'Baked Textures'
LIBRARY_BACKUPS_NAME = 'Library Backups'
LAYOUT_VERSION = 2

# Compatibility inputs only. New directories always use the English constants.
LEGACY_LIBRARY = '\u7eb9\u8eab\u5e93'
LEGACY_SOURCE_IMAGES = '\u539f\u56fe'
LEGACY_BAKED_TEXTURES = '\u70d8\u7119'
LEGACY_LIBRARY_BACKUPS = '\u7eb9\u8eab\u8fc1\u79fb\u5907\u4efd'


def rename_directory(parent, old_name, new_name):
    source, target = parent / old_name, parent / new_name
    if source.is_symlink() or target.is_symlink():
        raise RuntimeError('Cannot migrate a linked storage directory: ' + str(source))
    if not source.exists():
        return
    if not source.is_dir():
        raise RuntimeError('Expected a storage directory: ' + str(source))
    if target.exists():
        if target.is_dir() and not any(source.iterdir()):
            source.rmdir()
            return
        if not target.is_dir() or any(target.iterdir()):
            raise RuntimeError('Both legacy and English storage directories contain data. '
                               'Neither was overwritten: ' + str(parent))
        target.rmdir()  # Only an empty destination can be replaced.
    source.rename(target)


def migrate_storage(root):
    """Rename generated folders only; preserve user group/design/image names."""
    root = Path(root)
    rename_directory(root, LEGACY_LIBRARY, LIBRARY_NAME)
    rename_directory(root, LEGACY_LIBRARY_BACKUPS, LIBRARY_BACKUPS_NAME)
    for collection in (root / LIBRARY_NAME, root / LIBRARY_BACKUPS_NAME):
        if not collection.is_dir():
            continue
        for design in collection.rglob('design.tattoo.json'):
            if design.is_symlink() or not design.resolve().is_relative_to(collection.resolve()):
                raise RuntimeError('Cannot migrate a linked design: ' + str(design))
            for old_name, new_name in ((LEGACY_SOURCE_IMAGES, SOURCE_IMAGES_NAME),
                                       (LEGACY_BAKED_TEXTURES, BAKED_TEXTURES_NAME)):
                rename_directory(design.parent, old_name, new_name)
