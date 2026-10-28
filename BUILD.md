# Verify and reconstruct the matching release

## 1. Verify source against the distributed archive

Use Python 3.12 or later. This verification uses only the standard library:

```powershell
python scripts/verify_release.py "C:\Downloads\Tatto Studio 1.0.0.zip"
```

The script verifies the complete archive SHA-256 and compares every mapped source file byte-for-byte.
It does not execute the editor, game, or third-party binaries.

## 2. Reconstruct the release from reviewed code and the published resource bundle

```powershell
python scripts/rebuild_release.py --base "C:\Downloads\Tatto Studio 1.0.0.zip" --output "C:\Downloads\Tatto Studio 1.0.0.rebuilt.zip"
```

This keeps the matching distribution's omitted runtime, resource templates, and branding, replaces
all mapped code with this repository's copies, refreshes the editor file manifest, and creates a
standard ZIP. With the unmodified release source, the output must match the published SHA-256 exactly.
It writes a new output file and refuses to overwrite an existing file or the input.

There is no custom EXE build step. The launchers are CMD files, the editor/backend are JavaScript and
Python, and the CET collector uses Lua. The resource bridge is supplied as `.reds` source, compiled
by the separately installed redscript framework when the game starts. This repository does not
include source builds of CPython, NumPy or Pillow, or independently recreate omitted game templates.

## 3. Run the editor for inspection

Extract the complete distribution into a test directory and run `Start tatto studio.cmd`.
For isolated inspection, set `TATTO_STUDIO_DATA_DIR` to an absolute writable folder outside the
program directory before launching. This avoids opening the normal user's tattoo library.

Alternatively, a Windows x64 Python 3.12 environment can run the backend after installing
`requirements.txt`, using the reviewed source overlaid on the distribution's resource files:

```powershell
python -B server.py --port 8876
```

The CMD launcher specifically expects the bundled runtime. A functioning game installation and
WolvenKit CLI are needed for character extraction and mod generation, not for source verification.
