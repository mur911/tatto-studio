"""Use the installed game's codec; never redistribute its proprietary DLL."""
import ctypes
import os
from pathlib import Path
import shutil
import struct
import tempfile
import threading

_LOCK = threading.Lock()
_DECODERS = {}
TEXTURE_CODEC_VERSION = 'game-oodle-v1'


def ensure_native_codec(game):
    """WolvenKit loads Oodle from LocalAppData, not beside its CLI executable."""
    if os.name != 'nt' or game is None:
        raise ValueError('输出纹身需要 Windows 和有效的游戏目录。')
    source = Path(game) / 'bin/x64/oo2ext_7_win64.dll'
    local = os.environ.get('LOCALAPPDATA')
    if not source.is_file() or not local:
        raise ValueError('找不到游戏的 oo2ext_7_win64.dll，已停止输出以免生成无法加载的贴图。')
    target = Path(local) / source.name
    with _LOCK:
        if not target.exists():
            # Publish a complete file atomically; concurrent processes keep the
            # first valid copy. The cache and temporary file share one volume.
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(dir=target.parent, prefix='.tatto-codec-', delete=False) as file:
                    temporary = Path(file.name)
                shutil.copyfile(source, temporary)
                try:
                    os.link(temporary, target)
                except FileExistsError:
                    pass
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
        try:
            library = ctypes.WinDLL(str(target))
            library.OodleLZ_Decompress
            library.OodleLZ_Compress
        except (OSError, AttributeError) as exc:
            raise ValueError('游戏压缩库无法加载，已停止输出纹身。') from exc
    return target


def _decoder(game):
    path = str(ensure_native_codec(game))
    with _LOCK:
        if path not in _DECODERS:
            library = ctypes.WinDLL(path)
            function = library.OodleLZ_Decompress
            function.restype = ctypes.c_ssize_t
            function.argtypes = [
                ctypes.c_void_p, ctypes.c_ssize_t, ctypes.c_void_p, ctypes.c_ssize_t,
                ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_void_p,
                ctypes.c_ssize_t, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
                ctypes.c_ssize_t, ctypes.c_int,
            ]
            _DECODERS[path] = (library, function)
    return _DECODERS[path][1]


def verify_texture(path, game):
    """Validate actual cooked buffers with the decoder that the game uses."""
    path = Path(path)
    data = path.read_bytes()
    if len(data) < 112 or data[:4] != b'CR2W':
        raise ValueError('输出贴图文件无效：' + path.name)
    table, count = struct.unpack_from('<II', data, 100)
    if not count or count > 1024 or table + count * 24 > len(data):
        raise ValueError('输出贴图缓冲区索引无效：' + path.name)
    decode = _decoder(game)
    for index in range(count):
        _, _, offset, disk_size, raw_size, _ = struct.unpack_from('<6I', data, table + index * 24)
        if offset + disk_size > len(data) or not raw_size or raw_size > 0x7fffffff:
            raise ValueError('输出贴图缓冲区大小无效：' + path.name)
        block = data[offset:offset + disk_size]
        if disk_size == raw_size and not block.startswith(b'KARK'):
            continue
        if len(block) < 8 or block[:4] != b'KARK' or struct.unpack_from('<I', block, 4)[0] != raw_size:
            raise ValueError('输出贴图压缩头无效：' + path.name)
        source = ctypes.create_string_buffer(block[8:])
        output = ctypes.create_string_buffer(raw_size)
        result = decode(source, disk_size - 8, output, raw_size, 1, 0, 0, None, 0, None, None, None, 0, 3)
        if result != raw_size:
            raise ValueError('游戏无法解压输出贴图：' + path.name + '；请重新更新纹身库。')
    return True
