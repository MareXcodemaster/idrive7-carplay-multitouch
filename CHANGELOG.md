# Changelog

## 0.2.2 — 2026-10-29

- Compact resizable window, lower minimum size, working taskbar minimization,
  collapsible log and scrolling for small windows. Updated English/Polish images.
- Clear factory-CarPlay status after uninstall.
- Windows ENET backup/uninstall/reinstall/reboot/health cycle confirmed on a G30.
- USB/MGU Store edition withdrawn after an unsuccessful vehicle trial; its
  installation code and download packages have been removed. A removal guide
  remains for existing users.

## 0.2.1 preview — 2026-10-29

- Consistent CarPlay Multitouch labels in the GUI, descriptions and guides.
- Illustrated English/Polish Windows installation guides, plus MGU Store USB
  instructions illustrated with credited screenshots from the Store project.
- No change to the touch-report format, patch payload or firmware compatibility.

## 0.2.0 preview — 2026-10-29

- Windows GUI installer: English by default, Polish option, ENET discovery,
  root SSH checks, automatic CarPlay-scoped backups, install/remove/restore,
  and a guide to the key exported by the original rooting tool.
- Offline USB tool for an already installed MGU Store (`mgu-deploy` 0.6.4+).
  The USB package is version 0.1.0; the underlying stable patch is unchanged.
- USB setup verifies the factory file, power and a read-back backup on the
  inserted stick before preparing activation. Store manages removal of its
  own configuration and patch files; a full head-unit restart applies changes.
- English and Polish instructions, release downloads and checksum manifests.
- GUI and USB workflows have local checks only. The underlying patch's vehicle
  confirmation is with an Android AI box; direct iPhone CarPlay remains untested.

## 0.1.0 — 2026-10-28

- Initial exact-version CarPlay Multitouch patch for iDrive 7 MGU.
- Stable contact slots, coordinate clipping, duplicate suppression, and independent finger releases.
- A 133-byte HID descriptor and 12-byte legacy CarPlay reports.
- A pure Node.js 8-compatible delta patcher with input and output SHA-256 verification.
- A reversible SSH installer, startup guard, and removal command.
- Synthetic public tests that require no BMW firmware.

Confirmed with a wireless CarPlay Android AI box on one G30 MGU build. Direct iPhone CarPlay is not yet tested. More than two contacts and other executable hashes are not supported.
