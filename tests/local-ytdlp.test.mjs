import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createLocalYtDlp } from '../server/local-ytdlp.mjs';

const catalog = { stations: [{ tracks: [{ confidence: 'OFFICIAL', youtubeId: 'xgxRrFUgeDY' }] }] };

async function serve(options, fn) {
  const service = createLocalYtDlp({ catalog, ...options });
  const server = createServer((req, res) => {
    void service.handler(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  try {
    await fn(origin);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('yt-dlp local adapter stays disabled without explicit opt in', async () => {
  await serve({ env: { ENABLE_LOCAL_YTDLP: '0' } }, async (origin) => {
    const status = await (await fetch(origin + '/api/local-audio/status')).json();
    assert.equal(status.available, false);
    assert.equal(status.enabled, false);
    const response = await fetch(origin + '/api/local-audio/stream/xgxRrFUgeDY');
    assert.equal(response.status, 503);
  });
});

test('local adapter resolves a verified catalog ID and pipes an authorized test stream', async () => {
  const calls = [];
  const execute = async (_bin, args) => {
    calls.push(args);
    if (args.includes('--version')) return '2026.11.19';
    assert.ok(args.includes('--js-runtimes'));
    return JSON.stringify({
      ext: 'm4a',
      is_live: false,
      url: 'https://rr2.googlevideo.com/videoplayback?test=true',
      http_headers: { 'User-Agent': 'testing-agent' },
    });
  };
  const fetcher = async (url, opts) => {
    assert.match(url, /googlevideo\.com/);
    assert.equal(opts.headers['User-Agent'], 'testing-agent');
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-length': '4' },
    });
  };
  await serve({ env: { ENABLE_LOCAL_YTDLP: '1' }, execute, fetcher }, async (origin) => {
    const status = await (await fetch(origin + '/api/local-audio/status')).json();
    assert.equal(status.available, true);
    assert.equal(status.enabled, true);
    const unknown = await fetch(origin + '/api/local-audio/stream/12345678901');
    assert.equal(unknown.status, 404);
    const result = await fetch(origin + '/api/local-audio/stream/xgxRrFUgeDY');
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('content-type'), 'audio/mp4');
    assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [1, 2, 3, 4]);
    assert.equal(calls.filter((x) => x.includes('--dump-single-json')).length, 1);
  });
});

test('local adapter refuses arbitrary URLs in extractor output', async () => {
  const execute = async (_bin, args) =>
    args.includes('--version')
      ? '2026.11.19'
      : JSON.stringify({ ext: 'm4a', url: 'https://private.example.org/internal' });
  await serve({ env: { ENABLE_LOCAL_YTDLP: '1' }, execute }, async (origin) => {
    const res = await fetch(origin + '/api/local-audio/stream/xgxRrFUgeDY');
    assert.equal(res.status, 502);
  });
});
