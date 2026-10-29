# Contributing

Changes should preserve exact-version checks, the untouched factory executable, an owned reversible installation, and a working fallback.

## Test locally

Use Node.js 8 or newer:

```sh
npm test
```

The public tests use synthetic buffers and do not need a vehicle, root access, or firmware. Keep hardware tests separate and state what was actually observed.

## Receiver testing

For a direct iPhone test, report the iOS version, map application and version, MGU software version, and original CarPlay executable SHA-256. State whether the connection was directly from the iPhone to factory BMW CarPlay or through a box. Check ordinary taps, multitouch pinch-to-zoom, independent releases, and whether ordinary controls still work. A video of the gesture is useful if it contains no private information.

For an Android AI box, include its model and software version, the touch tester used, and the maximum pointer count it actually displayed. A working box does not establish direct iPhone support.

## New MGU software profiles

Do not remove the original hash check or accept an entire vehicle family by model year. A new profile needs a separately analyzed original executable, exact original and candidate hashes, validated patch offsets and instruction boundaries, contact state tests, receiver compatibility evidence, and a controlled hardware test with a verified return to factory behavior.

Submit code and compact patch data that you are entitled to share. Do not upload BMW executables, PSdZData, root filesystem archives, Android box libraries, or other proprietary firmware to this repository.

## Privacy

Never include VINs, private SSH keys, passwords, device certificates, phone serial numbers, Bluetooth or Wi-Fi addresses, pairing records, or full system dumps in an issue or pull request. Share the specific sanitized fields requested by the issue form. Review screenshots and videos before posting.

The project does not need your private key or a complete vehicle dump to receive a compatibility report.
