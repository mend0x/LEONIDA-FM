import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { chooseLive, RadioEngine, retryDelay } from '../web/audio.ts';
import {
  adjacent,
  defaults,
  markFavorite,
  normalizePreferences,
  readPreferences,
  savePreferences,
  STORAGE_KEY,
} from '../web/preferences.ts';
import { scheduleAt } from '../server/schedule.mjs';
import { syntheticPrograms } from './fixtures/synthetic-programs.mjs';

const shippingPrograms = JSON.parse(readFileSync(new URL('../data/programs.json', import.meta.url)));
const programs = Object.keys(shippingPrograms).length ? shippingPrograms : syntheticPrograms;
const slugs = Object.keys(programs);
const time = Date.UTC(2026, 10, 18, 18, 45, 12);
const source = (id, type, enabled = true, url = '/stream/' + id) => ({ id, type, enabled, url });

function replaceGlobal(property, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, property);
  Object.defineProperty(globalThis, property, { configurable: true, writable: true, value });
  return () => {
    if (original) Object.defineProperty(globalThis, property, original);
    else delete globalThis[property];
  };
}

function player(t, { playResult = () => Promise.resolve() } = {}) {
  const attached = new Set();
  class TestMedia {
    dataset = {};
    duration = Infinity;
    currentTime = 0;
    readyState = 1;
    paused = true;
    volume = 1;
    muted = false;
    error = null;
    buffered = { length: 0 };
    canPlayType() {
      return '';
    }
    setAttribute(name, value) {
      this[name] = value;
    }
    removeAttribute(name) {
      delete this[name];
    }
    play() {
      this.paused = false;
      return playResult();
    }
    pause() {
      this.paused = true;
    }
    load() {
      this.reloaded = true;
    }
    remove() {
      attached.delete(this);
    }
  }
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: time });
  t.mock.method(Math, 'random', () => 0.5);
  const restoreWindow = replaceGlobal('window', {
    setTimeout: (...args) => globalThis.setTimeout(...args),
  });
  const restoreDocument = replaceGlobal('document', {
    createElement(name) {
      assert.equal(name, 'audio');
      return new TestMedia();
    },
    body: {
      append(element) {
        attached.add(element);
      },
    },
  });
  const engine = new RadioEngine();
  engine.setData(programs);
  t.after(() => {
    engine.destroy();
    restoreDocument();
    restoreWindow();
  });
  return { engine, attached };
}

