/** On-disk, local-only audio library. Catalog entries are references, never audio downloads. */
import { readdir } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac']);
export const isAudioFilename = (name) =>
  typeof name === 'string' &&
  !name.startsWith('.') &&
  !/[\\/]/.test(name) &&
  !Array.from(name).some((c) => c.charCodeAt(0) < 32) &&
  AUDIO_EXTENSIONS.has(extname(name).toLowerCase());

// The normalizer also handles titles such as "I’m Broken" and filenames with typographic apostrophes.
export const normalizeSongName = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(?:feat\.?|ft\.?|featuring)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

/** Conservative matching: exact 'Artist - Title' or 'Title' to avoid wrong metadata. */
export function matchTrack(filename, tracks = []) {
  const base = filename.slice(0, -extname(filename).length).replace(/^\s*\d{1,3}[.\s_-]+/, '');
  const normalized = normalizeSongName(base);
  const matches = tracks.filter((track) => {
    const title = normalizeSongName(track.title);
    const artist = normalizeSongName(track.artist);
    return (
      normalized === title ||
      normalized === `${artist} ${title}` ||
      normalized === `${title} ${artist}`
    );
  });
  return matches.length === 1 ? matches[0] : null;
}

export function createSongLibrary({
  catalog,
  root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'canciones'),
} = {}) {
  if (!catalog?.stations) throw new Error('A station catalog is required');
  const stations = new Map(catalog.stations.map((station) => [station.slug, station]));
  return {
    root,
    hasStation(slug) {
      return stations.has(slug);
    },
    async list(slug) {
      const station = stations.get(slug);
      if (!station) return null;
      const folder = join(root, slug);
      const entries = await readdir(folder, { withFileTypes: true }).catch((error) => {
        if (error?.code === 'ENOENT') return [];
        throw error;
      });
      const files = entries
        .filter((entry) => entry.isFile() && isAudioFilename(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
      const matched = new Set();
      const songs = files.map(({ name }) => {
        const track = matchTrack(name, station.tracks || []);
        if (track)
          matched.add(`${normalizeSongName(track.artist)}|${normalizeSongName(track.title)}`);
        return {
          filename: name,
          url: `/canciones/${encodeURIComponent(slug)}/${encodeURIComponent(name)}`,
          title: track?.title || name.slice(0, -extname(name).length),
          artist: track?.artist || 'Archivo local',
          confidence: track?.confidence || 'COMMUNITY',
          catalogMatched: Boolean(track),
        };
      });
      return {
        station: slug,
        totalCatalog: (station.tracks || []).length,
        available: songs.length,
        matched: matched.size,
        missing: (station.tracks || [])
          .filter(
            (t) => !matched.has(`${normalizeSongName(t.artist)}|${normalizeSongName(t.title)}`),
          )
          .map(({ artist, title }) => ({ artist, title })),
        songs,
      };
    },
  };
}
