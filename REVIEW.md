# Security review notes: Tatto Studio 1.0.1

## Entry points and executable dependencies

`Start tatto studio.cmd` uses a plain Windows `start` command to invoke the bundled
`runtime/python/pythonw.exe -B launcher.py launch`. Configure and Stop are separate readable CMD entry points.
There is no custom packed launcher EXE, encoded command, PowerShell/VBS launcher, automatic dependency
download, autorun registration or administrator-elevation request in these entry points.

The distribution is **not executable-free**. It contains CPython, NumPy, Pillow and their native dependencies.
[BINARY-DEPENDENCIES.json](BINARY-DEPENDENCIES.json) lists every MZ-header file with its release hash;
[THIRD-PARTY.md](THIRD-PARTY.md) links to upstream sources and licensing references.

## Local browser service

The Python server binds to IPv4 loopback, normally `127.0.0.1:8876`. It validates Host headers and
requires a process token for mutations, rejecting explicit foreign Origins. It opens the local editor
in the default browser. These checks are not a boundary against other programs running as the same user.

A Windows mutex serializes launch requests. Service reuse checks its application and data directories.
Browser sessions use a local authenticated event stream; the service exits after the last session closes
and active work finishes. The Stop launcher requests graceful shutdown, refusing to interrupt active tasks.

## Files, paths and subprocesses

- Vortex state and deployment metadata are read to find the game, staging folder and publishing target.
  The editor does not modify the Vortex database.
- First launch/upgrade asks the user to confirm prefilled paths. Path Settings can change the game,
  CLI, personal data and publishing locations. Manual installation does not require Vortex.
- Personal designs, imported images, local model caches, logs and generated output are stored outside
  the managed editor folder. The default Vortex location is beside the staging root; manual installation
  has a Local AppData fallback. Locator/preferences files are also stored under the current user's Local AppData.
- Moving personal data copies and verifies it before switching the locator and restarting the local backend.
  The source is retained; non-empty destinations are not silently merged. Restart recovery can restore the prior location.
- Character import and resource generation invoke the user-selected `WolvenKit.CLI.exe`. `processes.py`
  applies `CREATE_NO_WINDOW` to resource subprocesses to suppress repeated console pop-ups; diagnostic logs remain available.
- The game's installed texture codec is loaded for compression/verification. `native_compression.py` may
  copy the user's game DLL to Local AppData for WolvenKit compatibility. This proprietary DLL is not distributed here.
- The CET collector and redscript bridge run through separately installed mod frameworks to read character
  component/resource references; the collector writes snapshot JSON in its game-side mod directory.
- Publishing validates source resources and writes generated library files into the same editor mod's
  confirmed Vortex staging target. Vortex deployment remains a user action. Manual mode writes to its selected game target.
- A generated library ZIP is an output/backup, not a second required Vortex installation.

## Changes relevant to review

Compared with 1.0.0, this version adds male-body handling and resource-identity checks, localized messages,
path migration/recovery, file/resource caches, browser Workers for pixel processing, and hidden resource subprocesses.
Readable sources for these behaviors, including the message catalog, are mapped to the exact distribution.

The release is a standard unencrypted deflated ZIP. [PACKAGE-AUDIT.json](PACKAGE-AUDIT.json) records the
structure check and whether any valid ZIP archives were found inside it. These findings do not identify
which Nexus check triggered quarantine, and VirusTotal results do not replace a platform review.

## Reproduction limits

The application's own code is interpreted; no custom EXE compilation is needed. The `.reds` bridge is
compiled at game startup by the separately installed redscript framework. Reconstruction uses the exact
submitted ZIP as the input for omitted runtime binaries, branding and resource templates. It is not an
independent source build of CPython, NumPy, Pillow or game assets. Source verification and reconstruction
require only Python's standard library and do not launch the game, editor or WolvenKit.
