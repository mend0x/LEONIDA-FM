FROM debian:trixie-slim AS icecast
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends icecast2 python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/broadcast
COPY entry.py icecast.xml ./
USER 65532:65532
ENTRYPOINT ["python3", "entry.py", "icecast"]

FROM debian:trixie-slim AS playout
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends liquidsoap python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/broadcast
COPY entry.py station.liq rights.json ./
ENV HOME=/tmp XDG_CACHE_HOME=/tmp/cache
USER 65532:65532
ENTRYPOINT ["python3", "entry.py", "worker"]

FROM node:22-trixie-slim AS gateway
WORKDIR /opt/broadcast
COPY gateway.mjs rights.json ./
USER node
ENTRYPOINT ["node", "gateway.mjs"]
