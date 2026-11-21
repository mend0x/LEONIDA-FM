import { createSongLibrary } from '../server/song-library.mjs';
import { readFileSync } from 'node:fs';
const catalog = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url)));
const library = createSongLibrary({ catalog });
let available = 0,
  total = 0,
  matched = 0;
for (const s of catalog.stations) {
  const item = await library.list(s.slug);
  available += item.available;
  total += item.totalCatalog;
  matched += item.matched;
  console.log(
    `${s.name.padEnd(26)} archivos: ${String(item.available).padStart(3)} · identificadas: ${String(item.matched).padStart(3)} / ${item.totalCatalog}`,
  );
}
console.log(
  `TOTAL: ${available} archivos presentes · ${matched}/${total} canciones del catálogo reconocidas`,
);
