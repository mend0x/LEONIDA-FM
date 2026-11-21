export interface SectorOptions {
  deadZone?: number;
  outerLimit?: number;
  hysteresis?: number;
}
export function normalizeAngle(angle: number): number;
export function angularDistance(left: number, right: number): number;
export function stepIndex(current: number, direction: number, count: number): number;
export function sectorAtVector(
  x: number,
  y: number,
  count: number,
  previous?: number,
  options?: SectorOptions,
): number | null;
export function dialPoint(angle: number, radius: number, center?: number): { x: number; y: number };
export function sectorPath(
  index: number,
  count: number,
  innerRadius: number,
  outerRadius: number,
): string;
