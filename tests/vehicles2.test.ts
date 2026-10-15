import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { norm, v3, type Vec3 } from '../src/sim/vec';

const shoot = (vid: string, rid: string, origin: Vec3, dir: Vec3, seed = 1, distance = 500) => {
  const v = vehicleById(vid);
  const r = roundById(rid);
  return simulateShot(v, r, { vehicleId: vid, roundId: rid, distance, origin, dir: norm(dir), seed }, initialState(v));
};
const many = (n: number, f: (seed: number) => ReturnType<typeof shoot>) => Array.from({ length: n }, (_, i) => f(i + 1));

describe('Leopard 2A4', () => {
  it('turret front stops Soviet 125 mm APFSDS and HEAT', () => {
    expect(shoot('leo2a4', '3bm42', v3(10, 1.9, 0.6), v3(-1, 0, 0), 1, 1000).summary.penetrated).toBe(false);
    expect(shoot('leo2a4', '3bk14m', v3(10, 1.9, 0.6), v3(-1, 0, 0), 1, 1000).summary.penetrated).toBe(false);
  });

  it('bustle hits vent through the blow-out panels', () => {
    const shots = many(30, (s) => shoot('leo2a4', 'm829a1', v3(-1.25, 1.78, 6), v3(0, 0, -1), s));
    expect(shots.some((x) => x.summary.cookOff === 'blowout')).toBe(true);
    expect(shots.every((x) => x.summary.cookOff !== 'detonation')).toBe(true);
  });

  it('the hull rack beside the driver is not protected and can detonate', () => {
    const shots = many(30, (s) => shoot('leo2a4', '3bm42', v3(2.3, 0.8, 6), v3(0, 0, -1), s));
    expect(shots.some((x) => x.summary.cookOff === 'detonation')).toBe(true);
  });
});

describe('Tiger I', () => {
  it('85 mm APHE goes through the flat 100 mm front at 100 m but 75 mm M72 does not', () => {
    expect(shoot('tiger1', 'br365k', v3(10, 1.25, 0.0), v3(-1, 0, 0), 1, 100).summary.penetrated).toBe(true);
    expect(shoot('tiger1', 'm72', v3(10, 1.25, 0.0), v3(-1, 0, 0), 1, 100).summary.penetrated).toBe(false);
  });

  it('a side shot into the sponson bins often sets off the ammunition', () => {
    const shots = many(30, (s) => shoot('tiger1', 'm82', v3(-0.5, 1.12, 6), v3(0, 0, -1), s, 300));
    expect(shots.filter((x) => x.summary.cookOff !== 'none').length).toBeGreaterThan(10);
  });
});

describe('M4A3 (76) W', () => {
  it('63 mm glacis at 47 degrees stops 75 mm M72 but not 88 mm PzGr 39', () => {
    expect(shoot('m4a3', 'm72', v3(10, 1.3, 0.0), v3(-1, 0, 0), 1, 500).summary.penetrated).toBe(false);
    expect(shoot('m4a3', 'pzgr39', v3(10, 1.3, 0.0), v3(-1, 0, 0), 1, 500).summary.penetrated).toBe(true);
  });

  it('wet stowage makes floor-rack hits far less likely to cook off than the T-34 dry racks', () => {
    const sherman = many(40, (s) => shoot('m4a3', 'm82', v3(-0.1, 0.6, 6), v3(0, 0, -1), s, 100));
    const t34 = many(40, (s) => shoot('t34-85', 'm82', v3(0.2, 0.58, 6), v3(0, 0, -1), s, 100));
    const det = (xs: typeof sherman) => xs.filter((x) => x.summary.cookOff === 'detonation').length / xs.length;
    expect(sherman.some((x) => x.moduleHits.some((h) => h.moduleId.startsWith('wet-')))).toBe(true);
    expect(det(t34)).toBeGreaterThan(0.7);
    expect(det(sherman)).toBeLessThan(0.4);
    expect(det(sherman)).toBeLessThan(det(t34) * 0.6);
  });
});
