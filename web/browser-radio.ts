import genreTags from '../data/radio-genres.json';

/** Live radio directory requests run in the browser on static hosting. */
export interface BrowserStation {
  id: string;
  name: string;
  url: string;
  codec: string;
  bitrate: number;
  homepage: string | null;
  tags: string;
}

interface RawStation {
  stationuuid?: string;
  name?: string;
  url_resolved?: string;
  url?: string;
  codec?: string;
  bitrate?: number;
  homepage?: string;
  tags?: string;
  lastcheckok?: number;
  clickcount?: number;
  hls?: number;
}

const HOSTS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];
const TAGS: Record<string, string[]> = {
  'flash-fm': ['dance pop', 'pop hits', 'pop'],
  'cocoteo-fm': ['reggaeton', 'latin urban', 'latin'],
  'back-country': ['classic country', 'country'],
  'the-chamber': ['heavy metal', 'thrash metal', 'metal'],
  'dirty-south': ['southern hip hop', 'hip hop', 'rap'],
  'afro-bank': ['afrobeats', 'afrobeat', 'african'],
  'v-rock': ['classic rock', 'hard rock', 'rock'],
  'stockyard-fm': ['deep house', 'house', 'electronic'],
  'symphony-fm': ['classical', 'orchestra'],
  'circoloco-records-radio': ['techno', 'deep house', 'house'],
  emotion: ['80s', 'soft rock', 'oldies'],
  'honey-fm': ['rnb', 'soul', '90s'],
  'radio-on-u': ['dub', 'roots reggae', 'reggae'],
  'the-wipe': ['talk', 'spoken word'],
  'worldwide-fm': ['nu jazz', 'world music', 'jazz'],
  'kaleidoscope-fm': ['world music', 'world', 'electronic'],
  'la-ola': ['salsa', 'latin', 'tropical'],
  'vice-city-fm': ['80s', 'new wave', 'classic hits'],
  vcrr: ['trap', 'hip hop', 'rap'],
  'gloriana-blues-radio': ['blues', 'classic blues'],
  'leonida-jazz-radio': ['jazz fusion', 'jazz'],
};

function safeAudioUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return !(
      host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost') ||
      /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
      /^172\.(?:1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

async function radioBrowserTag(tag: string, signal?: AbortSignal): Promise<RawStation[]> {
  for (const host of HOSTS) {
    const aborter = new AbortController();
    const abort = () => aborter.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = window.setTimeout(abort, 5500);
    try {
      const url = `${host}/json/stations/bytag/${encodeURIComponent(tag)}?hidebroken=true&order=clickcount&reverse=true&limit=100`;
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: aborter.signal,
      });
      if (!response.ok) continue;
      const data: unknown = await response.json();
      if (Array.isArray(data)) return data as RawStation[];
    } catch (error) {
      if (signal?.aborted) throw error;
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  return [];
}

export async function findLiveStations(
  slug: string,
  signal?: AbortSignal,
): Promise<BrowserStation[]> {
  const genres = TAGS[slug] || (genreTags as Record<string, string[]>)[slug] || ['music'];
  const used = new Set<string>();
  const result: BrowserStation[] = [];
  for (const tag of genres.slice(0, 3)) {
    const rows = await radioBrowserTag(tag, signal);
    for (const row of rows) {
      const url = row.url_resolved || row.url || '';
      const codec = (row.codec || '').toLowerCase();
      if (!safeAudioUrl(url) || row.lastcheckok === 0 || row.hls === 1 ||
          (codec && !/(mp3|aac|ogg|opus)/.test(codec)) || used.has(url)) continue;
      used.add(url);
      result.push({
        id: row.stationuuid || url,
        name: (row.name || 'Live radio').trim(),
        url,
        codec: row.codec || '',
        bitrate: row.bitrate || 0,
        homepage: row.homepage || null,
        tags: row.tags || '',
      });
      if (result.length >= 12) return result;
    }
  }
  return result;
}
