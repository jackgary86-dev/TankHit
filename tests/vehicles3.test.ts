import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { VEHICLES, vehicleById } from '../src/data/vehicles';
import { GUN_ROUND } from '../src/modes/duel';
import { simulateShot } from '../src/sim/shot';
import { penetrationAt } from '../src/sim/penetration';
import { initialState } from '../src/sim/state';
import { norm, v3, type Vec3 } from '../src/sim/vec';

const shoot = (vid: string, rid: string, origin: Vec3, dir: Vec3, seed = 1, distance = 500) => {
  const v = vehicleById(vid);
  const r = roundById(rid);
  return simulateShot(v, r, { vehicleId: vid, roundId: rid, distance, origin, dir: norm(dir), seed }, initialState(v));
};
const many = (n: number, f: (seed: number) => ReturnType<typeof shoot>) => Array.from({ length: n }, (_, i) => f(i + 1));

describe('new vehicles', () => {
  it('all eleven are registered with a gun round', () => {
    expect(VEHICLES.length).toBe(11);
    for (const v of VEHICLES) expect(() => roundById(GUN_ROUND[v.id])).not.toThrow();
  });

  it('Panther: glacis stops 75 mm M72 at 500 m but 85 mm APHE gets through up close', () => {
    expect(shoot('panther', 'm72', v3(10, 1.3, 0.0), v3(-1, 0, 0), 1, 500).summary.penetrated).toBe(false);
    expect(shoot('panther', 'br365k', v3(10, 1.3, 0.0), v3(-1, 0, 0), 1, 100).summary.penetrated).toBe(true);
    // The thin side is the Panther's weakness.
    expect(shoot('panther', 'm72', v3(0.5, 1.2, 6), v3(0, 0, -1), 1, 500).summary.penetrated).toBe(true);
  });

  it('T-55: 90 mm APC cannot beat the 60-degree glacis, a long rod can; the front rack is a weak spot', () => {
    expect(shoot('t55', 'm82', v3(10, 1.05, 0.0), v3(-1, 0, 0), 1, 500).summary.penetrated).toBe(false);
    expect(shoot('t55', 'm829a1', v3(10, 1.05, 0.0), v3(-1, 0, 0), 1, 500).summary.penetrated).toBe(true);
    const shots = many(30, (s) => shoot('t55', 'm829a1', v3(10, 0.95, -0.6), v3(-1, -0.02, 0), s, 500));
    expect(shots.filter((x) => x.summary.cookOff !== 'none').length).toBeGreaterThan(8);
  });

  it('M48: cast turret front holds 85 mm APHE; ready rack hits cook off', () => {
    expect(shoot('m48', 'br365k', v3(10, 1.85, 0.85), v3(-1, 0, 0), 1, 500).summary.penetrated).toBe(false);
    const shots = many(30, (s) => shoot('m48', '3bm42', v3(0.4, 1.55, 6), v3(0, 0, -1), s, 500));
    expect(shots.filter((x) => x.summary.cookOff !== 'none').length).toBeGreaterThan(5);
  });

  it('Challenger 1: Chobham front stops Soviet 125 mm; wet charge bins rarely detonate', () => {
    expect(shoot('chally1', '3bm42', v3(10, 1.9, 0.6), v3(-1, 0, 0), 1, 1000).summary.penetrated).toBe(false);
    expect(shoot('chally1', '3bk14m', v3(10, 1.9, 0.6), v3(-1, 0, 0), 1, 1000).summary.penetrated).toBe(false);
    const shots = many(30, (s) => shoot('chally1', 'm829a1', v3(-0.3, 0.7, 6), v3(0, 0, -1), s, 500));
    expect(shots.filter((x) => x.summary.cookOff === 'detonation').length / shots.length).toBeLessThan(0.2);
  });

  it('new rounds have sensible penetration', () => {
    expect(penetrationAt(roundById('pzgr39_42'), 100)).toBeGreaterThan(130);
    expect(penetrationAt(roundById('pzgr39_42'), 100)).toBeLessThan(175);
    expect(penetrationAt(roundById('br412d'), 100)).toBeGreaterThan(170);
    expect(penetrationAt(roundById('m431'), 0)).toBeGreaterThan(300);
    expect(penetrationAt(roundById('l23'), 2000)).toBeGreaterThan(400);
  });
});
