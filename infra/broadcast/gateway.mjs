import http from 'node:http';
import { readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';

const registry = JSON.parse(readFileSync(process.env.BROADCAST_REGISTRY || new URL('./rights.json', import.meta.url)));
const mounts = new Map(registry.stations.map(({ slug }) => ['/stream/' + slug, slug]));
const origin = { hostname: process.env.ICECAST_HOST || 'icecast', port: Number(process.env.ICECAST_PORT || 8000) };
const counts = new Map([...mounts.values()].map(slug => [slug, { listeners: 0, bytesServed: 0 }]));
const timerMs = 5000;
let activeListeners = 0;
let snapshot = { status: 'starting', checkedAt: null, stations: [] };

function upstream(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ ...origin, path, headers, agent: false }, resolve);
    req.setTimeout(7000, () => req.destroy(new Error('Origin timed out')));
    req.on('error', reject);
  });
}

async function originStats() {
  const res = await upstream('/status-json.xsl');
  try {
    if (res.statusCode !== 200) throw new Error('Origin unavailable');
    const chunks = [];
    let size = 0;
    for await (const chunk of res) {
      size += chunk.length;
      if (size > 262144) throw new Error('Origin statistics exceed configured limit');
      chunks.push(chunk);
    }
    const stats = JSON.parse(Buffer.concat(chunks).toString()).icestats;
    if (!stats || typeof stats !== 'object') throw new Error('Invalid origin statistics');
    return [stats.source || []].flat();
  } finally {
    res.destroy();
  }
}

async function receivesMedia(mount) {
  let response;
  try {
    response = await upstream(mount);
    if (response.statusCode !== 200 || !response.headers['content-type']?.startsWith('audio/')) return false;
    for await (const chunk of response) {
      if (chunk.length) return true;
    }
  } catch {
    // A mount can disappear between the stats read and the first audio byte.
  } finally {
    response?.destroy();
  }
  return false;
}

async function refresh() {
  let status = 'connected';
  const found = new Map();
  try {
    for (const row of await originStats()) {
      if (!row) continue;
      let mount = row.mount;
      if (!mount && row.listenurl) {
        try { mount = new URL(row.listenurl).pathname; } catch { continue; }
      }
      if (mounts.has(mount)) found.set(mount, row);
    }
  } catch {
    status = 'unreachable';
  }
  const stations = await Promise.all([...mounts].map(async ([mount, slug]) => {
    const item = found.get(mount);
    const state = status === 'unreachable' ? 'unreachable'
      : !item ? 'no-source' : await receivesMedia(mount) ? 'active' : 'unknown';
    return { slug, mount, status: state, current: typeof item?.title === 'string' ? item.title : null,
      artist: typeof item?.artist === 'string' ? item.artist : null,
      bitrateKbps: Number.isFinite(Number(item?.bitrate)) && Number(item?.bitrate) > 0 ? Number(item.bitrate) : null,
      startedAt: typeof item?.stream_start_iso8601 === 'string' ? item.stream_start_iso8601 : null };
  }));
  snapshot = { status, checkedAt: new Date().toISOString(), stations };
}

function json(res, code, fields) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(fields));
}

function withCounts() {
  return { ...snapshot, stations: snapshot.stations.map(s => ({ ...s, ...counts.get(s.slug) })) };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  if (process.env.BROADCAST_ALLOW_ORIGIN && req.headers.origin === process.env.BROADCAST_ALLOW_ORIGIN) {
    res.setHeader('access-control-allow-origin', process.env.BROADCAST_ALLOW_ORIGIN);
    res.setHeader('vary', 'Origin');
  }
  const path = req.url.split('?', 1)[0];
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD');
    return json(res, 405, { error: 'Read-only endpoint' });
  }
  if (path === '/stream/status.json') return json(res, snapshot.status === 'connected' ? 200 : 503, withCounts());
  if (!mounts.has(path)) return json(res, 404, { error: 'Unknown mount' });
  if (activeListeners >= 96) return json(res, 503, { error: 'Listener capacity reached' });

  const tally = counts.get(mounts.get(path));
  let upstreamResponse;
  activeListeners++;
  try {
    const headers = req.headers['icy-metadata'] === '1' ? { 'Icy-MetaData': '1' } : {};
    upstreamResponse = await upstream(path, headers);
    if (res.destroyed) return;
    if (upstreamResponse.statusCode !== 200 || !upstreamResponse.headers['content-type']?.startsWith('audio/')) {
      return json(res, 503, { error: 'No active broadcast' });
    }
    for (const header of ['content-type', 'icy-name', 'icy-br', 'icy-metaint', 'icy-genre']) {
      const value = upstreamResponse.headers[header];
      if (value !== undefined) res.setHeader(header, value);
    }
    res.writeHead(200);
    if (req.method === 'HEAD') return res.end();
    tally.listeners++;
    try {
      upstreamResponse.on('data', chunk => { tally.bytesServed += chunk.length; });
      // pipeline applies backpressure and aborts both sockets on disconnect.
      await pipeline(upstreamResponse, res);
    } finally {
      tally.listeners--;
    }
  } catch {
    if (!res.headersSent && !res.destroyed) json(res, 503, { error: 'Broadcast temporarily unavailable' });
    else res.destroy();
  } finally {
    upstreamResponse?.destroy();
    activeListeners--;
  }
});
server.headersTimeout = 10000;
server.requestTimeout = 12000;
server.maxHeadersCount = 40;
server.keepAliveTimeout = 4000;

server.listen(Number(process.env.BROADCAST_PORT || 8088), process.env.BROADCAST_BIND || '0.0.0.0');
let stopping = false;
async function tick() {
  await refresh();
  if (!stopping) setTimeout(tick, timerMs).unref();
}
tick().catch(err => { console.error(err.message); process.exit(1); });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  stopping = true;
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
