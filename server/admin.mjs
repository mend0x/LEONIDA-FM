import {
  adminEnabled,
  authorized,
  checkMutationOrigin,
  cookieToken,
  makeSession,
  matchesSecret,
  sessionCookie,
  sessionDigest,
} from './access.mjs';
import { statusFor, stationSources } from './broadcast.mjs';
import { HttpError, readJson, validSlug, validateEdit } from './validation.mjs';
import { json } from './api.mjs';

const missing = () => {
  throw new HttpError(404, 'not_found', 'Administrative resource not found.');
};
const unauthorized = () => {
  throw new HttpError(401, 'unauthorized', 'A valid administrator credential is required.');
};
function revisionFor(request, body) {
  const tag = request.headers.get('if-match');
  if (tag !== null && !/^(?:"[1-9]\d*"|[1-9]\d*)$/.test(tag))
    throw new HttpError(400, 'invalid_input', 'Invalid If-Match revision.');
  const headerRevision = tag === null ? undefined : Number(tag.replaceAll('"', ''));
  if (body.revision !== undefined && (!Number.isSafeInteger(body.revision) || body.revision < 1))
    throw new HttpError(400, 'invalid_input', 'Invalid revision.');
  if (
    headerRevision !== undefined &&
    body.revision !== undefined &&
    headerRevision !== body.revision
  )
    throw new HttpError(400, 'invalid_input', 'Revision headers and body disagree.');
  return headerRevision ?? body.revision;
}

