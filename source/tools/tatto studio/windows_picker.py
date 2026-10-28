"""Native Windows path dialogs used only after a local Browse button click."""
import ctypes
from ctypes import wintypes as W
import threading

PICKER_LOCK = threading.Lock()


def choose(field):
    if field not in ('game_directory', 'vortex_staging_directory', 'wolvenkit_cli'):
        raise ValueError('Unknown path field.')
    if not PICKER_LOCK.acquire(blocking=False):
        raise ValueError('A path selection window is already open.')
    try:
        if field == 'vortex_staging_directory':
            return choose_folder()
        filename = 'Cyberpunk2077.exe' if field == 'game_directory' else 'WolvenKit.CLI.exe'
        value = choose_file(filename)
        if value and field == 'game_directory':
            from pathlib import Path
            path = Path(value)
            if path.name.casefold() != filename.casefold():
                raise ValueError('Select ' + filename + '.')
            return str(path.parent.parent.parent)
        return value
    finally:
        PICKER_LOCK.release()


def choose_file(filename):
    class OPENFILENAMEW(ctypes.Structure):
        _fields_ = [('lStructSize', W.DWORD), ('hwndOwner', W.HWND), ('hInstance', W.HINSTANCE),
                    ('lpstrFilter', W.LPCWSTR), ('lpstrCustomFilter', W.LPWSTR), ('nMaxCustFilter', W.DWORD),
                    ('nFilterIndex', W.DWORD), ('lpstrFile', W.LPWSTR), ('nMaxFile', W.DWORD),
                    ('lpstrFileTitle', W.LPWSTR), ('nMaxFileTitle', W.DWORD), ('lpstrInitialDir', W.LPCWSTR),
                    ('lpstrTitle', W.LPCWSTR), ('Flags', W.DWORD), ('nFileOffset', W.WORD),
                    ('nFileExtension', W.WORD), ('lpstrDefExt', W.LPCWSTR), ('lCustData', ctypes.c_ssize_t),
                    ('lpfnHook', ctypes.c_void_p), ('lpTemplateName', W.LPCWSTR), ('pvReserved', ctypes.c_void_p),
                    ('dwReserved', W.DWORD), ('FlagsEx', W.DWORD)]
    buffer = ctypes.create_unicode_buffer(32768)
    options = OPENFILENAMEW()
    options.lStructSize = ctypes.sizeof(options)
    options.lpstrFile = ctypes.cast(buffer, W.LPWSTR)
    options.nMaxFile = len(buffer)
    options.lpstrFilter = filename + '\0' + filename + '\0\0'
    options.lpstrTitle = 'Tatto Studio - Select ' + filename
    options.Flags = 0x1000 | 0x800 | 0x8 | 0x2000000  # Existing file/path; no cwd/history changes.
    dialog = ctypes.WinDLL('comdlg32')
    dialog.GetOpenFileNameW.argtypes = [ctypes.POINTER(OPENFILENAMEW)]
    dialog.GetOpenFileNameW.restype = W.BOOL
    if dialog.GetOpenFileNameW(ctypes.byref(options)):
        return buffer.value
    error = dialog.CommDlgExtendedError()
    if error:
        raise OSError('Windows file picker failed: ' + str(error))
    return None


def choose_folder():
    class BROWSEINFOW(ctypes.Structure):
        _fields_ = [('hwndOwner', W.HWND), ('pidlRoot', ctypes.c_void_p), ('pszDisplayName', W.LPWSTR),
                    ('lpszTitle', W.LPCWSTR), ('ulFlags', W.UINT), ('lpfn', ctypes.c_void_p),
                    ('lParam', ctypes.c_ssize_t), ('iImage', ctypes.c_int)]
    ole = ctypes.OleDLL('ole32')
    ole.CoInitialize.argtypes = [ctypes.c_void_p]
    ole.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    ole.CoInitialize(None)
    shell = ctypes.WinDLL('shell32')
    shell.SHBrowseForFolderW.argtypes = [ctypes.POINTER(BROWSEINFOW)]
    shell.SHBrowseForFolderW.restype = ctypes.c_void_p
    shell.SHGetPathFromIDListEx.argtypes = [ctypes.c_void_p, W.LPWSTR, W.DWORD, W.DWORD]
    shell.SHGetPathFromIDListEx.restype = W.BOOL
    pointer = None
    try:
        display = ctypes.create_unicode_buffer(32768)
        options = BROWSEINFOW()
        options.pszDisplayName = ctypes.cast(display, W.LPWSTR)
        options.lpszTitle = 'Tatto Studio - Select the Vortex Cyberpunk 2077 staging folder'
        options.ulFlags = 0x1 | 0x40 | 0x200  # Filesystem directories; modern UI; no new-folder button.
        pointer = shell.SHBrowseForFolderW(ctypes.byref(options))
        if not pointer:
            return None
        path = ctypes.create_unicode_buffer(32768)
        if not shell.SHGetPathFromIDListEx(pointer, path, len(path), 0):
            raise ValueError('Select a filesystem folder.')
        return path.value
    finally:
        if pointer:
            ole.CoTaskMemFree(pointer)
        ole.CoUninitialize()
