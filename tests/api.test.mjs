import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { createApi } from '../server/api.mjs';
import { createMonitor } from '../server/broadcast.mjs';
import { createNodeStore } from '../server/node-store.mjs';
import { createD1Store } from '../server/store.mjs';
import { createNodeHandler } from '../server/node.mjs';
import { migration } from '../server/migrations/001.mjs';
import { scheduleAt } from '../server/schedule.mjs';
import { syntheticPrograms } from './fixtures/synthetic-programs.mjs';

const catalog = JSON.parse(
  await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'),
);
const shippingPrograms = JSON.parse(
  await readFile(new URL('../data/programs.json', import.meta.url), 'utf8'),
);
// The production music catalogue has no demo MP3s; test the broadcast API using
// deterministic, test-only programming without pretending that files ship.
const programs = Object.keys(shippingPrograms).length ? shippingPrograms : syntheticPrograms;
const now = Date.UTC(2026, 10, 18, 21);
const slug = 'flash-fm',
  origin = 'https://radio.example.org';
function setup(t, overrides = {}) {
  const store = overrides.store ?? createNodeStore(':memory:');
  const adminToken = randomBytes(32).toString('hex');
  const api = createApi({ catalog, programs, store, adminToken, clock: () => now, ...overrides });
  t.after(() => store.close?.());
  const request = (path, options = {}, context) =>
    api(new Request(origin + '/api/' + path, options), context ?? { clientKey: 'integration' });
  const json = async (path, options, context) => {
    const response = await request(path, options, context);
    return [response, await response.json()];
  };
  const admin = (method = 'GET', body, extra = {}) => ({
    method,
    headers: {
      Authorization: 'Bearer ' + adminToken,
      'Content-Type': 'application/json',
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { api, store, request, json, admin, adminToken };
}

test('public catalog is sourced and broadcast API accepts deterministic test-only schedule fixtures', async (t) => {
  const { json } = setup(t);
  const [, health] = await json('health');
  assert.deepEqual([health.ok, health.database], [true, 'connected']);
  const [r, all] = await json('stations');
  assert.equal(r.status, 200);
  assert.equal(all.stations.length, catalog.stations.length);
  assert.ok(all.references.length);
  assert.equal(all.expanded.length, catalog.expanded.length);
  const [, detail] = await json('stations/' + slug);
  assert.equal(detail.station.slug, slug);
  const [, tracks] = await json('stations/' + slug + '/tracks');
  assert.ok(tracks.tracks.length > 0);
  assert.ok(tracks.tracks[0].evidence.length);
  const [, plan] = await json('stations/' + slug + '/schedule');
  assert.deepEqual(plan.programs, programs[slug]);
  const [, current] = await json('stations/' + slug + '/now-playing');
  assert.equal(current.serverTime, now);
  assert.equal(current.mode, 'demo');
  assert.ok(current.current.url.startsWith('/audio/'));
  const [, live] = await json('stations/' + slug + '/now-playing?mode=live');
  assert.equal(live.current, null);
  assert.equal(live.liveStatus, 'unconfigured');
  const [, s] = await json('stations/' + slug + '/sources');
  assert.deepEqual(
    s.sources.map((i) => i.type),
    ['demo'],
  );
  const [, statuses] = await json('broadcasts/status');
  assert.ok(statuses.stations.every((station) => !station.liveAvailable));
  assert.ok(
    statuses.stations
      .filter(
        (station) =>
          catalog.stations.find((s) => s.slug === station.slug)?.confidence === 'OFFICIAL',
      )
      .every((station) => station.demoAvailable),
  );
  const [, time] = await json('system/time');
  assert.equal(time.now, now);
  const [, config] = await json('config/public');
  assert.deepEqual(config.languages, ['en', 'es']);
  assert.ok(config.adminAvailable);
});

test('pagination, search, conditional cache, unknown resource, invalid filters and methods', async (t) => {
  const { request, json } = setup(t);
  const [first, body] = await json('stations?limit=2&offset=1');
  assert.equal(body.stations.length, 2);
  assert.equal(body.total, catalog.stations.length);
  assert.equal(
    (
      await request('stations?limit=2&offset=1', {
        headers: { 'If-None-Match': first.headers.get('etag') },
      })
    ).status,
    304,
  );
  assert.equal((await json('stations?q=flash'))[1].stations[0].slug, slug);
  assert.ok((await json('stations/' + slug + '/tracks?q=charli'))[1].tracks.length);
  for (const path of [
    'stations?limit=999',
    'stations?offset=-1',
    'stations?confidence=maybe',
    'stations/flash-fm/now-playing?mode=external',
  ])
    assert.equal((await request(path)).status, 400);
  assert.equal((await request('stations/missing-station')).status, 404);
  assert.equal((await request('health', { method: 'POST' })).status, 405);
  assert.equal(await (await request('stations', { method: 'HEAD' })).text(), '');
});

test('absolute UTC schedules match for two listeners, roll exactly, wrap and support old timestamps', () => {
  const a = scheduleAt(slug, programs, now);
  assert.deepEqual(a, scheduleAt(slug, programs[slug], now));
  assert.ok(a.offset >= 0 && a.offset < a.current.duration);
  assert.equal(scheduleAt(slug, programs, a.endsAt - 1).current.id, a.current.id);
  const next = scheduleAt(slug, programs, a.endsAt);
  assert.equal(next.current.id, a.next.id);
  assert.equal(next.offset, 0);
  assert.equal(
    scheduleAt(slug, programs, a.startedAt - Math.round(a.cycleDuration * 1000)).current.id,
    a.current.id,
  );
  assert.ok(scheduleAt(slug, programs, -1).offset >= 0);
  assert.equal(scheduleAt(slug, [], now).current, null);
});

test('administration requires the server secret, ties secure sessions to their origin and expires credentials', async (t) => {
  let time = now;
  const { request, json, adminToken } = setup(t, { clock: () => time });
  assert.equal((await request('admin/dashboard')).status, 401);
  const call = (token) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ token }),
  });
  assert.equal((await request('admin/session', call('incorrect'))).status, 401);
  const [result, session] = await json('admin/session', call(adminToken));
  assert.equal(result.status, 200);
  assert.ok(session.authenticated);
  const rawCookie = result.headers.get('set-cookie');
  assert.match(rawCookie, /HttpOnly/);
  assert.match(rawCookie, /SameSite=Strict/);
  assert.match(rawCookie, /Secure/);
  const cookie = rawCookie.split(';')[0];
  assert.equal((await request('admin/dashboard', { headers: { Cookie: cookie } })).status, 200);
  const denied = await request('admin/session', {
    method: 'DELETE',
    headers: { Cookie: cookie, Origin: 'https://music.example.org' },
  });
  assert.equal(denied.status, 403);
  assert.equal(
    (
      await request('admin/session', {
        method: 'DELETE',
        headers: { Cookie: cookie, Origin: origin },
      })
    ).status,
    200,
  );
  assert.equal((await request('admin/session', { headers: { Cookie: cookie } })).status, 401);
  const again = await request('admin/session', call(adminToken));
  time += 5 * 60 * 60 * 1000;
  assert.equal(
    (
      await request('admin/session', {
        headers: { Cookie: again.headers.get('set-cookie').split(';')[0] },
      })
    ).status,
    401,
  );
});

