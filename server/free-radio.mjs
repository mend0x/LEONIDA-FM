/** Live third-party radio from Radio Browser. Never claims to stream Rockstar's stations. */
import { readFileSync } from 'node:fs';

// Keep the existing catalogue/tag definitions untouched. The live-mode profiles
// refine each GTA VI station's musical era and subgenre without changing the game mode.
export const RADIO_TAGS = Object.freeze(
  JSON.parse(readFileSync(new URL('../data/radio-genres.json', import.meta.url), 'utf8')),
);

/**
 * In priority order: Radio Browser tags worth searching for each station.
 * Prefer / avoid patterns are checked against third-party station names and
 * their self-reported tags. They are signals, not a claim about actual playlists.
 */
const LIVE_PROFILES = Object.freeze({
  'flash-fm': {
    search: ['pop', 'dance pop', 'top 40'],
    prefer: ['dance pop', 'dance hits', 'chart hits', 'top 40', 'hits', 'electropop', 'pop music', 'contemporary pop', 'mainstream'],
    avoid: ['talk', 'news', 'religious', 'classical', 'oldies', 'hard rock', 'metal', 'country'],
  },
  'cocoteo-fm': {
    search: ['reggaeton', 'dembow', 'latin urban', 'latin'],
    prefer: ['reggaeton', 'dembow', 'latin urban', 'urbano latino', 'perreo', 'latin trap', 'musica urbana'],
    avoid: ['salsa', 'bachata', 'classical', 'talk', 'news', 'christian', 'latin jazz'],
  },
  'back-country': {
    search: ['classic country', 'country', 'outlaw country'],
    prefer: ['classic country', 'outlaw country', 'traditional country', 'country classics', 'classic hits country', 'old country', '70s country', '80s country'],
    avoid: ['modern country', 'country pop', 'bro country', 'pop country', 'news', 'talk', 'christian'],
  },
  'the-chamber': {
    search: ['heavy metal', 'thrash metal', 'metal', 'hard rock'],
    prefer: ['heavy metal', 'thrash metal', 'speed metal', 'classic metal', 'metallica', 'hard metal', 'metal music'],
    avoid: ['soft rock', 'pop rock', 'alternative pop', 'talk', 'news', 'country', 'christian'],
  },
  'dirty-south': {
    search: ['southern hip hop', 'old school hip hop', 'hip hop', 'crunk'],
    prefer: ['southern hip hop', 'southern rap', 'dirty south', 'old school hip hop', 'crunk', '2000s hip hop', 'classic hip hop', 'classic rap'],
    avoid: ['contemporary trap', 'new trap', 'drill', 'k pop', 'talk', 'news', 'instrumental'],
  },
  'afro-bank': {
    search: ['afrobeats', 'afrobeat', 'amapiano', 'african'],
    prefer: ['afrobeats', 'afrobeat', 'amapiano', 'highlife', 'afro house', 'african dance', 'naija', 'afro pop'],
    avoid: ['talk', 'news', 'gospel', 'religious', 'classical'],
  },
  'v-rock': {
    search: ['classic rock', 'hard rock', '80s rock', 'rock'],
    prefer: ['classic rock', 'hard rock', '80s rock', '70s rock', 'hair metal', 'glam rock', 'arena rock', 'rock classics'],
    avoid: ['indie rock', 'pop rock', 'modern rock', 'soft rock', 'christian rock', 'talk', 'news'],
  },
  'stockyard-fm': {
    search: ['indie dance', 'nu disco', 'electronic', 'house'],
    prefer: ['indie dance', 'nu disco', 'electronic dance', 'electropop', 'disco house', 'dance', 'indie electronic', 'house music', 'electro'],
    avoid: ['hardstyle', 'gabber', 'trance classics', 'talk', 'news', 'classical'],
  },
  'symphony-fm': {
    search: ['classical', 'orchestra', 'symphony'],
    prefer: ['classical', 'orchestra', 'symphony', 'symphonic', 'concert', 'chamber music', 'baroque'],
    avoid: ['classical rock', 'classic hits', 'classical crossover', 'pop', 'talk', 'news'],
  },
  'circoloco-records-radio': {
    search: ['tech house', 'minimal techno', 'techno', 'deep house'],
    prefer: ['tech house', 'minimal techno', 'underground techno', 'underground house', 'deep house', 'minimal house', 'electronic underground', 'techno'],
    avoid: ['commercial dance', 'eurodance', 'mainstream pop', 'hardstyle', 'trance', 'talk', 'news'],
  },
  emotion: {
    search: ['80s', 'soft rock', '80s love songs', 'adult contemporary'],
    prefer: ['80s', 'soft rock', 'love songs', 'power ballads', 'adult contemporary', '80s hits', 'romantic hits', 'ballads'],
    avoid: ['hard rock', 'metal', 'techno', 'trap', 'talk', 'news'],
  },
  'honey-fm': {
    search: ['rnb', '90s rnb', 'neo soul', 'soul'],
    prefer: ['90s rnb', 'r&b', 'rnb', 'new jack swing', 'neo soul', 'urban soul', '90s soul', 'slow jams', 'classic r&b'],
    avoid: ['trap', 'drill', 'hard rap', 'gospel', 'religious', 'news', 'talk'],
  },
  'radio-on-u': {
    search: ['roots reggae', 'dub', 'reggae', 'rocksteady'],
    prefer: ['roots reggae', 'dub reggae', 'dub', 'rocksteady', 'reggae classics', 'roots', 'lovers rock', 'dancehall classics'],
    avoid: ['reggaeton', 'latin trap', 'commercial dance', 'news', 'talk', 'gospel'],
  },
  'the-wipe': {
    search: ['talk', 'comedy', 'entertainment', 'spoken'],
    prefer: ['talk', 'entertainment', 'comedy', 'radio talk', 'podcast', 'conversation', 'spoken'],
    avoid: ['classical', 'metal', 'instrumental', 'dance', 'edm', 'trance'],
  },
  'worldwide-fm': {
    search: ['jazz funk', 'nu jazz', 'soul', 'world music'],
    prefer: ['jazz funk', 'nu jazz', 'broken beat', 'funk', 'soul', 'world music', 'global beats', 'rare groove', 'afro jazz', 'jazz'],
    avoid: ['smooth jazz', 'easy listening', 'classical', 'hard rock', 'news', 'talk'],
  },
  'kaleidoscope-fm': {
    search: ['world music', 'global beats', 'eclectic', 'world'],
    prefer: ['world music', 'global beats', 'eclectic', 'psychedelic', 'international music', 'world fusion', 'global music', 'experimental'],
    avoid: ['mainstream pop', 'classical', 'news', 'talk', 'gospel'],
  },
  'la-ola': {
    search: ['salsa', 'salsa clasica', 'mambo', 'latin'],
    prefer: ['salsa', 'classic salsa', 'salsa clasica', 'son cubano', 'mambo', 'latin classics', 'tropical', 'guaracha'],
    avoid: ['reggaeton', 'latin trap', 'dembow', 'urbano', 'pop latino', 'news', 'talk'],
  },
  'vice-city-fm': {
    search: ['80s', '80s pop', 'new wave', 'synthpop'],
    prefer: ['80s pop', 'new wave', 'synthpop', 'synth pop', '80s hits', '80s', 'retro pop', '80s dance'],
    avoid: ['modern pop', 'top 40', 'contemporary hits', 'metal', 'news', 'talk'],
  },
  vcrr: {
    search: ['trap', 'modern hip hop', 'hip hop', 'urban'],
    prefer: ['trap', 'new hip hop', 'modern hip hop', 'current hip hop', 'rap hits', 'new rap', 'urban rap', 'drill', 'hip hop'],
    avoid: ['old school hip hop', 'classic hip hop', '80s rap', '90s rap', 'news', 'talk', 'instrumental'],
  },
  'gloriana-blues-radio': {
    search: ['blues', 'classic blues', 'delta blues'],
    prefer: ['blues', 'classic blues', 'electric blues', 'delta blues', 'chicago blues', 'traditional blues', 'old blues'],
    avoid: ['blues rock', 'classic rock', 'country pop', 'news', 'talk'],
  },
  'leonida-jazz-radio': {
    search: ['jazz fusion', 'jazz', 'instrumental jazz', 'bebop'],
    prefer: ['jazz fusion', 'fusion jazz', 'instrumental jazz', 'bebop', 'jazz funk', 'contemporary jazz', 'jazz', 'modern jazz'],
    avoid: ['smooth jazz', 'lounge', 'easy listening', 'pop', 'talk', 'news'],
  },
});

const MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];
const CACHE_MS = 15 * 60 * 1000;
const ALLOWED_CODECS = new Set(['MP3', 'AAC', 'AAC+', 'AACPLUS']);

/** Only public HTTPS streams; reject local/private addresses and embedded credentials. */
export function safeStreamUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.hostname.length > 250) return null;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.test') ||
      host === '[::1]' ||
      /^(?:127|10|0|169\.254|192\.168)\./.test(host)
    )
      return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    if (host.includes(':')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Preserve the client response contract; include metadata only for scoring. */
export function normalizeStations(rows) {
  if (!Array.isArray(rows)) return [];
  const used = new Set();
  return rows
    .filter((row) => row && typeof row === 'object')
    .flatMap((row) => {
      if (!Number(row.lastcheckok) || Number(row.hls)) return [];
      const codec = String(row.codec ?? '').toUpperCase();
      if (!ALLOWED_CODECS.has(codec)) return [];
      const url = safeStreamUrl(row.url_resolved || row.url);
      if (!url || used.has(url)) return [];
      used.add(url);
      const name = String(row.name ?? '')
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, 100);
      if (!name) return [];
      return [
        {
          id: String(row.stationuuid || '').slice(0, 64),
          name,
          url,
          codec,
          bitrate: Math.max(0, Number(row.bitrate) || 0),
          homepage: safeStreamUrl(row.homepage),
          tags: String(row.tags || '').slice(0, 500),
          votes: Number(row.votes) || 0,
          clickcount: Number(row.clickcount) || 0,
          lastcheckoktime: String(row.lastcheckoktime_iso8601 || ''),
        },
      ];
    })
    .sort((a, b) => b.votes - a.votes || b.bitrate - a.bitrate);
}

