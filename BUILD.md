# Verify and reconstruct Tatto Studio 1.0.1

The matching input is `Tatto Studio 1.0.1.zip`, SHA-256:
`b3b090532721b7a3b8b7762bfad79cf4d8247bc0a7850124d299f3bee125ce15`.

## Verify reviewed source against the submitted ZIP

Use Python 3.12; the scripts use only its standard library.

```powershell
python scripts/verify_release.py "C:\Downloads\Tatto Studio 1.0.1.zip"
```

This checks the complete ZIP hash, CRCs, source hashes and every mapped file's bytes. It does not execute
the editor or third-party binaries. `source-map.json` includes the Python/CMD backend, web code, message
and release JSON, installer metadata, Lua collector and redscript bridge.

## Reconstruct the exact ZIP

```powershell
python scripts/rebuild_release.py --base "C:\Downloads\Tatto Studio 1.0.1.zip" --output "C:\Downloads\Tatto Studio 1.0.1.rebuilt.zip"
```

Use the release's Python 3.12.14 runtime for the tested compression environment. The script preserves
the input archive's entry metadata and omitted resources, overlays the reviewed source and refreshes
the existing application manifest. With unchanged reviewed source, the rebuilt SHA-256 must match
the submitted ZIP exactly. It refuses an existing output path and never overwrites the input.

This is verification/reconstruction from the submitted resource bundle, **not** a standalone source
build of the bundled runtime, native libraries, branding or game resource templates. Upstream links
and binary hashes are provided separately. No custom application EXE is compiled.

## Optional application inspection

Extract the complete release to a test directory and run `tools/tatto studio/Start tatto studio.cmd`.
Normal game resource import/export needs the separately installed dependencies and a user-provided game.
Neither is needed for the two verification scripts above.
