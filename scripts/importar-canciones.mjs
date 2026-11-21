/** Import your own local audio files into folders for the GTA VI stations. */
import { readdir, copyFile, rename, mkdir } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAudioFilename, matchTrack } from '../server/song-library.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalog = JSON.parse(readFileSync(join(root, 'data/catalog.json'), 'utf8'));
const args = process.argv.slice(2);
function option(flag) {
  const index = args.indexOf(flag);
  return index < 0 ? null : args[index + 1];
}
const source = option('--from');
const explicitStation = option('--station');
const copy = args.includes('--copy');
const move = args.includes('--move');
if (
  !source ||
  (copy && move) ||
  (explicitStation && !catalog.stations.some((s) => s.slug === explicitStation))
) {
  console.error(
    'Uso: npm run canciones:importar -- --from "C:\\Musica" [--station flash-fm] [--copy|--move]',
  );
  console.error('Sin --copy/--move solo se hace una simulación, sin modificar archivos.');
  process.exitCode = 1;
} else {
  const sourceDir = resolve(source);
  const entries = await readdir(sourceDir, { withFileTypes: true });
  let accepted = 0,
    ambiguous = 0,
    skipped = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !isAudioFilename(entry.name)) continue;
    const matches = explicitStation
      ? catalog.stations.filter((s) => s.slug === explicitStation)
      : catalog.stations.filter((s) => matchTrack(entry.name, s.tracks || []));
    if (matches.length !== 1) {
      console.log(
        matches.length ? 'AMBIGUO' : 'SIN ASIGNAR',
        entry.name,
        matches.length ? matches.map((s) => s.slug).join(', ') : '',
      );
      ambiguous++;
      continue;
    }
    const station = matches[0];
    const destination = join(root, 'canciones', station.slug, basename(entry.name));
    const src = join(sourceDir, entry.name);
    if (src.toLowerCase() === destination.toLowerCase()) {
      skipped++;
      continue;
    }
    try {
      const { stat } = await import('node:fs/promises');
      await stat(destination);
      console.log('EXISTE', destination);
      skipped++;
      continue;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    console.log(
      move ? 'MOVER' : copy ? 'COPIAR' : 'SIMULACIÓN',
      `${entry.name} -> canciones/${station.slug}/`,
    );
    if (copy || move) {
      await mkdir(join(root, 'canciones', station.slug), { recursive: true });
      if (copy) await copyFile(src, destination);
      else await rename(src, destination);
    }
    accepted++;
  }
  console.log(
    `Coincidencias: ${accepted} · sin asignar/ambiguas: ${ambiguous} · existentes: ${skipped}`,
  );
  if (!copy && !move) console.log('Para importar de verdad, añade --copy (recomendado) o --move.');
}
