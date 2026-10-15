import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { buildProjectile, shellPoseAt, visualScale } from '../src/render/projectile';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { v3 } from '../src/sim/vec';

const t34 = vehicleById('t34-85');
const fire = (rid: string, origin = v3(0.6, 1.55, 6), dir = v3(0, 0, -1), seed = 1) =>
  simulateShot(t34, roundById(rid), { vehicleId: t34.id, roundId: rid, distance: 300, origin, dir, seed }, initialState(t34));

describe('projectile pose', () => {
  it('starts at the shot origin and flies along the direction of travel', () => {
    const s = fire('br365k');
    const p0 = shellPoseAt(s.traces, s.impacts, 0, 'APHE');
    expect(p0.phase).toBe('flight');
    expect(p0.pos.z).toBeCloseTo(6, 3);
    expect(p0.dir.z).toBeCloseTo(-1, 3);
    const p1 = shellPoseAt(s.traces, s.impacts, s.impacts[0].t / 2, 'APHE');
    expect(p1.pos.z).toBeLessThan(6);
    expect(p1.pos.z).toBeGreaterThan(s.impacts[0].point.z);
  });

  it('is at the impact point at impact time and continues inside after a penetration', () => {
    const s = fire('m829a1');
    const imp = s.impacts[0];
    expect(imp.kind).toBe('pen');
    const at = shellPoseAt(s.traces, s.impacts, imp.t, 'APFSDS');
    expect(at.pos.distanceTo(at.pos.clone().set(imp.point.x, imp.point.y, imp.point.z))).toBeLessThan(0.02);
    const later = shellPoseAt(s.traces, s.impacts, imp.t + 0.2, 'APFSDS');
    expect(['inside', 'stopped', 'gone']).toContain(later.phase);
    expect(later.remaining).toBeLessThanOrEqual(1);
  });

  it('a HEAT body is consumed at the plate', () => {
    const s = fire('m456a2');
    const imp = s.impacts[0];
    expect(shellPoseAt(s.traces, s.impacts, imp.t - 0.05, 'HEAT').phase).toBe('flight');
    expect(shellPoseAt(s.traces, s.impacts, imp.t + 0.05, 'HEAT').phase).toBe('gone');
  });

  it('a ricochet follows the bounce trace', () => {
    const s = simulateShot(t34, roundById('br365k'), { vehicleId: t34.id, roundId: 'br365k', distance: 100, origin: v3(6, 0.9, 1.4), dir: { x: -0.997, y: 0, z: -0.08 }, seed: 3 }, initialState(t34));
    expect(s.impacts[0].kind).toBe('ricochet');
    const p = shellPoseAt(s.traces, s.impacts, s.impacts[0].t + 0.2, 'APHE');
    expect(p.phase).toBe('ricochet');
    const end = shellPoseAt(s.traces, s.impacts, 99, 'APHE');
    expect(end.phase).toBe('gone');
  });

  it('is deterministic in T', () => {
    const s = fire('pzgr39');
    const a = shellPoseAt(s.traces, s.impacts, 0.37, 'APHE');
    const b = shellPoseAt(s.traces, s.impacts, 0.37, 'APHE');
    expect(a.pos.toArray()).toEqual(b.pos.toArray());
  });
});

describe('projectile meshes', () => {
  it('builds every family with sensible sizes', () => {
    for (const id of ['m829a1', 'm72', 'br365k', 'm456a2', 'l35', 'of471']) {
      const r = roundById(id);
      const p = buildProjectile(r);
      expect(p.group.children.length).toBeGreaterThan(0);
      expect(p.length).toBeGreaterThan(0.15);
      expect(p.length).toBeLessThan(1.2);
      expect(p.petals.length).toBe(r.family === 'APFSDS' ? 3 : 0);
      expect(!!p.cap).toBe(!!r.capped);
    }
    expect(visualScale(roundById('m72'))).toBeGreaterThan(visualScale(roundById('m829a1')));
  });
});
