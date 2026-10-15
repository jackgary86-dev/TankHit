import { describe, expect, it } from 'vitest';
import { plateNormal } from '../src/data/builder';
import { VEHICLES } from '../src/data/vehicles';
import { centroid, cross, dot, norm, sub } from '../src/sim/vec';

describe.each(VEHICLES.map((v) => [v.name, v] as const))('%s data', (_name, v) => {
  it('has unique ids', () => {
    const ids = [...v.plates.map((p) => p.id), ...v.modules.map((m) => m.id), ...v.crew.map((c) => c.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('plates are planar with outward normals', () => {
    for (const p of v.plates) {
      const n = plateNormal(p);
      const [a, b, c] = p.pts;
      const n0 = norm(cross(sub(b, a), sub(c, a)));
      expect(Math.abs(Math.abs(dot(n, n0)) - 1)).toBeLessThan(1e-6);
      for (const q of p.pts) expect(Math.abs(dot(sub(q, a), n))).toBeLessThan(1e-6);
      expect(dot(n, sub(centroid(p.pts), p.inside))).toBeGreaterThan(0);
      expect(p.mm).toBeGreaterThan(0);
    }
  });

  it('ammo belongs to a declared rack', () => {
    const racks = new Set(v.racks.map((r) => r.id));
    for (const m of v.modules.filter((m) => m.ammo)) expect(racks.has(m.ammo!.rack)).toBe(true);
  });

  it('has crew with head and torso zones', () => {
    for (const c of v.crew) {
      expect(c.zones.some((z) => z.zone === 'head')).toBe(true);
      expect(c.zones.some((z) => z.zone === 'torso')).toBe(true);
    }
  });
});