describe('live provider selection and retry timing', () => {
  it('excludes demo cuts, third-party links, disabled streams and missing URLs', () => {
    const mp3 = source('primary', 'icecast');
    const rows = [
      source('catalog', 'external'),
      source('demo', 'demo'),
      source('embed', 'youtube'),
      source('disabled', 'icecast', false),
      source('empty', 'icecast', true, null),
      mp3,
    ];
    const browser = { canPlayType: () => '' };
    assert.equal(chooseLive(rows, browser), mp3);
    assert.equal(chooseLive(rows.slice(0, -1), browser), undefined);
  });

  it('probes HLS support with the playlist MIME type and falls through to Icecast', () => {
    const hls = source('adaptive', 'hls', true, '/radio/live.m3u8');
    const mp3 = source('fallback', 'icecast');
    for (const verdict of ['', 'maybe', 'probably']) {
      const mimeTypes = [];
      const browser = {
        canPlayType(mime) {
          mimeTypes.push(mime);
          return verdict;
        },
      };
      assert.equal(chooseLive([hls, mp3], browser), verdict ? hls : mp3);
      assert.deepEqual(mimeTypes, ['application/vnd.apple.mpegurl']);
    }
    assert.equal(chooseLive([hls], { canPlayType: () => '' }), undefined);
  });

  it('opens an online live URL before a higher-priority offline one and keeps priority among equals', (t) => {
    const { engine } = player(t);
    const offline = { ...source('priority-one', 'icecast'), health: 'offline' };
    const unknown = { ...source('unmonitored', 'icecast'), health: 'unknown' };
    const online = { ...source('online-primary', 'icecast'), health: 'online' };
    const other = { ...source('online-secondary', 'icecast'), health: 'online' };
    const station = { slug: 'flash-fm' };
    engine.tune(station, 'live', true, [offline, unknown, online, other]);
    assert.equal(engine.media.src, online.url);
    engine.tune(station, 'live', true, [offline, unknown]);
    assert.equal(engine.media.src, unknown.url);
    engine.tune(station, 'live', true, [offline]);
    assert.equal(engine.media.src, offline.url);
  });

  it('chooses the declared bitrate within a health class and keeps the built-in recording when quality changes', (t) => {
    const { engine, attached } = player(t);
    const primary = { ...source('primary', 'icecast'), health: 'online' };
    const low = { ...source('low', 'icecast'), health: 'online', bitrateKbps: 64 };
    const high = { ...source('high', 'icecast'), health: 'online', bitrateKbps: 192 };
    const highTie = { ...source('high-tie', 'icecast'), health: 'online', bitrateKbps: 192 };
    const unavailable = {
      ...source('offline-lossless', 'icecast'),
      health: 'offline',
      bitrateKbps: 1500,
    };
    const station = { slug: 'flash-fm' };
    engine.tune(station, 'live', true, [unavailable, primary, high, low, highTie]);
    assert.equal(engine.media.src, primary.url);
    engine.setQuality('lowest');
    assert.equal(engine.media.src, low.url);
    engine.setQuality('highest');
    assert.equal(engine.media.src, high.url);
    const selected = engine.media;
    engine.setQuality('highest');
    assert.equal(engine.media, selected);
    engine.setSources([unavailable, primary, { ...high, enabled: false }]);
    assert.equal(engine.media.src, primary.url);
    assert.equal(attached.size, 1);
    engine.tune(station, 'demo', true);
    const original = engine.media;
    engine.setQuality('lowest');
    assert.equal(engine.media, original);
    assert.equal(engine.media.src, scheduleAt(station.slug, programs, time).current.url);
  });

  it('doubles each retry until its base cap and distributes retries across a jitter window', () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6, 40].map((n) => retryDelay(n, 0.5)),
      [600, 600, 1200, 2400, 4800, 9600, 12000, 12000],
    );
    assert.equal(retryDelay(1, 0), 510);
    assert.equal(retryDelay(1, 1), 690);
    assert.ok(retryDelay(3, 0.3) < retryDelay(3, 0.7));
  });
});

