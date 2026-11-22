/** Publish the licensed Git LFS song library as static Cloudflare Pages assets.
 * No browser upload, Node server, or persistent machine is required at runtime.
 */
import { readFile, readdir, copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSongLibrary, isAudioFilename } from '../server/song-library.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const MAX_ASSET_BYTES = 25 * 1024 * 1024; // Official Cloudflare Pages limit.
const POINTER_HEADER = 'version https://git-lfs.github.com/spec/v1';

async function scanFiles(songRoot) {
  const stationDirs = await readdir(songRoot, { withFileTypes: true });
  const songs = [];
  for (const folder of stationDirs.filter(item => item.isDirectory())) {
    const entries = await readdir(join(songRoot, folder.name), { withFileTypes: true });
    for (const entry of entries) if (entry.isFile() && isAudioFilename(entry.name))
      songs.push({ station: folder.name, filename: entry.name,
        path: join(songRoot, folder.name, entry.name) });
  }
  return songs;
}
async function isPointer(file) {
  const handle = await (await import('node:fs/promises')).open(file, 'r');
  try {
    const buffer = Buffer.alloc(90);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8').startsWith(POINTER_HEADER);
  } finally { await handle.close(); }
}

export async function publishLicensedLibrary({
  root = projectRoot,
  songsDirectory = join(root, 'canciones'),
  output = join(root, 'dist', 'client'),
  minimumTracks = Number(process.env.LEONIDA_MIN_SONGS ?? 235),
  pullLfs = true,
} = {}) {
  const catalog = JSON.parse(await readFile(join(root, 'data', 'catalog.json'), 'utf8'));
  const expectedSlugs = new Set(catalog.stations.map(station => station.slug));
  const allFiles = await scanFiles(songsDirectory);
  const pointers = [];
  for (const file of allFiles) if (await isPointer(file.path)) pointers.push(file);
  if (pointers.length && pullLfs) {
    console.log(`Git LFS: recuperando ${pointers.length} archivos de audio desde GitHub...`);
    try {
      execFileSync('git', ['lfs', 'version'], { cwd: root, stdio: 'inherit' });
      execFileSync('git', ['lfs', 'pull', '--include=canciones/**'], { cwd: root, stdio: 'inherit', timeout: 12 * 60 * 1000 });
    } catch (error) {
      throw new Error('No se pudieron descargar los objetos Git LFS. Comprueba que git-lfs esté disponible en el entorno de Cloudflare y que el repositorio sea accesible.', { cause: error });
    }
  }
  const files = await scanFiles(songsDirectory);
  if (!Number.isSafeInteger(minimumTracks) || minimumTracks < 0) throw new Error('Invalid minimumTracks');
  if (files.length < minimumTracks) throw new Error(
    `Biblioteca incompleta: hay ${files.length} canciones, se esperan al menos ${minimumTracks}. No se publicará una beta sin música.`,
  );
  let totalBytes = 0;
  for (const file of files) {
    if (!expectedSlugs.has(file.station)) throw new Error(`Unknown station for song: ${file.station}`);
    if (await isPointer(file.path)) throw new Error(`Git LFS devolvió un puntero en vez del audio: ${file.station}/${file.filename}`);
    const info = await stat(file.path);
    if (!info.isFile() || info.size === 0 || info.size > MAX_ASSET_BYTES)
      throw new Error(`Archivo incompatible con Pages (vacío o mayor de 25 MiB): ${file.station}/${file.filename} (${info.size} bytes)`);
    totalBytes += info.size;
  }
  if (files.length + 1800 > 20000) throw new Error('The Cloudflare free plan allows at most 20,000 site files.');
  const library = createSongLibrary({ catalog, root: resolve(songsDirectory) });
  let published = 0;
  const byStation = {};
  for (const station of catalog.stations) {
    const manifest = await library.list(station.slug);
    const dir = join(output, 'library');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${station.slug}.json`), JSON.stringify(manifest));
    byStation[station.slug] = manifest.available;
    for (const entry of manifest.songs) {
      const dst = join(output, 'canciones', station.slug, entry.filename);
      await mkdir(join(output, 'canciones', station.slug), { recursive: true });
      await copyFile(join(songsDirectory, station.slug, entry.filename), dst);
      published++;
    }
  }
  if (published !== files.length) throw new Error(`Some tracks were not published: ${published} of ${files.length}`);
  await writeFile(join(output, 'library', 'index.json'), JSON.stringify({
    tracks: published, sizeBytes: totalBytes, stations: byStation,
  }));
  console.log(`LEONIDA Cloudflare: ${published} audios (${(totalBytes / (1024**3)).toFixed(2)} GiB), ${Object.keys(byStation).length} emisoras.`);
  return { tracks: published, bytes: totalBytes, stations: byStation };
}
