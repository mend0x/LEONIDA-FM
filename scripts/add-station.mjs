/**
 * Add a community or newly verified station without touching React/components.
 * Usage: npm run station:add -- slug "Station Name" "music genre" "pop,indie"
 * New station names are explicitly COMMUNITY until manually verified.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const [slug, name, genre, tags] = process.argv.slice(2);
if (!slug || !name || !genre || !tags) {
  console.error('Usage: npm run station:add -- station-slug "Station Name" "Genre" "tag1,tag2"');
  process.exitCode = 1;
} else {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), 'Use a lowercase URL-safe slug');
  const tagList = [
    ...new Set(
      tags
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  assert(
    tagList.length > 0 && tagList.every((tag) => /^[a-z0-9 -]+$/.test(tag)),
    'Invalid Radio Browser tags',
  );
  assert(name.length <= 70 && genre.length <= 60, 'Station name or genre is too long');
  const catalogFile = resolve('data/catalog.json');
  const genresFile = resolve('data/radio-genres.json');
  const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
  const genres = JSON.parse(await readFile(genresFile, 'utf8'));
  assert(!catalog.stations.some((station) => station.slug === slug), 'Station already exists');
  const station = {
    id: slug,
    slug,
    order: catalog.stations.length,
    name,
    shortName: name,
    genre,
    genreEs: genre,
    description: 'Community radio inspired by Leonida.',
    descriptionEs: 'Radio de la comunidad inspirada en Leonida.',
    hosts: [],
    confidence: 'COMMUNITY',
    color: '#FF9C9E',
    art: `/art/${slug}.svg`,
    evidence: [],
    tracks: [],
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" fill="#201525"/><circle cx="240" cy="240" r="140" fill="none" stroke="#ff9c9e" stroke-width="9"/><path d="M240 160v160m-75-80h150" stroke="#ffb9a7" stroke-width="15" stroke-linecap="round"/><text x="240" y="415" text-anchor="middle" font-size="20" fill="#ffe7d7" font-family="sans-serif">LEONIDA FM - COMMUNITY</text></svg>`;
  await mkdir('public/art', { recursive: true });
  await writeFile(resolve(`public/art/${slug}.svg`), svg);
  catalog.stations.push(station);
  genres[slug] = tagList;
  await writeFile(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
  await writeFile(genresFile, JSON.stringify(genres, null, 2) + '\n');
  console.log(`Added ${name} (${slug}). You can now customize the station in data/catalog.json.`);
}
