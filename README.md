# Tatto Studio

Review source for **Tatto Studio 1.0.1**, an external tattoo editor for Cyberpunk 2077.

## Exact release identification

- Archive: `Tatto Studio 1.0.1.zip`
- SHA-256: `b3b090532721b7a3b8b7762bfad79cf4d8247bc0a7850124d299f3bee125ce15`
- Nexus Mods: https://www.nexusmods.com/cyberpunk2077/mods/35558
- VirusTotal report: https://www.virustotal.com/gui/file/b3b090532721b7a3b8b7762bfad79cf4d8247bc0a7850124d299f3bee125ce15

All mapped files are extracted byte-for-byte from this exact archive, not from a later development folder.
[source-map.json](source-map.json) records their paths and hashes; [BUILD.md](BUILD.md) explains verification
and exact reconstruction. The previous 1.0.0 source remains available in Git history.

## Review material

- [Editor and launchers](source/tools/tatto%20studio): readable Python and CMD source.
- [Browser interface](source/tools/tatto%20studio/web): JavaScript, HTML, CSS and shaders.
- [CET snapshot collector](source/bin/x64/plugins/cyber_engine_tweaks/mods/TattoStudio_Tattoo_Collector).
- [redscript resource bridge](source/r6/scripts/TattoStudioSnapshot/ResourceBridge.reds).
- [Security review notes](REVIEW.md), [binary inventory](BINARY-DEPENDENCIES.json),
  [package structure](PACKAGE-AUDIT.json), [third-party sources and licenses](THIRD-PARTY.md).
- [Changes from 1.0.0](CHANGELOG.md).

The release launches readable code with bundled Python. It has no custom Tatto Studio EXE;
the complete distribution still contains the Python interpreter and native third-party libraries.
Personal settings, designs, source images, character snapshots and extracted game resources are excluded
from this repository. Runtime binaries, branding and game resource templates are also omitted.

Source publication is provided for inspection and does not indicate Nexus Mods approval or certify safety.
Existing third-party notices are preserved. No new license for the project's own code is granted here.
