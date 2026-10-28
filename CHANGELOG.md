# Changelog

## 0.1.0 — 2026-10-28

- Initial exact-version two-finger patch for iDrive 7 MGU.
- Stable contact slots, coordinate clipping, duplicate suppression, and independent finger releases.
- A 133-byte HID descriptor and 12-byte legacy CarPlay reports.
- A pure Node.js 8-compatible delta patcher with input and output SHA-256 verification.
- A reversible SSH installer, startup guard, and removal command.
- Synthetic public tests that require no BMW firmware.

Confirmed with a wireless CarPlay Android AI box on one G30 MGU build. Direct iPhone CarPlay is not yet tested. More than two contacts and other executable hashes are not supported.
