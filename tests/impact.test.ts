import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { easeContact, HEAT_COLLAPSE, shellPoseAt } from '../src/render/projectile';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { v3 } from '../src/sim/vec';

const t34 = vehicleById('t34-85');
const fire = (rid: string) =>
  simulateShot(t34, roundById(rid), { vehicleId: t34.id, roundId: rid, distance: 300, origin: v3(0.6, 1.55, 6), dir: v3(0, 0, -1), seed: 1 }, initialState(t34));

describe('contact easing', () => {
  it('is identity away from the impact and monotonic through it', () => {
    expect(easeContact(0.5, true, false)).toBe(0.5);
    expect(easeContact(0.5, false, true)).toBe(0.5);
    let prev = -1;
    for (let k = 0; k <= 1.0001; k += 0.01) {
      const e = easeContact(k, true, false);
      expect(e).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = e;
    }
    expect(easeContact(1, true, false)).toBeCloseTo(1);
    expect(easeContact(0, false, true)).toBe(0);
  });

  it('slows into the plate and accelerates out of it', () => {
    // Ease-out: at 95 % of the time the shell has covered more than 95 % of the distance.
    expect(easeContact(0.95, true, false)).toBeGreaterThan(0.95);
    // Ease-in: at 10 % of the time it has covered less than 10 % of the distance.
    expect(easeContact(0.1, false, true)).toBeLessThan(0.1);
  });

  it('keeps the shell exactly at the impact point at impact time', () => {
    const s = fire('br365k');
    const imp = s.impacts[0];
    const p = shellPoseAt(s.traces, s.impacts, imp.t, 'APHE');
    expect(p.pos.distanceTo(p.pos.clone().set(imp.point.x, imp.point.y, imp.point.z))).toBeLessThan(0.02);
  });
});

describe('HEAT collapse', () => {
  it('the body lingers at the plate briefly, then is consumed', () => {
    const s = fire('m456a2');
    const t = s.impacts[0].t;
    expect(shellPoseAt(s.traces, s.impacts, t + HEAT_COLLAPSE / 2, 'HEAT').phase).toBe('stopped');
    expect(shellPoseAt(s.traces, s.impacts, t + HEAT_COLLAPSE + 0.01, 'HEAT').phase).toBe('gone');
  });
});