describe('local listening preferences', () => {
  it('handles absent, legacy and malformed values, trims list sizes and clamps finite volume', () => {
    for (const value of [null, undefined, 'v0', 55]) {
      assert.deepEqual(normalizePreferences(value), defaults);
    }
    const result = normalizePreferences({
      slug: '../station',
      volume: Infinity,
      muted: 'false',
      language: 'xx',
      favorites: ['flash-fm', '', 'x/y', 'flash-fm', 'afro-bank', 7],
      recent: Array.from({ length: 14 }, (_, n) => 'station-' + n),
      visualizer: {},
      gamepadCancel: -1,
      gamepadConfirm: 16,
    });
    assert.deepEqual(result.favorites, ['flash-fm', 'afro-bank']);
    assert.equal(result.recent.length, 8);
    assert.equal(result.slug, defaults.slug);
    assert.equal(result.volume, defaults.volume);
    assert.equal(result.muted, false);
    assert.equal(normalizePreferences({ quality: 'invented' }).quality, 'auto');
    assert.equal(result.gamepadConfirm, defaults.gamepadConfirm);
    assert.equal(result.gamepadCancel, defaults.gamepadCancel);
    assert.equal(normalizePreferences({ volume: -5 }).volume, 0);
    assert.equal(normalizePreferences({ volume: 9 }).volume, 1);
    assert.equal(
      normalizePreferences({ favorites: Array.from({ length: 104 }, (_, i) => 's-' + i) }).favorites
        .length,
      100,
    );
  });

  it('restores station, gain, language, selector, gamepad mapping and UI settings after saving', (t) => {
    const storage = new Map();
    t.after(
      replaceGlobal('localStorage', {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
      }),
    );
    const selected = {
      ...defaults,
      mode: 'live',
      slug: 'afro-bank',
      volume: 0.37,
      quality: 'highest',
      muted: true,
      language: 'es',
      visualizer: 'ambient',
      motion: 'reduce',
      selector: 'wheel',
      sounds: true,
      compact: true,
      confirmOnRelease: true,
      showExpanded: true,
      notices: true,
      gamepadConfirm: 5,
      gamepadCancel: 6,
      favorites: ['cocoteo-fm'],
      recent: ['afro-bank', 'dirty-south'],
    };
    assert.deepEqual(readPreferences(), defaults);
    savePreferences(selected);
    assert.equal(storage.size, 1);
    assert.equal(JSON.parse(storage.get(STORAGE_KEY)).slug, selected.slug);
    assert.deepEqual(readPreferences(), selected);
    storage.set(STORAGE_KEY, '{broken');
    assert.deepEqual(readPreferences(), defaults);
  });

  it('can keep listening when device storage is blocked', (t) => {
    const blocked = () => {
      throw new Error('storage unavailable');
    };
    t.after(replaceGlobal('localStorage', { getItem: blocked, setItem: blocked }));
    assert.deepEqual(readPreferences(), defaults);
    assert.doesNotThrow(() => savePreferences(defaults));
  });

  it('toggles favorites without mutating input and wraps station navigation both ways', () => {
    const original = ['flash-fm', 'the-chamber'];
    assert.deepEqual(markFavorite(original, 'flash-fm'), ['the-chamber']);
    assert.deepEqual(markFavorite(original, 'afro-bank'), [...original, 'afro-bank']);
    assert.deepEqual(original, ['flash-fm', 'the-chamber']);
    assert.equal(adjacent(slugs, 0, -1), slugs.at(-1));
    assert.equal(adjacent(slugs, slugs.length - 1, 1), slugs[0]);
    assert.equal(adjacent(slugs, 0, slugs.length * 3 + 1), slugs[1]);
    assert.equal(adjacent([], 0, 1), undefined);
  });
});

