"""Initialize local secrets and start non-root Icecast or Liquidsoap."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import tempfile
import xml.etree.ElementTree as ET

BASE = Path(__file__).resolve().parent
SECRET_NAMES = ("source", "relay", "admin", "dj")
MOUNT_SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
LOCAL_RECORDING = re.compile(r"[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*\.mp3")


def env_path(name: str, default: str | Path) -> Path:
    return Path(os.environ.get(name, default)).resolve()


def init_secrets(directory: Path) -> None:
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if os.name == "posix" and directory.stat().st_mode & 0o077:
        raise ValueError(f"Make {directory} private (chmod 700) before initialization.")
    for name in SECRET_NAMES:
        try:
            # Local Compose mounts secret files as-is. Host access is restricted
            # by the 0700 directory; the unprivileged container can read its file.
            fd = os.open(directory / name, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o444)
        except FileExistsError:
            continue
        with os.fdopen(fd, "w", encoding="ascii") as file:
            file.write(secrets.token_urlsafe(36) + "\n")
    print(f"Four broadcast secrets available in {directory}.")


def launch_icecast() -> None:
    tree = ET.parse(BASE / "icecast.xml")
    cfg = tree.getroot()
    state = Path(tempfile.mkdtemp(prefix="leonida-icecast-"))
    shared = env_path("ICECAST_DATA", "/usr/share/icecast2")
    secrets_dir = env_path("BROADCAST_SECRETS_DIR", "/run/secrets")
    cfg.find("listen-socket/port").text = str(int(os.environ.get("ICECAST_PORT", "8000")))
    cfg.find("listen-socket/bind-address").text = os.environ.get("ICECAST_BIND", "0.0.0.0")
    for name in ("source", "admin", "relay"):
        value = (secrets_dir / name).read_text("utf-8").strip()
        if len(value) < 24:
            raise ValueError(f"{name} secret requires at least 24 characters")
        cfg.find(f"authentication/{name}-password").text = value
    for key, path in {"basedir": shared, "webroot": shared / "web", "adminroot": shared / "admin",
                      "logdir": state, "pidfile": state / "icecast.pid"}.items():
        cfg.find(f"paths/{key}").text = str(path)
    (state / "access.log").symlink_to(os.devnull)
    config = state / "icecast.xml"
    tree.write(config, encoding="utf-8", xml_declaration=True)
    binary = os.environ.get("ICECAST_BIN", "icecast2")
    os.execvp(binary, [binary, "-c", str(config)])


def reviewed_stations(registry: Path, audio: Path) -> list[tuple]:
    stations = []
    manifest = json.loads(registry.read_text("utf-8"))
    references = manifest["rights"]
    if not isinstance(references, dict) or any(not isinstance(value, str) or not value.strip() for value in references.values()):
        raise ValueError("Supply non-empty rights descriptions in the broadcast manifest.")
    for station in manifest["stations"]:
        slug, name = station["slug"], station["name"]
        if not MOUNT_SLUG.fullmatch(slug) or slug in {s[0] for s in stations}:
            raise ValueError("Invalid or duplicate station slug")
        if not isinstance(name, str) or not name.strip() or len(name) > 80 or not name.isprintable():
            raise ValueError(f"{slug}: invalid station name")
        paths = []
        for row in station["recordings"]:
            if row.get("rightsReference") not in references or not LOCAL_RECORDING.fullmatch(row["file"]):
                raise ValueError(f"{slug}: supply a local MP3 and a rights reference")
            location = (audio / row["file"]).resolve(strict=True)
            if not location.is_relative_to(audio) or not location.is_file():
                raise ValueError(f"{slug}: recording outside the authorized directory")
            with location.open("rb") as recording:
                if hashlib.file_digest(recording, "sha256").hexdigest() != row["sha256"]:
                    raise ValueError(f"{slug}: recording checksum differs from its authorization")
            paths.append(location)
        if not paths:
            raise ValueError(f"{slug}: requires an authorized fallback recording")
        fade = float(station.get("crossfadeSeconds", 0))
        if not math.isfinite(fade) or not 0 <= fade <= 5:
            raise ValueError(f"{slug}: crossfade must be from 0 through 5 seconds")
        stations.append((slug, name, paths, fade))
    if not stations:
        raise ValueError("The rights manifest is empty")
    return stations


def liq_string(text: str) -> str:
    # The input becomes a Liquidsoap string literal. Escape interpolation, too.
    return json.dumps(text, ensure_ascii=False).replace("#{", "\\#{")


def launch_worker(check: bool) -> None:
    registry = env_path("BROADCAST_REGISTRY", BASE / "rights.json")
    stations = reviewed_stations(registry, env_path("BROADCAST_AUDIO", "/audio"))
    state = Path(tempfile.mkdtemp(prefix="leonida-worker-"))
    script = (BASE / "station.liq").read_text("utf-8")
    for slug, name, tracks, fade in stations:
        playlist = state / f"{slug}.m3u"
        playlist.write_text("\n".join(map(str, tracks)) + "\n", encoding="utf-8")
        args = [liq_string(s) for s in (slug, name, str(playlist), str(tracks[0]))]
        script += f"\nstation({', '.join(args)}, {fade:.3f})\n"
    config = state / "network.liq"
    config.write_text(script, encoding="utf-8")
    binary = os.environ.get("LIQUIDSOAP_BIN", "liquidsoap")
    os.execvp(binary, [binary, *(["--check"] if check else []), str(config)])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["init", "icecast", "worker", "check"])
    parser.add_argument("--directory", type=Path, default=BASE / ".secrets")
    args = parser.parse_args()
    if args.action == "init":
        init_secrets(args.directory)
    else:
        os.umask(0o077)
        if args.action == "icecast":
            launch_icecast()
        else:
            launch_worker(args.action == "check")
