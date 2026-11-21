/**
 * LEONIDA FM: importador por URL directa de descargas autorizadas.
 * No busca, descarga ni extrae música de reproductores protegidos.
 * No necesita dependencias externas: Node.js >= 22.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const audioExtensions = new Set(['.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wav']);
const maxBytes = 100 * 1024 * 1024;

function readCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (char === ';' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (quoted) throw new Error('CSV inválido: comillas sin cerrar');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  if (!headers) throw new Error('CSV vacío');
  return values.map((cols, index) => {
    if (cols.length !== headers.length)
      throw new Error(`CSV fila ${index + 2}: columnas desiguales`);
    return Object.fromEntries(headers.map((h, i) => [h, cols[i]]));
  });
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[;\n\r"]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}
function writeCsv(rows, columns) {
  return (
    '\uFEFF' +
    [
      columns.join(';'),
      ...rows.map((row) => columns.map((key) => csvEscape(row[key])).join(';')),
    ].join('\r\n') +
    '\r\n'
  );
}
function safeBase(value) {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/[. ]+$/g, '')
    .slice(0, 170)
    .trim();
}
function detectFormat(buffer) {
  if (buffer.length < 4) return null;
  if (buffer.subarray(0, 3).toString('ascii') === 'ID3') return '.mp3';
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0 && (buffer[1] & 0x06) !== 0) {
    return (buffer[1] & 0x16) === 0x10 ? '.aac' : '.mp3';
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'fLaC') return '.flac';
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') return '.ogg';
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WAVE'
  )
    return '.wav';
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') return '.m4a';
  return null;
}
async function existingFile(dir, base) {
  const entries = await readdir(dir).catch((error) =>
    error.code === 'ENOENT' ? [] : Promise.reject(error),
  );
  const found = entries.find(
    (name) =>
      audioExtensions.has(extname(name).toLowerCase()) &&
      basename(name, extname(name)).toLowerCase() === base.toLowerCase(),
  );
  return found ?? null;
}
async function fetchAudio(url, part, { allowHttp }) {
  const initial = new URL(url);
  if (initial.protocol !== 'https:' && !(allowHttp && initial.protocol === 'http:'))
    throw new Error('Solo se permiten URLs HTTPS directas');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const res = await fetch(initial, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'LEONIDA-FM-LocalImporter/1.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (
      new URL(res.url).protocol !== 'https:' &&
      !(allowHttp && new URL(res.url).protocol === 'http:')
    )
      throw new Error('Redirección a protocolo no seguro');
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (/text\/html|application\/json|text\/plain|application\/xml/.test(type))
      throw new Error('La URL devuelve una página, no un archivo de audio');
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > maxBytes) throw new Error('Archivo demasiado grande (>100 MB)');
    if (!res.body) throw new Error('Respuesta sin datos');
    let received = 0;
    const checkSize = new Transform({
      transform(chunk, enc, callback) {
        received += chunk.length;
        if (received > maxBytes) callback(new Error('Archivo demasiado grande (>100 MB)'));
        else callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body), checkSize, createWriteStream(part, { flags: 'wx' }));
    if (received < 1024) throw new Error('Archivo demasiado pequeño para ser una canción');
    const handle = await open(part, 'r');
    const bytes = Buffer.alloc(32);
    try {
      await handle.read(bytes, 0, bytes.length, 0);
    } finally {
      await handle.close();
    }
    const extension = detectFormat(bytes);
    if (!extension) throw new Error('El archivo no parece MP3, M4A, FLAC, WAV, OGG o AAC');
    return { extension, bytes: received };
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(args) {
  const opts = { check: false, allowHttp: false, only: null, limit: Infinity };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--check') opts.check = true;
    else if (arg === '--allow-http') opts.allowHttp = true;
    else if (arg === '--only-folder') opts.only = args[++i];
    else if (arg === '--limit') opts.limit = Number(args[++i]);
    else throw new Error(`Parámetro desconocido: ${arg}`);
  }
  if (!Number.isInteger(opts.limit) && opts.limit !== Infinity) throw new Error('Límite inválido');
  if (opts.limit < 0) throw new Error('Límite inválido');
  if (opts.only && !/^[a-z0-9-]+$/.test(opts.only)) throw new Error('Carpeta inválida');
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const manifest = join(root, 'canciones', 'FUENTES-DESCARGA.csv');
  const rows = readCsv(await readFile(manifest, 'utf8'));
  const report = [];
  let attempted = 0;
  for (const [index, row] of rows.entries()) {
    const slug = row.Carpeta?.trim();
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error(`Fila ${index + 2}: carpeta inválida`);
    if (opts.only && opts.only !== slug) continue;
    const base = safeBase(
      (row.ArchivoEsperado ?? '').replace(/\.(mp3|m4a|aac|flac|ogg|opus|wav)$/i, ''),
    );
    if (!base || base === '.' || base === '..')
      throw new Error(`Fila ${index + 2}: nombre de archivo inválido`);
    const dir = join(root, 'canciones', slug);
    await mkdir(dir, { recursive: true });
    const result = {
      Emisora: row.Emisora,
      Artista: row.Artista,
      Cancion: row.Cancion,
      Carpeta: slug,
      Estado: '',
      Detalle: '',
    };
    const found = await existingFile(dir, base);
    if (found) {
      result.Estado = 'YA_EXISTE';
      result.Detalle = found;
    } else if (!row.URL_Directa?.trim()) result.Estado = 'SIN_ENLACE';
    else if (row.Descarga_autorizada?.trim().toUpperCase() !== 'SI')
      result.Estado = 'FALTA_AUTORIZACION';
    else if (opts.check) result.Estado = 'LISTO_PARA_DESCARGAR';
    else if (attempted >= opts.limit) result.Estado = 'FUERA_DEL_LIMITE';
    else {
      attempted++;
      const temp = join(dir, `.${randomUUID()}.part`);
      let lastError;
      for (let tryNumber = 1; tryNumber <= 3; tryNumber++) {
        try {
          const item = await fetchAudio(row.URL_Directa.trim(), temp, opts);
          const target = join(dir, base + item.extension);
          await rename(temp, target);
          result.Estado = 'DESCARGADA';
          result.Detalle = `${basename(target)} (${(item.bytes / 1048576).toFixed(1)} MB)`;
          break;
        } catch (error) {
          lastError = error;
          await rm(temp, { force: true });
          if (
            tryNumber < 3 &&
            /HTTP 429|HTTP 5\d\d|fetch failed|terminated|timeout/i.test(error.message ?? '')
          )
            await new Promise((done) => setTimeout(done, tryNumber * 1500));
          else break;
        }
      }
      if (!result.Estado) {
        result.Estado = 'ERROR';
        result.Detalle = lastError?.message ?? 'Error desconocido';
      }
    }
    report.push(result);
    if (result.Estado === 'DESCARGADA' || result.Estado === 'ERROR')
      console.log(`${result.Estado}: ${row.Artista} - ${row.Cancion} → ${slug} ${result.Detalle}`);
  }
  const reportPath = join(root, 'canciones', 'ESTADO-DESCARGAS.csv');
  await writeFile(
    reportPath,
    writeCsv(report, ['Emisora', 'Artista', 'Cancion', 'Carpeta', 'Estado', 'Detalle']),
    'utf8',
  );
  const tally = Object.create(null);
  for (const result of report) tally[result.Estado] = (tally[result.Estado] ?? 0) + 1;
  console.log(`\nLEONIDA FM — ${report.length} referencias revisadas`);
  for (const [key, value] of Object.entries(tally)) console.log(`  ${key}: ${value}`);
  console.log(`Informe: ${reportPath}`);
  if (report.some((item) => item.Estado === 'ERROR')) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error('ERROR:', error.message);
    process.exitCode = 1;
  });
}

export { readCsv, safeBase, detectFormat, parseArgs };
