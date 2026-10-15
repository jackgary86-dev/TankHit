// Turret traverse: turret-group geometry is authored facing forward and rotated about a pivot at shot time.
// Rather than rotating every plate, rays are rotated into the turret's local frame (three.js Y-rotation convention).
import type { PlateGroup } from './types';
import { v3, type Vec3 } from './vec';

export interface Frame {
  pivot: Vec3;
  /** Turret yaw in radians; positive turns the gun toward the right (-Z) side. */
  yaw: number;
}

export const IDENTITY: Frame = { pivot: v3(), yaw: 0 };

const rot = (p: Vec3, yaw: number, pivot: Vec3): Vec3 => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const x = p.x - pivot.x;
  const z = p.z - pivot.z;
  return v3(pivot.x + c * x + s * z, p.y, pivot.z - s * x + c * z);
};
const rotDir = (d: Vec3, yaw: number): Vec3 => {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return v3(c * d.x + s * d.z, d.y, -s * d.x + c * d.z);
};

export const toLocal = (p: Vec3, f: Frame) => (f.yaw ? rot(p, -f.yaw, f.pivot) : p);
export const toWorld = (p: Vec3, f: Frame) => (f.yaw ? rot(p, f.yaw, f.pivot) : p);
export const dirToLocal = (d: Vec3, f: Frame) => (f.yaw ? rotDir(d, -f.yaw) : d);
export const dirToWorld = (d: Vec3, f: Frame) => (f.yaw ? rotDir(d, f.yaw) : d);

/** World position of a point authored in `group` space. */
export const groupToWorld = (group: PlateGroup, p: Vec3, f: Frame) => (group === 'turret' ? toWorld(p, f) : p);