test('SQL persists edits across restarts, rejects concurrent and stale revisions and records committed changes', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'leonida-sql-'));
  t.after(() => rm(dir, { force: true, recursive: true }));
  const file = join(dir, 'catalog.sqlite');
  const a = setup(t, { store: createNodeStore(file) }),
    b = setup(t, { store: createNodeStore(file) });
  const route = 'admin/stations/' + slug;
  const [, before] = await a.json(route, a.admin());
  const body = (name) => ({ revision: before.revision, station: { name } });
  const edits = await Promise.all([
    a.request(route, a.admin('PUT', body('Flash North'))),
    b.request(route, b.admin('PUT', body('Flash South'))),
  ]);
  assert.equal(edits.filter((r) => r.status === 200).length, 1);
  assert.ok(edits.some((r) => r.status === 409 || r.status === 412));
  const [, after] = await b.json(route, b.admin());
  assert.equal(after.revision, 2);
  assert.equal((await a.request(route, a.admin('PUT', body('Stale')))).status, 412);
  const c = setup(t, { store: createNodeStore(file) });
  assert.equal((await c.json(route, c.admin()))[1].station.name, after.station.name);
  const events = (await c.json('admin/events', c.admin()))[1].events;
  assert.equal(events.filter((e) => e.type === 'station.updated').length, 1);
});

test('station creation and programming are atomic, audio rights and evidence are validated, disabling removes it from public dial', async (t) => {
  const { request, json, admin } = setup(t);
  const entry = {
    station: { slug: 'demo-station', name: 'Demo Station', genre: 'Pop', confidence: 'COMMUNITY' },
    programs: [programs[slug][0]],
  };
  assert.equal((await request('admin/stations', admin('POST', entry))).status, 201);
  assert.equal((await request('admin/stations', admin('POST', entry))).status, 409);
  const route = 'admin/stations/demo-station';
  const invalid = [
    { station: { confidence: 'OFFICIAL' } },
    {
      sources: [{ id: 'feed', type: 'icecast', url: '/stream/demo-station', rightsReference: '' }],
    },
    {
      sources: [
        {
          id: 'feed',
          type: 'icecast',
          url: 'https://example.org/music',
          rightsReference: 'Artist grant',
        },
      ],
    },
    { programs: [{ ...programs[slug][0], url: '/audio/unknown-cut.mp3' }] },
  ];
  for (const edit of invalid) assert.equal((await request(route, admin('PUT', edit))).status, 400);
  const [, current] = await json(route, admin());
  assert.equal(current.revision, 1);
  assert.equal(current.programs.length, 1);
  const live = {
    id: 'feed',
    type: 'icecast',
    url: '/stream/demo-station',
    rightsReference: 'LEONIDA original programming',
    enabled: true,
  };
  assert.equal((await request(route, admin('PUT', { sources: [live] }))).status, 200);
  const [, sources] = await json('stations/demo-station/sources');
  assert.ok(sources.sources.some((s) => s.id === 'feed' && s.health === 'unknown'));
  await request(route, admin('PUT', { station: { enabled: false } }));
  assert.equal((await request('stations/demo-station')).status, 404);
  assert.equal((await json('stations'))[1].stations.length, catalog.stations.length);
});