describe('RadioEngine media lifecycle', () => {
  it('joins the absolute schedule, corrects clock drift and rolls into the next track at its boundary', (t) => {
    const { engine, attached } = player(t);
    const slug = 'flash-fm';
    const now = scheduleAt(slug, programs, time);
    engine.tune({ slug }, 'demo', false);
    assert.equal(engine.media, null);
    engine.play();
    const first = engine.media;
    assert.equal(first.src, now.current.url);
    first.onloadedmetadata();
    first.onplaying();
    assert.equal(first.currentTime, now.offset);
    assert.equal(engine.getSnapshot().state, 'playing');
    first.currentTime = now.offset + 2.5;
    engine.resync();
    assert.equal(first.currentTime, now.offset);
    t.mock.timers.tick(now.endsAt - time + 21);
    assert.notEqual(engine.media, first);
    assert.equal(engine.media.src, now.next.url);
    assert.equal(first.paused, true);
    assert.equal(attached.size, 1);
    engine.pause();
    assert.equal(engine.getSnapshot().state, 'paused');
    assert.equal(attached.size, 0);
  });

  it('applies gain and mute across five rapid retunes and ignores callbacks from removed media', (t) => {
    const { engine, attached } = player(t);
    const seen = [];
    const unsubscribe = engine.subscribe(() => seen.push(engine.getSnapshot().state));
    engine.setVolume(0.24, true);
    const staleCallbacks = [];
    let previous;
    for (const slug of slugs.slice(0, 5)) {
      engine.tune({ slug }, 'demo', true);
      if (previous) {
        assert.equal(previous.paused, true);
        assert.equal(previous.src, undefined);
        assert.equal(previous.onerror, null);
        assert.equal(previous.reloaded, true);
      }
      assert.equal(attached.size, 1);
      assert.equal(engine.media.volume, 0.24);
      assert.equal(engine.media.muted, true);
      assert.equal(engine.media.src, scheduleAt(slug, programs, time).current.url);
      staleCallbacks.push(engine.media.onerror, engine.media.onplaying);
      previous = engine.media;
    }
    for (const callback of staleCallbacks.slice(0, -2)) callback();
    assert.equal(engine.getSnapshot().state, 'preparing');
    previous.onplaying();
    engine.setVolume(0.59, false);
    assert.equal(previous.volume, 0.59);
    assert.equal(previous.muted, false);
    unsubscribe();
    const last = seen.at(-1);
    engine.pause();
    assert.equal(seen.at(-1), last);
    assert.equal(last, 'playing');
    assert.equal(attached.size, 0);
  });

  it('requires explicit demo selection when a live station has no playable source', (t) => {
    const { engine, attached } = player(t);
    const slug = 'cocoteo-fm';
    engine.tune({ slug }, 'live', true, [source('off', 'icecast', false)]);
    assert.equal(engine.getSnapshot().state, 'unavailable');
    assert.equal(engine.getSnapshot().kind, 'live');
    assert.equal(engine.intent, false);
    assert.equal(attached.size, 0);
    engine.tune({ slug }, 'demo', true);
    assert.equal(engine.media.src, scheduleAt(slug, programs, time).current.url);
  });

  it('enables play when live sources arrive and immediately releases a revoked feed', (t) => {
    const { engine, attached } = player(t);
    const station = { slug: 'afro-bank' };
    const first = source('first', 'icecast');
    const backup = source('backup', 'icecast');
    engine.tune(station, 'live', false, []);
    assert.equal(engine.getSnapshot().state, 'unavailable');
    engine.setSources([first], 'the-chamber');
    assert.equal(engine.getSnapshot().state, 'unavailable');
    engine.setSources([first, backup], station.slug);
    assert.equal(engine.getSnapshot().state, 'idle');
    assert.equal(engine.intent, false);
    assert.equal(attached.size, 0);
    engine.play();
    const firstMedia = engine.media;
    firstMedia.onplaying();
    engine.setSources([{ ...first, enabled: false }, backup], station.slug);
    assert.equal(firstMedia.paused, true);
    assert.equal(engine.media.src, backup.url);
    assert.equal(attached.size, 1);
    engine.setSources([source('catalog', 'external')], station.slug);
    assert.equal(engine.getSnapshot().state, 'unavailable');
    assert.equal(engine.media, null);
    assert.equal(attached.size, 0);
    engine.setSources([backup], station.slug);
    assert.equal(engine.getSnapshot().state, 'idle');
    assert.equal(engine.intent, false);
  });

  it('limits automatic network retries, keeps the live source type and supports manual recovery', (t) => {
    const { engine, attached } = player(t);
    const live = source('the-chamber', 'icecast');
    engine.tune({ slug: 'the-chamber' }, 'live', true, [live]);
    for (const [index, delay] of [600, 1200, 2400].entries()) {
      const failed = engine.media;
      failed.error = { code: 2 };
      failed.onerror();
      assert.deepEqual(engine.getSnapshot(), {
        state: 'reconnecting',
        attempts: index + 1,
        issue: 'network',
        kind: 'live',
      });
      t.mock.timers.tick(delay - 1);
      assert.equal(engine.media, null);
      t.mock.timers.tick(1);
      assert.equal(engine.media.src, live.url);
      assert.notEqual(engine.media, failed);
    }
    engine.media.onerror();
    assert.equal(engine.getSnapshot().state, 'error');
    assert.equal(engine.intent, false);
    t.mock.timers.tick(30_000);
    assert.equal(attached.size, 0);
    engine.play();
    engine.media.onplaying();
    assert.deepEqual(engine.getSnapshot(), {
      state: 'playing',
      attempts: 0,
      issue: '',
      kind: 'live',
    });
  });

  it('falls through a rejected live URL, excludes duplicate URLs and retries only the compatible backup', async (t) => {
    const first = source('first', 'icecast');
    const duplicate = { ...first, id: 'same-url' };
    const backup = source('backup', 'icecast');
    const rows = [
      first,
      source('demo', 'demo'),
      duplicate,
      source('disabled', 'icecast', false),
      backup,
    ];
    let rejectNext = false;
    const { engine, attached } = player(t, {
      playResult() {
        if (!rejectNext) return Promise.resolve();
        rejectNext = false;
        return Promise.reject(new DOMException('unsupported codec', 'NotSupportedError'));
      },
    });
    engine.tune({ slug: 'flash-fm' }, 'live', true, rows);
    const obsolete = engine.media;
    const lateError = obsolete.onerror;
    obsolete.error = { code: 4 };
    obsolete.onerror();
    assert.equal(obsolete.paused, true);
    assert.equal(obsolete.src, undefined);
    assert.equal(engine.media.src, backup.url);
    assert.equal(attached.size, 1);
    lateError();
    engine.media.onplaying();
    assert.deepEqual(engine.getSnapshot(), {
      state: 'playing',
      attempts: 0,
      issue: '',
      kind: 'live',
    });

    engine.media.error = { code: 2 };
    engine.media.onerror();
    assert.equal(engine.getSnapshot().state, 'reconnecting');
    t.mock.timers.tick(600);
    assert.equal(engine.media.src, backup.url);
    engine.media.error = { code: 4 };
    engine.media.onerror();
    assert.equal(engine.getSnapshot().state, 'error');
    assert.equal(engine.getSnapshot().kind, 'live');
    assert.equal(attached.size, 0);

    rejectNext = true;
    engine.play();
    assert.equal(engine.media.src, first.url);
    await Promise.resolve();
    assert.equal(engine.media.src, backup.url);
    assert.equal(attached.size, 1);
  });

  it('stops on unsupported native media and starts no new attempt after explicit pause', (t) => {
    const { engine, attached } = player(t);
    const live = source('afro-bank', 'icecast');
    engine.tune({ slug: 'afro-bank' }, 'live', true, [live]);
    engine.media.error = { code: 4 };
    engine.media.onerror();
    assert.deepEqual(engine.getSnapshot(), {
      state: 'error',
      attempts: 0,
      issue: 'unsupported',
      kind: 'live',
    });
    assert.equal(engine.intent, false);
    engine.play();
    engine.media.onwaiting();
    assert.equal(engine.getSnapshot().state, 'buffering');
    t.mock.timers.tick(12_000);
    assert.equal(engine.getSnapshot().issue, 'timeout');
    engine.pause();
    t.mock.timers.tick(30_000);
    assert.equal(attached.size, 0);
    assert.equal(engine.getSnapshot().state, 'paused');
  });

  it('recovers from a blocked autoplay request after a user gesture', async (t) => {
    let allowed = false;
    const { engine, attached } = player(t, {
      playResult: () =>
        allowed
          ? Promise.resolve()
          : Promise.reject(new DOMException('gesture required', 'NotAllowedError')),
    });
    engine.tune({ slug: 'back-country' }, 'demo', true);
    await Promise.resolve();
    assert.equal(engine.getSnapshot().state, 'paused');
    assert.equal(engine.getSnapshot().issue, 'gesture');
    assert.equal(attached.size, 0);
    allowed = true;
    engine.play();
    engine.media.onplaying();
    assert.equal(engine.getSnapshot().state, 'playing');
  });
});
