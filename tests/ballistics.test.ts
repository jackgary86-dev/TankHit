import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { dispersionMils, heightAt, integrateArc, rangeTickMils, solveArc } from '../src/sim/ballistics';

describe('ballistics', () => {
  it('a solved arc lands at the requested range', () => {
    for (const [id, range] of [['m829a1', 2000], ['br365k', 1000], ['of471', 1500], ['m456a2', 800]] as const) {
      const r = roundById(id);
      const sol = solveArc(r, range);
      const arc = integrateArc(r, sol.elevation, range + 50);
      expect(Math.abs(heightAt(arc, range)!)).toBeLessThan(0.3);
      expect(sol.elevation).toBeGreaterThan(0);
      expect(sol.descent).toBeGreaterThan(0);
    }
  });

  it('time of flight and drop scale with velocity', () => {
    const fast = solveArc(roundById('m829a1'), 1500);
    const slow = solveArc(roundById('br365k'), 1500);
    expect(fast.timeOfFlight).toBeLessThan(1.3);
    expect(slow.timeOfFlight).toBeGreaterThan(1.9);
    expect(slow.elevation).toBeGreaterThan(fast.elevation * 2);
    expect(slow.descent).toBeGreaterThan(fast.descent);
  });

  it('impact velocity matches the penetration model drop-off', () => {
    const r = roundById('br365k');
    const sol = solveArc(r, 1000);
    // velocityAt uses exp(-drag * distance); the arc should agree within a few percent.
    expect(sol.impactVelocity / (r.velocity * Math.exp(-r.drag * 1000))).toBeCloseTo(1, 1);
  });

  it('range ticks: farther ranges need positive lead, nearer negative', () => {
    const r = roundById('m456a2');
    expect(rangeTickMils(r, 1000, 2000)).toBeGreaterThan(0);
    expect(rangeTickMils(r, 1000, 500)).toBeLessThan(0);
  });

  it('long rods disperse less than HE', () => {
    expect(dispersionMils(roundById('m829a1'))).toBeLessThan(dispersionMils(roundById('of471')));
  });
});

describe('range estimation error', () => {
  it('is seeded, small and clamped', async () => {
    const { estimatedRangeError } = await import('../src/sim/ballistics');
    const errs = Array.from({ length: 500 }, (_, i) => estimatedRangeError(i * 7919 + 13));
    expect(estimatedRangeError(42)).toBe(estimatedRangeError(42));
    for (const e of errs) expect(Math.abs(e)).toBeLessThanOrEqual(0.07);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(errs.some((e) => Math.abs(e) > 0.02)).toBe(true);
  });
});
