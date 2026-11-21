import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  angularDistance,
  dialPoint,
  normalizeAngle,
  sectorAtVector,
  sectorPath,
  stepIndex,
} from '../web/wheel-geometry.mjs';

const turn = Math.PI * 2;
const deg = (degrees) => (degrees * Math.PI) / 180;
function sectorAtDegrees(angle, count, previous = -1, options) {
  return sectorAtVector(
    0.8 * Math.sin(deg(angle)),
    -0.8 * Math.cos(deg(angle)),
    count,
    previous,
    options,
  );
}

describe('wheel geometry', () => {
  it('uses 12 o’clock as index zero and increases in a clockwise direction', () => {
    for (const count of [1, 2, 3, 6, 9, 17, 60]) {
      for (let i = 0; i < count; i++) assert.equal(sectorAtDegrees((360 * i) / count, count), i);
    }
    assert.equal(sectorAtVector(1, 0, 4), 1);
    assert.equal(sectorAtVector(0, 1, 4), 2);
    assert.equal(sectorAtVector(-1, 0, 4), 3);
  });
  it('normalizes across the 0/360 seam and handles several revolutions', () => {
    assert.ok(Math.abs(normalizeAngle((-7 * Math.PI) / 2) - Math.PI / 2) < 1e-12);
    assert.ok(Math.abs(angularDistance(deg(358), deg(2)) - deg(4)) < 1e-12);
    assert.ok(angularDistance(normalizeAngle(turn * 13), 0) < 1e-12);
    assert.equal(sectorAtDegrees(-359, 6), 0);
    assert.equal(sectorAtDegrees(721, 6), 0);
  });
  it('holds a previous choice inside the hysteresis band on either side and across the seam', () => {
    assert.equal(sectorAtDegrees(32, 6, 0), 0);
    assert.equal(sectorAtDegrees(36, 6, 0), 1);
    assert.equal(sectorAtDegrees(28, 6, 1), 1);
    assert.equal(sectorAtDegrees(24, 6, 1), 0);
    assert.equal(sectorAtDegrees(329, 6, 0), 0);
    assert.equal(sectorAtDegrees(324, 6, 0), 5);
    assert.equal(sectorAtDegrees(32, 6, -1), 1);
  });
  it('rejects the hub and outside the interaction ring, including pointer cancellations near the edge', () => {
    for (const point of [
      [0, 0],
      [0, 0.46],
      [1.1, 0],
      [Infinity, 0],
      [NaN, 1],
    ]) {
      assert.equal(sectorAtVector(...point, 6, 3), null);
    }
    assert.equal(sectorAtVector(0.8, 0, 0), null);
    assert.equal(sectorAtVector(0.8, 0, 0.5), null);
    assert.equal(sectorAtVector(0.8, 0, -10), null);
  });
  it('accepts an analog stick with a separate dead zone and square-axis magnitude', () => {
    const options = { deadZone: 0.32, outerLimit: 1.5 };
    assert.equal(sectorAtVector(0.2, -0.15, 4, 2, options), null);
    assert.equal(sectorAtVector(1, 1, 8, -1, options), 3);
    assert.equal(sectorAtVector(0, -0.35, 4, -1, options), 0);
  });
  it('wraps arrows and D-pad indexes on both ends, including one or zero stations', () => {
    assert.equal(stepIndex(5, 1, 6), 0);
    assert.equal(stepIndex(0, -1, 6), 5);
    assert.equal(stepIndex(0, -13, 6), 5);
    assert.equal(stepIndex(0, 1, 1), 0);
    assert.equal(stepIndex(0, 1, 0), -1);
  });
  it('draws closed annular arcs in the same coordinate system as hit-testing', () => {
    assert.deepEqual(dialPoint(0, 50), { x: 220, y: 170 });
    assert.deepEqual(dialPoint(Math.PI / 2, 50), { x: 270, y: 220 });
    for (const count of [1, 2, 6, 15]) {
      for (let i = 0; i < count; i++) {
        const path = sectorPath(i, count, 101, 205);
        assert.match(path, /^M .* A 205 205 0 [01] 1 .* L .* A 101 101 0 [01] 0 .* Z$/);
        assert.doesNotMatch(path, /NaN|Infinity/);
        const label = dialPoint((turn * i) / count, 153);
        assert.equal(sectorAtVector((label.x - 220) / 220, (label.y - 220) / 220, count), i);
      }
    }
  });
});
