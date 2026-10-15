// Shareable shots: everything needed to reproduce a replay, packed into the URL hash.
import type { ShotInput } from '../sim/types';
import { v3, type Vec3 } from '../sim/vec';

const num = (n: number, d = 3) => String(Math.round(n * 10 ** d) / 10 ** d);
const vec = (p: Vec3) => [p.x, p.y, p.z].map((n) => num(n, 4)).join(',');
const parseVec = (s: string | null): Vec3 | null => {
  if (!s) return null;
  const a = s.split(',').map(Number);
  return a.length === 3 && a.every(Number.isFinite) ? v3(a[0], a[1], a[2]) : null;
};

export function encodeShot(input: ShotInput): string {
  const q = new URLSearchParams();
  q.set('v', input.vehicleId);
  q.set('r', input.roundId);
  q.set('d', num(input.distance, 0));
  q.set('o', vec(input.origin));
  q.set('dir', vec(input.dir));
  q.set('s', String(input.seed >>> 0));
  if (input.turretYaw) q.set('ty', num(input.turretYaw, 1));
  return q.toString();
}

export function decodeShot(hash: string): ShotInput | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const vehicleId = q.get('v');
  const roundId = q.get('r');
  const origin = parseVec(q.get('o'));
  const dir = parseVec(q.get('dir'));
  const distance = Number(q.get('d'));
  const seed = Number(q.get('s'));
  if (!vehicleId || !roundId || !origin || !dir || !Number.isFinite(distance) || !Number.isFinite(seed)) return null;
  const ty = q.get('ty');
  return { vehicleId, roundId, distance, origin, dir, seed, turretYaw: ty ? Number(ty) : 0 };
}

export const shareUrl = (input: ShotInput) => `${location.origin}${location.pathname}#${encodeShot(input)}`;
