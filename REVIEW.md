# Security review notes — Tatto Studio 1.0.0

## Startup and local access

`Start tatto studio.cmd` runs the bundled `runtime/python/python.exe` with `launcher.py launch`.
The launcher detects configured paths, starts the backend using the bundled `pythonw.exe`, and opens
`http://127.0.0.1:8876/` using the default browser. A named Windows mutex serializes simultaneous launches.
The helper refuses to reuse or stop a service belonging to another installation directory.

The HTTP server binds only to IPv4 loopback. Requests validate the Host header. POST operations also
require a per-process session token and reject an explicit foreign Origin. These controls are not a
security boundary against other programs already running as the same Windows user.

The setup page supports auto-detection, manually entered paths, and Windows path dialogs through ctypes.
There is no custom packed EXE, PowerShell startup, encoded command, elevated-permission request,
autorun registration, or automatic software download in this release's launcher.

## Files and processes

- Vortex state is read to locate the game and staging folder.
- User settings, designs, images, snapshots converted for preview, logs, and exports are written to an
  independent `tatto studio User Data` folder. Vortex installations use the staging folder's parent.
  Manual-install fallback is the user's Local AppData. An explicit external data-directory override is supported.
- The collector writes runtime snapshot JSON files in its game-side mod directory.
- Reading character resources and exporting tattoo mods runs the user's selected `WolvenKit.CLI.exe`.
- Publishing updates generated tattoo-library files in matching Vortex staging targets. Deployment remains a user action.
- The texture codec is loaded from the user's installed game. `native_compression.py` may copy the game's
  `oo2ext_7_win64.dll` to Local AppData for WolvenKit compatibility. The proprietary DLL is not redistributed here.
- Native windows are used for file/folder selection. Other processes are not injected into.

Browser sessions hold an authenticated local event-stream connection. The backend exits after the
last session disconnects and the grace period expires, once active work is finished. A startup timeout
also stops an unused service. `Stop tatto studio.cmd` uses authenticated graceful shutdown and refuses
to interrupt active editing requests or background jobs.

## Third-party executables

The distribution still includes the Python interpreter, native Python extension modules and dependencies.
Removing the custom launcher does not make the archive free of Windows executable code.
[BINARY-DEPENDENCIES.json](BINARY-DEPENDENCIES.json) enumerates every MZ-header file and its hash in
the exact matching archive. Official upstream references are in [THIRD-PARTY.md](THIRD-PARTY.md).

## Reproduction limits

The editor and collector code are interpreted; no custom launcher compilation is required.
Game-specific resource templates, branding, and binary dependencies are omitted from this repository.
The reconstruction script intentionally takes the matching published ZIP as its resource input,
then overlays the reviewed source and rebuilds the ZIP. It does not independently build CPython,
NumPy, Pillow, or game assets from source.
