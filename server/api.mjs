import { createReadOnlyStore, seedRows } from './store.mjs';
import { scheduleAt } from './schedule.mjs';
import { checkedPage, HttpError, paginate, validSlug } from './validation.mjs';
import { createMonitor, statusFor } from './broadcast.mjs';
import { createLimits } from './access.mjs';
import { createAdminRoutes } from './admin.mjs';
import { eventStream } from './events.mjs';

function fingerprint(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}
export function json(value, status = 200, overrides = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...overrides,
    },
  });
}
function cached(request, body) {
  const text = JSON.stringify(body);
  const tag = 'W/"' + fingerprint(text) + '"';
  const headers = {
    'Cache-Control': 'public, max-age=5, must-revalidate',
    ETag: tag,
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
  if (
    request.headers
      .get('if-none-match')
      ?.split(',')
      .map((v) => v.trim())
      .includes(tag)
  )
    return new Response(null, { status: 304, headers });
  return new Response(text, { headers });
}
export function publicStation(row) {
  return {
    ...row.station,
    slug: row.slug,
    order: row.position,
    enabled: row.enabled,
    revision: row.revision,
    tracks: row.tracks,
  };
}
function allReferences(catalog, rows) {
  const refs = new Map(catalog.references.map((ref) => [ref.id, ref]));
  for (const row of rows)
    for (const ref of row.evidence) if (!refs.has(ref.id)) refs.set(ref.id, ref);
  return [...refs.values()];
}
const missing = () => {
  throw new HttpError(404, 'not_found', 'Resource not found.');
};
const lower = (value) => String(value ?? '').toLocaleLowerCase();
const publicStatus = ({ sources: _sources, ...status }) => status;
function applyFilters(items, params, isTrack = false) {
  const q = lower(params.get('q')).trim(),
    confidence = params.get('confidence'),
    genre = lower(params.get('genre'));
  if (confidence && !['OFFICIAL', 'REPORTED', 'UNVERIFIED', 'COMMUNITY'].includes(confidence))
    throw new HttpError(400, 'invalid_input', 'Unknown confidence filter.');
  return items.filter(
    (item) =>
      (!confidence || item.confidence === confidence) &&
      (!genre || lower(item.genre).includes(genre)) &&
      (!q ||
        lower(
          isTrack
            ? item.artist + ' ' + item.title
            : item.name + ' ' + item.genre + ' ' + (item.hosts ?? []).join(' '),
        ).includes(q)),
  );
}
export function createApi(options) {
  const { catalog, programs, clock = Date.now } = options;
  const rows = seedRows(catalog, programs, clock());
  const store = options.store ?? createReadOnlyStore(rows);
  const revision = fingerprint(JSON.stringify([catalog, programs]));
  const hostInput =
    options.streamHosts instanceof Set
      ? [...options.streamHosts]
      : Array.isArray(options.streamHosts)
        ? options.streamHosts
        : (options.streamHosts ?? '').split(',');
  const config = {
    streamHosts: new Set(hostInput.map((host) => host.trim().toLowerCase()).filter(Boolean)),
    streamBase: options.streamBase?.replace(/\/$/, ''),
    streamRightsReference: options.streamRightsReference?.trim(),
  };
  const limit = createLimits(clock);
  const clients = new Map();
  let openStreams = 0;
  let preparing;
  const ready = () =>
    (preparing ??= Promise.resolve()
      .then(() => store.init(rows, revision))
      .catch((error) => {
        preparing = undefined;
        throw error;
      }));
  const monitor = createMonitor({
    url: options.broadcastStatusUrl,
    fetcher: options.fetcher,
    clock,
    onIncident: store.available
      ? (type, severity, slug, detail) => store.addEvent(type, severity, slug, clock(), detail)
      : undefined,
  });
  const admin = createAdminRoutes({
    store,
    clock,
    config,
    catalog,
    programs,
    monitor,
    limit,
    token: options.adminToken,
    assetInventory: options.assetInventory,
    connected: () => openStreams,
  });
  const summary = async (record) => statusFor(record, config, await monitor.read());

  async function route(request, context) {
    const url = new URL(request.url);
    const parts = url.pathname.replace(/\/+$/, '').split('/').slice(1);
    if (parts[0] !== 'api') missing();
    const client = context?.clientKey || 'anonymous';
    if (!limit(client, 'api', 360))
      throw new HttpError(429, 'rate_limited', 'Request limit reached. Try again shortly.');
    await ready();
    if (parts[1] === 'admin') return admin(request, url, parts.slice(2), client);
    if (request.method !== 'GET' && request.method !== 'HEAD')
      throw new HttpError(405, 'method_not_allowed', 'Use GET for this resource.');
    const path = parts.slice(1).join('/');
    const now = clock();
    if (path === 'system/time') return json({ now, utc: new Date(now).toISOString() });
    if (path === 'health')
      return json({
        ok: await store.health(),
        service: 'leonida-fm',
        apiVersion: 1,
        database: store.available ? 'connected' : 'bundled-read-only',
      });
    if (path === 'config/public')
      return cached(request, {
        apiVersion: 1,
        catalogVersion: catalog.version ?? revision,
        defaultMode: 'demo',
        modes: ['demo', 'explorer', 'live'],
        languages: ['en', 'es'],
        adminAvailable: admin.enabled,
        persistence: store.available ? 'sqlite' : 'bundled-read-only',
      });
    if (path === 'stations') {
      const records = (await store.list()).filter((row) => row.enabled);
      const result = paginate(
        applyFilters(records.map(publicStation), url.searchParams),
        checkedPage(url.searchParams),
      );
      const { items: stations, ...page } = result;
      return cached(request, {
        stations,
        expanded: catalog.expanded ?? [],
        references: allReferences(catalog, records),
        ...page,
        version: catalog.version ?? revision,
        verifiedAt: catalog.verifiedAt,
      });
    }
    if (path === 'broadcasts/status') {
      const [records, health] = await Promise.all([store.list(), monitor.read()]);
      return json({
        checkedAt: health.checkedAt,
        monitor: health.state,
        stations: records
          .filter((row) => row.enabled)
          .map((row) => publicStatus(statusFor(row, config, health))),
      });
    }
    if (path === 'events') {
      if (request.method === 'HEAD')
        return new Response(null, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' },
        });
      const filter = url.searchParams.get('station');
      if (filter && (!validSlug(filter) || !(await store.get(filter))?.enabled)) missing();
      const count = clients.get(client) ?? 0;
      if (count >= 6 || openStreams >= 128)
        throw new HttpError(429, 'stream_limit', 'Too many event subscriptions.');
      clients.set(client, count + 1);
      openStreams++;
      return eventStream({
        request,
        clock,
        tickMs: options.eventTickMs ?? 5000,
        release() {
          openStreams--;
          const remaining = (clients.get(client) ?? 1) - 1;
          if (remaining > 0) clients.set(client, remaining);
          else clients.delete(client);
        },
        async snapshot() {
          const time = clock();
          const [records, health] = await Promise.all([
            filter ? store.get(filter).then((row) => (row ? [row] : [])) : store.list(),
            monitor.read(),
          ]);
          return {
            now: time,
            stations: records
              .filter((row) => row.enabled)
              .map((row) => {
                const plan = scheduleAt(row.slug, row.programs, time);
                const live = statusFor(row, config, health);
                return {
                  slug: row.slug,
                  revision: row.revision,
                  programId: plan.current?.id ?? null,
                  startedAt: plan.startedAt,
                  endsAt: plan.endsAt,
                  liveStatus: live.liveStatus,
                  liveTitle: live.current?.title ?? null,
                };
              }),
          };
        },
      });
    }
    if (parts[1] !== 'stations' || parts.length > 4 || !validSlug(parts[2])) missing();
    const row = await store.get(parts[2]);
    if (!row?.enabled) missing();
    const sub = parts[3];
    if (!sub)
      return cached(request, {
        station: publicStation(row),
        references: allReferences(catalog, [row]),
      });
    if (sub === 'tracks') {
      const { items: tracks, ...page } = paginate(
        applyFilters(row.tracks, url.searchParams, true),
        checkedPage(url.searchParams),
      );
      return cached(request, { slug: row.slug, tracks, ...page });
    }
    if (sub === 'schedule')
      return cached(request, {
        slug: row.slug,
        mode: 'demo',
        scheduleVersion: row.revision,
        clock: 'UTC',
        programs: row.programs,
      });
    if (sub === 'now-playing') {
      const mode = url.searchParams.get('mode') ?? 'demo';
      if (mode === 'demo')
        return json({ ...scheduleAt(row.slug, row.programs, now), scheduleVersion: row.revision });
      if (mode !== 'live') throw new HttpError(400, 'invalid_input', 'Use demo or live.');
      const state = await summary(row);
      return json({
        slug: row.slug,
        mode,
        current: state.current,
        next: null,
        liveStatus: state.liveStatus,
        checkedAt: state.checkedAt,
        serverTime: now,
      });
    }
    if (sub === 'sources') {
      const state = await summary(row);
      const demo = row.programs.length
        ? [
            {
              id: 'demo-' + row.slug,
              type: 'demo',
              enabled: true,
              health: 'available',
              url: row.programs[0].url,
              rightsReference: 'Original LEONIDA FM demo program',
              priority: 0,
            },
          ]
        : [];
      return json({
        slug: row.slug,
        sources: [...demo, ...state.sources],
        liveStatus: state.liveStatus,
      });
    }
    missing();
  }

  async function handle(request, context = {}) {
    try {
      const response = await route(request, context);
      return request.method === 'HEAD'
        ? new Response(null, { status: response.status, headers: response.headers })
        : response;
    } catch (error) {
      if (!(error instanceof HttpError)) {
        options.onError?.(error);
        return json(
          {
            error: {
              code: 'service_unavailable',
              message: 'The service is temporarily unavailable.',
            },
          },
          503,
        );
      }
      const headers =
        error.status === 429
          ? { 'Retry-After': '60' }
          : error.status === 401
            ? { 'WWW-Authenticate': 'Bearer realm="Leonida FM Studio"' }
            : {};
      return json({ error: { code: error.code, message: error.message } }, error.status, headers);
    }
  }
  handle.ready = ready;
  handle.refresh = async () => {
    await ready();
    return monitor.read(true);
  };
  return handle;
}
