/**
 * LEONIDA FM — busca enlaces y organiza archivos musicales por estación.
 * yt-dlp es un programa externo. Solo utilices fuentes para las que esté permitida la descarga.
 * Nunca se inventan URLs de audio: el enlace obtenido es al vídeo original.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readCsv, safeBase } from './descargar-canciones.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const cancionesRoot = join(root, 'canciones');
const catalogPath = join(cancionesRoot, 'FUENTES-DESCARGA.csv');
const foundPath = join(cancionesRoot, 'ENLACES-YTDLP.csv');
const statusPath = join(cancionesRoot, 'ESTADO-AUTOBUSQUEDA.csv');
const candidatesPath = join(cancionesRoot, 'CANDIDATOS-PENDIENTES.csv');
const errorsPath = join(cancionesRoot, 'ERRORES-DETALLADOS.csv');
const audioExt = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.flac']);
const COLUMNS = [
  'Emisora',
  'Carpeta',
  'Artista',
  'Cancion',
  'URL_YOUTUBE',
  'Titulo_Encontrado',
  'Canal',
  'Puntuacion',
  'Estado',
  'Archivo',
];

function csv(value) {
  const str = String(value ?? '');
  return /[;\n\r"]/.test(str) ? `"${str.replaceAll('"', '""')}"` : str;
}
function serialize(rows, fields = COLUMNS) {
  return (
    '\uFEFF' +
    fields.join(';') +
    '\r\n' +
    rows.map((row) => fields.map((field) => csv(row[field])).join(';')).join('\r\n') +
    '\r\n'
  );
}
function cli(args) {
  const cfg = {
    onlyFolder: '',
    limit: Infinity,
    linksOnly: false,
    statusOnly: false,
    forceCandidates: false,
    candidates: 8,
    ytDlp: '',
    refresh: false,
    deepSearch: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--only-folder') cfg.onlyFolder = args[++i] ?? '';
    else if (a === '--limit') cfg.limit = Number(args[++i]);
    else if (a === '--links-only') cfg.linksOnly = true;
    else if (a === '--status') cfg.statusOnly = true;
    else if (a === '--force-candidates') cfg.forceCandidates = true;
    else if (a === '--refresh') cfg.refresh = true;
    else if (a === '--deep-search') cfg.deepSearch = true;
    else if (a === '--yt-dlp') cfg.ytDlp = args[++i] ?? '';
    else throw new Error(`Opción desconocida: ${a}`);
  }
  if (cfg.onlyFolder && !/^[a-z0-9-]+$/.test(cfg.onlyFolder))
    throw new Error('Nombre de emisora inválido');
  if ((!Number.isInteger(cfg.limit) && cfg.limit !== Infinity) || cfg.limit < 1)
    throw new Error('Límite inválido');
  return cfg;
}
function norm(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokens(value) {
  return norm(value)
    .split(' ')
    .filter(
      (x) =>
        x.length > 1 &&
        !['the', 'and', 'feat', 'featuring', 'with', 'ft', 'dj', 'de', 'la', 'el'].includes(x),
    );
}
function overlap(query, hit) {
  const q = [...new Set(tokens(query))];
  const h = new Set(tokens(hit));
  return q.length ? q.filter((x) => h.has(x)).length / q.length : 0;
}
function candidateScore(track, candidate) {
  const title = norm(candidate.title);
  const owner = norm([candidate.channel, candidate.uploader].filter(Boolean).join(' '));
  const song = norm(track.Cancion);
  const artist = norm(track.Artista);
  const titleMatch =
    song.length === 1
      ? new RegExp(`(?:^| )${song}(?: |$)`).test(title)
        ? 1
        : 0
      : overlap(track.Cancion, candidate.title);
  const artistMatch = Math.max(
    overlap(track.Artista, candidate.title),
    overlap(track.Artista, owner),
  );
  const primaryArtist = norm(
    track.Artista.split(/\s+(?:feat\.?|ft\.?|featuring)\s+|\s*&\s*|\s+and\s+/i)[0],
  );
  const primaryMatch =
    primaryArtist && (title.includes(primaryArtist) || owner.includes(primaryArtist)) ? 1 : 0;
  let score = titleMatch * 0.62 + Math.max(artistMatch, primaryMatch * 0.75) * 0.38;
  if (song && title.includes(song)) score += 0.11;
  if (artist && title.includes(artist)) score += 0.06;
  if (
    /\b(official audio|official video|official music video|topic|vevo)\b/.test(title + ' ' + owner)
  )
    score += 0.03;
  const flags = [
    'remix',
    'cover',
    'karaoke',
    'nightcore',
    'slowed',
    'sped up',
    '8d audio',
    'reaction',
    'tutorial',
    'instrumental',
    'live',
    'concert',
    'full album',
    'mix playlist',
  ];
  for (const word of flags) {
    if (title.includes(word) && !norm(track.Cancion).includes(word)) score -= 0.32;
  }
  if (Number.isFinite(candidate.duration) && (candidate.duration < 75 || candidate.duration > 780))
    score -= 0.5;
  if (!titleMatch || !(artistMatch > 0.1 || primaryMatch > 0)) score -= 0.4;
  return Math.max(0, Math.min(1, score));
}
function videoUrl(entry) {
  const id = entry.id;
  if (/^[a-zA-Z0-9_-]{11}$/.test(id ?? '')) return `https://www.youtube.com/watch?v=${id}`;
  for (const val of [entry.webpage_url, entry.original_url, entry.url]) {
    if (typeof val !== 'string') continue;
    try {
      const parsed = new URL(val);
      if (
        [
          'www.youtube.com',
          'youtube.com',
          'music.youtube.com',
          'm.youtube.com',
          'youtu.be',
        ].includes(parsed.hostname) &&
        parsed.protocol === 'https:'
      )
        return parsed.href;
    } catch {
      /* ignore invalid URLs */
    }
  }
  return null;
}
function selectCandidate(track, entries, { forceCandidates = false } = {}) {
  const matches = entries
    .map((item) => ({ ...item, link: videoUrl(item), score: candidateScore(track, item) }))
    .filter((item) => item.link && item.title)
    .sort((a, b) => b.score - a.score);
  const top = matches[0];
  if (!top) return { state: 'NO_ENCONTRADO', candidate: null };
  if (top.score >= 0.76) return { state: 'ENCONTRADO', candidate: top };
  if (top.score >= 0.53)
    return { state: forceCandidates ? 'ENCONTRADO' : 'REVISAR', candidate: top };
  return { state: 'NO_COINCIDE', candidate: top };
}
function run(program, args, timeoutMs = 120000) {
  return new Promise((fulfill, reject) => {
    const proc = spawn(program, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '',
      err = '',
      expired = false;
    const timer = setTimeout(() => {
      expired = true;
      proc.kill();
    }, timeoutMs);
    proc.stdout.on('data', (b) => {
      out += b.toString();
      if (out.length > 12_000_000) proc.kill();
    });
    proc.stderr.on('data', (b) => {
      err += b.toString();
      if (err.length > 1_000_000) err = err.slice(-100_000);
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      fulfill({ code, out, err, expired });
    });
  });
}
function ytdlpPath(cfg) {
  if (cfg.ytDlp) return cfg.ytDlp;
  const candidates =
    process.platform === 'win32'
      ? [join(root, 'tools', 'yt-dlp.exe'), join(root, 'yt-dlp.exe')]
      : [join(root, 'tools', 'yt-dlp')];
  return candidates.find((path) => existsSync(path)) ?? 'yt-dlp';
}
function ytCommon() {
  return [
    '--no-playlist',
    '--no-warnings',
    '--js-runtimes',
    'node',
    '--remote-components',
    'ejs:github',
  ];
}
function makeQueries(track, deepSearch) {
  const artist = String(track.Artista);
  const song = String(track.Cancion);
  const normal = [
    `${artist} - ${song} official audio`,
    `${artist} ${song}`,
  ];
  if (!deepSearch) return normal;
  const primary = artist.split(/\s+(?:feat\.?|ft\.?|featuring)\s+|\s*&\s*|\s+and\s+/i)[0];
  const dePunctuated = song.replace(/[‘’“”]/g, '').replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  return [...new Set([
    ...normal,
    `${primary} ${dePunctuated} topic`,
    `"${dePunctuated}" "${primary}"`,
    `${primary} ${dePunctuated} full song`,
    `${artist} ${dePunctuated} GTA VI soundtrack`,
    `${primary} ${dePunctuated} audio song`,
    `${dePunctuated} by ${primary}`,
  ])];
}
async function lookup(yt, track, { deepSearch = false } = {}) {
  const queries = makeQueries(track, deepSearch);
  const ranked = new Map();
  let best = { state: 'NO_ENCONTRADO', candidate: null };
  for (const query of queries) {
    const call = await run(
      yt,
      [...ytCommon(), '--flat-playlist', '--dump-single-json', `ytsearch${deepSearch ? 20 : 8}:${query}`],
      deepSearch ? 150000 : 100000,
    );
    if (call.code !== 0 && !call.out.trim()) {
      // A search endpoint can fail temporarily. Try the next query if one exists.
      continue;
    }
    let json;
    try {
      json = JSON.parse(call.out);
    } catch {
      continue;
    }
    for (const item of json.entries ?? []) {
      const link = videoUrl(item);
      if (!link || !item.title) continue;
      const candidate = { ...item, link, score: candidateScore(track, item) };
      if (!ranked.has(link) || ranked.get(link).score < candidate.score) ranked.set(link, candidate);
    }
    const result = selectCandidate(track, [...ranked.values()]);
    if ((result.candidate?.score ?? 0) > (best.candidate?.score ?? 0)) best = result;
    if (best.state === 'ENCONTRADO' && (!deepSearch || best.candidate.score >= 0.94)) break;
  }
  return { ...best, candidates: [...ranked.values()].sort((a,b) => b.score - a.score).slice(0, 8) };
}
async function existing(dir, basenameWithoutExt) {
  const names = await readdir(dir).catch((e) => (e.code === 'ENOENT' ? [] : Promise.reject(e)));
  return (
    names.find(
      (name) =>
        audioExt.has(extname(name).toLowerCase()) &&
        name.slice(0, -extname(name).length).toLowerCase() === basenameWithoutExt.toLowerCase(),
    ) ?? null
  );
}
function reportFor(track) {
  return {
    Emisora: track.Emisora,
    Carpeta: track.Carpeta,
    Artista: track.Artista,
    Cancion: track.Cancion,
    URL_YOUTUBE: '',
    Titulo_Encontrado: '',
    Canal: '',
    Puntuacion: '',
    Estado: '',
    Archivo: '',
  };
}
function cacheKey(row) {
  return [row.Carpeta, norm(row.Artista), norm(row.Cancion)].join('|');
}
async function download(yt, url, targetBase) {
  // MP3 if ffmpeg is available; otherwise fetch M4A without a converter.
  const ffmpeg = spawnSync('ffmpeg', ['-version'], { windowsHide: true, stdio: 'ignore' });
  const hasFFmpeg = ffmpeg.status === 0;
  const output = targetBase + '.%(ext)s';
  const extra = hasFFmpeg
    ? ['-f', 'bestaudio', '-x', '--audio-format', 'mp3', '--audio-quality', '2']
    : ['-f', 'bestaudio[ext=m4a]'];
  const result = await run(
    yt,
    [
      ...ytCommon(),
      '--no-overwrites',
      '--continue',
      '--no-progress',
      '--no-mtime',
      '--retries',
      '5',
      '--fragment-retries',
      '5',
      '--extractor-retries',
      '4',
      '--socket-timeout',
      '20',
      ...extra,
      '-o',
      output,
      url,
    ],
    420000,
  );
  const dir = resolve(targetBase, '..');
  const found = await existing(dir, basename(targetBase));
  if (!found || result.code !== 0)
    throw new Error((result.err.trim() || 'No se pudo obtener audio compatible').slice(-350));
  const info = await stat(join(dir, found));
  if (info.size < 1024) throw new Error('El archivo obtenido no contiene audio válido');
  return found;
}
async function main(options = cli(process.argv.slice(2))) {
  const csvRows = readCsv(await readFile(catalogPath, 'utf8'));
  const filtered = csvRows.filter(
    (row) => !options.onlyFolder || row.Carpeta === options.onlyFolder,
  );
  const saved = existsSync(foundPath) ? readCsv(await readFile(foundPath, 'utf8')) : [];
  const cache = new Map(saved.map((row) => [cacheKey(row), row]));
  const yt = ytdlpPath(options);
  if (!options.statusOnly) {
    const test = await run(yt, ['--version'], 12000).catch((err) => {
      throw new Error(
        `No encuentro yt-dlp: ${err.message}. Ejecuta DESCARGAR_CANCIONES.bat para instalarlo.`,
      );
    });
    if (test.code !== 0) throw new Error(`yt-dlp no responde: ${test.err}`);
    console.log(`Motor: ${yt} (${test.out.trim()})`);
  }
  let count = 0;
  const report = [];
  const candidatesReport = [];
  const errorsReport = [];
  for (const [i, row] of filtered.entries()) {
    if (!row.Carpeta || !/^[a-z0-9-]+$/.test(row.Carpeta))
      throw new Error(`Carpeta inválida en entrada ${i + 1}`);
    const base = safeBase(
      (row.ArchivoEsperado || `${row.Artista} - ${row.Cancion}`).replace(
        /\.(mp3|m4a|aac|flac|ogg|opus|wav)$/i,
        '',
      ),
    );
    if (!base || base === '.' || base === '..')
      throw new Error(`Nombre inválido en entrada ${i + 1}`);
    const dir = join(cancionesRoot, row.Carpeta);
    await mkdir(dir, { recursive: true });
    const item = { ...reportFor(row), ...(cache.get(cacheKey(row)) || {}) };
    const present = await existing(dir, base);
    if (present) {
      item.Estado = 'YA_EXISTE';
      item.Archivo = present;
      report.push(item);
      cache.set(cacheKey(row), item);
      continue;
    }
    if (options.statusOnly) {
      item.Estado = item.URL_YOUTUBE ? 'ENLACE_GUARDADO' : 'SIN_ENLACE';
      report.push(item);
      continue;
    }
    if (count >= options.limit) {
      item.Estado = 'PENDIENTE';
      report.push(item);
      continue;
    }
    count++;
    console.log(`[${i + 1}/${filtered.length}] ${row.Emisora}: ${row.Artista} - ${row.Cancion}`);
    try {
      let viableAlternatives = [];
      if (!item.URL_YOUTUBE || options.refresh) {
        const found = await lookup(yt, row, { deepSearch: options.deepSearch });
        viableAlternatives = (found.candidates ?? [])
          .filter((candidate) => candidate.link && candidate.score >= 0.76)
          .filter((candidate) => candidate.link !== found.candidate?.link)
          .slice(0, options.deepSearch ? 4 : 2);
        item.URL_YOUTUBE = found.candidate?.link ?? '';
        item.Titulo_Encontrado = found.candidate?.title ?? '';
        item.Canal = found.candidate?.channel ?? found.candidate?.uploader ?? '';
        item.Puntuacion = found.candidate ? found.candidate.score.toFixed(2) : '';
        item.Estado = found.state;
        if (found.state !== 'ENCONTRADO') {
          for (const candidate of found.candidates) {
            candidatesReport.push({
              Emisora: row.Emisora, Artista: row.Artista, Cancion: row.Cancion,
              URL_YOUTUBE: candidate.link, Titulo_Encontrado: candidate.title,
              Canal: candidate.channel ?? candidate.uploader ?? '', Puntuacion: candidate.score.toFixed(3),
            });
          }
        }
      } else {
        // Critical: a cached low-score mismatch must not become an acceptable match.
        const oldScore = Number(item.Puntuacion);
        item.Estado = !Number.isFinite(oldScore) || oldScore < 0.53
          ? 'NO_COINCIDE'
          : oldScore >= 0.76 ? 'ENCONTRADO' : 'REVISAR';
      }
      if (options.forceCandidates && item.Estado === 'REVISAR' && Number(item.Puntuacion) >= 0.53)
        item.Estado = 'ENCONTRADO';
      if (item.Estado === 'ENCONTRADO' && !options.linksOnly) {
        const attempts = [
          { link: item.URL_YOUTUBE, title: item.Titulo_Encontrado, channel: item.Canal,
            score: Number(item.Puntuacion) },
          ...viableAlternatives,
        ];
        const failures = [];
        let succeeded = false;
        for (const candidate of attempts) {
          try {
            item.Archivo = await download(yt, candidate.link, join(dir, base));
            item.URL_YOUTUBE = candidate.link;
            item.Titulo_Encontrado = candidate.title ?? item.Titulo_Encontrado;
            item.Canal = candidate.channel ?? candidate.uploader ?? item.Canal;
            item.Puntuacion = Number.isFinite(candidate.score) ? candidate.score.toFixed(2) : item.Puntuacion;
            item.Estado = 'DESCARGADA';
            succeeded = true;
            break;
          } catch (downloadError) {
            const reason = String(downloadError.message ?? downloadError).slice(-420);
            failures.push(candidate.link + ': ' + reason);
            console.log('  Fuente no disponible; ' + (attempts.length > 1 ? 'probando alternativa...' : 'sin alternativas aceptables'));
          }
        }
        if (!succeeded) throw new Error(failures.join(' | ').slice(-1500));
      }
    } catch (error) {
      item.Estado = 'ERROR';
      item.Archivo = String(error.message).slice(0, 1200);
      errorsReport.push({ Emisora: row.Emisora, Artista: row.Artista, Cancion: row.Cancion,
        URL_YOUTUBE: item.URL_YOUTUBE, Motivo: item.Archivo });
      console.warn('  Motivo: ' + item.Archivo.slice(-500));
    }
    console.log(`  ${item.Estado}${item.URL_YOUTUBE ? ' → ' + item.URL_YOUTUBE : ''}`);
    cache.set(cacheKey(row), item);
    // Save after each item, so an interrupted batch can resume.
    await writeFile(foundPath, serialize([...cache.values()]), 'utf8');
    report.push(item);
  }
  await writeFile(statusPath, serialize(report), 'utf8');
  if (errorsReport.length) await writeFile(errorsPath, serialize(errorsReport, [
    'Emisora','Artista','Cancion','URL_YOUTUBE','Motivo'
  ]), 'utf8');
  if (candidatesReport.length) await writeFile(candidatesPath, serialize(candidatesReport, [
    'Emisora','Artista','Cancion','Titulo_Encontrado','Canal','Puntuacion','URL_YOUTUBE'
  ]), 'utf8');
  await writeFile(foundPath, serialize([...cache.values()]), 'utf8');
  const counts = report.reduce(
    (map, item) => ((map[item.Estado] = (map[item.Estado] ?? 0) + 1), map),
    {},
  );
  console.log(`\nLEONIDA FM — ${report.length} canciones revisadas`);
  for (const [status, total] of Object.entries(counts)) console.log(`  ${status}: ${total}`);
  console.log(`Enlaces: ${foundPath}\nInforme: ${statusPath}`);
  if (candidatesReport.length) console.log(`Candidatos para revisar: ${candidatesPath}`);
  if (errorsReport.length) console.log(`Motivos de error: ${errorsPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  });
}
export { norm, tokens, overlap, candidateScore, selectCandidate, videoUrl, cli, serialize, main, makeQueries };
