# iDrive 7 CarPlay Multitouch — Windows GUI

English is the default language. Use **English / PL** to switch to Polish.

Run `iDrive7-Multitouch-Installer.exe` on Windows 10/11 with .NET Framework 4.8 and the Windows OpenSSH Client. Local Python and Node.js are not needed. Your MGU must already have root/SSH access and Node.js 8.

1. Connect ENET to the parked vehicle and provide stable power.
2. You can leave the key field blank. The app looks for a local `id_rsa` under `data/enrollments/<VIN>` for the discovered vehicle, then tries SSH agent/default authentication. Select your own key manually only if automatic login fails. Root access still requires SSH authentication. Keys are never bundled or uploaded into the backup.
3. Click **Connect and check**. The app discovers the VIN/IP, checks root and the exact CarPlay software profile. Verify and accept the displayed SSH host key. The unit may generate a new host key after reboot.
4. Choose the PC backup folder and confirm the parked vehicle/stable supply checkbox. Changes require a diagnostic reading of at least 13.0 V.
5. Click **Install**. A checksum-verified PC backup must complete before any installation change is sent.
6. By default the app requests a full MGU reboot and verifies startup health. Leave it powered for the 60-second health check after CarPlay starts. An Android AI box may need its own full restart after MGU starts.

Do not generate a new key just to run the installer. After successful Enable SSH / Flash, the rooting tool exports the accepted login key, usually `data/enrollments/<VIN>/id_rsa`. A new, unenrolled key will not grant access.

Missing root or the key? Use the in-app link to [the original author's SSH/root instructions](https://github.com/cauliflowermossgrape/idrive7-8-ssh-root#readme). Authentication failure can mean the wrong key; it does not establish that the unit lacks root.

## After rooting: where is the key, and how do I select it?

The [author’s SSH key instructions](https://github.com/cauliflowermossgrape/idrive7-8-ssh-root#the-ssh-key-and-connect-info) describe the export location. The file is created by the rooting tool, not by this installer.

1. After successful **Enable SSH / Flash** in the author’s application, keep its whole program folder.
2. If you used `MGU-SSH.exe`, open the folder containing that EXE, then open **data → enrollments → your vehicle’s VIN**. When using the repository’s built EXE, this is `dist\MGU-SSH\data\enrollments\<VIN>\`.
3. If you ran the Python/source version, open `data\enrollments\<VIN>\` inside the root repository folder.
4. In our installer click **Choose file…**, select **`id_rsa` with no extension**, then click **Connect and check**. The **Where is my key?** link repeats these steps and includes a file selector. Automatic discovery is still available when the field is blank.
5. Do not select `id_rsa.pub` or `id_rsa.pub.pem` (public keys), `id_rsa.ppk` (PuTTY), or `data/assets/01_PRIVATE_KEY.pem` (enrollment, not SSH login). The app explains these mistakes before attempting SSH.

The adjacent `connect.txt` contains the MGU IP and a ready-made SSH command. If you cannot locate the export, check the rooting tool’s log and original program folder. Generating an unrelated new key will not grant access. Keep the exported keys on your own PC; do not attach them to public reports.

Windows key-file permissions are handled using a temporary copy restricted to your Windows account, removed after each SSH command. The original file and its permissions are not changed.

## Backup and removal

`.mgubak` contains the factory CarPlay executable/service and this patch's installed files/configuration, with permissions and SHA-256 checksums. It is **not a full MGU image, coding backup, bootloader recovery or firmware flash backup**.

- **Uninstall** first backs up the current state, then removes only this installation. Factory CarPlay returns after reboot.
- **Restore backup** verifies checksums, software and the VIN discovered over ENET. It restores the previous patched/unpatched state using the verified patch code. It never extracts arbitrary archived files into MGU. Damaged owned files can be preserved for diagnostics; restoring a patched state rebuilds the known patch rather than executing damaged archived code.
- **Create backup** works independently of installation. **Open backups** opens the PC folder. Keep copies until operation is verified.

The installer preserves `/usr/bin/carplay`. No private SSH keys or BMW firmware are included in the distributable.

## Compatibility and validation

The two-contact patch was confirmed with a wireless CarPlay Android AI box. Direct iPhone CarPlay remains untested. The GUI does not modify an Android box or install a three/five-contact experiment.

Only the exact factory executable SHA-256 below is supported; model/year alone does not establish compatibility:

`ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50`

The new GUI, backup handling, ENET parsers and command quoting have local tests. The GUI's complete workflow still needs an in-vehicle trial. Its patch and underlying install/removal engine reuse the already tested two-contact implementation.
