# iDrive 7 CarPlay Multitouch

A multitouch patch for the factory CarPlay service on **one exact BMW iDrive 7 MGU software build**. The patch was confirmed with a wireless CarPlay Android AI box. A direct iPhone connection still needs testing.

The installer builds a patched copy from the original executable already on your MGU. It keeps `/usr/bin/carplay` intact and adds a reversible service override. This repository contains patch code and delta data, not BMW firmware or private SSH keys.

## Downloads and installation guides

**Root is required.** The installers do not root the MGU. Follow the original
[root/SSH instructions by cauliflowermossgrape](https://github.com/cauliflowermossgrape/idrive7-8-ssh-root)
if access has not already been enabled.

| Edition | Download | Requirements | Instructions |
| --- | --- | --- | --- |
| Windows GUI | [Windows ZIP v0.2.0](https://github.com/MareXcodemaster/idrive7-carplay-multitouch/releases/download/v0.2.0/iDrive7-Multitouch-Installer-v0.2.0-Windows.zip) | ENET, root SSH, Windows OpenSSH Client, .NET 4.8 | [English](gui/README-EN.md) / [Polski](gui/README-PL.md) |
| USB via MGU Store | [USB ZIP v0.1.0](https://github.com/MareXcodemaster/idrive7-carplay-multitouch/releases/download/v0.2.0/iDrive7-CarPlay-Multitouch-USB-v0.1.0.zip) | Root and MGU Store already installed; mgu-deploy 0.6.4+ | [English](store/README-EN.md) / [Polski](store/README-PL.md) |
| Complete source | [Source ZIP](https://github.com/MareXcodemaster/idrive7-carplay-multitouch/releases/download/v0.2.0/iDrive7-Multitouch-Installer-v0.2.0-Source.zip) | For review or building the installers | [Changelog](CHANGELOG.md) |

The Windows GUI starts in English and offers Polish. Both editions make a
**CarPlay-scoped backup**, with install and removal support. The stable patch
has been tested in a vehicle; these new GUI/USB installation workflows have
**local tests only** and are published as a preview. Read the success checks in
the relevant guide before restarting the head unit.

## Compatibility

| Item | Status |
| --- | --- |
| Two-finger gestures through a wireless CarPlay Android AI box | Confirmed in one G30 test |
| Factory CarPlay connected directly to an iPhone | **Not tested** |
| Three or five simultaneous fingers | Not implemented |
| Other CarPlay executable hashes | Refused by the installer |

The tested MGU reported `P18_23w44.2-1-3`. Model year, vehicle model, or the label “iDrive 7” does not establish compatibility. The original `/usr/bin/carplay` must have both:

- Size: **3,484,912 bytes**
- SHA-256: **`ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50`**

The resulting copy must have SHA-256 `2a009e6afe22f8f385b164ec9e2a7c2aa22b1c1c3ac2110d04f80715dc2c01de`. The installer checks these identities instead of guessing from a vehicle model.

## Requirements

**Root/SSH access to the MGU is required before using this installer.** For setup instructions, see [idrive7-8-ssh-root](https://github.com/cauliflowermossgrape/idrive7-8-ssh-root#readme) by [cauliflowermossgrape](https://github.com/cauliflowermossgrape). Follow the author's compatibility and coding-backup instructions before enabling access.

- An MGU with working **root SSH access already enabled**, and Node.js 8 available on the MGU.
- A computer with **Python 3.8+** and the OpenSSH client. The installer uses Python's standard library.
- A working network connection to the MGU and your own SSH authentication.
- A parked vehicle with stable power. Activation restarts the head unit; do not run it while driving.

This project does not unlock SSH, flash firmware, install an iDrive emulator, or modify an Android box.

## Windows GUI

A Windows GUI is available as `iDrive7-Multitouch-Installer.exe`. It discovers the vehicle over ENET, authenticates with your own root SSH key, checks the exact software profile, and provides install, uninstall and backup restore actions. It links to the original author’s root/SSH setup instructions if access has not been enabled. Local Python/Node.js are not required; Windows OpenSSH Client and .NET Framework 4.8 are required.

Before each change it automatically downloads and verifies a **CarPlay rollback backup** on the PC. This includes the factory CarPlay executable and service plus the patch’s installation/configuration files. **It is not a full MGU image or coding backup.** Restore checks the vehicle VIN and file hashes, then restores the prior installed/uninstalled state using the verified patch code; it does not extract arbitrary archived files into the MGU. The original factory executable remains intact.

The GUI has Polish/English labels and can request a full MGU reboot with startup health verification. An Android AI box may require its own full restart after MGU restarts. See [Polish GUI instructions](gui/README-PL.md). Build on Windows with `python gui/build.py`; the executable embeds only this project’s code and patch delta, not firmware or keys.

## USB installation through MGU Store

The separate USB edition is an offline **tool** for an already rooted MGU with
[MGU Store](https://github.com/robertnisipeanu/mgu-store) installed (`mgu-deploy`
0.6.4+). Extract its USB ZIP to the stick root, open Store's USB page and install
**CarPlay Multitouch - iDrive 7**. Keep the stick inserted: setup verifies a
CarPlay-scoped backup on it before preparing activation. After successful setup,
use Store Settings to fully restart the head unit. Remove it using Store and
restart again to revert. It does not need a PC SSH key for this operation.

The USB edition has passed offline checks but still needs an in-car Store
installation test. An existing Windows/ENET installation must be removed with
its own installer before switching to the USB edition. Read the full
[USB instructions in English](store/README-EN.md) or
[Polish](store/README-PL.md), including the post-install success check and backup
scope. Build the USB ZIP with `python store/build.py <output-directory>`.

Quick USB steps:

1. Extract the **USB ZIP** to the USB stick root. The path must be
   `mgu-repo/marex-carplay-multitouch/catalog.json`, with the `.tgz` and
   `USB-INSTALL.json` next to it. Leave at least 64 MB free and keep one matching
   USB stick inserted.
2. With stable vehicle power, open **MGU Store > USB**, select the
   `marex-carplay-multitouch` source and install **CarPlay Multitouch - iDrive 7**.
3. Keep the stick inserted. Check the operation log for
   **`prepared-for-next-full-boot`** and **`Backup verified on USB`**. A Store
   "installed" label alone does not confirm setup succeeded. A failed setup
   must be resolved before activation.
4. After success, use **MGU Store > Settings > Restart head unit**. If using an
   Android box, fully restart the box after MGU has booted. Allow one minute for
   the CarPlay startup health check.
5. Keep the backup in `CarPlay-Multitouch-Backups/` on the stick privately. It
   contains CarPlay files/configuration, **not a full MGU image**. BimmerCode is
   a separate coding backup.
6. To revert, use **Store > Installed > CarPlay Multitouch - iDrive 7 > Remove**,
   then fully restart the head unit again. Do not mix the Store and ENET
   installers; remove the existing edition with its own installer first.

## Install

Download the repository or release ZIP and extract the entire folder. Replace `MGU_IP` and `PATH_TO_YOUR_KEY` below with your own values. Never share your private key.

Check compatibility first:

```sh
python installer.py check --host MGU_IP --key PATH_TO_YOUR_KEY
```

Install for the next head-unit boot:

```sh
python installer.py install --host MGU_IP --key PATH_TO_YOUR_KEY
```

To install and request activation immediately, add `--activate`:

```sh
python installer.py install --host MGU_IP --key PATH_TO_YOUR_KEY --activate
```

Check the result after the MGU reconnects:

```sh
python installer.py status --host MGU_IP --key PATH_TO_YOUR_KEY
```

The optional `--known-hosts PATH` selects an SSH host-key file. Verify the vehicle's identity if SSH reports a changed host key before updating that trust file.

After activation, leave the MGU powered until `status` shows `activePatched: true`, `health.verified: true`, and `pending: null`. This takes about one minute after CarPlay starts. Switching it off before that verification conservatively selects the factory executable on the next boot.

## Remove

```sh
python installer.py uninstall --host MGU_IP --key PATH_TO_YOUR_KEY
```

The installer removes its own override and installed files. The next MGU boot uses the factory service again. It does not overwrite the factory executable during installation or removal.

## What is installed

- Patch files and the startup guard under `/var/opt/mgu-carplay-multitouch`.
- An owned drop-in at `/etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf`.
- A separate patched CarPlay executable, generated locally from the matching original.

The override uses `SIGKILL` for intentional service stops because the tested factory process crashed during SIGTERM teardown. Normal OEM failure handling remains enabled. Do not stop or restart this service while driving.

An unexpected `SIGKILL` is also treated as a successful stop, so the guard does not automatically disable the patch for that signal after the initial health check. The fallback does not cover every possible failure.

Writing the drop-in requires a brief writable remount of the root filesystem. The installer restores its previous read-only state afterward. No firmware partition is flashed.

At startup, the guard checks the original and patched hashes. An unfinished previous activation or a failed service result disables the patch and selects the factory executable. Startup health checking is bounded to 60 seconds; it is not a continuous battery monitor. Use the removal command to return to the factory setup.

## How it works

The factory input path receives multiple touch contacts but forwards one. This patch tracks two contacts independently and registers a 133-byte HID descriptor. It sends a 12-byte report with two fixed slots: transducer index, touch state, X (little-endian 16-bit), and Y (little-endian 16-bit). Each finger can move or release without dropping the other.

The receiver used in the confirmed test accepts this legacy two-contact format. That test does not prove that every CarPlay receiver or iPhone software version accepts it.

## Testing and reports

The payload was checked with deterministic contact/release scenarios, randomized frames, ASLR, the original box decoder's instruction blocks, and a live two-finger test. The local delta patcher also verifies the output against the confirmed executable byte for byte.

Run the public tests without a vehicle or BMW firmware:

```sh
npm test
```

Or run them directly:

```sh
node tests/patcher.test.js
node tests/agent.test.js
node runtime/test-manager.js
```

These tests exercise synthetic inputs. They do not claim hardware or iPhone validation. See [CONTRIBUTING.md](CONTRIBUTING.md) for adding an exact software profile or reporting a direct iPhone test. Use the issue forms and omit VINs, private keys, phone identifiers, pairing data, firmware images, and full unfiltered logs.

## License

Original project code is provided under the [MIT license](LICENSE). BMW and third-party firmware remain the property of their respective owners and are not distributed here.
