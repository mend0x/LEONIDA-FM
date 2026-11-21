// All clients use an absolute UTC epoch. Durations are quantised to milliseconds
// once, so clients agree on segment boundaries including on a negative timestamp.
export const SCHEDULE_EPOCH = Date.UTC(2026, 0, 1);

export function scheduleAt(slug, programs, nowMs = Date.now()) {
  const list = Array.isArray(programs) ? programs : programs?.[slug];
  const entries = (list ?? [])
    .map((item) => ({ item, ms: Math.round(Number(item.duration) * 1000) }))
    .filter(({ ms }) => Number.isSafeInteger(ms) && ms > 0);
  const time = Math.floor(Number(nowMs));
  if (!entries.length || !Number.isFinite(time)) {
    return {
      slug,
      mode: 'demo',
      current: null,
      next: null,
      offset: 0,
      startedAt: null,
      endsAt: null,
      serverTime: Number.isFinite(time) ? time : null,
    };
  }
  const total = entries.reduce((sum, entry) => sum + entry.ms, 0);
  let hash = 0;
  for (const character of slug) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  const stationEpoch = SCHEDULE_EPOCH + (hash % total);
  let position = (((time - stationEpoch) % total) + total) % total;
  for (let i = 0; i < entries.length; i++) {
    const { item, ms } = entries[i];
    if (position < ms) {
      return {
        slug,
        mode: 'demo',
        current: item,
        offset: position / 1000,
        next: entries[(i + 1) % entries.length].item,
        startedAt: time - position,
        endsAt: time - position + ms,
        serverTime: time,
        cycleDuration: total / 1000,
      };
    }
    position -= ms;
  }
  throw new RangeError('Invalid schedule length');
}
