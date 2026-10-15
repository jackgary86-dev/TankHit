import { describe, expect, it } from 'vitest';
import { plate } from '../src/data/builder';
import { roundById } from '../src/data/rounds';
import { fuzeArms, losThickness, penetrationAt, shatterChance } from '../src/sim/penetration';
import { v3 } from '../src/sim/vec';

/**
 * Published / widely quoted penetration figures (mm RHA at 0°). Sources disagree by 10–20 %, so each entry
 * carries its own tolerance band. The model must stay inside these as it is tuned.
 */
const REFERENCE: [string, number, number, number][] = [
  // id, distance m, low, high
  ['m829a1', 2000, 500, 620],
  ['dm53', 2000, 600, 720],
  ['3bm42', 2000, 440, 540],
  ['m833', 2000, 380, 460],
  ['3bm15', 2000, 380, 470],
  ['br365k', 100, 125, 150],
  ['br365k', 1000, 100, 130],
  ['pzgr39', 100, 190, 235],
  ['pzgr39', 1000, 160, 200],
  ['br471', 100, 160, 200],
  ['m72', 500, 60, 85],
  ['m82', 500, 130, 165],
  ['m456a2', 1000, 380, 420],
  ['m830', 1000, 440, 500],
  ['3bk14m', 1000, 450, 520],
];

describe('reference penetration table', () => {
  it.each(REFERENCE)('%s at %d m is within [%d, %d] mm', (id, d, lo, hi) => {
    const p = penetrationAt(roundById(id), d);
    expect(p).toBeGreaterThanOrEqual(lo);
    expect(p).toBeLessThanOrEqual(hi);
  });
});

const flat = (mm: number) => plate('p', 'test', 'hull', [v3(0, 0, -1), v3(0, 0, 1), v3(0, 1, 1), v3(0, 1, -1)], mm, v3(-1, 0.5, 0));

describe('fidelity details', () => {
  it('long rods pay less than full LOS on sloped plates', () => {
    const rod = roundById('m829a1');
    const ap = roundById('br365k');
    // 100 mm at 60°: geometric LOS is 200 mm.
    expect(losThickness(flat(100), 60, rod)).toBeLessThan(180);
    expect(losThickness(flat(100), 60, rod)).toBeGreaterThan(150);
    expect(losThickness(flat(100), 60, ap)).toBeGreaterThan(losThickness(flat(100), 60, rod));
  });

  it('only uncapped full-calibre AP can shatter, and only on thick plates at speed', () => {
    const m72 = roundById('m72');
    expect(shatterChance(m72, 600, 80)).toBe(0); // slow
    expect(shatterChance(m72, 900, 40)).toBe(0); // thin plate
    expect(shatterChance(m72, 900, 80)).toBeGreaterThan(0.2);
    expect(shatterChance(roundById('m82'), 900, 100)).toBe(0); // capped
    expect(shatterChance(roundById('m829a1'), 1500, 300)).toBe(0); // long rod
  });

  it('thin skirts do not arm an APHE fuze', () => {
    const r = roundById('br365k');
    expect(fuzeArms(r, 8)).toBe(false);
    expect(fuzeArms(r, 20)).toBe(true);
  });
});
