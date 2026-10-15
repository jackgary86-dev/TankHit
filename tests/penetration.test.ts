import { describe, expect, it } from 'vitest';
import { plate } from '../src/data/builder';
import { roundById } from '../src/data/rounds';
import { losThickness, penetrationAt, plateEquivalent, ricochetChance } from '../src/sim/penetration';
import { v3 } from '../src/sim/vec';

const flat = (mm: number, layers?: { mat: any; mm: number }[]) =>
  plate('p', 'test', 'hull', [v3(0, 0, -1), v3(0, 0, 1), v3(0, 1, 1), v3(0, 1, -1)], layers ? { mm, layers } : mm, v3(-1, 0.5, 0));

describe('kinetic penetration', () => {
  it('M829A1 is in the 540-650 mm range up close', () => {
    const p = penetrationAt(roundById('m829a1'), 10);
    expect(p).toBeGreaterThan(540);
    expect(p).toBeLessThan(650);
  });

  it('BR-365K is around 140 mm at 100 m', () => {
    const p = penetrationAt(roundById('br365k'), 100);
    expect(p).toBeGreaterThan(125);
    expect(p).toBeLessThan(155);
  });

  it('penetration falls with distance for kinetic rounds', () => {
    for (const id of ['m829a1', 'br365k', 'm72']) {
      const r = roundById(id);
      expect(penetrationAt(r, 2000)).toBeLessThan(penetrationAt(r, 0));
    }
  });

  it('HEAT penetration ignores distance', () => {
    const r = roundById('m456a2');
    expect(penetrationAt(r, 2500)).toBe(penetrationAt(r, 0));
    expect(penetrationAt(r, 0)).toBeCloseTo(400, 0);
  });

  it('DU outperforms an otherwise identical tungsten rod', () => {
    const du = roundById('m829a1');
    const w = { ...du, penMaterial: 'tungsten' as const };
    expect(penetrationAt(du, 0)).toBeGreaterThan(penetrationAt(w, 0));
  });
});

describe('armor geometry', () => {
  it('LOS thickness grows with angle (1/cos) for full-calibre shot', () => {
    const r = roundById('m82');
    const p = flat(100);
    expect(losThickness(p, 0, r)).toBeCloseTo(100, 5);
    // 6 degrees of normalization on a capped round: 100 / cos(54) ~= 170.
    expect(losThickness(p, 60, r)).toBeGreaterThan(165);
    expect(losThickness(p, 60, r)).toBeLessThan(175);
  });

  it('full-calibre AP normalizes more than APFSDS', () => {
    expect(losThickness(flat(100), 60, roundById('m72'))).toBeLessThan(losThickness(flat(100), 60, roundById('m829a1')));
  });

  it('composite protects more against HEAT than KE', () => {
    const p = flat(0, [{ mat: 'rha', mm: 50 }, { mat: 'nera', mm: 300 }, { mat: 'ceramic', mm: 100 }]);
    expect(plateEquivalent(p, false)).toBeGreaterThan(plateEquivalent(p, true));
  });

  it('ricochet chance rises at grazing angles and is zero head-on', () => {
    const r = roundById('m829a1');
    expect(ricochetChance(r, 30, 50)).toBe(0);
    expect(ricochetChance(r, 80, 50)).toBeGreaterThan(0);
    expect(ricochetChance(r, 88, 50)).toBe(1);
  });

  it('overmatch prevents ricochet on thin plates', () => {
    expect(ricochetChance(roundById('m829a1'), 82, 20)).toBe(0);
  });
});
