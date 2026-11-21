import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { RADIO_TAGS } from '../server/free-radio.mjs';

const read = (name) => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const catalog = read('catalog.json');
const additions = read('station-track-additions.json');

test('catalog and streaming genres are data-driven and in sync', () => {
  const stations = catalog.stations.map((station) => station.slug);
  assert.deepEqual(stations.sort(), Object.keys(RADIO_TAGS).sort());
  assert.ok(stations.length >= 6);
  assert.ok(Object.values(RADIO_TAGS).every((tags) => tags.length && tags.every((tag) => typeof tag === 'string')));
});

test('every new song is documented without being labeled an official Rockstar preview', () => {
  let total = 0;
  for (const [slug, list] of Object.entries(additions.stations)) {
    const station = catalog.stations.find((s) => s.slug === slug);
    assert.ok(station, `Missing station ${slug}`);
    for (const song of list) {
      assert.equal(song.confidence, 'REPORTED');
      assert.equal(song.association, 'SECONDARY_STATION_LIST');
      assert.match(song.sourceUrl, /^https:\/\/www\.gtabase\.com\/gta-6\/radio-stations\//);
      assert.ok(station.tracks.some((track) => track.id === song.id), `Missing ${song.title}`);
      assert.ok(!song.youtubeId, 'Secondary track must not imply a playable YouTube ID');
      total++;
    }
    const ids = station.tracks.map((track) => track.id);
    assert.equal(new Set(ids).size, ids.length, `Duplicate track ID in ${slug}`);
  }
  assert.ok(total >= 71);
  assert.ok(catalog.stations.reduce((sum, station) => sum + station.tracks.length, 0) >= 92);
});

test('the expanded player is a separate component with a persistent audio attachment node', () => {
  const dock = readFileSync(new URL('../web/RadioDock.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../web/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /<RadioDock\b/);
  assert.match(dock, /aria-expanded=\{open\}/);
  assert.match(dock, /ref=\{radio\.attach\}/);
  assert.match(dock, /hidden=\{!open\}/);
  assert.ok(!/open\s*&&\s*<div[^>]+ref=\{radio\.attach\}/.test(dock), 'Audio must not be conditional on expanded state');
  assert.match(dock, /radio\.pause\(\)/);
  assert.match(dock, /radio\.play\(\)/);
});
