"""Local editor launch/configuration helper. No shell or remote downloads."""
import argparse
import http.client
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import sys
import time
import uuid
import contextlib
import ctypes
from ctypes import wintypes

ROOT = Path(__file__).resolve().parent


@contextlib.contextmanager
def launch_lock(port):
    """Serialize double-clicks before checking or starting the local service."""
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.LPCWSTR]
    kernel.CreateMutexW.restype = wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    kernel.ReleaseMutex.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.CreateMutexW(None, False, 'Local\\TattoStudio.Launch.' + str(port))
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    acquired = False
    try:
        acquired = kernel.WaitForSingleObject(handle, 30000) in (0, 0x80)
        if not acquired:
            raise RuntimeError('Another launch is still in progress. Try again shortly.')
        yield
    finally:
        if acquired:
            kernel.ReleaseMutex(handle)
        kernel.CloseHandle(handle)


def read_settings(data):
    path = data / 'settings.local.json'
    if not path.exists():
        return {}
    value = json.loads(path.read_text(encoding='utf-8-sig'))
    if not isinstance(value, dict):
        raise ValueError('The saved configuration must be a JSON object.')
    return value


def valid_game(value):
    return isinstance(value, str) and (Path(value) / 'bin/x64/Cyberpunk2077.exe').is_file()


def valid_staging(value):
    return isinstance(value, str) and Path(value).is_absolute() and Path(value).is_dir()


def valid_cli(value):
    return isinstance(value, str) and Path(value).name.casefold() == 'wolvenkit.cli.exe' and Path(value).is_file()


def validate(paths):
    return (valid_game(paths.get('game_directory')) and
            valid_staging(paths.get('vortex_staging_directory')) and
            valid_cli(paths.get('wolvenkit_cli')))


def resolve_paths(existing, root=ROOT, detected=None):
    if detected is None:
        from vortex_paths import read_paths
        detected = read_paths(Path(os.environ.get('APPDATA', '')) / 'Vortex/state.v2')
    game = next((str(p) for p in (root, *root.parents) if valid_game(str(p))), None)
    for value in (existing.get('game_directory'), detected.get('game_directory')):
        if not game and valid_game(value):
            game = str(Path(value).resolve())
    staging = None
    for value in (existing.get('vortex_staging_directory'), detected.get('vortex_staging_directory')):
        if isinstance(value, str):
            value = value.replace('{game}', 'cyberpunk2077').replace('{USERDATA}', str(Path(os.environ.get('APPDATA', '')) / 'Vortex'))
            if '{' not in value and valid_staging(value):
                staging = str(Path(value).resolve())
                break
    if not staging:
        staging = next((str(p) for p in root.parents if (p / '__vortex_staging_folder').is_file()), None)
    hints = [existing.get('wolvenkit_cli'), str(root / 'WolvenKit-CLI/WolvenKit.CLI.exe')]
    if staging:
        hints += [str(Path(staging) / 'WolvenKit-CLI/WolvenKit.CLI.exe'), str(Path(staging).parent / 'WolvenKit-CLI/WolvenKit.CLI.exe')]
    if game:
        hints += [str(Path(game) / 'tools/WolvenKit-CLI/WolvenKit.CLI.exe')]
    cli = next((str(Path(p).resolve()) for p in hints if valid_cli(p)), None)
    return {'game_directory': game, 'vortex_staging_directory': staging, 'wolvenkit_cli': cli}


def save_settings(data, existing, selected):
    if not validate(selected):
        raise ValueError('The selected paths are invalid. Configuration was not changed.')
    value = {'python_executable': 'runtime/python/python.exe', 'generated_package': 'output/tatto_studio_Library.zip', **existing}
    value.update({key: str(Path(selected[key]).resolve()) for key in ('game_directory', 'vortex_staging_directory', 'wolvenkit_cli')})
    data.mkdir(parents=True, exist_ok=True)
    path = data / 'settings.local.json'
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)
    return value


def request(port, method='GET', route='/api/config', token=None):
    connection = http.client.HTTPConnection('127.0.0.1', port, timeout=2)
    headers = {'X-Studio-Token': token} if token else {}
    try:
        connection.request(method, route, body=b'{}' if method == 'POST' else None, headers=headers)
        response = connection.getresponse()
        content = response.read(1024 * 1024)
        result = json.loads(content)
        if not isinstance(result, dict):
            raise ValueError('Unexpected editor response.')
        if response.status != 200:
            raise RuntimeError(result.get('error', 'Editor request failed.'))
        return result
    finally:
        connection.close()


