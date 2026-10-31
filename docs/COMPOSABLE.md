# Working with another CarPlay patch

Multitouch can share CarPlay with another CarPlay patch through a CarPlay patch
composer (mgu-deploy's `carplay-patch`). The composer builds **one** executable
from the factory `/usr/bin/carplay`, this patch and the other registered
patches, each in its own byte regions. The factory file is never written.

Without another registered patch, nothing changes: multitouch runs its own
installed copy exactly as before.

## Existing installations (0.1.0 to 0.2.2)

An installation made by 0.1.0 to 0.2.2 is left exactly as it is:

- Its drop-in, manager and copy are not touched or migrated. They keep
  starting the installed copy with the same preflight, hash checks, pending-boot
  guard, first-minute health check and factory fallback.
- It registered no manifest, so a composer treats its drop-in as a launcher it
  does not know and refuses to compose: the other patch is reported as a
  conflict and not applied, and nothing of multitouch changes.
- Its uninstall with this version removes it as before and does not touch the
  composer (`registration.state: "never-registered"`).

To combine it with another patch, remove it and install this version:

```sh
python installer.py uninstall --host MGU_IP --key PATH_TO_YOUR_KEY
python installer.py install --host MGU_IP --key PATH_TO_YOUR_KEY
```

An install over an existing installation directory is refused, as before.

## What this version installs

Everything earlier versions install, plus:

- `/var/opt/mgu-carplay-multitouch/carplay-patch.json`: this patch as a
  manifest (`node patch/composable.js manifest`), with its SHA-256 recorded as
  `composableManifestSha256` in `install.json`.
- Its registration. With an mgu-deploy that has `carplay-patch`:
  `/var/opt/mgu-deploy/mgu-deploy.sh carplay-patch add <manifest>`. Otherwise
  the same bytes at
  `/var/opt/mgu-carplay-patch/patches/idrive7-carplay-multitouch.json`, which a
  composer installed later reads. A refused or failed registration is reported
  in the result (`registration`) and the installation stays multitouch-only.

A new multitouch-only installation without mgu-deploy therefore leaves one file
outside its own folder: that registration file. It is inert while no composer
is installed, and uninstall removes it.

Preflight accepts one drop-in besides its own: the composer's
`/etc/systemd/system/carplay.service.d/50-mgu-carplay-patch.conf`, a regular
root-owned file whose first line starts with `# mgu-carplay-patch launcher`.
Any other drop-in, or a file of that name without the marker, still refuses
the installation. Installation and removal never write or remove that file.

## Order of steps

The composer ignores a manifest whose launcher (this patch's drop-in) is not
installed, and refuses to compose while a launcher is installed whose owner
registered nothing. So:

- **Install:** the drop-in is in place before the manifest is registered.
- **Uninstall:** the drop-in is removed before the manifest is unregistered
  (through mgu-deploy when it has `carplay-patch`, else by deleting the
  registration file when it is still the one this installation wrote), then
  the files go. When mgu-deploy fails or refuses to unregister (for example
  while another of its runs holds its lock), a composition may still carry this
  patch: the drop-in is put back with the same bytes, nothing else is removed,
  and the uninstall fails saying so; run it again.

The composer retries patches it refused earlier when another patch is added or
removed, so a patch refused while an earlier multitouch installation was
present joins once this version is installed.

## Which executable starts

The drop-in sorts after the composer's (`60-` after `50-`), so systemd uses its
`ExecStart`. At every CarPlay start the manager:

1. runs every earlier check on the installed copy (metadata, disabled marker,
   factory hash, copy hash, unverified previous boot). If any fails, the factory
   executable starts, as before;
2. then selects the composed executable `/var/opt/mgu-carplay-patch/carplay`
   only if all of this holds, else the installed copy:
   - the composer folder, `composed.json` and `carplay` are root-owned and not
     group- or world-writable;
   - `composed.json` names the factory hash this patch requires, and it equals
     `/usr/bin/carplay`'s;
   - the composed file's SHA-256 is the one `composed.json` records;
   - `composed.json` lists this patch with the manifest SHA-256 this
     installation registered, and at least one other patch;
   - the composed file has the installed copy's length, and equals the verified
     installed copy byte for byte everywhere except inside the other patches'
     declared regions; those regions lie within the factory file, overlap none
     of this patch's edits or payload, and their recorded original and written
     bytes match the two files. The other patches append nothing;
   - the composer committed it: its `expected.sha256`, which the composer
     writes last and deletes first when it removes a patch, names exactly
     `/usr/bin/carplay` with the factory hash and this composed file with its
     hash, so a composition stopped half way is never selected.

`/run/mgu-carplay-multitouch/selected` holds the installed copy's SHA-256 (as
before) or `composed <sha256>`; `pending.json` records the composed path and
hash when it was selected. The drop-in starts the installed copy, the composed
executable or the factory file accordingly.

The guard covers whichever was selected: the first-minute health check
requires the CarPlay process to run that executable with that SHA-256 and reads
the same metrics from its payload; a failed check, a failed service stop or an
unverified previous boot writes `disabled.json`, and the factory executable
starts from then on. A composed executable the composer replaced after CarPlay
started still passes when the running bytes have the selected hash.

`status` reports `activeBinary` (`own`, `composed` or `factory`), the
composer's state, and the manager's `selection` with the reason a composed
executable was not taken.

## Testing

`npm test` runs synthetic checks of the manifest, the drop-in's selection
(run through `/bin/sh`), the installer's composer handling and the manager's
verification. With a factory executable and a composer checkout it also
composes the two patches in both orders and checks the manager's verification
against tampering:

```sh
CARPLAY_BIN=./original-carplay MGU_STORE_DIR=../mgu-store \
OTHER_MANIFEST=./other-patch.json node tests/composable.test.js
```

The combination is not yet confirmed on a vehicle.
