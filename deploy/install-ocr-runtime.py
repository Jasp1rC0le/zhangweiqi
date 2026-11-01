"""Install the pinned, offline CPU OCR runtime without changing system Python or services."""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import uuid
import zipfile


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def install(bundle, manifest_path, destination):
    manifest = json.loads(manifest_path.read_text())
    assert (bundle / "manifest.json").read_bytes() == manifest_path.read_bytes()
    assert manifest["version"] == "ppocrv5-20261101-r1" and manifest["python"] == "3.12"
    assert os.geteuid() == 0 and str(destination) == "/opt/campus-ai/ocr/ppocrv5-20261101-r1"
    assert not destination.exists(), "Inspect existing runtime before reinstalling"
    assert shutil.disk_usage("/opt").free > 600 * 1024 * 1024
    for key, folder in [("packages", "wheels"), ("models", "models")]:
        for entry in manifest[key]:
            assert PurePosixPath(entry["file"]).name == entry["file"]
            path = bundle / folder / entry["file"]
            assert path.stat().st_size == entry["bytes"] and digest(path) == entry["sha256"]
    destination.parent.mkdir(mode=0o750, parents=True, exist_ok=True)
    pending = destination.with_name(destination.name + ".pending-" + uuid.uuid4().hex[:8])
    try:
        subprocess.run(["/usr/bin/python3", "-m", "venv", "--without-pip", str(pending)], check=True, timeout=30)
        site = pending / "lib/python3.12/site-packages"
        site.mkdir(parents=True, exist_ok=True)
        for entry in manifest["packages"]:
            with zipfile.ZipFile(bundle / "wheels" / entry["file"]) as archive:
                for item in archive.infolist():
                    parts = PurePosixPath(item.filename).parts
                    assert parts and not PurePosixPath(item.filename).is_absolute() and ".." not in parts
                    if item.is_dir():
                        continue
                    if parts[0].endswith(".data"):
                        if parts[1] not in {"purelib", "platlib"}:
                            continue
                        parts = parts[2:]
                    target = site.joinpath(*parts)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(item) as source, target.open("wb") as output:
                        shutil.copyfileobj(source, output)
                    target.chmod(0o644)
        (pending / "models").mkdir()
        for entry in manifest["models"]:
            shutil.copyfile(bundle / "models" / entry["file"], pending / "models" / entry["file"])
        shutil.copyfile(manifest_path, pending / "runtime-manifest.json")
        probe = subprocess.run([str(pending / "bin/python3"), "-c", "import cv2,onnxruntime,rapidocr; print(onnxruntime.__version__)"], capture_output=True, text=True, timeout=30)
        assert probe.returncode == 0, probe.stderr[:1000]
        os.replace(pending, destination)
        subprocess.run(["chown", "-R", "root:campus-ai", str(destination)], check=True, timeout=20)
        subprocess.run(["chown", "root:campus-ai", str(destination.parent)], check=True, timeout=10)
        destination.parent.chmod(0o750)
        for root, dirs, _files in os.walk(destination):
            Path(root).chmod(0o750)
        (destination / "INSTALL_COMPLETE").write_text(digest(manifest_path) + "\n")
        return {"installed": str(destination), "manifestSha256": digest(manifest_path), "onnxruntime": probe.stdout.strip(), "systemPythonChanged": False, "networkRequests": 0}
    except BaseException:
        shutil.rmtree(pending, ignore_errors=True)
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(install(args.bundle, args.manifest, Path("/opt/campus-ai/ocr/ppocrv5-20261101-r1"))))