export function createAdminRoutes({
  store,
  clock,
  config,
  catalog,
  programs,
  monitor,
  limit,
  token,
  assetInventory,
  connected,
}) {
  const enabled = adminEnabled(store, token);
  const knownAssets = new Set([
    ...Object.values(programs)
      .flat()
      .map((p) => p.url),
    ...(assetInventory ?? []),
  ]);
  async function stationDetail(row) {
    return {
      slug: row.slug,
      station: { ...row.station, order: row.position, enabled: row.enabled },
      tracks: row.tracks,
      sources: stationSources(row, config),
      programs: row.programs,
      evidence: row.evidence,
      revision: row.revision,
      updatedAt: row.updatedAt,
    };
  }
  async function dashboard() {
    const [rows, health, events] = await Promise.all([
      store.list(),
      monitor.read(),
      store.events(50),
    ]);
    const statuses = rows.map((row) => statusFor(row, config, health));
    const samples = statuses.filter((s) => s.liveAvailable && s.listeners !== null);
    const bytes = statuses.filter((s) => s.liveAvailable && s.bytesSent !== null);
    return {
      now: clock(),
      stations: rows.map((row, i) => ({
        slug: row.slug,
        name: row.station.name,
        enabled: row.enabled,
        revision: row.revision,
        confidence: row.station.confidence,
        demoAvailable: statuses[i].demoAvailable,
        liveStatus: statuses[i].liveStatus,
      })),
      metrics: {
        stations: rows.length,
        enabled: rows.filter((r) => r.enabled).length,
        demoReady: statuses.filter((s) => s.demoAvailable).length,
        liveConfigured: statuses.filter((s) => s.liveConfigured).length,
        liveOnline: statuses.filter((s) => s.liveAvailable).length,
        listeners: samples.length ? samples.reduce((total, s) => total + s.listeners, 0) : null,
        measuredMounts: samples.length,
        bytesServed: bytes.length ? bytes.reduce((total, s) => total + s.bytesSent, 0) : null,
        eventClientsThisInstance: connected(),
        broadcastMonitor: health.state,
        checkedAt: health.checkedAt,
        database: 'connected',
      },
      events,
    };
  }
  async function route(request, url, parts, client) {
    if (!enabled)
      throw new HttpError(
        503,
        'admin_unconfigured',
        'Studio requires a configured administrator credential and persistent store.',
      );
    checkMutationOrigin(request, url);
    const path = parts.join('/');
    const now = clock();
    if (path === 'session' && request.method === 'POST') {
      if (!limit(client, 'login', 10, 60000))
        throw new HttpError(429, 'rate_limited', 'Try signing in again shortly.');
      const body = await readJson(request, 2048);
      if (!(await matchesSecret(body?.token, token))) unauthorized();
      const previous = cookieToken(request);
      if (previous) await store.removeSession(await sessionDigest(previous + ':' + token));
      const session = await makeSession(store, now, token);
      return json({ authenticated: true, expiresAt: now + 4 * 60 * 60 * 1000 }, 200, {
        'Set-Cookie': sessionCookie(session, url),
      });
    }
    if (!(await authorized(request, store, token, now))) {
      if (!limit(client, 'auth-failure', 20))
        throw new HttpError(429, 'rate_limited', 'Too many failed administrative requests.');
      unauthorized();
    }
    if (path === 'session' && request.method === 'DELETE') {
      const previous = cookieToken(request);
      if (previous) await store.removeSession(await sessionDigest(previous + ':' + token));
      return json({ authenticated: false }, 200, { 'Set-Cookie': sessionCookie('', url, 0) });
    }
    if (path === 'session' && request.method === 'GET') return json({ authenticated: true });
    if (path === 'dashboard' && request.method === 'GET') return json(await dashboard());
    if (path === 'events' && request.method === 'GET') {
      const size = Number(url.searchParams.get('limit') ?? 50);
      if (!Number.isInteger(size) || size < 1 || size > 200)
        throw new HttpError(400, 'invalid_input', 'Invalid event limit.');
      return json({ events: await store.events(size) });
    }
    if (parts[0] !== 'stations' || parts.length > 3) missing();
    const create = parts.length === 1 && request.method === 'POST';
    if (parts.length === 1 && request.method === 'GET')
      return json({ stations: (await dashboard()).stations });
    if (!create && !validSlug(parts[1])) missing();
    const existing = create ? null : await store.get(parts[1]);
    if (!create && !existing) missing();
    if (parts.length === 2 && request.method === 'GET')
      return json(await stationDetail(existing), 200, { ETag: '"' + existing.revision + '"' });
    if (parts.length === 3 && parts[2] === 'probe' && request.method === 'POST') {
      if (!limit(client, 'probe', 12, 60000))
        throw new HttpError(429, 'rate_limited', 'Too many manual probes.');
      const state = statusFor(existing, config, await monitor.read(true));
      await store.addEvent(
        'station.probed',
        'info',
        existing.slug,
        now,
        'Live source status: ' + state.liveStatus,
      );
      return json({ status: state });
    }
    if (!create && (parts.length !== 2 || !['PUT', 'PATCH'].includes(request.method)))
      throw new HttpError(405, 'method_not_allowed', 'Unsupported administrative method.');
    const input = await readJson(request);
    if (!input || Array.isArray(input) || typeof input !== 'object')
      throw new HttpError(400, 'invalid_input', 'Supply a station edit object.');
    const slug = existing?.slug ?? input.station?.slug;
    const supplied = revisionFor(request, input);
    if (supplied !== undefined && supplied !== existing?.revision)
      throw new HttpError(412, 'stale_revision', 'Reload the current station revision.');
    const rows = await store.list();
    const references = [
      ...catalog.references,
      ...rows.filter((r) => r.slug !== slug).flatMap((r) => r.evidence),
    ];
    const next = validateEdit(
      input,
      existing,
      slug,
      references,
      config.streamHosts,
      now,
      knownAssets,
    );
    if (!(await store.save(next, existing?.revision ?? 0)))
      throw new HttpError(
        409,
        'edit_conflict',
        'Station already exists or another edit committed first.',
      );
    return json(await stationDetail(next), create ? 201 : 200, { ETag: '"' + next.revision + '"' });
  }
  route.enabled = enabled;
  return route;
}
