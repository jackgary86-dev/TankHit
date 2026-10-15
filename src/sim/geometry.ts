import { plateNormal } from '../data/builder';
import type { Box, Plate } from './types';
import { cross, dot, madd, sub, type Vec3 } from './vec';

const normals = new WeakMap<Plate, Vec3>();
export const normalOf = (p: Plate): Vec3 => {
  let n = normals.get(p);
  if (!n) {
    n = plateNormal(p);
    normals.set(p, n);
  }
  return n;
};

/** Ray vs convex planar polygon. Returns distance along the ray or null. */
export function rayPlate(origin: Vec3, dir: Vec3, p: Plate): number | null {
  const n = normalOf(p);
  const denom = dot(dir, n);
  if (Math.abs(denom) < 1e-9) return null;
  const t = dot(sub(p.pts[0], origin), n) / denom;
  if (t < 1e-6) return null;
  const hit = madd(origin, dir, t);
  // Inside test: hit must be on the same side of every edge.
  let sign = 0;
  const k = p.pts.length;
  for (let i = 0; i < k; i++) {
    const a = p.pts[i];
    const b = p.pts[(i + 1) % k];
    const s = dot(cross(sub(b, a), sub(hit, a)), n);
    if (Math.abs(s) < 1e-12) continue;
    const sg = Math.sign(s);
    if (sign === 0) sign = sg;
    else if (sg !== sign) return null;
  }
  return t;
}

/** Ray vs axis-aligned box (slab method). Returns entry distance (>0) or null. Rays starting inside are ignored. */
export function rayBox(origin: Vec3, dir: Vec3, b: Box): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const ax of ['x', 'y', 'z'] as const) {
    const o = origin[ax];
    const d = dir[ax];
    if (Math.abs(d) < 1e-12) {
      if (o < b.min[ax] || o > b.max[ax]) return null;
      continue;
    }
    let t1 = (b.min[ax] - o) / d;
    let t2 = (b.max[ax] - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (tmin <= 1e-6) return null;
  return tmin;
}

export const insideBox = (p: Vec3, b: Box) =>
  p.x >= b.min.x && p.x <= b.max.x && p.y >= b.min.y && p.y <= b.max.y && p.z >= b.min.z && p.z <= b.max.z;
