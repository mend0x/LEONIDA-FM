import { HttpError } from './validation.mjs';

const encoder = new TextEncoder();
export const sessionLifetime = 4 * 60 * 60;
const digest = async (value) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
const hex = (bytes) => Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
export const sessionDigest = async (value) => hex(await digest(value));

export async function matchesSecret(value, secret) {
  if (
    typeof value !== 'string' ||
    value.length > 512 ||
    typeof secret !== 'string' ||
    secret.length < 32 ||
    secret.length > 512
  )
    return false;
  const [a, b] = await Promise.all([digest(value), digest(secret)]);
  let delta = 0;
  for (let i = 0; i < a.length; i++) delta |= a[i] ^ b[i];
  return delta === 0;
}
export function cookieToken(request) {
  const match = /(?:^|;\s*)lfm_session=([0-9a-f]{64})(?:;|$)/.exec(
    request.headers.get('cookie') ?? '',
  );
  return match?.[1] ?? null;
}
export function sessionCookie(token, url, maxAge = sessionLifetime) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return (
    'lfm_session=' +
    token +
    '; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=' +
    maxAge +
    secure
  );
}
export async function makeSession(store, now, secret) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await store.putSession(
    await sessionDigest(token + ':' + secret),
    now + sessionLifetime * 1000,
    now,
  );
  return token;
}
export function checkMutationOrigin(request, url) {
  if (['GET', 'HEAD'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'origin_denied', 'A same-origin administrative request is required.');
  }
  if (cookieToken(request) && !origin && !request.headers.has('authorization')) {
    throw new HttpError(
      403,
      'origin_required',
      'Supply the same-origin Origin header for a session mutation.',
    );
  }
}
export async function authorized(request, store, token, now) {
  const auth = request.headers.get('authorization');
  if (auth) return auth.startsWith('Bearer ') && matchesSecret(auth.slice(7), token);
  const session = cookieToken(request);
  return Boolean(
    session && (await store.activeSession(await sessionDigest(session + ':' + token), now)),
  );
}
export function adminEnabled(store, token) {
  return Boolean(
    store.available && typeof token === 'string' && token.length >= 32 && token.length <= 512,
  );
}

// Fixed windows bound memory in each process/isolate. Only an opaque host-provided
// client key is accepted; keys expire and never enter the database or return data.
export function createLimits(clock) {
  const counters = new Map();
  let nextCleanup = 0;
  return (key, kind, max, period = 60000) => {
    const now = clock();
    if (now >= nextCleanup) {
      for (const [id, counter] of counters) if (counter.end <= now) counters.delete(id);
      nextCleanup = now + 10000;
    }
    const id = kind + ':' + key;
    let counter = counters.get(id);
    if (!counter || counter.end <= now) {
      if (counters.size >= 16000 && !counter) return false;
      counter = { count: 0, end: now + period };
      counters.set(id, counter);
    }
    counter.count++;
    return counter.count <= max;
  };
}
