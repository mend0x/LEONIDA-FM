export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const bad = (message) => {
  throw new HttpError(400, 'invalid_input', message);
};
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const refIdPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
const confidenceValues = new Set(['OFFICIAL', 'REPORTED', 'UNVERIFIED', 'COMMUNITY']);

export function validSlug(slug) {
  return (
    typeof slug === 'string' &&
    slug.length <= 64 &&
    slugPattern.test(slug) &&
    !['constructor', 'prototype'].includes(slug)
  );
}
function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    bad(label + ' must be an object.');
  return value;
}
function bounded(value, label, max = 240) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character === '<' || character === '>',
    )
  )
    bad('Invalid ' + label + '.');
  return value.trim();
}
function list(value, label, max = 150) {
  if (!Array.isArray(value) || value.length > max) bad('Invalid ' + label + ' list.');
  return value;
}
function distinct(items, label) {
  if (new Set(items).size !== items.length) bad('Duplicate ' + label + '.');
  return items;
}
function confidence(value) {
  if (!confidenceValues.has(value)) bad('Unknown evidence classification.');
  return value;
}
function refIds(items) {
  return distinct(
    list(items ?? [], 'evidence', 40).map((id) => {
      if (typeof id !== 'string' || !refIdPattern.test(id)) bad('Invalid reference id.');
      return id;
    }),
    'reference id',
  );
}
function httpsLink(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    bad('A valid HTTPS URL is required.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.href.length > 1400 ||
    !isPublicHostname(url.hostname)
  )
    bad('A public HTTPS URL is required.');
  return url;
}
function isPublicHostname(hostname) {
  if (hostname.length > 253 || !hostname.includes('.') || hostname.endsWith('.')) return false;
  if (
    hostname.includes(':') ||
    hostname.includes('[') ||
    hostname.includes(']') ||
    /^\d+(?:\.\d+)*$/.test(hostname)
  )
    return false;
  return !/(^|\.)(?:localhost|local|internal|invalid|test|onion|home\.arpa)$/.test(hostname);
}
function mediaUrl(path, station, streamHosts) {
  if (path === '/stream/' + station) return path;
  const url = httpsLink(path);
  if (url.port || !streamHosts.has(url.hostname) || url.hash || url.search)
    bad('Stream host or path is outside the configured media policy.');
  return url.href;
}
function imagePath(path) {
  if (typeof path !== 'string') bad('Invalid station artwork.');
  if (/^\/art\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:webp|avif|png|jpe?g)$/.test(path)) return path;
  // Official Rockstar media may be hotlinked, without accepting arbitrary hosts.
  const url = httpsLink(path);
  if (
    url.hostname !== 'www.rockstargames.com' ||
    url.port ||
    url.hash ||
    !/^\/VI\/_next\/static\/media\/[a-zA-Z0-9_.~%-]+\.(?:png|jpe?g|webp)$/.test(url.pathname)
  )
    bad('Station artwork must come from /art/ or the official Rockstar media library.');
  return url.href;
}
function sourceList(input, slug, streamHosts) {
  const result = list(input, 'sources', 20).map((source, n) => {
    plain(source, 'source');
    const type = source.type ?? source.providerType;
    if (!['icecast', 'hls', 'youtube', 'external'].includes(type)) bad('Unsupported source type.');
    const id = bounded(source.id ?? type + '-' + n, 'source id', 80);
    if (!refIdPattern.test(id)) bad('Invalid source id.');
    const enabled = source.enabled ?? true;
    if (typeof enabled !== 'boolean') bad('Invalid source enabled flag.');
    const raw = source.url ?? source.streamUrl;
    let url;
    if (type === 'icecast' || type === 'hls') {
      url = mediaUrl(raw, slug, streamHosts);
    } else {
      const parsed = httpsLink(raw);
      if (
        type === 'youtube' &&
        !(
          ['www.youtube-nocookie.com', 'www.youtube.com'].includes(parsed.hostname) &&
          /^\/embed\/[A-Za-z0-9_-]{11}$/.test(parsed.pathname) &&
          !parsed.search &&
          !parsed.hash
        )
      )
        bad('Use an official YouTube embed URL.');
      url = parsed.href;
    }
    const rightsReference = bounded(
      source.rightsReference,
      'public rights or provider reference',
      500,
    );
    const priority = source.priority ?? n;
    if (!Number.isInteger(priority) || priority < 0 || priority > 1000)
      bad('Invalid source priority.');
    const bitrateKbps = source.bitrateKbps;
    if (bitrateKbps !== undefined && (!Number.isSafeInteger(bitrateKbps) || bitrateKbps < 1))
      bad('Source bitrateKbps must be a positive integer.');
    return {
      id,
      type,
      url,
      enabled,
      rightsReference,
      priority,
      ...(bitrateKbps === undefined ? {} : { bitrateKbps }),
    };
  });
  distinct(
    result.map((source) => source.id),
    'source id',
  );
  return result.sort((a, b) => a.priority - b.priority);
}
function programList(input) {
  const entries = list(input, 'programs', 150).map((program) => {
    plain(program, 'program');
    const id = bounded(program.id, 'program id', 100);
    if (!refIdPattern.test(id)) bad('Invalid program id.');
    if (
      typeof program.url !== 'string' ||
      !/^\/audio\/[A-Za-z0-9][A-Za-z0-9_-]*\.(mp3|m4a|ogg|opus)$/.test(program.url)
    )
      bad('Program must use a reviewed, bundled /audio/ asset.');
    if (!Number.isFinite(program.duration) || program.duration < 0.01 || program.duration > 14400)
      bad('Program duration must be expressed in seconds.');
    return {
      id,
      title: bounded(program.title, 'program title'),
      artist: bounded(program.artist, 'program artist'),
      url: program.url,
      duration: program.duration,
    };
  });
  distinct(
    entries.map((entry) => entry.id),
    'program id',
  );
  return entries;
}
function referenceList(input) {
  const entries = list(input, 'reference', 160).map((reference) => {
    plain(reference, 'reference');
    const id = refIds([reference.id])[0];
    const result = {
      id,
      name: bounded(reference.name, 'source name'),
      url: httpsLink(reference.url).href,
    };
    for (const field of [
      'verifiedAt',
      'observedAt',
      'notes',
      'type',
      'publisher',
      'kind',
      'scope',
      'scopeEs',
    ]) {
      if (reference[field]) result[field] = bounded(reference[field], field, 800);
    }
    return result;
  });
  distinct(
    entries.map((ref) => ref.id),
    'reference id',
  );
  return entries;
}
function trackList(input) {
  return list(input, 'tracks', 600).map((item) => {
    plain(item, 'track');
    const track = {
      title: bounded(item.title, 'track title'),
      artist: bounded(item.artist, 'track artist'),
      confidence: confidence(item.confidence ?? 'UNVERIFIED'),
      evidence: refIds(item.evidence),
    };
    for (const field of [
      'rightsStatus',
      'audioStatus',
      'album',
      'verifiedAt',
      'notes',
      'scope',
      'association',
      'id',
      'youtubeChannel',
      'spotifyLinkKind',
    ]) {
      if (item[field]) track[field] = bounded(item[field], field, 800);
    }
    for (const field of ['sourceUrl', 'youtubeUrl', 'spotifyUrl']) {
      if (item[field]) {
        const url = httpsLink(item[field]);
        if (
          field === 'youtubeUrl' &&
          !['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname)
        )
          bad('Invalid YouTube URL.');
        if (field === 'spotifyUrl' && url.hostname !== 'open.spotify.com')
          bad('Invalid Spotify URL.');
        track[field] = url.href;
      }
    }
    if (item.youtubeId !== undefined) {
      if (typeof item.youtubeId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(item.youtubeId))
        bad('Invalid YouTube video id.');
      track.youtubeId = item.youtubeId;
    }
    for (const field of ['year', 'duration', 'previewStartSeconds']) {
      if (item[field] !== undefined) {
        if (!Number.isFinite(item[field]) || item[field] < 0) bad('Invalid track ' + field + '.');
        track[field] = item[field];
      }
    }
    return track;
  });
}
function checkEvidence(entity, references) {
  const ids = entity.evidence ?? [];
  if (ids.some((id) => !references.has(id))) bad('A cited evidence id is missing.');
  if (
    entity.confidence === 'OFFICIAL' &&
    !ids.some((id) => {
      try {
        return /(^|\.)rockstargames\.com$/.test(new URL(references.get(id)?.url).hostname);
      } catch {
        return false;
      }
    })
  )
    bad('OFFICIAL requires a Rockstar source.');
}
export function validateEdit(input, existing, slug, catalogRefs, hosts, now, knownAssets) {
  plain(input, 'request body');
  if (!validSlug(slug)) bad('Invalid station slug.');
  const supplied = input.station ?? {};
  plain(supplied, 'station');
  if (supplied.slug !== undefined && supplied.slug !== slug) bad('Station slug cannot be changed.');
  if (!['station', 'tracks', 'sources', 'programs', 'evidence'].some((field) => field in input))
    bad('Supply at least one editable field.');
  if (
    Object.keys(input).some(
      (field) =>
        !['station', 'tracks', 'sources', 'programs', 'evidence', 'revision'].includes(field),
    )
  )
    bad('Unknown station edit field.');
  const old = existing?.station ?? {};
  const station = { ...old, slug };
  for (const field of [
    'name',
    'shortName',
    'genre',
    'genreEs',
    'description',
    'descriptionEs',
    'countryOrRegion',
  ]) {
    if (supplied[field] !== undefined)
      station[field] = bounded(
        supplied[field],
        field,
        field.startsWith('description') ? 1800 : 160,
      );
  }
  if (!station.name || !station.genre) bad('Station name and genre are required.');
  station.shortName ??= station.name;
  station.genreEs ??= station.genre;
  station.description ??= '';
  station.descriptionEs ??= station.description;
  station.id ??= slug;
  if (supplied.officialUrl !== undefined) {
    const url = httpsLink(supplied.officialUrl);
    if (!/(^|\.)rockstargames\.com$/.test(url.hostname)) bad('Expected a Rockstar publisher URL.');
    station.officialUrl = url.href;
  }
  if (supplied.frequencyMHz !== undefined) {
    if (
      supplied.frequencyMHz !== null &&
      (!Number.isFinite(supplied.frequencyMHz) || supplied.frequencyMHz <= 0)
    )
      bad('Invalid station frequency.');
    station.frequencyMHz = supplied.frequencyMHz;
  }
  station.confidence = confidence(supplied.confidence ?? old.confidence ?? 'UNVERIFIED');
  const art = supplied.art ?? old.art ?? '/art/skyline-small.webp';
  if (art) station.art = imagePath(art);
  if (supplied.color !== undefined) {
    if (typeof supplied.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(supplied.color))
      bad('Color must be six-digit hexadecimal.');
    station.color = supplied.color;
  }
  station.color ??= '#3de8e0';
  if (supplied.hosts !== undefined)
    station.hosts = list(supplied.hosts, 'hosts', 10).map((host) => bounded(host, 'host'));
  station.hosts ??= [];
  station.evidence = refIds(supplied.evidence ?? old.evidence);
  const position = supplied.order ?? existing?.position ?? 999;
  if (!Number.isInteger(position) || position < 0 || position > 99999) bad('Invalid dial order.');
  const enabled = supplied.enabled ?? existing?.enabled ?? true;
  if (typeof enabled !== 'boolean') bad('Invalid station enabled flag.');
  station.enabled = enabled;
  station.order = position;
  station.updatedAt = new Date(now).toISOString();
  const evidence =
    input.evidence === undefined ? (existing?.evidence ?? []) : referenceList(input.evidence);
  const refs = new Map(catalogRefs.map((ref) => [ref.id, ref]));
  for (const ref of evidence) {
    if (refs.has(ref.id) && refs.get(ref.id).url !== ref.url)
      bad('Existing reference id refers to another URL.');
    refs.set(ref.id, ref);
  }
  const tracks = input.tracks === undefined ? (existing?.tracks ?? []) : trackList(input.tracks);
  if (
    !existing ||
    supplied.confidence !== undefined ||
    supplied.evidence !== undefined ||
    input.evidence !== undefined
  )
    checkEvidence(station, refs);
  if (input.tracks !== undefined || input.evidence !== undefined)
    tracks.forEach((track) => checkEvidence(track, refs));
  const programs =
    input.programs === undefined ? (existing?.programs ?? []) : programList(input.programs);
  if (
    input.programs !== undefined &&
    knownAssets &&
    programs.some((program) => !knownAssets.has(program.url))
  )
    bad('Program asset is missing from the reviewed media inventory.');
  const sources =
    input.sources === undefined
      ? (existing?.sources ?? null)
      : sourceList(input.sources, slug, hosts);
  return {
    slug,
    station,
    tracks,
    programs,
    sources,
    evidence,
    position,
    enabled,
    revision: (existing?.revision ?? 0) + 1,
    updatedAt: now,
  };
}
export function checkedPage(params) {
  function number(name, fallback, min, max) {
    const raw = params.get(name);
    if (raw === null) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max)
      bad('Invalid ' + name + '.');
    return value;
  }
  return { limit: number('limit', 100, 1, 200), offset: number('offset', 0, 0, 100000) };
}
export function paginate(items, { offset, limit }) {
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit };
}
export async function readJson(request, max = 131072) {
  if (
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json'
  )
    throw new HttpError(415, 'content_type', 'Use application/json.');
  if (Number(request.headers.get('content-length')) > max)
    throw new HttpError(413, 'too_large', 'Request body is too large.');
  const reader = request.body?.getReader();
  if (!reader) bad('A JSON body is required.');
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new HttpError(413, 'too_large', 'Request body is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    bad('Invalid UTF-8 JSON body.');
  }
}