test('persists an optional declared bitrate per live source and publishes it after validation', async (t) => {
  const { request, json, admin } = setup(t);
  const route = 'admin/stations/' + slug;
  const live = {
    id: 'primary',
    type: 'icecast',
    url: '/stream/' + slug,
    rightsReference: 'Original community sessions',
  };
  for (const bad of [0, -1, 64.5, '96', null, Number.MAX_SAFE_INTEGER + 1]) {
    const response = await request(
      route,
      admin('PUT', { sources: [{ ...live, bitrateKbps: bad }] }),
    );
    assert.equal(response.status, 400);
  }
  for (const info of [{ bitrateKbps: 96 }, {}]) {
    assert.equal(
      (await request(route, admin('PUT', { sources: [{ ...live, ...info }] }))).status,
      200,
    );
    const entry = (await json('stations/' + slug + '/sources'))[1].sources.find(
      (s) => s.id === 'primary',
    );
    assert.equal(entry.bitrateKbps, info.bitrateKbps);
    assert.equal(Object.hasOwn(entry, 'bitrateKbps'), Object.hasOwn(info, 'bitrateKbps'));
  }
});

test('only the configured monitor is contacted; outages, recovery and measured mount values propagate', async (t) => {
  const url = 'http://trusted-monitor/stream/status.json';
  let up = true;
  const calls = [];
  const fetcher = async (target) => {
    calls.push(target);
    return up
      ? Response.json({
          stations: [
            {
              slug,
              status: 'active',
              current: 'On air',
              artist: 'Studio',
              listeners: 2,
              bytesServed: 3400,
            },
          ],
        })
      : new Response('', { status: 503 });
  };
  const { request, json, admin } = setup(t, {
    streamBase: '/stream',
    streamRightsReference: 'LEONIDA FM originals',
    broadcastStatusUrl: url,
    fetcher,
  });
  const [, before] = await json('broadcasts/status');
  const flash = before.stations.find((s) => s.slug === slug);
  assert.equal(flash.liveStatus, 'online');
  assert.equal(flash.listeners, 2);
  assert.equal(flash.bytesSent, 3400);
  assert.equal(flash.current.title, 'On air');
  assert.equal(before.stations.find((s) => s.slug !== slug).liveStatus, 'offline');
  up = false;
  const [, down] = await json('admin/stations/' + slug + '/probe', admin('POST'));
  assert.equal(down.status.liveStatus, 'stale');
  assert.equal(down.status.liveAvailable, false);
  up = true;
  await request('admin/stations/' + slug + '/probe', admin('POST'));
  const [, dash] = await json('admin/dashboard', admin());
  assert.equal(dash.metrics.listeners, 2);
  assert.ok(dash.events.some((e) => e.type === 'monitor.recovered'));
  assert.ok(dash.events.some((e) => e.type === 'monitor.unavailable'));
  assert.ok(calls.every((target) => target === url));
});

test('Icecast exposes one source or a source array; unknown and malformed data remain unavailable', async () => {
  const source = {
    listenurl: 'https://media.example.org/stream/flash-fm.mp3',
    title: 'Original cue',
    listeners: 0,
  };
  for (const data of [{ icestats: { source } }, { icestats: { source: [source] } }]) {
    const m = createMonitor({
      url: 'http://a',
      fetcher: async () => Response.json(data),
      clock: () => now,
    });
    const result = await m.read();
    assert.equal(result.mounts.get(slug).title, 'Original cue');
    assert.equal(result.mounts.get(slug).listeners, 0);
  }
  const m = createMonitor({
    url: 'http://a',
    fetcher: async () => Response.json({}),
    clock: () => now,
  });
  assert.equal((await m.read()).state, 'unreachable');
});

