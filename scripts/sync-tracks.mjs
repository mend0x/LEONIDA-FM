/** Deterministically merge source-documented songs into the local catalog.
 * Add new songs to data/station-track-additions.json. Never turn a secondary
 * source into an official Rockstar confirmation by accident.
 */
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const catalogPath = new URL('../data/catalog.json', import.meta.url);
const inputPath = new URL('../data/station-track-additions.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const additions = JSON.parse(await readFile(inputPath, 'utf8'));
const known = new Set(catalog.stations.map((station) => station.slug));
for (const [slug, songs] of Object.entries(additions.stations)) {
  assert(known.has(slug), `Track additions reference missing station: ${slug}`);
  assert(Array.isArray(songs), `Expected tracks array: ${slug}`);
  const station = catalog.stations.find((entry) => entry.slug === slug);
  const seen = new Set(
    station.tracks.map(
      (entry) => `${entry.title.trim().toLowerCase()}\0${entry.artist.trim().toLowerCase()}`,
    ),
  );
  for (const track of songs) {
    assert(track.title && track.artist && track.sourceUrl?.startsWith('https://'));
    assert(
      track.confidence === 'REPORTED' && track.association === 'SECONDARY_STATION_LIST',
      'Do not present third-party songs as official previews',
    );
    const key = `${track.title.trim().toLowerCase()}\0${track.artist.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    station.tracks.push(track);
  }
}
// Community stations may start with an empty, accurately labeled catalog.
catalog.verifiedAt = additions.checkedAt;
catalog.version ??= '2026-11-19.radio-ux.2';
const result = JSON.stringify(catalog, null, 2) + '\n';
if (process.argv.includes('--check')) {
  assert.equal(
    await readFile(catalogPath, 'utf8'),
    result,
    'Catalog out of sync. Run npm run catalog:sync',
  );
  console.log(
    `Catalog is in sync: ${catalog.stations.reduce((n, s) => n + s.tracks.length, 0)} songs`,
  );
} else {
  await writeFile(catalogPath, result, 'utf8');
  console.log(
    `Catalog synced: ${catalog.stations.reduce((n, s) => n + s.tracks.length, 0)} documented songs`,
  );
}
