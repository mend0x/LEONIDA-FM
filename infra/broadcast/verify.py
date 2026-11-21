"""Decode, measure and exercise the six broadcasts. Python 3.11+ and ffmpeg."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import statistics
import subprocess
import sys
import tempfile
from threading import Barrier
import time
import urllib.error
import urllib.request

BASE = Path(__file__).resolve().parent
STATIONS = [r["slug"] for r in json.loads((BASE / "rights.json").read_text())["stations"]]
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))
HEADERS = {"User-Agent": "Leonida-broadcast-verification/1"}


def open_url(url, method="GET"):
    return HTTP.open(urllib.request.Request(url, method=method, headers=HEADERS), timeout=5)


def status(url):
    try:
        response = open_url(url + "/stream/status.json")
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, json.load(response)


def expect_code(url, method, code):
    try:
        response = open_url(url, method)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        assert response.status == code, (url, response.status, code)


def wait_for(description, predicate, timeout=50):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        try:
            found = predicate()
        except (OSError, ValueError, KeyError):
            found = False
        if found:
            return found, round(time.monotonic() - start, 2)
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {description}")


def locked(url):
    code, snap = status(url)
    rows = snap["stations"]
    if code == 200 and {r["slug"] for r in rows if r["status"] == "active"} == set(STATIONS):
        return snap
    return False


def decode_mount(url, slug):
    with open_url(f"{url}/stream/{slug}") as response:
        assert response.headers.get_content_type() == "audio/mpeg"
        body = response.read(19800)
    decoded = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "mp3", "-i", "pipe:0",
         "-t", "0.5", "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1"],
        input=body, capture_output=True, check=True)
    if len(decoded.stdout) < 7800:
        raise RuntimeError(f"Not enough decoded PCM sampled from {slug}.")
    return {"slug": slug, "mp3Bytes": len(body), "decodedPcmBytes": len(decoded.stdout)}


def process_totals(roots):
    """Linux only. Count roots and children, including native launcher wrappers."""
    if not roots or not Path("/proc/self/stat").exists():
        return None
    stats = {}
    for proc in Path("/proc").glob("[0-9]*/stat"):
        try:
            fields = proc.read_text().rsplit(")", 1)[1].split()
            stats[int(proc.parent.name)] = (int(fields[1]), int(fields[11]) + int(fields[12]), int(fields[21]))
        except (OSError, ValueError, IndexError):
            continue
    pids = set(roots)
    while True:
        extended = pids | {pid for pid, (ppid, _, _) in stats.items() if ppid in pids}
        if extended == pids:
            break
        pids = extended
    values = [stats[pid] for pid in pids if pid in stats]
    return (sum(v[1] for v in values) / os.sysconf("SC_CLK_TCK"),
            sum(v[2] for v in values) * os.sysconf("SC_PAGE_SIZE") / (1024**2))


def listeners(url, count, seconds, pids):
    # Bound the helper to operator-scale checks; one group can include two
    # listeners on each station for the same concurrently transmitted frames.
    barrier = Barrier(count + 1)
    def read(index):
        slug = STATIONS[index % len(STATIONS)]
        barrier.wait(timeout=10)
        start = time.monotonic()
        with open_url(f"{url}/stream/{slug}") as response:
            first = response.read(1024)
            ttfb = time.monotonic() - start
            sample = bytearray(first)
            received = len(first)
            while time.monotonic() - start < seconds:
                chunk = response.read(4096)
                if not chunk:
                    raise RuntimeError(f"{slug} stopped during the load test")
                received += len(chunk)
                if len(sample) < 49152:
                    sample.extend(chunk)
        return slug, received, bytes(sample), ttfb
    with ThreadPoolExecutor(count) as pool:
        tasks = [pool.submit(read, i) for i in range(count)]
        before = process_totals(pids)
        barrier.wait(timeout=10)
        started = time.monotonic()
        peaks, timings, seen = [], [], 0
        while not all(f.done() for f in tasks):
            tick = time.monotonic()
            code, body = status(url)
            assert code == 200
            timings.append((time.monotonic() - tick) * 1000)
            seen = max(seen, sum(row["listeners"] for row in body["stations"]))
            process = process_totals(pids)
            if process:
                peaks.append(process[1])
            time.sleep(0.1)
        duration = time.monotonic() - started
        after = process_totals(pids)
        results = [f.result() for f in tasks]
    assert seen == count, f"Only observed {seen} simultaneous of {count} connections."
    overlap = []
    for slug in STATIONS:
        samples = [value[2] for value in results if value[0] == slug]
        if len(samples) > 1:
            first, second = samples[:2]
            shared = any(first[i:i+1024] in second for i in range(0,len(first)-1024,512))
            assert shared, f"No matching live MP3 frames for {slug}."
            overlap.append(slug)
    total = sum(row[1] for row in results)
    timings.sort()
    return {
        "concurrentListenersObserved": seen, "seconds": round(duration, 2),
        "receivedBytesIncludingJoinBursts": total,
        "aggregateMegabitsPerSecondIncludingJoinBursts": round(8 * total / 1e6 / duration, 3),
        "sharedAudioConfirmedForStations": overlap,
        "firstAudioMedianMs": round(statistics.median(r[3] for r in results) * 1000, 2),
        "statusRequests": len(timings), "statusMedianMs": round(statistics.median(timings),2),
        "statusP95Ms": round(timings[max(0, (95 * len(timings) + 99) // 100 - 1)],2),
        "serviceProcessTreePeakRssMiB": round(max(peaks),2) if peaks else None,
        "serviceCpuPercentOfOneCore": round(100*(after[0]-before[0])/duration,2) if before and after else None,
        "listenerErrors": 0,
    }


def measure(url, count, seconds, pids):
    current, ready = wait_for("the complete dial",lambda: locked(url))
    routes = [("/admin/stats", "GET", 404), ("/status-json.xsl", "GET", 404),
              ("/stream/unknown", "GET", 404), ("/stream/flash-fm", "POST", 405)]
    for path, verb, code in routes:
        expect_code(url + path, verb, code)
    print("Six mounts active; checking decoded audio and concurrent listeners.", flush=True)
    with ThreadPoolExecutor(6) as pool:
        decoded = list(pool.map(lambda s: decode_mount(url, s),STATIONS))
    payload = listeners(url,count,seconds,pids)
    return {"secondsToFullDialFromProbe": ready, "initialMetadata": {s["slug"]: s["current"] for s in current["stations"]},
            "mounts": decoded, "restrictedRoutesChecked": len(routes), "load": payload}


def available_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1",0))
        return sock.getsockname()[1]


def stop(process):
    if process.poll() is None:
        os.killpg(process.pid,signal.SIGTERM)
        try:
            process.wait(timeout=7)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid,signal.SIGKILL)
            process.wait(timeout=4)


def native(count, seconds):
    if os.name != "posix":
        raise ValueError("The native restart test uses POSIX process groups. Use Docker and the HTTP probe on Windows.")
    with tempfile.TemporaryDirectory(prefix="leonida-verify-") as directory, ExitStack() as stack:
        tmp = Path(directory)
        origin_port, public_port = available_port(), available_port()
        while origin_port == public_port:
            public_port = available_port()
        env = {**os.environ, "ICECAST_HOST":"127.0.0.1","ICECAST_BIND":"127.0.0.1","ICECAST_PORT":str(origin_port),
               "BROADCAST_BIND":"127.0.0.1","BROADCAST_PORT":str(public_port),
               "BROADCAST_SECRETS_DIR":str(tmp/"secrets"),"BROADCAST_AUDIO":str(BASE.parent.parent/"public/audio"),
               "BROADCAST_REGISTRY":str(BASE/"rights.json"),"XDG_CACHE_HOME":str(tmp/"cache"),"DJ_ENABLED":"0"}
        start = [sys.executable,str(BASE/"entry.py")]
        subprocess.run(start+["init","--directory",env["BROADCAST_SECRETS_DIR"]],env=env,check=True,stdout=subprocess.DEVNULL)
        digests = {p.name:hashlib.sha256(p.read_bytes()).digest() for p in (tmp/"secrets").iterdir()}
        subprocess.run(start+["init","--directory",env["BROADCAST_SECRETS_DIR"]],env=env,check=True,stdout=subprocess.DEVNULL)
        assert len(digests)==4 and digests=={p.name:hashlib.sha256(p.read_bytes()).digest() for p in (tmp/"secrets").iterdir()}
        for enabled in ("0","1"):
            subprocess.run(start+["check"],env={**env,"DJ_ENABLED":enabled},check=True,stdout=subprocess.DEVNULL)
        print("Rights manifest and both Liquidsoap configurations validated.",flush=True)
        processes = {}
        def launch(name):
            file = stack.enter_context((tmp/f"{name}-{time.monotonic_ns()}.log").open("wb"))
            cmd = [shutil.which("node") or "node",str(BASE/"gateway.mjs")] if name=="gateway" else start+[name]
            child = subprocess.Popen(cmd,env=env,stdout=file,stderr=file,start_new_session=True)
            processes[name] = child
            stack.callback(stop,child)
        url = f"http://127.0.0.1:{public_port}"
        try:
            for service in ("icecast","worker","gateway"):
                launch(service)
            report = measure(url,count,seconds,[p.pid for p in processes.values()])
            first = report["initialMetadata"]["flash-fm"]
            def changed():
                code, body = status(url)
                now = next((s["current"] for s in body["stations"] if s["slug"]=="flash-fm"),None)
                return now if code == 200 and now and first and now != first else False
            next_title, change_s = wait_for("a second Flash FM title",changed,75)
            report["metadataChange"] = {"from": first,"to": next_title,"secondsAfterLoad":change_s}
            print("Metadata advanced. Checking encoder and server recovery.",flush=True)
            stop(processes["worker"])
            def no_source():
                code,body=status(url)
                return code==200 and len(body["stations"])==6 and all(s["status"]=="no-source" for s in body["stations"])
            _,down=wait_for("encoder outage",no_source)
            expect_code(url+"/stream/flash-fm","GET",503)
            launch("worker")
            _,up=wait_for("restarted encoder",lambda: locked(url))
            stop(processes["icecast"])
            _,origin_down=wait_for("origin outage",lambda: status(url)[0]==503 and status(url)[1]["status"]=="unreachable")
            launch("icecast")
            _,origin_up=wait_for("automatic Icecast reconnection",lambda: locked(url))
            report["recoverySeconds"]={"encoderOutageDetected":down,"encoderRestartToSixActive":up,
                                       "originOutageDetected":origin_down,"originRestartToSixActive":origin_up}
            report["afterRecovery"]=decode_mount(url,"flash-fm")
            return report
        except Exception:
            for file in sorted(tmp.glob("*.log")):
                print(file.name+ "\n"+file.read_text(errors="replace")[-2200:],file=sys.stderr)
            raise


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url",default="http://127.0.0.1:8088")
    parser.add_argument("--native",action="store_true")
    parser.add_argument("--listeners",type=int,default=12,choices=range(2,33),metavar="2..32")
    parser.add_argument("--seconds",type=int,default=5,choices=range(2,61),metavar="2..60")
    parser.add_argument("--output",type=Path)
    args=parser.parse_args()
    report=native(args.listeners,args.seconds) if args.native else measure(args.url.rstrip("/"),args.listeners,args.seconds,[])
    report["completedAtUtc"]=datetime.now(timezone.utc).isoformat(timespec="seconds")
    report["verificationMode"]="native services on loopback" if args.native else "existing HTTP gateway"
    output=json.dumps(report,indent=2,ensure_ascii=False)+"\n"
    if args.output: args.output.write_text(output,encoding="utf-8")
    print(output)
