"""Machine-specific paths live outside distributable source and defaults."""
import json
from pathlib import Path
from userdata import DATA_ROOT

ROOT = Path(__file__).resolve().parent
LOCAL = DATA_ROOT / 'settings.local.json'


def read(path=LOCAL):
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError) as exc:
        raise ValueError('本机配置无法读取：' + str(path)) from exc
    if not isinstance(value, dict):
        raise ValueError('本机配置必须是 JSON 对象')
    return value


VALUES = read()


def location(key, default=None, *, values=None, root=ROOT):
    """Resolve relative paths against the app, never the caller's directory."""
    value = (VALUES if values is None else values).get(key, default)
    if value in (None, ''):
        return None
    if not isinstance(value, str):
        raise ValueError('本机路径配置需要文本：' + key)
    path = Path(value).expanduser()
    return (path if path.is_absolute() else root / path).resolve()


GAME = location('game_directory')
CLI = location('wolvenkit_cli', 'tools/WolvenKit.CLI.exe')
STAGING = location('vortex_staging_directory')
OUTPUT = location('generated_package', 'output/tatto_studio_Library.zip', root=DATA_ROOT)
TEXTURES = location('legacy_texture_templates', 'templates/source/tatto_studio/diy_tattoo_rb_v01/textures')
