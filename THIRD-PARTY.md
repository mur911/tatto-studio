# Third-party components

Versions below describe the matching release, rather than whichever versions are newest upstream.

| Component | Version / use | Official source |
|---|---|---|
| CPython | 3.12.14, Windows x64 runtime | https://www.python.org/downloads/windows/ ; https://github.com/python/cpython |
| NumPy | 2.3.5, mesh and image calculations; bundled native libraries retain their upstream notices | https://pypi.org/project/numpy/2.3.5/ ; https://github.com/numpy/numpy |
| Pillow | 12.3.0, image import and processing | https://pypi.org/project/pillow/12.3.0/ ; https://github.com/python-pillow/Pillow |
| WolvenKit Console | User-installed external resource importer/exporter; not bundled | https://github.com/WolvenKit/WolvenKit/releases |
| Cyber Engine Tweaks | User-installed game dependency | https://github.com/maximegmd/CyberEngineTweaks |
| RED4ext | User-installed game dependency | https://github.com/WopsS/RED4ext |
| redscript | User-installed game dependency | https://github.com/jac3km4/redscript |
| Codeware | User-installed game dependency | https://github.com/psiberx/cp2077-codeware |
| ArchiveXL | User-installed game dependency; retained MIT notices | https://github.com/psiberx/cp2077-archive-xl |
| RedHotTools reference helper | Small Lua reference helper with retained MIT notice; RedHotTools itself is not required by the collector | https://github.com/psiberx/cp2077-red-hot-tools |

The release archive contains the applicable runtime license files, including notices under the bundled
Python `Lib` and native dependency directories. Retained text license files for the mod-side helpers are
also present under `source/licenses/` and the editor's source tree.

The game and any body or skin mods are user-supplied. The repository does not redistribute their
extracted meshes, textures, snapshots, or the game's proprietary compression library.
