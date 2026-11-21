import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OfficialRadio } from '../web/official-radio.ts';

const station = {
  slug: 'flash-fm',
  tracks: [
    { title: 'Electric Feel', artist: 'MGMT', confidence: 'OFFICIAL' },
    { title: 'Good Ones', artist: 'Charli xcx', confidence: 'OFFICIAL' },
  ],
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('GTA VI project mode loads disk songs and auto-advances; radio stays separate', async (t) => {
  const prior = { document: globalThis.document, fetch: globalThis.fetch };
  t.after(() => {
    globalThis.document = prior.document;
    globalThis.fetch = prior.fetch;
  });
  const elements = [];
  globalThis.document = {
    createElement(kind) {
      assert.equal(kind, 'audio');
      const el = {
        setAttribute() {},
        removeAttribute() {},
        load() {},
        remove() {},
        pause() {
          this.onpause?.();
        },
        play() {
          this.onplaying?.();
          return Promise.resolve();
        },
      };
      elements.push(el);
      return el;
    },
  };
  let fetched = 0;
  globalThis.fetch = async (url) => {
    assert.match(url, /^\/api\/song-library\/flash-fm$/);
    fetched++;
    return new Response(
      JSON.stringify({
        station: 'flash-fm',
        totalCatalog: 2,
        matched: 2,
        available: 2,
        songs: [
          {
            title: 'Electric Feel',
            artist: 'MGMT',
            url: '/canciones/flash-fm/MGMT%20-%20Electric%20Feel.mp3',
            confidence: 'OFFICIAL',
          },
          {
            title: 'Good Ones',
            artist: 'Charli xcx',
            url: '/canciones/flash-fm/Charli%20xcx%20-%20Good%20Ones.mp3',
            confidence: 'OFFICIAL',
          },
        ],
        missing: [],
      }),
      { status: 200 },
    );
  };
  const dock = { appendChild() {}, replaceChildren() {} };
  const radio = new OfficialRadio();
  radio.attach(dock);
  radio.setListeningMode('soundtrack', false);
  radio.tune(station, true);
  await tick();
  await tick();
  assert.equal(radio.getSnapshot().provider, 'project');
  assert.equal(radio.getSnapshot().state, 'playing');
  assert.equal(radio.getSnapshot().libraryAvailable, 2);
  assert.equal(radio.getSnapshot().track.title, 'Electric Feel');
  assert.equal(elements.at(-1).src, '/canciones/flash-fm/MGMT%20-%20Electric%20Feel.mp3');
  elements.at(-1).onended();
  await tick();
  assert.equal(radio.getSnapshot().track.title, 'Good Ones');
  assert.equal(elements.at(-1).src, '/canciones/flash-fm/Charli%20xcx%20-%20Good%20Ones.mp3');
  assert.equal(fetched, 1, 'track changes should not re-fetch directory');
  radio.pause();
  assert.equal(radio.getSnapshot().state, 'paused');
  radio.destroy();
});

test('an empty project folder shows unavailable instead of playing unrelated live radio', async (t) => {
  const originalDocument = globalThis.document,
    originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.document = originalDocument;
    globalThis.fetch = originalFetch;
  });
  globalThis.document = {
    createElement() {
      return { setAttribute() {} };
    },
  };
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ songs: [], matched: 0, totalCatalog: 2, available: 0, missing: [] }),
      { status: 200 },
    );
  const radio = new OfficialRadio();
  radio.attach({ appendChild() {}, replaceChildren() {} });
  radio.setListeningMode('soundtrack', false);
  radio.tune(station, true);
  await tick();
  assert.equal(radio.getSnapshot().provider, 'project');
  assert.equal(radio.getSnapshot().state, 'unavailable');
  assert.match(radio.getSnapshot().issue, /canciones\/flash-fm/);
  radio.destroy();
});
