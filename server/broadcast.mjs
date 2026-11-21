// All outbound requests use the operator-supplied monitor URL. Station records
// control client playback only. Never follow a redirect with server credentials.
export function createMonitor({ url, fetcher = fetch, clock = Date.now, onIncident }) {
  let cache = { state: 'unknown', mounts: new Map(), checkedAt: null, lastGood: null };
  let pending;
  let lastAttempt = -Infinity;
  const ttl = 15000;
  const clean = (value) =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : null;
  const count = (value) =>
    value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0
      ? Number(value)
      : null;
  function icecastMount(item) {
    const location = item.mount ?? item.listenurl;
    if (typeof location !== 'string') return null;
    let path;
    try {
      path = new URL(location, 'https://broadcast.invalid').pathname;
    } catch {
      return null;
    }
    const match = /^\/(?:stream\/)?([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.(?:mp3|ogg|opus|aac))?$/.exec(
      path,
    );
    if (!match) return null;
    return [
      match[1],
      {
        status: 'online',
        title: clean(item.title),
        artist: clean(item.artist),
        listeners: count(item.listeners),
        bitrateKbps: count(item.bitrate ?? item['ice-bitrate']),
        startedAt: clean(item.stream_start_iso8601),
        bytesSent: count(item.total_bytes_sent),
      },
    ];
  }
  function parse(data) {
    if (data && typeof data.icestats === 'object' && data.icestats !== null) {
      const sources = data.icestats.source;
      const entries = Array.isArray(sources) ? sources : sources ? [sources] : [];
      return new Map(entries.filter(Boolean).map(icecastMount).filter(Boolean));
    }
    if (Array.isArray(data?.stations)) {
      const statusMap = {
        active: 'online',
        'no-source': 'offline',
        online: 'online',
        offline: 'offline',
        unreachable: 'unreachable',
        unknown: 'unknown',
      };
      const observed = typeof data.checkedAt === 'string' ? Date.parse(data.checkedAt) : null;
      if (observed && clock() - observed > 60000) throw new Error('Stale broadcast probe.');
      return new Map(
        data.stations
          .filter((s) => typeof s.slug === 'string' && Object.hasOwn(statusMap, s.status))
          .map((s) => [
            s.slug,
            {
              status: statusMap[s.status],
              title: clean(
                s.title ?? (typeof s.current === 'string' ? s.current : s.current?.title),
              ),
              artist: clean(s.artist ?? s.current?.artist),
              listeners: count(s.listeners),
              bitrateKbps: count(s.bitrateKbps),
              startedAt: clean(s.startedAt),
              bytesSent: count(s.bytesSent ?? s.bytesServed),
            },
          ]),
      );
    }
    throw new Error('Unsupported broadcast status response.');
  }
  async function refresh() {
    const previous = cache;
    try {
      const response = await fetcher(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(3500),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error('Unreachable status endpoint.');
      const buffer = await readLimited(response, 262144);
      const mounts = parse(JSON.parse(buffer));
      const now = clock();
      cache = { state: 'ready', mounts, checkedAt: now, lastGood: now };
      if (previous.state === 'unreachable' || previous.state === 'stale')
        await onIncident?.('monitor.recovered', 'info', null, 'Broadcast status recovered');
      if (previous.state === 'ready') {
        for (const [slug, info] of previous.mounts) {
          if (info.status === 'online' && mounts.get(slug)?.status !== 'online')
            await onIncident?.('mount.offline', 'warning', slug, 'Broadcast mount disconnected');
        }
        for (const [slug, info] of mounts) {
          if (info.status === 'online' && previous.mounts.get(slug)?.status !== 'online')
            await onIncident?.('mount.online', 'info', slug, 'Broadcast mount connected');
        }
      }
    } catch {
      cache = {
        ...previous,
        state: previous.lastGood === null ? 'unreachable' : 'stale',
        checkedAt: clock(),
      };
      if (previous.state !== cache.state)
        await onIncident?.('monitor.unavailable', 'warning', null, 'Broadcast status unavailable');
    }
    return cache;
  }
  return {
    async read(force = false) {
      if (!url) return cache;
      if (pending) return pending;
      if (!force && clock() - lastAttempt < ttl) return cache;
      lastAttempt = clock();
      pending = refresh().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    available: Boolean(url),
  };
}
async function readLimited(response, max) {
  if (Number(response.headers.get('content-length')) > max)
    throw new Error('Monitor response too large.');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing monitor body.');
  const decoder = new TextDecoder();
  let length = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      length += value.byteLength;
      if (length > max) {
        await reader.cancel();
        throw new Error('Monitor response too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
export function stationSources(row, config) {
  if (row.sources !== null && row.sources !== undefined) return row.sources;
  if (!config.streamBase || !config.streamRightsReference) return [];
  let url;
  if (config.streamBase === '/stream') url = '/stream/' + row.slug;
  else {
    try {
      const base = new URL(config.streamBase);
      if (
        base.protocol !== 'https:' ||
        base.port ||
        base.username ||
        base.password ||
        base.search ||
        base.hash ||
        !config.streamHosts.has(base.hostname)
      )
        return [];
      url = base.href.replace(/\/$/, '') + '/' + row.slug;
    } catch {
      return [];
    }
  }
  return [
    {
      id: 'icecast-' + row.slug,
      type: 'icecast',
      url,
      enabled: true,
      priority: 0,
      rightsReference: config.streamRightsReference,
    },
  ];
}
function belongsToMonitor(source, slug, config) {
  if (source.url === '/stream/' + slug) return true;
  if (!config.streamBase || config.streamBase === '/stream') return false;
  return source.url === config.streamBase.replace(/\/$/, '') + '/' + slug;
}
export function statusFor(row, config, monitor) {
  const sources = stationSources(row, config);
  const live = sources.filter((s) => ['icecast', 'hls'].includes(s.type));
  const active = live.filter((s) => s.enabled);
  const mount = monitor.mounts.get(row.slug);
  const diagnostics = (source) => {
    if (!source.enabled) return 'disabled';
    if (!belongsToMonitor(source, row.slug, config)) return 'unknown';
    if (monitor.state !== 'ready') return monitor.state;
    return mount?.status ?? 'offline';
  };
  const current = active.find((s) => diagnostics(s) === 'online') ?? active[0];
  let liveStatus = 'unconfigured';
  if (live.length) liveStatus = current ? diagnostics(current) : 'disabled';
  const isOnline = liveStatus === 'online';
  return {
    slug: row.slug,
    name: row.station.name,
    demoAvailable: row.programs.length > 0,
    liveAvailable: isOnline,
    liveConfigured: active.length > 0,
    liveStatus,
    checkedAt: current && belongsToMonitor(current, row.slug, config) ? monitor.checkedAt : null,
    liveSource: current ? { ...current, health: liveStatus } : null,
    current: isOnline && mount?.title ? { title: mount.title, artist: mount.artist } : null,
    listeners: isOnline ? (mount?.listeners ?? null) : null,
    bitrateKbps: isOnline ? (mount?.bitrateKbps ?? null) : null,
    bytesSent: isOnline ? (mount?.bytesSent ?? null) : null,
    sources: sources.map((source) => ({
      ...source,
      health: ['icecast', 'hls'].includes(source.type)
        ? diagnostics(source)
        : source.enabled
          ? 'external'
          : 'disabled',
    })),
  };
}
