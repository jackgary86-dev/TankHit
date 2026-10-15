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
