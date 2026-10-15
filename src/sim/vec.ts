// Minimal 3D vector math for the simulation layer (no three.js dependency).
// World axes: +X = vehicle front, +Y = up, +Z = vehicle left side.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, s: number): Vec3 => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = (a: Vec3): number => Math.sqrt(dot(a, a));
export const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
export const norm = (a: Vec3): Vec3 => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : v3(0, 0, 0);
};
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
export const madd = (a: Vec3, dir: Vec3, t: number): Vec3 =>
  v3(a.x + dir.x * t, a.y + dir.y * t, a.z + dir.z * t);

export const centroid = (pts: Vec3[]): Vec3 => {
  let c = v3();
  for (const p of pts) c = add(c, p);
  return scale(c, 1 / pts.length);
};

/** Any unit vector perpendicular to `n`. */
export const perpendicular = (n: Vec3): Vec3 => {
  const a = Math.abs(n.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
  return norm(cross(n, a));
};

export const DEG = Math.PI / 180;

/** Seeded PRNG (mulberry32) so shots are reproducible and replayable. */
export type Rng = () => number;
export const makeRng = (seed: number): Rng => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Random unit vector within a cone of half-angle `half` (radians) around `axis`. */
export const randomInCone = (axis: Vec3, half: number, rng: Rng): Vec3 => {
  const cosMax = Math.cos(half);
  const cosT = 1 - rng() * (1 - cosMax);
  const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
  const phi = rng() * Math.PI * 2;
  const u = perpendicular(axis);
  const w = cross(axis, u);
  return norm(
    add(scale(axis, cosT), add(scale(u, Math.cos(phi) * sinT), scale(w, Math.sin(phi) * sinT))),
  );
};
