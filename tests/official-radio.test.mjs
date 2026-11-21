import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { OfficialRadio, videoCandidates } from '../web/official-radio.ts';

const original = {
  document: globalThis.document,
  location: globalThis.location,
  window: globalThis.window,
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
};
after(() => {
  globalThis.window = original.window;
  globalThis.document = original.document;
  globalThis.location = original.location;
  URL.createObjectURL = original.createObjectURL;
  URL.revokeObjectURL = original.revokeObjectURL;
});
const players = [];
class FakeYTPlayer {
  constructor(target, options) {
    this.options = options;
    this.target = target;
    this.destroyed = false;
    players.push(this);
  }
  playVideo() {}
  pauseVideo() {}
  destroy() {
    this.destroyed = true;
  }
  setVolume() {}
  mute() {}
  unMute() {}
}
const createContainer = () => ({
  children: [],
  appendChild(child) {
    this.children.push(child);
  },
  replaceChildren() {
    this.children = [];
  },
});
function install() {
  players.length = 0;
  globalThis.window = { YT: { Player: FakeYTPlayer } };
  globalThis.location = { origin: 'http://localhost:3000' };
  globalThis.document = {
    createElement(kind) {
      if (kind !== 'audio') return { setAttribute() {} };
      return {
        paused: true,
        setAttribute() {},
        removeAttribute() {},
        load() {},
        remove() {},
        pause() {
          this.paused = true;
          this.onpause?.();
        },
        play() {
          this.paused = false;
          this.onplaying?.();
          return Promise.resolve();
        },
      };
    },
  };
  URL.createObjectURL = () => 'blob:private-file';
  URL.revokeObjectURL = () => {};
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const station = {
  slug: 'dirty-south',
  tracks: [
    {
      title: 'Like A Pimp',
      artist: 'David Banner',
      confidence: 'OFFICIAL',
      youtubeId: 'xgxRrFUgeDY',
      youtubeAlternates: ['iLiEBEaIVm8', 'MKGQ5cIw_ew'],
    },
    { title: 'Who Dat', artist: 'JT Money', confidence: 'OFFICIAL', youtubeId: 'Ey2rqJ-Og8w' },
    { title: 'Unverified', artist: 'Someone', confidence: 'UNVERIFIED', youtubeId: '12345678901' },
  ],
};

test('videoCandidates filters malformed IDs and deduplicates fallback uploads', () => {
  assert.deepEqual(
    videoCandidates({
      youtubeId: 'xgxRrFUgeDY',
      youtubeAlternates: ['xgxRrFUgeDY', 'bad', 'iLiEBEaIVm8'],
    }),
    ['xgxRrFUgeDY', 'iLiEBEaIVm8'],
  );
});

test('blocked YouTube uploads rotate through known variants and other confirmed tracks exactly once', async () => {
  install();
  const radio = new OfficialRadio();
  radio.attach(createContainer());
  radio.tune(station, false);
  radio.selectProvider('youtube');
  await tick();
  assert.equal(players.at(-1).options.videoId, 'xgxRrFUgeDY');
  for (const [code, expected] of [
    [150, 'iLiEBEaIVm8'],
    [101, 'MKGQ5cIw_ew'],
    [100, 'Ey2rqJ-Og8w'],
  ]) {
    players.at(-1).options.events.onError({ data: code });
    await tick();
    assert.equal(players.at(-1).options.videoId, expected);
  }
  players.at(-1).options.events.onError({ data: 150 });
  await tick();
  assert.equal(radio.getSnapshot().state, 'unavailable');
  assert.equal(radio.getSnapshot().attempts, 4);
  assert.equal(players.length, 4, 'must not loop back through broken videos');
  radio.destroy();
});

test('YouTube error 153 reports identity issue without skipping every track', async () => {
  install();
  const radio = new OfficialRadio();
  radio.attach(createContainer());
  radio.tune(station, false);
  radio.selectProvider('youtube');
  await tick();
  players.at(-1).options.events.onError({ data: 153 });
  await tick();
  assert.equal(radio.getSnapshot().state, 'error');
  assert.match(radio.getSnapshot().issue, /153/);
  assert.equal(players.length, 1);
  radio.destroy();
});

test('local audio is decoded in-browser and survives station selection until a reload', async () => {
  install();
  const dock = createContainer();
  const radio = new OfficialRadio();
  radio.attach(dock);
  radio.tune(station, false);
  assert.equal(
    radio.importFiles([
      { name: 'Real song.mp3', type: 'audio/mpeg' },
      { name: 'Real song 2.m4a', type: 'audio/mp4' },
      { name: 'not-a-song.txt', type: 'text/plain' },
    ]),
    2,
  );
  await tick();
  assert.equal(radio.getSnapshot().state, 'playing');
  assert.equal(radio.getSnapshot().provider, 'local');
  assert.equal(radio.getSnapshot().track.title, 'Real song');
  assert.equal(dock.children.length, 1);
  assert.equal(dock.children[0].src, 'blob:private-file');
  radio.nextTrack(1);
  await tick();
  assert.equal(radio.getSnapshot().track.title, 'Real song 2');
  radio.destroy();
});

test('optional yt-dlp mode uses the local audio endpoint and switches stations without an iframe', async () => {
  install();
  const dock = createContainer();
  const radio = new OfficialRadio();
  radio.attach(dock);
  radio.setLocalResolverAvailable(true);
  radio.tune(station, false);
  radio.selectProvider('yt-dlp');
  await tick();
  assert.equal(radio.getSnapshot().provider, 'yt-dlp');
  assert.equal(radio.getSnapshot().state, 'playing');
  assert.equal(dock.children[0].src, '/api/local-audio/stream/xgxRrFUgeDY');
  assert.equal(players.length, 0, 'yt-dlp should not create a YouTube iframe');
  radio.nextTrack(1);
  await tick();
  assert.equal(dock.children.length, 1, 'old audio player must be released');
  assert.equal(dock.children[0].src, '/api/local-audio/stream/Ey2rqJ-Og8w');
  radio.destroy();
});

test('free internet radio is default, streams HTTPS directly, changes sources, and creates no YouTube iframe', async () => {
  install();
  const originalFetch = globalThis.fetch;
  const urls = ['https://radio.example.org:8443/live.mp3', 'https://backup.example.org/audio'];
  globalThis.fetch = async (url) => {
    assert.match(String(url), /api\/free-radio\/stations\/dirty-south/);
    return {
      ok: true,
      json: async () => ({
        stations: urls.map((src, i) => ({
          id: String(i),
          name: `Indie radio ${i}`,
          url: src,
          codec: 'MP3',
          bitrate: 128,
          homepage: null,
          tags: 'hip hop',
        })),
      }),
    };
  };
  try {
    const dock = createContainer();
    const radio = new OfficialRadio();
    radio.attach(dock);
    radio.tune(station, true);
    await tick();
    await tick();
    assert.equal(radio.getSnapshot().provider, 'radio-browser');
    assert.equal(radio.getSnapshot().state, 'playing');
    assert.equal(dock.children.length, 1);
    assert.equal(dock.children[0].src, urls[0]);
    assert.equal(players.length, 0);
    radio.nextTrack(1);
    await tick();
    assert.equal(dock.children[0].src, urls[1]);
    assert.equal(dock.children.length, 1);
    radio.pause();
    assert.equal(radio.getSnapshot().state, 'paused');
    radio.destroy();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('blocked external station automatically switches to the next stream and stops on station change', async () => {
  install();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      stations: [
        { id: '1', name: 'Broken radio', url: 'https://broken.example.net/stream', homepage: null },
        {
          id: '2',
          name: 'Fallback radio',
          url: 'https://working.example.net/stream',
          homepage: null,
        },
      ],
    }),
  });
  try {
    const dock = createContainer();
    const radio = new OfficialRadio();
    radio.attach(dock);
    radio.tune(station, true);
    await tick();
    await tick();
    const old = dock.children[0];
    old.onerror();
    await tick();
    assert.equal(dock.children[0].src, 'https://working.example.net/stream');
    assert.equal(dock.children.length, 1);
    radio.tune({ ...station, slug: 'flash-fm' }, false);
    assert.equal(dock.children.length, 0);
    assert.equal(radio.getSnapshot().provider, 'radio-browser');
    radio.destroy();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
