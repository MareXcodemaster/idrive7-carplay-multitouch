# CarPlay Multitouch - iDrive 7 / MGU Store USB edition

This package installs the stable CarPlay multitouch patch through the USB page of
[MGU Store](https://github.com/robertnisipeanu/mgu-store).
MGU Store and root must **already** be installed. This is not an automatic USB
rooting tool. No ENET connection, PC SSH key or internet connection is needed for
this package once the Store is working in the car.

## Compatibility and test status

- iDrive 7, x86-64 MGU, with the exact factory `/usr/bin/carplay` supported below.
- Factory file: 3,484,912 bytes; SHA-256
  `ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50`.
- MGU Store with `mgu-deploy` 0.6.4 or newer is required. This catalog does not
  contain Store updates; update Store separately before going offline if needed.
- The stable patch has been tested with a wireless Android AI box on a G30,
  including a full MGU reboot. Direct iPhone CarPlay still needs verification.
  The stable patch requires no Android box modification.
- This USB packaging has been tested offline, **not yet installed using Store in
  a real car**. A Store "installed" label alone does not prove setup succeeded.
- If the ENET/Windows version is already installed, remove it using that
  installer and fully restart MGU first. Store refuses the existing foreign
  drop-in; the two installers must not manage the same installation.

## Install from USB

1. Park the car. Keep MGU powered with a stabilised supply. Setup requires a fresh
   voltage reading of 13.0-18.0 V. A failed/unavailable reading prevents setup.
2. Use a USB stick that the car and Store already recognise and can write to.
   Leave at least 64 MB free. These small package files and the scoped backup
   fit FAT32; no special Linux format or repartitioning is needed. The installer
   does not format or manually mount anything.
3. Extract the ZIP **to the root of the stick**. It must contain:
   `mgu-repo/marex-carplay-multitouch/catalog.json` and the adjacent `.tgz` and
   `USB-INSTALL.json`. Leave exactly one stick with this package connected.
4. Insert it into the car's USB data port. Open **MGU Store > USB**, choose the
   `marex-carplay-multitouch` source and **CarPlay Multitouch - iDrive 7**.
5. Install and keep the stick inserted. Read the operation log: successful setup
   explicitly says **`prepared-for-next-full-boot`** and **`Backup verified on USB`**.
   If the log says **`CARPLAY MULTITOUCH SETUP FAILED`**, activation was not
   prepared. Fix that cause and reinstall, or Remove this tool. Store can retain
   the helper as "installed" after a failed post-install script.
6. After successful setup, use **MGU Store > Settings > Restart head unit**.
   The package never stops/restarts CarPlay or reboots MGU automatically. If you
   use an Android box, fully restart the box after MGU has booted again.
7. Allow at least one minute after the new CarPlay process starts for its boot
   health check, then test normal touch and multitouch. For an interrupted or
   failed boot check the next boot selects factory CarPlay; fix the cause before
   explicitly reinstalling. Once installation/log writing is complete, remove
   the stick using Store's safe-removal option if available, or after MGU has
   fully shut down.

## Backup and removal

Before creating activation files, setup writes and reads back a verified backup
on the same USB stick:
`CarPlay-Multitouch-Backups/<timestamp>-<random>.mgubak.gz`.
It contains the factory CarPlay executable, factory service, installed Store
drop-in and this patch's existing configuration/state. Per-file SHA-256, modes,
owners and an archive SHA-256 receipt are recorded. It is a **CarPlay-scoped
backup, not a full MGU image**. BimmerCode saves coding, not a full system image.
Keep the USB backup privately; it contains files from your car.

Store separately snapshots its pre-change service/drop-in configuration.
Our USB post-install backup is taken after Store has installed its drop-in;
the backup records that fact. Neither the OEM executable nor the stock service
is overwritten by the patch. The package contains only our code and delta.

To revert: **MGU Store > Installed > CarPlay Multitouch - iDrive 7 > Remove**,
then **Settings > Restart head unit**. The managed drop-in and patch directory
are removed; factory CarPlay runs after the full restart. USB backup files are
retained. Do not restore by blindly extracting the archive over `/` or by copying
its Store drop-in back: that would re-enable the patch. Use Store's backup/restore
tools for its own snapshots if needed; retain the USB archive for recovery and
diagnosis. There is no separate one-click import of this USB archive.

Root instructions: [idrive7-8-ssh-root by cauliflowermossgrape](https://github.com/cauliflowermossgrape/idrive7-8-ssh-root).
Patch source: [MareXcodemaster/idrive7-carplay-multitouch](https://github.com/MareXcodemaster/idrive7-carplay-multitouch).
