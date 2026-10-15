import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { dirToWorld, toLocal, toWorld } from '../src/sim/frame';
import { collectHits, frameOf, previewShot, simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { DEG, v3 } from '../src/sim/vec';

const t34 = vehicleById('t34-85');

describe('turret frame', () => {
  it('round-trips points and keeps the pivot fixed', () => {
    const f = frameOf(t34, 37);
    const p = v3(2, 1.5, -0.4);
    const back = toLocal(toWorld(p, f), f);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.z).toBeCloseTo(p.z);
    const pv = toWorld(v3(t34.turretPivot.x, 1, t34.turretPivot.z), f);
    expect(pv.x).toBeCloseTo(t34.turretPivot.x);
  });

  it('positive yaw swings the gun toward the right (-Z) side', () => {
    const d = dirToWorld(v3(1, 0, 0), frameOf(t34, 90));
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-1);
  });
});

describe('turret traverse', () => {
  it('a frontal shot hits the turret side once the turret is turned 90 degrees', () => {
    const origin = v3(8, 1.65, 0.6);
    const dir = v3(-1, 0, 0);
    const r = roundById('m829a1');
    const straight = previewShot(t34, initialState(t34), r, origin, dir, 500, 0)!;
    const turned = previewShot(t34, initialState(t34), r, origin, dir, 500, 90)!;
    expect(straight.plate.name).toMatch(/Turret (front|cheek)|mantlet/);
    expect(turned.plate.name).toMatch(/Turret side/);
  });

  it('the hull roof is open under the turret ring', () => {
    const hullOnly = collectHits(t34, initialState(t34), v3(t34.turretPivot.x, 5, 0), v3(0, -1, 0), { modules: false, crew: false })
      .filter((h) => h.kind === 'plate' && h.plate.group === 'hull');
    expect(hullOnly[0].kind === 'plate' && hullOnly[0].plate.id).toBe('h-floor');
  });

  it('turret crew move with the turret', () => {
    // Shot through the turret side at gunner height; with 180 degrees of traverse the gunner is on the other side.
    const r = roundById('pzgr39');
    const shoot = (yaw: number, z: number) =>
      simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 100, origin: v3(t34.turretPivot.x + 0.15, 1.55, z), dir: v3(0, 0, -Math.sign(z)), seed: 3, turretYaw: yaw }, initialState(t34));
    const left = shoot(0, 6);
    const flipped = shoot(180, -6);
    expect(left.crewHits.length).toBeGreaterThan(0);
    expect(flipped.crewHits.map((h) => h.crewId)).toEqual(expect.arrayContaining([left.crewHits[0].crewId]));
    expect(Math.abs(left.impacts[0].angleDeg! - flipped.impacts[0].angleDeg!)).toBeLessThan(1e-6);
  });

  it('yaw is purely a rotation: angle-of-impact at a matching aim is unchanged', () => {
    const f = frameOf(t34, 45);
    const dirL = v3(-1, 0, 0);
    const dirW = dirToWorld(dirL, f);
    expect(Math.hypot(dirW.x, dirW.y, dirW.z)).toBeCloseTo(1);
    expect(Math.acos(-dirW.x) / DEG).toBeCloseTo(45);
  });
});

describe('covering plates', () => {
  it("a ray through the driver's hatch skips the glacis behind it", () => {
    const hits = collectHits(t34, initialState(t34), v3(8, 1.3, 0.43), v3(-1, -0.035, 0), { modules: false, crew: false }).filter((h) => h.kind === 'plate');
    expect(hits[0].kind === 'plate' && hits[0].plate.id).toBe('h-hatch');
    expect(hits.some((h) => h.kind === 'plate' && h.plate.id === 'h-ufp')).toBe(false);
  });

  it('a ray beside the hatch still hits the glacis', () => {
    const hits = collectHits(t34, initialState(t34), v3(8, 1.3, 0.0), v3(-1, -0.035, 0), { modules: false, crew: false }).filter((h) => h.kind === 'plate');
    expect(hits[0].kind === 'plate' && hits[0].plate.id).toBe('h-ufp');
  });
});
