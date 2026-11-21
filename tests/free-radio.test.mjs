import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createFreeRadio,
  normalizeStations,
  safeStreamUrl,
  RADIO_TAGS,
} from '../server/free-radio.mjs';

const entry = (overrides = {}) => ({
  stationuuid: 'abc-1',
  name: 'Test radio',
  codec: 'MP3',
  bitrate: 128,
  lastcheckok: 1,
  hls: 0,
  url_resolved: 'https://example.org:8443/live.mp3',
  votes: 120,
  ...overrides,
});
test('community radio source sanitization prevents unsafe URLs and rejects broken or incompatible streams', () => {
  for (const unsafe of [
    'http://example.org/live',
    'javascript:alert(1)',
    'https://127.0.0.1/a',
    'https://192.168.0.1/live',
    'https://localhost/hi',
    'https://guest:pass@example.org/audio',
    'https://[::1]/live',
  ])
    assert.equal(safeStreamUrl(unsafe), null, unsafe);
  assert.equal(safeStreamUrl('https://example.org/live'), 'https://example.org/live');
  assert.equal(
    normalizeStations([
      entry(),
      entry(),
      entry({ hls: 1 }),
      entry({ lastcheckok: 0 }),
      entry({ codec: 'WMA' }),
      entry({ url_resolved: 'http://example.org/live' }),
    ]).length,
    1,
  );
});

test('all six GTA VI station slots have non-YouTube genre queries', () => {
  assert.ok(Object.keys(RADIO_TAGS).length >= 6);
  for (const tags of Object.values(RADIO_TAGS)) assert.ok(tags.length > 0);
});

test('the free directory fetch uses genre, caches results, and serves labeled third-party streams', async () => {
  let calls = 0;
  let clock = 100;
  const service = createFreeRadio({
    mirrors: ['https://test.api.radio-browser.info'],
    now: () => clock,
    fetcher: async (url) => {
      calls++;
      assert.match(url, /bytag\/pop\?/);
      return { ok: true, json: async () => [entry()] };
    },
  });
  const result = await service.lookup('flash-fm');
  assert.equal(result.provider, 'radio-browser');
  assert.equal(result.stations[0].name, 'Test radio');
  assert.match(result.label, /not GTA VI/);
  clock += 10_000;
  await service.lookup('flash-fm');
  assert.equal(calls, 1);
  const response = {
    statusCode: 0,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(text) {
      this.body = JSON.parse(text);
    },
  };
  await service.handler({ method: 'GET' }, response, 'flash-fm');
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.stations.length, 1);
  assert.equal(await service.lookup('fake-gta-station'), null);
});
