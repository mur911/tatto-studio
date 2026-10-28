# Tatto Studio

Source code for **Tatto Studio 1.0.0**, an external tattoo editor for Cyberpunk 2077.
This repository corresponds to the Python-launcher release uploaded on 28 October 2026.

## Release identification

- Archive name: `Tatto Studio 1.0.0.zip`
- SHA-256: `16e54bc53006c38bc5a9b5a196dc049be8ce2c6f0bc8f30231456e7c68dd9438`
- This release uses `Start tatto studio.cmd` and bundled Python. It contains no custom Tatto Studio EXE.
- The Python backend, browser interface, CET collector, and redscript bridge are supplied as readable source.
- [source-map.json](source-map.json) records the exact archive path and SHA-256 of every published source file.

## Source layout

- [Editor and launcher](source/tools/tatto%20studio): Python backend and CMD entry points.
- [Browser interface](source/tools/tatto%20studio/web): HTML, CSS, JavaScript, and shader code.
- [Game snapshot collector](source/bin/x64/plugins/cyber_engine_tweaks/mods/TattoStudio_Tattoo_Collector): CET Lua code.
- [Resource bridge](source/r6/scripts/TattoStudioSnapshot/ResourceBridge.reds): redscript code.
- [Review notes](REVIEW.md): behavior relevant to the Nexus Mods security review.
- [Reproduction steps](BUILD.md): source verification and release reconstruction.
- [Third-party components](THIRD-PARTY.md): runtime dependencies, sources, and licensing references.

Personal settings, tattoo designs, imported images, character snapshots, extracted game resources,
the Python runtime, and other binary files are not included in this repository. The promotional logo
and resource templates remain in the distribution archive rather than in this code repository.

Publication of the source does not certify the distribution as safe or indicate approval by Nexus Mods.
Third-party license notices are retained with their respective source files. No additional license
for the project's own code is selected by this source publication.