function fold(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[._/\\-]+/g, ' ')
    .replace(/[^a-z0-9&+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function hasPhrase(haystack, phrase) {
  const p = fold(phrase);
  return Boolean(p && (' ' + haystack + ' ').includes(' ' + p + ' '));
}

/** Public stream ranking: subgenre first, popularity and bitrate second. */
export function scoreLiveStation(station, slug, searchTag = '', queryIndex = 0) {
  const profile = LIVE_PROFILES[slug] || { prefer: [], avoid: [] };
  const haystack = fold(station.name + ' ' + station.tags);
  const preferHits = profile.prefer.filter((word) => hasPhrase(haystack, word));
  const avoidHits = profile.avoid.filter((word) => hasPhrase(haystack, word));
  let score = 19 - queryIndex * 4;
  score += Math.min(26, preferHits.length * 13);
  score -= avoidHits.length * 38;
  if (searchTag && hasPhrase(haystack, searchTag)) score += 8;
  // Some directory entries have empty tags: do not blindly reject stations
  // returned under the selected genre, but rank documented matches above them.
  score += Math.min(12, Math.log2(Math.max(0, Number(station.votes) || 0) + 1) * 1.8);
  score += Math.min(7, Math.log2(Math.max(0, Number(station.clickcount) || 0) + 1));
  score += Math.min(7, Math.floor(Math.max(0, Number(station.bitrate) || 0) / 48));
  if (station.codec === 'AAC' || station.codec === 'AAC+') score += 2;
  const checkedAt = Date.parse(station.lastcheckoktime);
  if (Number.isFinite(checkedAt)) {
    const age = Date.now() - checkedAt;
    if (age > 45 * 86400_000) score -= 22;
    else if (age >= 0 && age < 7 * 86400_000) score += 4;
  }
  return score;
}

function bestCandidates(pool, slug) {
  const scored = [...pool.values()]
    .map(({ station, searchTag, queryIndex }) => ({
      station,
      score: scoreLiveStation(station, slug, searchTag, queryIndex),
      match: (LIVE_PROFILES[slug]?.prefer || []).some((word) =>
        hasPhrase(fold(station.name + ' ' + station.tags), word),
      ),
    }))
    .sort((a, b) => b.score - a.score || b.station.votes - a.station.votes);
  const hasGoodMatch = scored.some((entry) => entry.match && entry.score >= 28);
  // Never pad an otherwise good music selection with plainly mismatched genres.
  const suitable = hasGoodMatch ? scored.filter((s) => s.score >= 24) : scored;
  const selected = [];
  const byHost = new Map();
  for (const item of suitable) {
    const hostname = new URL(item.station.url).hostname;
    if ((byHost.get(hostname) || 0) >= 3) continue;
    selected.push(item.station);
    byHost.set(hostname, (byHost.get(hostname) || 0) + 1);
    if (selected.length >= 12) break;
  }
  return selected;
}

export function createFreeRadio({ fetcher = fetch, now = () => Date.now(), mirrors = MIRRORS } = {}) {
  const cached = new Map();
  const pending = new Map();

  async function lookup(slug) {
    const defaults = RADIO_TAGS[slug];
    if (!defaults) return null;
    const old = cached.get(slug);
    if (old && now() - old.at < CACHE_MS) return old.value;
    if (pending.has(slug)) return pending.get(slug);
    const promise = (async () => {
      const queries = [...new Set((LIVE_PROFILES[slug]?.search || defaults).slice(0, 4))];
      const pool = new Map();
      let failure;
      let lastTag = queries[0];
      for (const [queryIndex, tag] of queries.entries()) {
        let received = false;
        let rows = [];
        for (const mirror of mirrors) {
          const url = `${mirror}/json/stations/bytag/${encodeURIComponent(tag)}?hidebroken=true&order=votes&reverse=true&limit=55`;
          try {
            const response = await fetcher(url, {
              signal: AbortSignal.timeout(4500),
              headers: { 'User-Agent': 'LeonidaFM/1.0 (independent fan site; https://www.radio-browser.info/)' },
            });
            if (!response.ok) throw Error(`Radio directory HTTP ${response.status}`);
            rows = normalizeStations(await response.json());
            received = true;
            break;
          } catch (error) {
            failure = error;
          }
        }
        if (!received) continue;
        lastTag = tag;
        for (const station of rows) {
          const id = station.id || station.url;
          const current = pool.get(id);
          const candidate = { station, searchTag: tag, queryIndex };
          if (
            !current ||
            scoreLiveStation(station, slug, tag, queryIndex) >
              scoreLiveStation(current.station, slug, current.searchTag, current.queryIndex)
          ) pool.set(id, candidate);
        }
        const ranked = bestCandidates(pool, slug);
        const strong = ranked.filter((station) =>
          (LIVE_PROFILES[slug]?.prefer || []).some((word) =>
            hasPhrase(fold(station.name + ' ' + station.tags), word),
          ),
        ).length;
        // A single established stream is a valid result for a niche genre.
        // Otherwise, sample more tags until there are several stylistic matches.
        if (
          (rows.length === 1 && rows[0].votes >= 100) ||
          (ranked.length >= 8 && strong >= 5) ||
          pool.size >= 140
        ) break;
      }
      const stations = bestCandidates(pool, slug);
      if (!stations.length)
        throw failure || Error('No compatible HTTPS MP3/AAC live radio stations for this style');
      const value = {
        provider: 'radio-browser',
        label: 'Independent live internet radio, not GTA VI audio',
        genre: lastTag,
        stations,
      };
      cached.set(slug, { at: now(), value });
      return value;
    })().finally(() => pending.delete(slug));
    pending.set(slug, promise);
    return promise;
  }
  return {
    lookup,
    async handler(req, res, slug) {
      const data = await lookup(slug);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=90');
      if (!data) {
        res.statusCode = 404;
        return res.end(JSON.stringify({ error: 'Unknown station' }));
      }
      res.statusCode = 200;
      return res.end(JSON.stringify(data));
    },
  };
}
