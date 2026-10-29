"""Build a deterministic, offline MGU Store tool. No BMW firmware or keys."""
import gzip
import hashlib
import io
import json
import sys
import tarfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACKAGE = HERE.parent
ID = "marex-carplay-multitouch"
VERSION = "0.1.1"
ROOT = "/var/opt/" + ID
RUN = "/run/" + ID
DROP = "carplay.service.d/60-mgu-carplay-multitouch.conf"
TITLE = "CarPlay Multitouch - iDrive 7"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def js(data):
    return (json.dumps(data, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def payload():
    files = {}
    for name in ["patch/patcher.js", "patch/patch.json", "read-voltage.js",
                 "store/setup.js", "store/install.sh", "LICENSE"]:
        # A Windows checkout may use CRLF; /bin/sh requires a clean LF script.
        files[name] = (PACKAGE / name).read_text(encoding="utf-8").encode("utf-8")
    for name in ["runtime/manager.js", "runtime/60-mgu-carplay-multitouch.conf"]:
        text = (PACKAGE / name).read_text(encoding="utf-8")
        assert "/var/opt/mgu-carplay-multitouch" in text
        assert "/run/mgu-carplay-multitouch" in text
        text = text.replace("/var/opt/mgu-carplay-multitouch", ROOT)
        text = text.replace("/run/mgu-carplay-multitouch", RUN)
        files[name] = text.encode("utf-8")
    for lang in ["EN", "PL"]:
        files[f"README-{lang}.md"] = (HERE / f"README-{lang}.md").read_bytes()
    return files


def build(out):
    out.mkdir(parents=True, exist_ok=True)
    files = payload()
    component = {"id": ID, "kind": "tool", "version": VERSION,
                 "title": TITLE, "description": "Exact-version CarPlay multitouch patch for iDrive 7. Verified USB backup before activation. Requires full head-unit restart.",
                 "files": [{"path": name, "mode": "0755" if name.endswith(".sh") else "0644",
                            "sha256": sha(data)} for name, data in sorted(files.items())],
                 "units": [], "enable": [], "recmgr": [], "restart": [],
                 "dropins": [{"unit": "carplay.service", "name": "60-mgu-carplay-multitouch.conf"}],
                 "mguHmi": ["ID7"], "postInstall": ["store/install.sh"]}
    entries = {"component.json": js(component), "dropins/" + DROP: files["runtime/60-mgu-carplay-multitouch.conf"]}
    entries.update({"files/" + name: data for name, data in files.items()})
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name, data in sorted(entries.items()):
            item = tarfile.TarInfo(name)
            item.size = len(data)
            item.mode = 0o755 if name.endswith(".sh") else 0o644
            item.uid = item.gid = item.mtime = 0
            archive.addfile(item, io.BytesIO(data))
    artifact = gzip.compress(stream.getvalue(), mtime=0)
    filename = f"{ID}@{VERSION}.tgz"
    catalog = {"schema": 2, "components": [{
        "id": ID, "kind": "tool", "version": VERSION, "title": TITLE,
        "description": "iDrive 7 CarPlay multitouch. Keep USB inserted for the automatic CarPlay backup. After successful setup: Settings > Restart head unit. Remove in Store to revert.",
        "author": "MareXcodemaster", "mguHmi": ["ID7"], "optional": True,
        "uninstallable": True, "requires": {"mgu-deploy": "0.6.4"},
        "artifact": {"name": filename, "url": filename, "size": len(artifact), "sha256": sha(artifact)}
    }]}
    usb = {f"mgu-repo/{ID}/{filename}": artifact,
           f"mgu-repo/{ID}/catalog.json": js(catalog),
           f"mgu-repo/{ID}/USB-INSTALL.json": js({"format": "marex-carplay-usb", "id": ID, "version": VERSION}),
           "README-EN.md": files["README-EN.md"], "INSTRUKCJA-PL.md": files["README-PL.md"],
           "LICENSE": files["LICENSE"]}
    checksums = "".join(f"{sha(data)}  {name}\n" for name, data in sorted(usb.items()))
    usb["SHA256SUMS.txt"] = checksums.encode("ascii")
    zipname = f"iDrive7-CarPlay-Multitouch-USB-v{VERSION}.zip"
    with zipfile.ZipFile(out / zipname, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(usb.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    for name in ["README-EN.md", "INSTRUKCJA-PL.md", "SHA256SUMS.txt"]:
        (out / name).write_bytes(usb[name])
    manifest = {"id": ID, "version": VERSION, "zip": zipname,
                "zipSha256": sha((out / zipname).read_bytes()), "artifactSha256": sha(artifact),
                "artifactBytes": len(artifact), "containsFirmware": False,
                "validation": "Offline fixtures and upstream package/catalog format; not yet installed through Store in a vehicle."}
    (out / "build-manifest.json").write_bytes(js(manifest))
    print(json.dumps(manifest, indent=2))
    return usb, entries


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python store/build.py <output-directory>")
    build(Path(sys.argv[1]).resolve())
