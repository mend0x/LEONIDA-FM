/**
 * Data-only GTABase station directory synchronization.
 * Run `npm run directory:sync` after editing data/station-directory.json.
 * Idempotent: preserves the six Rockstar-featured stations and their publisher
 * evidence while maintaining 15 secondary station entries.
 */
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const catalogPath = new URL('../data/catalog.json', import.meta.url);
const tagsPath = new URL('../data/radio-genres.json', import.meta.url);
const data = JSON.parse(
  await readFile(new URL('../data/station-directory.json', import.meta.url), 'utf8'),
);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const tags = JSON.parse(await readFile(tagsPath, 'utf8'));
assert.equal(
  data.stations.length,
  15,
  'Check the GTABase index before changing the expected station count',
);
const featured = catalog.stations.filter((s) => s.confidence === 'OFFICIAL');
assert.equal(featured.length, 6, 'Do not accidentally alter Rockstar-featured stations');
for (const [order, item] of data.stations.entries()) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug), `Invalid slug: ${item.slug}`);
  assert(Array.isArray(item.radioBrowserTags) && item.radioBrowserTags.length);
  const current = catalog.stations.find((s) => s.slug === item.slug);
  const evidenceId = 'gtabase-' + item.slug;
  const art =
    item.artProvenance === 'user_reference'
      ? `/art/${item.slug}-source.png`
      : `/art/${item.slug}.svg`;
  const sourceUrl = item.catalogUrl;
  const tracks = item.tracks.map((track, index) => ({
    id: `${item.slug}-gtabase-${String(index + 1).padStart(3, '0')}`,
    title: track.title,
    artist: track.artist,
    confidence: 'REPORTED',
    association: 'SECONDARY_STATION_LIST',
    evidence: [evidenceId],
    sourceUrl,
    rightsStatus: 'NO_REBROADCAST_GRANT',
    audioStatus: 'CATALOG_ONLY',
    verifiedAt: data.checkedAt,
  }));
  const next = {
    ...(current ?? {}),
    id: item.slug,
    slug: item.slug,
    order: order + featured.length,
    name: item.name,
    shortName: item.name,
    genre: item.genre,
    genreEs: item.genreEs,
    description: item.description,
    descriptionEs: item.description,
    hosts: [],
    kind: item.kind,
    featured: false,
    art,
    artProvenance: item.artProvenance,
    color: item.color,
    confidence: 'REPORTED',
    evidence: [evidenceId],
    sourceUrl,
    tracks,
  };
  if (item.slug === 'the-wipe') {
    next.shows = [
      {
        id: 'ask-dr-nita',
        title: 'Ask Dr. Nita',
        host: 'Dr. Nita (Anitta)',
        status: 'REPORTED',
        audioStatus: 'NOT_PUBLICLY_AVAILABLE',
        description:
          'A reported in-game talk/podcast segment. No complete authorized public episodes have been found.',
        sourceUrl:
          'https://www.uol.com.br/splash/noticias/2026/11/18/anitta-esta-no-gta-6-veja-como-sera-a-participacao-da-cantora.ghtm',
        episodes: [],
      },
    ];
  }
  if (current) catalog.stations[catalog.stations.indexOf(current)] = next;
  else catalog.stations.push(next);
  tags[item.slug] = item.radioBrowserTags;
  if (!catalog.references.some((r) => r.id === evidenceId)) {
    catalog.references.push({
      id: evidenceId,
      name: `GTABase · ${item.name} (secondary listing)`,
      url: sourceUrl,
    });
  }
}
const imported = new Set(data.stations.map((s) => s.slug));
catalog.expanded = (catalog.expanded ?? []).filter((s) => !imported.has(s.slug));
catalog.version = '2026-11-19.full-dial.1';
catalog.verifiedAt = data.checkedAt;
const result = JSON.stringify(catalog, null, 2) + '\n';
const genreJson = JSON.stringify(tags, null, 2) + '\n';
if (process.argv.includes('--check')) {
  assert.equal(await readFile(catalogPath, 'utf8'), result, 'Catalog out of sync');
  assert.equal(await readFile(tagsPath, 'utf8'), genreJson, 'Radio Browser tags out of sync');
  console.log(`Directory in sync: ${catalog.stations.length} stations`);
} else {
  await writeFile(catalogPath, result, 'utf8');
  await writeFile(tagsPath, genreJson, 'utf8');
  console.log(
    `Updated ${catalog.stations.length} stations, ${catalog.stations.reduce((n, s) => n + s.tracks.length, 0)} songs`,
  );
}