def probe(port, root=ROOT):
    try:
        info = request(port)
    except (ConnectionRefusedError, ConnectionResetError):
        return None
    except OSError as error:
        if getattr(error, 'winerror', None) == 10061:
            return None
        # Some Windows filters silently discard connections to unused ports.
        # Confirm the port is actually free rather than assuming a timeout is safe.
        try:
            with socket.socket() as candidate:
                candidate.bind(('127.0.0.1', port))
            return None
        except OSError:
            pass
        raise RuntimeError('Cannot contact the local editor. Close any other application using port ' + str(port) + '.') from error
    except (ValueError, http.client.HTTPException) as error:
        raise RuntimeError('Port ' + str(port) + ' is occupied by another application.') from error
    if info.get('application') != 'tatto studio' or Path(info.get('application_root', '')).resolve() != root.resolve():
        raise RuntimeError('Port ' + str(port) + ' belongs to another editor copy. Close that copy before starting this one.')
    return info


def stop_server(port, info):
    if info.get('busy'):
        raise RuntimeError('The editor is saving or updating. Wait for it to finish before closing it.')
    if info.get('launcher_protocol', 0) < 1:
        raise RuntimeError('An older editor service is still running. Close its browser tabs and wait a few seconds, then try again.')
    request(port, 'POST', '/api/launcher/stop', info['token'])
    for _ in range(100):
        try:
            if probe(port) is None:
                return
        except (OSError, http.client.HTTPException):
            pass
        time.sleep(.1)
    raise RuntimeError('The editor has not finished shutting down. Close its browser tabs and try again.')


def start_server(port, data):
    # Fail before starting a service if a bundled runtime dependency is missing.
    import PIL
    import numpy
    info = probe(port)
    version = int(re.search(r'(?m)^VERSION = (\d+)\r?$', (ROOT / 'profiles.py').read_text(encoding='utf-8')).group(1))
    previous_token = None
    if info and (info.get('overlay_profile_version') != version or info.get('launcher_protocol', 0) < 2):
        if info.get('launcher_protocol', 0) < 2:
            raise RuntimeError('An older editor service is still running. Close its tabs and wait a few seconds before starting the new version.')
        previous_token = info.get('token')
        stop_server(port, info)
        info = None
    if info:
        return {'url': 'http://127.0.0.1:' + str(port), 'reused': True}
    environment = os.environ.copy()
    environment['PYTHONIOENCODING'] = 'utf-8'
    if previous_token:
        environment['TATTO_STUDIO_SESSION_TOKEN'] = previous_token
    python = ROOT / 'runtime/python/pythonw.exe'
    if not python.is_file():
        raise ValueError('The bundled Python runtime is incomplete. Extract the complete release ZIP again.')
    log_path = data / 'editor-service.log'
    with log_path.open('ab') as log:
        process = subprocess.Popen([str(python), '-B', str(ROOT / 'server.py'), '--port', str(port)], cwd=ROOT,
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=log, env=environment, close_fds=True)
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError('The editor could not start. See ' + str(log_path))
        info = probe(port)
        if info:
            return {'url': 'http://127.0.0.1:' + str(port), 'reused': False}
        time.sleep(.15)
    raise RuntimeError('The editor did not become ready. See ' + str(log_path))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['resolve', 'save', 'start', 'stop', 'launch', 'configure'])
    parser.add_argument('--port', type=int, default=8876)
    args = parser.parse_args()
    from datalocation import ensure_data_directory
    data = ensure_data_directory()
    existing = read_settings(data)
    if args.action == 'resolve':
        paths = resolve_paths(existing)
        result = {'paths': paths, 'needs_configuration': not validate(paths)}
        if validate(paths) and any(existing.get(k) != v for k, v in paths.items()):
            save_settings(data, existing, paths)
    elif args.action == 'save':
        selected = json.load(sys.stdin)
        if not isinstance(selected, dict):
            raise ValueError('Invalid configuration.')
        save_settings(data, existing, selected)
        result = {'saved': True}
    else:
        with launch_lock(args.port):
            info = probe(args.port)
            if args.action == 'stop':
                if info:
                    stop_server(args.port, info)
                result = {'stopped': True}
            else:
                if not info:
                    existing = read_settings(data)
                    paths = resolve_paths(existing)
                    if validate(paths) and any(existing.get(k) != v for k, v in paths.items()):
                        save_settings(data, existing, paths)
                result = start_server(args.port, data)
                if args.action in ('launch', 'configure'):
                    url = result['url'] + ('/setup.html' if args.action == 'configure' else '/')
                    os.startfile(url)
    print(json.dumps(result, ensure_ascii=True))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
