import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { RADIO_TAGS } from '../server/free-radio.mjs';
const read = (name) =>
  JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const catalog = read('catalog.json');
const source = read('station-directory.json');

test('all GTABase station slots are present, with no soundtrack albums masquerading as a radio station', () => {
  assert.ok(catalog.stations.length >= 21);
  assert.equal(new Set(catalog.stations.map((s) => s.slug)).size, catalog.stations.length);
  assert.equal(catalog.stations.filter((s) => s.confidence === 'OFFICIAL').length, 6);
  assert.equal(source.stations.length, 15);
  assert.ok(catalog.stations.reduce((sum, s) => sum + s.tracks.length, 0) >= 241);
  assert.deepEqual(catalog.stations.map((s) => s.slug).sort(), Object.keys(RADIO_TAGS).sort());
  for (const s of catalog.stations) {
    assert.match(s.art, /^(?:\/|https:\/\/)/);
    if (s.art.startsWith('/'))
      assert.ok(
        existsSync(new URL('../public' + s.art, import.meta.url)),
        `Artwork missing: ${s.art}`,
      );
    assert.ok(s.genre && s.description);
  }
});

test('all new songs remain secondary sourced catalog entries, not fictional playable audio', () => {
  for (const st of source.stations) {
    const entry = catalog.stations.find((s) => s.slug === st.slug);
    assert.ok(entry, st.slug);
    assert.equal(entry.tracks.length, st.tracks.length);
    assert.equal(entry.confidence, 'REPORTED');
    for (const track of entry.tracks) {
      assert.equal(track.confidence, 'REPORTED');
      assert.equal(track.association, 'SECONDARY_STATION_LIST');
      assert.equal(track.audioStatus, 'CATALOG_ONLY');
      assert.equal(track.sourceUrl, st.catalogUrl);
    }
  }
});

test('The Wipe has an actual cited show but no fabricated or unlicensed episodes', () => {
  const wipe = catalog.stations.find((s) => s.slug === 'the-wipe');
  assert.equal(wipe.kind, 'talk');
  assert.equal(wipe.tracks.length, 0);
  assert.equal(wipe.shows.length, 1);
  assert.equal(wipe.shows[0].title, 'Ask Dr. Nita');
  assert.equal(wipe.shows[0].episodes.length, 0);
  assert.equal(wipe.shows[0].audioStatus, 'NOT_PUBLICLY_AVAILABLE');
});

test('the featured wheel is strictly scoped to six Rockstar preview stations', () => {
  const app = readFileSync(new URL('../web/App.tsx', import.meta.url), 'utf8');
  const selection = readFileSync(new URL('../web/station-selection.ts', import.meta.url), 'utf8');
  assert.match(app, /stations=\{wheelStations\}/);
  assert.match(selection, /station.confidence === 'OFFICIAL'/);
  assert.match(app, /<StationRibbon\b/);
});

test('featured selection and catalogue preview are independent of the external audio stream', async () => {
  const { featuredStations, stationPreview, stationIndex } =
    await import('../web/station-selection.ts');
  const featured = featuredStations(catalog.stations);
  assert.equal(featured.length, 6);
  assert.ok(featured.every((s) => s.confidence === 'OFFICIAL'));
  assert.equal(stationIndex(catalog.stations, 'vcrr'), 18);
  assert.match(stationPreview(catalog.stations[18], 'es'), /^CATÁLOGO · Nokia — Drake/);
  assert.match(
    stationPreview(
      catalog.stations.find((s) => s.slug === 'the-wipe'),
      'es',
    ),
    /podcasts/,
  );
});
