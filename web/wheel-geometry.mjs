const TURN = Math.PI * 2;

export function normalizeAngle(angle) {
  return ((angle % TURN) + TURN) % TURN;
}

export function angularDistance(left, right) {
  return Math.abs(normalizeAngle(left - right + Math.PI) - Math.PI);
}

export function stepIndex(current, direction, count) {
  if (!Number.isInteger(count) || count < 1) return -1;
  return (((current + direction) % count) + count) % count;
}

/** Clockwise from twelve o'clock. Inputs are expressed as fractions of the dial radius. */
export function sectorAtVector(x, y, count, previous = -1, options = {}) {
  const { deadZone = 0.46, outerLimit = 1, hysteresis = Math.PI / 42 } = options;
  if (!Number.isInteger(count) || count < 1 || !Number.isFinite(x) || !Number.isFinite(y))
    return null;
  const radius = Math.hypot(x, y);
  if (radius <= deadZone || radius > outerLimit) return null;

  const step = TURN / count;
  const angle = normalizeAngle(Math.atan2(x, -y));
  if (Number.isInteger(previous) && previous >= 0 && previous < count) {
    const margin = Math.min(Math.max(hysteresis, 0), step * 0.2);
    if (angularDistance(angle, previous * step) <= step / 2 + margin) return previous;
  }
  return Math.floor(normalizeAngle(angle + step / 2) / step) % count;
}

export function dialPoint(angle, radius, center = 220) {
  return { x: center + Math.sin(angle) * radius, y: center - Math.cos(angle) * radius };
}

/** One closed, gapped ring sector. Leaving a small gap also handles a one-station dial. */
export function sectorPath(index, count, innerRadius, outerRadius) {
  const step = TURN / count;
  const gap = Math.min(0.021, step * 0.08);
  const start = index * step - step / 2 + gap;
  const end = index * step + step / 2 - gap;
  const points = [
    dialPoint(start, outerRadius),
    dialPoint(end, outerRadius),
    dialPoint(end, innerRadius),
    dialPoint(start, innerRadius),
  ];
  const [a, b, c, d] = points.map(({ x, y }) => `${x.toFixed(3)} ${y.toFixed(3)}`);
  const large = end - start > Math.PI ? 1 : 0;
  return `M ${a} A ${outerRadius} ${outerRadius} 0 ${large} 1 ${b} L ${c} A ${innerRadius} ${innerRadius} 0 ${large} 0 ${d} Z`;
}
