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

describe('M1 Abrams', () => {
  it('turret front stops M833 and M456A2 HEAT', () => {
    expect(shoot('m1', 'm833', v3(10, 1.8, 0.7), v3(-1, 0, 0)).summary.penetrated).toBe(false);
    expect(shoot('m1', 'm456a2', v3(10, 1.8, 0.7), v3(-1, 0, 0)).summary.penetrated).toBe(false);
  });

  it('a bustle hit vents through the blow-out panels instead of detonating', () => {
    const shots = Array.from({ length: 30 }, (_, i) => shoot('m1', 'm829a1', v3(-1.75, 1.76, 6), v3(0, 0, -1), i + 1));
    expect(shots.some((s) => s.summary.cookOff === 'blowout')).toBe(true);
    expect(shots.every((s) => s.summary.cookOff !== 'detonation')).toBe(true);
    const vent = shots.find((s) => s.summary.cookOff === 'blowout')!;
    expect(vent.bigEvents.find((e) => e.kind === 'blowout')!.rack).toBe('bustle');
  });

  it('crew behind the blast doors are shielded from bustle fragments', () => {
    const s = shoot('m1', 'm829a1', v3(-1.75, 1.76, 6), v3(0, 0, -1), 4);
    const turretCrew = ['gunner', 'commander', 'loader'];
    // The rod continues across the bustle; nothing should reach crew stations forward of the doors.
    for (const h of s.crewHits) expect(turretCrew.includes(h.crewId) && h.point.x < -1.2).toBe(false);
  });
});

describe('T-72B', () => {
  it('ERA plus composite defeats 105 mm HEAT on the glacis', () => {
    expect(shoot('t72b', 'm456a2', v3(10, 1.5, 0.3), v3(-1, -0.05, 0)).summary.penetrated).toBe(false);
  });

  it('a lower side shot into the carousel very often detonates the tank', () => {
    const shots = Array.from({ length: 20 }, (_, i) => shoot('t72b', 'm829a1', v3(0.35, 0.62, 6), v3(0, 0, -1), i + 1));
    const det = shots.filter((s) => s.summary.cookOff === 'detonation').length;
    expect(det).toBeGreaterThan(8);
  });
});

describe('IS-3', () => {
  it('pike nose shrugs off 85 mm APHE head-on', () => {
    expect(shoot('is3', 'br365k', v3(10, 1.1, 0.4), v3(-1, 0, 0), 1, 100).summary.penetrated).toBe(false);
  });

  it('the side is vulnerable to a 90 mm APC at close range', () => {
    expect(shoot('is3', 'm82', v3(-0.8, 0.9, 6), v3(0, 0, -1), 1, 100).summary.penetrated).toBe(true);
  });
});
