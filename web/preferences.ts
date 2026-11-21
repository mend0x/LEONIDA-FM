import type { Preferences } from './types';
export const STORAGE_KEY = 'leonida.fm.preferences.v1';
export const defaults: Preferences = {
  language: 'en',
  slug: 'flash-fm',
  volume: 0.65,
  muted: false,
  mode: 'demo',
  musicMode: 'radio',
  quality: 'auto',
  favorites: [],
  recent: [],
  motion: 'system',
  visualizer: 'reactive',
  compact: false,
  showExpanded: false,
  sounds: true,
  confirmOnRelease: false,
  selector: 'dial',
  notices: false,
  gamepadConfirm: 0,
  gamepadCancel: 1,
};
function list(value: unknown) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((x): x is string => typeof x === 'string' && /^[a-z0-9-]{1,64}$/.test(x)),
        ),
      ].slice(0, 100)
    : [];
}
export function normalizePreferences(raw: unknown): Preferences {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const p = { ...defaults };
  const bools = [
    'muted',
    'compact',
    'showExpanded',
    'sounds',
    'confirmOnRelease',
    'notices',
  ] as const;
  for (const key of bools) if (typeof s[key] === 'boolean') p[key] = s[key];
  if (typeof s.slug === 'string' && /^[a-z0-9-]{1,64}$/.test(s.slug)) p.slug = s.slug;
  if (typeof s.volume === 'number' && Number.isFinite(s.volume))
    p.volume = Math.min(1, Math.max(0, s.volume));
  if (s.mode === 'live') p.mode = 'live';
  if (s.musicMode === 'soundtrack') p.musicMode = 'soundtrack';
  if (s.quality === 'lowest' || s.quality === 'highest') p.quality = s.quality;
  if (s.language === 'es') p.language = 'es';
  if (s.motion === 'reduce') p.motion = 'reduce';
  if (s.visualizer === 'ambient' || s.visualizer === 'off') p.visualizer = s.visualizer;
  if (s.selector === 'wheel') p.selector = 'wheel';
  for (const key of ['gamepadConfirm', 'gamepadCancel'] as const)
    if (typeof s[key] === 'number' && Number.isInteger(s[key]) && s[key] >= 0 && s[key] <= 15)
      p[key] = s[key];
  p.favorites = list(s.favorites);
  p.recent = list(s.recent).slice(0, 8);
  return p;
}
export function readPreferences(): Preferences {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return { ...defaults };
  }
}
export function savePreferences(p: Preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* Listening remains available when storage is disabled. */
  }
}
export function adjacent<T>(list: T[], index: number, delta: number) {
  return list[(((index + delta) % list.length) + list.length) % list.length];
}
export function markFavorite(list: string[], slug: string) {
  return list.includes(slug) ? list.filter((x) => x !== slug) : [...list, slug];
}
