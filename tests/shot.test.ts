import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { previewShot, simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { norm, v3 } from '../src/sim/vec';

const t34 = vehicleById('t34-85');

/** Fire horizontally from the front at height y, lateral z. */
const frontal = (y: number, z = 0) => ({ origin: v3(8, y, z), dir: v3(-1, 0, 0) });

describe('kinetic shots on T-34-85', () => {
  it('BR-365K penetrates the upper front plate at 100 m', () => {
    const r = roundById('br365k');
    const { origin, dir } = frontal(1.1, 0.42);
    const shot = simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 100, origin, dir, seed: 1 }, initialState(t34));
    expect(shot.impacts[0].plateId).toBe('h-ufp');
    expect(shot.summary.penetrated).toBe(true);
    expect(shot.summary.losMm).toBeGreaterThan(70);
  });

  it('M72 fails against the turret front at 1000 m', () => {
    const r = roundById('m72');
    const { origin, dir } = frontal(1.6, 0.6);
    const shot = simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 1000, origin, dir, seed: 1 }, initialState(t34));
    expect(shot.summary.penetrated).toBe(false);
    expect(shot.summary.verdict === 'Non-penetration' || shot.summary.verdict === 'Ricochet').toBe(true);
  });

  it('a grazing shot along the side ricochets', () => {
    const r = roundById('br365k');
    const dir = norm(v3(-1, 0, -0.08)); // ~85° from the side normal
    const shot = simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 100, origin: v3(6, 0.9, 1.4), dir, seed: 3 }, initialState(t34));
    expect(shot.impacts[0].kind).toBe('ricochet');
  });

  it('preview reports LOS and a rating', () => {
    const r = roundById('m829a1');
    const { origin, dir } = frontal(1.1, 0.42);
    const p = previewShot(t34, initialState(t34), r, origin, dir, 1000)!;
    expect(p.plate.id).toBe('h-ufp');
    expect(p.rating).toBe('good');
  });

  it('is deterministic for a given seed', () => {
    const r = roundById('br365k');
    const { origin, dir } = frontal(1.1, 0.2);
    const a = simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 100, origin, dir, seed: 9 }, initialState(t34));
    const b = simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 100, origin, dir, seed: 9 }, initialState(t34));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('spall', () => {
  it('a penetration throws spall that damages interior modules', () => {
    const r = roundById('m82');
    // Side shot into the hull at fighting-compartment height.
    const shot = simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 100, origin: v3(0.2, 0.9, 6), dir: v3(0, 0, -1), seed: 5 }, initialState(t34));
    expect(shot.summary.penetrated).toBe(true);
    expect(shot.summary.spallCount).toBeGreaterThan(15);
    expect(shot.traces.filter((t) => t.kind === 'spall' || t.kind === 'frag').length).toBe(shot.summary.spallCount);
    expect(shot.moduleHits.length).toBeGreaterThan(0);
  });

  it('non-penetrations throw no spall', () => {
    const r = roundById('m72');
    const shot = simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 1500, origin: v3(8, 1.6, 0.6), dir: v3(-1, 0, 0), seed: 1 }, initialState(t34));
    expect(shot.summary.spallCount).toBe(0);
  });
});

describe('gel crew dummies', () => {
  it('a turret penetration wounds crew and records wound channels', () => {
    const r = roundById('pzgr39');
    // Through the turret side at gunner/commander height.
    const shot = simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 100, origin: v3(0.6, 1.55, 6), dir: v3(0, 0, -1), seed: 11 }, initialState(t34));
    expect(shot.summary.penetrated).toBe(true);
    expect(shot.crewHits.length).toBeGreaterThan(0);
    for (const w of shot.crewHits) expect(w.length).toBeGreaterThan(0);
    expect(shot.summary.crewHit.length).toBeGreaterThan(0);
  });

  it('heavy enough damage incapacitates a crew member', () => {
    const r = roundById('m829a1');
    // Straight through the driver's head and torso from above-front.
    const shot = simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 100, origin: v3(1.37, 6, 0.42), dir: v3(0, -1, 0), seed: 2 }, initialState(t34));
    expect(shot.stateAfter.crew.driver.incapacitated).toBe(true);
    expect(shot.summary.crewIncapacitated).toContain('driver');
  });
});

describe('ammunition cook-off', () => {
  const shoot = (seed: number) => {
    const r = roundById('m82');
    // Side shot straight into the floor ammo racks.
    return simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 100, origin: v3(0.2, 0.58, 6), dir: v3(0, 0, -1), seed }, initialState(t34));
  };

  it('hitting the ammo racks causes fires and some detonations', () => {
    const shots = Array.from({ length: 30 }, (_, i) => shoot(i + 1));
    expect(shots.filter((s) => s.summary.cookOff !== 'none').length).toBeGreaterThan(15);
    expect(shots.some((s) => s.summary.cookOff === 'detonation')).toBe(true);
  });

  it('a detonation is catastrophic and knocks out every crew member', () => {
    const det = Array.from({ length: 40 }, (_, i) => shoot(i + 1)).find((s) => s.summary.cookOff === 'detonation')!;
    expect(det.summary.verdict).toBe('Catastrophic (cook-off)');
    for (const c of t34.crew) expect(det.stateAfter.crew[c.id].incapacitated).toBe(true);
    expect(det.bigEvents.some((e) => e.kind === 'detonation')).toBe(true);
  });

  it('ignitions propagate in time order (ignite before burn)', () => {
    const s = Array.from({ length: 30 }, (_, i) => shoot(i + 1)).find((x) => x.ammoEvents.length > 4)!;
    for (const e of s.ammoEvents.filter((e) => e.kind === 'ignite')) {
      const burn = s.ammoEvents.find((b) => b.kind === 'burn' && b.moduleId === e.moduleId)!;
      expect(burn.t).toBeGreaterThan(e.t);
    }
  });
});
