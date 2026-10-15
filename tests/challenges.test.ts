import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { CHALLENGES, evaluateChallenge } from '../src/modes/challenges';
import { compareRounds } from '../src/modes/compare';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import type { ShotResult } from '../src/sim/types';
import { norm, v3, type Vec3 } from '../src/sim/vec';

/** A known-good aim for each challenge: [round, origin, dir]. */
const SOLUTIONS: Record<string, [string, Vec3, Vec3]> = {
  'first-blood': ['m72', v3(8, 1.3, 0.43), v3(-1, -0.035, 0)], // driver's hatch
  'mobility-kill': ['m82', v3(-9, 0.9, 0.2), v3(1, 0, 0)], // straight into the engine from behind
  'belly-shot': ['m833', v3(9, 1.0, 0.3), v3(-1, -0.052, 0)], // lower front plate
  'cold-kill': ['3bm42', v3(0.5, 1.6, 6), v3(0, 0, -1)], // turret side, above the carousel
  overpressure: ['of471', v3(0.6, 6, 0.3), v3(0, -1, 0)], // turret roof
  'flank-the-abrams': ['l31', v3(0.4, 1.0, 6), v3(0, 0, -1)], // hull side
  'pike-nose': ['br365k', v3(-0.5, 0.55, 6), v3(0, 0, -1)],
  'hesh-hammer': ['l35', v3(0.6, 1.6, 6), v3(0, 0, -1)],
  carousel: ['m833', v3(0.35, 0.62, 6), v3(0, 0, -1)],
  'two-shots': ['m829a1', v3(0.35, 0.62, 6), v3(0, 0, -1)],
  surgical: ['3bm42', v3(0.65, 1.55, -6), v3(0, 0, 1)],
};

function attempt(id: string, seedBase: number) {
  const c = CHALLENGES.find((x) => x.id === id)!;
  const v = vehicleById(c.vehicleId);
  const [rid, origin, dir] = SOLUTIONS[id];
  let state = initialState(v);
  const shots: ShotResult[] = [];
  for (let i = 0; i < c.maxShots; i++) {
    const s = simulateShot(v, roundById(rid), { vehicleId: v.id, roundId: rid, distance: c.distance, origin, dir: norm(dir), seed: seedBase * 100 + i, turretYaw: c.turretYaw ?? 0 }, state);
    state = s.stateAfter;
    shots.push(s);
    const res = evaluateChallenge(c, v, state, shots);
    if (res.status !== 'active') return res;
  }
  return evaluateChallenge(c, v, state, shots);
}

describe('challenges', () => {
  it.each(CHALLENGES.map((c) => [c.id]))('%s is winnable', (id) => {
    const c = CHALLENGES.find((x) => x.id === id)!;
    expect(c.rounds).toContain(SOLUTIONS[id][0]);
    const results = Array.from({ length: 12 }, (_, i) => attempt(id, i + 1));
    expect(results.some((r) => r.status === 'won')).toBe(true);
  });

  it('First Blood is no longer a one-shot: a side shot into the ammo is not allowed (fixed frontal angle)', () => {
    const c = CHALLENGES.find((x) => x.id === 'first-blood')!;
    expect(c.fixedAngle).toBeDefined();
    // Frontal hull shots at 800 m should fail to penetrate the sloped glacis.
    const v = vehicleById(c.vehicleId);
    const s = simulateShot(v, roundById('m72'), { vehicleId: v.id, roundId: 'm72', distance: c.distance, origin: v3(8, 1.3, 0.0), dir: v3(-1, -0.035, 0), seed: 1 }, initialState(v));
    expect(s.summary.penetrated).toBe(false);
  });

  it('objective failures are reported with a reason', () => {
    const c = CHALLENGES.find((x) => x.id === 'belly-shot')!;
    const v = vehicleById(c.vehicleId);
    const glacis = simulateShot(v, roundById('m833'), { vehicleId: v.id, roundId: 'm833', distance: c.distance, origin: v3(9, 1.6, 0.3), dir: norm(v3(-1, -0.052, 0)), seed: 1 }, initialState(v));
    const res = evaluateChallenge(c, v, glacis.stateAfter, [glacis]);
    expect(res.status).toBe('failed');
    expect(res.reason).toMatch(/only the lower front plate/);
  });

  it('awards stars by shots used and fails when out of shots', () => {
    const c = CHALLENGES.find((x) => x.id === 'two-shots')!;
    const v = vehicleById(c.vehicleId);
    const miss = simulateShot(v, roundById('m829a1'), { vehicleId: v.id, roundId: 'm829a1', distance: 1500, origin: v3(10, 5, 5), dir: v3(1, 0, 0), seed: 1 }, initialState(v));
    expect(evaluateChallenge(c, v, miss.stateAfter, [miss]).status).toBe('active');
    expect(evaluateChallenge(c, v, miss.stateAfter, [miss, miss])).toMatchObject({ status: 'failed' });
  });
});

describe('compare rounds', () => {
  it('fires each round at a fresh vehicle with the same seed', () => {
    const v = vehicleById('t34-85');
    const res = compareRounds(v, ['m72', 'm829a1'], v3(8, 1.1, 0.42), v3(-1, 0, 0), 500, 7);
    expect(res).toHaveLength(2);
    for (const r of res) expect(r.stateBefore).toEqual(initialState(v));
    expect(res[1].summary.penAtTargetMm).toBeGreaterThan(res[0].summary.penAtTargetMm);
  });
});