test('SSE delivers initial station metadata, follows committed revisions and releases canceled subscriptions', async (t) => {
  const { request, json, admin } = setup(t, { eventTickMs: 10 });
  const r = await request('events?station=' + slug);
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const reader = r.body.getReader(),
    decoder = new TextDecoder();
  let text = '';
  // A short-lived referenced timer also makes unexpected missing updates fail deterministically.
  const timeout = (promise) => {
    let timer;
    return Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('SSE timed out')), 1000);
      }),
    ]).finally(() => clearTimeout(timer));
  };
  const until = async (fragment) => {
    while (!text.includes(fragment)) {
      const data = await timeout(reader.read());
      assert.equal(data.done, false);
      text += decoder.decode(data.value);
    }
  };
  try {
    await until('event: snapshot');
    assert.match(text, /flash-fm/);
    assert.equal((await json('admin/dashboard', admin()))[1].metrics.eventClientsThisInstance, 1);
    await request(
      'admin/stations/' + slug,
      admin('PUT', { station: { description: 'Revised program' } }),
    );
    await until('event: update');
    assert.match(text, /"revision":2/);
  } finally {
    await reader.cancel();
  }
  assert.equal((await json('admin/dashboard', admin()))[1].metrics.eventClientsThisInstance, 0);
});

test('login, API and event limits bound requests; read-only mode still serves audio schedules', async (t) => {
  const { request } = setup(t);
  const failed = () =>
    request(
      'admin/session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid' }),
      },
      { clientKey: 'login-test' },
    );
  for (let i = 0; i < 10; i++) assert.equal((await failed()).status, 401);
  assert.equal((await failed()).status, 429);
  for (let i = 0; i < 360; i++)
    assert.equal((await request('system/time', {}, { clientKey: 'limit-test' })).status, 200);
  assert.equal((await request('system/time', {}, { clientKey: 'limit-test' })).status, 429);
  const streams = await Promise.all(
    Array.from({ length: 6 }, () => request('events', {}, { clientKey: 'sse-test' })),
  );
  assert.equal((await request('events', {}, { clientKey: 'sse-test' })).status, 429);
  await Promise.all(streams.map((r) => r.body.cancel()));
  const api = createApi({ catalog, programs });
  assert.equal((await api(new Request(origin + '/api/admin/dashboard'))).status, 503);
  assert.equal((await api(new Request(origin + '/api/stations/flash-fm/schedule'))).status, 200);
});

test('D1 prepared-statement contract uses migrated SQLite, seeds once and persists admin writes', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  const sql = await readFile(
    new URL('../server/migrations/001_initial.sql', import.meta.url),
    'utf8',
  );
  assert.equal(sql, migration.join(';\n\n') + ';\n');
  db.exec(sql);
  const prep = (query, values = []) => ({
    bind: (...args) => prep(query, args),
    first: async () => db.prepare(query).get(...values),
    all: async () => ({ results: db.prepare(query).all(...values) }),
    run: async () => ({ meta: { changes: db.prepare(query).run(...values).changes } }),
  });
  const d1 = {
    prepare: prep,
    async batch(batch) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const stmt of batch) results.push(await stmt.run());
        db.exec('COMMIT');
        return results;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const { request, admin } = setup(t, { store: createD1Store(d1) });
  assert.equal((await request('health')).status, 200);
  assert.equal(
    (await request('admin/stations/' + slug, admin('PUT', { station: { shortName: 'Flash' } })))
      .status,
    200,
  );
  assert.equal(
    db.prepare('SELECT revision FROM station_catalog WHERE slug=?').get(slug).revision,
    2,
  );
});

test('real Node HTTP listener serves SPA deep links, HEAD, progress ranges and the seeded API', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'leonida-http-'));
  t.after(() => rm(dir, { force: true, recursive: true }));
  await mkdir(join(dir, 'audio'));
  await writeFile(join(dir, 'index.html'), '<title>Leonida</title>');
  await writeFile(join(dir, 'audio', 'sample.mp3'), Buffer.from('1234567890'));
  const h = createNodeHandler({ distDir: dir, databasePath: ':memory:' });
  const server = createServer(h);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    h.close();
  });
  const root = 'http://127.0.0.1:' + server.address().port;
  assert.equal(
    (await (await fetch(root + '/api/stations')).json()).stations.length,
    catalog.stations.length,
  );
  assert.equal(await (await fetch(root + '/radio/flash-fm')).text(), '<title>Leonida</title>');
  const part = await fetch(root + '/audio/sample.mp3', { headers: { Range: 'bytes=2-5' } });
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await part.text(), '3456');
  const invalid = await fetch(root + '/audio/sample.mp3', { headers: { Range: 'bytes=20-' } });
  assert.equal(invalid.status, 416);
  const head = await fetch(root + '/audio/sample.mp3', { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), '10');
  assert.equal(await head.text(), '');
  assert.equal((await fetch(root + '/stream/flash-fm')).status, 404);
  assert.equal((await fetch(root + '/missing.mp3')).status, 404);
});
