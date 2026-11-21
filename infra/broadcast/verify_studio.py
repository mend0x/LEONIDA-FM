"""Verify private DJ takeover and return to rotation on real Icecast/Liquidsoap."""
from __future__ import annotations

from array import array
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time

from verify import BASE, available_port, locked, open_url, stop, wait_for

TONE = 1733
SAMPLE_RATE = 8000


def make_pilot():
    return subprocess.run(
        ["ffmpeg","-hide_banner","-loglevel","error","-f","lavfi","-i",f"sine=frequency={TONE}:duration=45",
         "-ac","2","-c:a","libmp3lame","-b:a","96k","-write_xing","0","-id3v2_version","0","-f","mp3","pipe:1"],
        check=True,capture_output=True).stdout


def source(port, password, pilot, done):
    authorization = base64.b64encode(("source:"+password).encode()).decode()
    with socket.create_connection(("127.0.0.1",port),timeout=5) as conn:
        conn.sendall((
            f"PUT /flash-fm HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Basic {authorization}\r\n"
            "Content-Type: audio/mpeg\r\nIce-Name: Studio verification\r\nUser-Agent: Leonida-Origin-Test/1\r\n"
            "Content-Length: "+str(len(pilot))+"\r\nExpect: 100-continue\r\n\r\n").encode("ascii"))
        response = conn.recv(4096).split(b"\r\n",1)[0]
        if not (b" 100 " in response or b" 200 " in response):
            raise RuntimeError("Studio ingest rejected the verification source: "+response.decode(errors="replace"))
        # 96 kbit/s. Keep supplying frames throughout the takeover check.
        size = 2400
        next_write = time.monotonic()
        for pos in range(0,len(pilot),size):
            if done.is_set():
                break
            conn.sendall(pilot[pos:pos+size])
            next_write += size/12000
            done.wait(max(0,next_write-time.monotonic()))


def tone_fraction(url,slug):
    with open_url(f"{url}/stream/{slug}") as res:
        payload=res.read(28000)
    raw=subprocess.run(["ffmpeg","-hide_banner","-loglevel","error","-f","mp3","-i","pipe:0",
                        "-ac","1","-ar",str(SAMPLE_RATE),"-f","s16le","pipe:1"],
                       input=payload,capture_output=True,check=True).stdout
    samples=array("h")
    samples.frombytes(raw)
    if sys.byteorder=="big":
        samples.byteswap()
    samples=samples[-4000:]
    omega=2*math.pi*TONE/SAMPLE_RATE
    cos_sum=sum(s*math.cos(i*omega) for i,s in enumerate(samples))
    sin_sum=sum(s*math.sin(i*omega) for i,s in enumerate(samples))
    return 2*(cos_sum**2+sin_sum**2)/max(len(samples)*sum(s*s for s in samples),1)


def verify():
    if os.name!="posix":
        raise ValueError("Run in Linux or WSL with the native packages.")
    with tempfile.TemporaryDirectory(prefix="leonida-studio-") as tmp, ExitStack() as stack:
        state=Path(tmp)
        ports=set()
        while len(ports)<3:
            ports.add(available_port())
        origin,public,studio=sorted(ports)
        env={**os.environ,"ICECAST_HOST":"127.0.0.1","ICECAST_BIND":"127.0.0.1","ICECAST_PORT":str(origin),
             "BROADCAST_BIND":"127.0.0.1","BROADCAST_PORT":str(public),"DJ_PORT":str(studio),"DJ_ENABLED":"1",
             "BROADCAST_SECRETS_DIR":str(state/"secrets"),"BROADCAST_REGISTRY":str(BASE/"rights.json"),
             "BROADCAST_AUDIO":str(BASE.parent.parent/"public/audio")}
        entry=[sys.executable,str(BASE/"entry.py")]
        subprocess.run(entry+["init","--directory",env["BROADCAST_SECRETS_DIR"]],check=True,stdout=subprocess.DEVNULL)
        try:
            for name in ("icecast","worker","gateway"):
                cmd=["node",str(BASE/"gateway.mjs")] if name=="gateway" else entry+[name]
                log=stack.enter_context((state/(name+".log")).open("wb"))
                child=subprocess.Popen(cmd,env=env,stdout=log,stderr=log,start_new_session=True)
                stack.callback(stop,child)
            url=f"http://127.0.0.1:{public}"
            wait_for("our six studio-enabled stations",lambda:locked(url),65)
            # A strong narrowband pilot precisely identifies which source listeners actually hear.
            baseline=tone_fraction(url,"flash-fm")
            assert baseline<0.1
            password=(state/"secrets/dj").read_text().strip()
            done=threading.Event()
            with ThreadPoolExecutor(1) as pool:
                task=pool.submit(source,studio,password,make_pilot(),done)
                try:
                    def takeover():
                        if task.done():
                            task.result()
                        energy=tone_fraction(url,"flash-fm")
                        return energy if energy>0.65 else False
                    live,acquire=wait_for("audible authenticated pilot",takeover,32)
                    isolated=tone_fraction(url,"cocoteo-fm")
                    assert isolated<0.1
                finally:
                    done.set()
                task.result(timeout=6)
            def reverted():
                energy=tone_fraction(url,"flash-fm")
                return (energy,) if energy<0.1 else False
            restored,release=wait_for("return to the original Flash FM rotation",reverted,35)
            return {"completedAtUtc":datetime.now(timezone.utc).isoformat(timespec="seconds"),"pilotHz":TONE,
                    "method":"normalized single-frequency energy of actual decoded gateway audio",
                    "flashBefore":round(baseline,7),"flashDuringPrivateDJ":round(live,7),
                    "cocoteoDuringFlashDJ":round(isolated,7),"flashAfterDisconnect":round(restored[0],7),
                    "secondsToHearStudio":acquire,"secondsToHearRotationAfterDisconnect":release}
        except Exception:
            for log in sorted(state.glob("*.log")):
                print(log.name+"\n"+log.read_text(errors="replace")[-2200:],file=sys.stderr)
            raise


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",type=Path)
    args=parser.parse_args()
    result=json.dumps(verify(),indent=2)+"\n"
    if args.output:
        args.output.write_text(result,encoding="utf-8")
    print(result)
