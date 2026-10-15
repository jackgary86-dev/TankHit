import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { MUZZLE_DUR, muzzleDistance, shellPoseAt } from '../src/render/projectile';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { v3 } from '../src/sim/vec';

const t34 = vehicleById('t34-85');
const shot = simulateShot(t34, roundById('m829a1'), { vehicleId: t34.id, roundId: 'm829a1', distance: 1500, origin: v3(0.6, 1.55, 6), dir: v3(0, 0, -1), seed: 1 }, initialState(t34));

describe('muzzle segment', () => {
  it('draws the gun a capped distance behind the trace origin', () => {
    expect(muzzleDistance(1500)).toBe(25);
    expect(muzzleDistance(3)).toBe(8);
  });

  it('the shell sits at the gun during the cut and is on the approach afterwards', () => {
    const d = muzzleDistance(shot.input.distance);
    const early = shellPoseAt(shot.traces, shot.impacts, 0.05, 'APFSDS', d);
    expect(early.phase).toBe('muzzle');
    expect(early.pos.z).toBeGreaterThan(6 + d - 2.5); // ~25 m behind the origin, heading in
    const after = shellPoseAt(shot.traces, shot.impacts, MUZZLE_DUR, 'APFSDS', d);
    expect(after.phase).toBe('flight');
    expect(after.pos.z).toBeLessThan(6);
    // Without a muzzle distance the pose is unchanged from before.
    expect(shellPoseAt(shot.traces, shot.impacts, 0.05, 'APFSDS', 0).phase).toBe('flight');
  });
});

describe('leaving the scene', () => {
  it('a miss flies off and is gone after its tracer; it does not hang in the air', () => {
    const miss = simulateShot(t34, roundById('br365k'), { vehicleId: t34.id, roundId: 'br365k', distance: 500, origin: v3(0.6, 4.5, 6), dir: v3(0, 0, -1), seed: 1 }, initialState(t34));
    expect(miss.summary.verdict).toBe('Miss');
    const tr = miss.traces[0];
    expect(shellPoseAt(miss.traces, miss.impacts, tr.t1 * 0.5, 'APHE').phase).toBe('flight');
    const end = shellPoseAt(miss.traces, miss.impacts, tr.t1 - 0.01, 'APHE');
    expect(end.onLast).toBe(true);
    expect(end.left).toBeLessThan(0.2);
    expect(shellPoseAt(miss.traces, miss.impacts, tr.t1 + 0.1, 'APHE').phase).toBe('gone');
  });
});
