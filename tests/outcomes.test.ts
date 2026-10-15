import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { v3, type Vec3 } from '../src/sim/vec';

/**
 * Outcome-rate table. Penetration numbers are checked elsewhere; this pins what happens *after* a hit against
 * documented tendencies (bands are deliberately wide – sources are anecdotal and the model is simplified):
 *  - T-34-85: dry floor racks under the fighting compartment; brew-ups common on side hits but not inevitable.
 *  - M4A3 (76) W: wet stowage cut Sherman brew-ups from ~60-80 % to ~10-15 % (US Army Ordnance, 1944-45).
 *  - T-72B: carousel under the crew; near-certain catastrophic loss when it is hit (Grozny 1995, Iraq 1991/2003).
 *  - M1 Abrams: bustle with blast doors and blow-out panels; crew survive bustle hits (Iraq 2003 incidents).
 *  - Tiger I: 92 rounds in hull sponsons; sponson hits light the ammunition, detonations less common than fires.
 */
const run = (vid: string, rid: string, o: Vec3, d: Vec3, n = 40, dist = 300) =>
  Array.from({ length: n }, (_, i) => {
    const v = vehicleById(vid);
    return simulateShot(v, roundById(rid), { vehicleId: vid, roundId: rid, distance: dist, origin: o, dir: d, seed: i + 1 }, initialState(v));
  });
const rate = (xs: ReturnType<typeof run>, pred: (x: (typeof xs)[number]) => boolean) => xs.filter(pred).length / xs.length;
const cooked = (x: ReturnType<typeof run>[number]) => x.summary.cookOff !== 'none';
const det = (x: ReturnType<typeof run>[number]) => x.summary.cookOff === 'detonation';

describe('outcome rates', () => {
  it('T-34-85 side hit at crew height: cook-off likely, detonation uncommon', () => {
    const xs = run('t34-85', 'm82', v3(0.2, 0.95, 6), v3(0, 0, -1));
    expect(rate(xs, cooked)).toBeGreaterThan(0.35);
    expect(rate(xs, cooked)).toBeLessThan(0.85);
    expect(rate(xs, det)).toBeLessThan(0.4);
  });

  it('T-34-85 direct hit on the floor rack: almost always brews up', () => {
    const xs = run('t34-85', 'm82', v3(0.2, 0.58, 6), v3(0, 0, -1));
    expect(rate(xs, cooked)).toBeGreaterThan(0.8);
  });

  it('Sherman wet stowage: fires possible, detonations rare', () => {
    const xs = run('m4a3', 'm82', v3(-0.1, 0.6, 6), v3(0, 0, -1));
    expect(rate(xs, det)).toBeLessThan(0.2);
    expect(rate(xs, cooked)).toBeLessThan(0.6);
  });

  it('T-72B carousel hit: usually catastrophic', () => {
    const xs = run('t72b', 'm829a1', v3(0.35, 0.62, 6), v3(0, 0, -1));
    expect(rate(xs, det)).toBeGreaterThan(0.6);
  });

  it('Abrams bustle hit: vents, never detonates, crew survive', () => {
    const xs = run('m1', 'm829a1', v3(-1.75, 1.76, 6), v3(0, 0, -1));
    expect(rate(xs, det)).toBe(0);
    expect(rate(xs, (x) => x.summary.cookOff === 'blowout')).toBeGreaterThan(0.5);
    expect(rate(xs, (x) => x.summary.verdict === 'Catastrophic (cook-off)')).toBe(0);
  });

  it('Tiger I sponson hit: ammunition lights, detonation is the minority outcome', () => {
    const xs = run('tiger1', 'm82', v3(-0.5, 1.12, 6), v3(0, 0, -1));
    expect(rate(xs, cooked)).toBeGreaterThan(0.6);
    expect(rate(xs, det)).toBeGreaterThan(0.1);
    expect(rate(xs, det)).toBeLessThan(0.6);
  });
});
