# Exact-version CarPlay delta

This directory contains original patch code and compact replacement data. It does not contain a BMW executable, a firmware image, a private key, a VIN, or an Android box library.

The only supported original `/usr/bin/carplay` is 3,484,912 bytes with SHA-256 `ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50`. The patcher refuses other inputs. The resulting executable is 3,487,405 bytes with SHA-256 `2a009e6afe22f8f385b164ec9e2a7c2aa22b1c1c3ac2110d04f80715dc2c01de`.

The change registers a multitouch HID descriptor and transmits a 12-byte legacy CarPlay report: transducer index, touch bit, X (LE16), Y (LE16), repeated for the second contact. It preserves contact slots and independent releases.

Multitouch was confirmed on one BMW G30 iDrive 7 MGU (`P18_23w44.2-1-3`) with a wireless CarPlay Android AI box using SharkCarPlay. Direct iPhone CarPlay has **not** been tested. Three or five contacts are **not** implemented. Matching model year or iDrive version alone does not establish compatibility; the exact binary hash is required.

`patcher.js` supports Node.js 8 and later without dependencies. It exports `apply(buffer, patch)`, `verifyOriginal(buffer, patch)`, `verifyPatched(buffer, patch)`, `validatePatch(patch)`, and `sha256(buffer)`. Verification returns a boolean; invalid manifests and unsuccessful applications throw an error. `apply` returns a new Buffer and never mutates its input.

Local use:

```sh
node patcher.js check ./original-carplay
node patcher.js apply ./original-carplay ./carplay-multitouch
```

The CLI creates a new output exclusively and refuses to overwrite existing files. Creating a patched copy does not install or activate it. Follow the package's main installation and removal instructions.

`multitouch.c` is the source of the appended payload. `payload.ld` is its linker layout. The package supplies the already-built payload within `patch.json` so applying it does not require a compiler.
