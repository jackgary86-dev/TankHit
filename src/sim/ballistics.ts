// External ballistics for the gunner's sight: a point-mass arc with velocity-proportional drag (matching
// velocityAt: dv/ds = -drag * v) under gravity. Solved numerically, then the superelevation for a range is
// found by bisection so the shell lands at the aim point.
import type { Round } from './types';

export const G = 9.81;
const DT = 0.002;

export interface ArcPoint {
  t: number;
  x: number;
  y: number;
  v: number;
}

/** Integrate the trajectory for a launch elevation (radians) until it drops back through y = 0 or `maxX`. */
export function integrateArc(r: Round, elevation: number, maxX = 6000): ArcPoint[] {
  let x = 0;
  let y = 0;
  let vx = r.velocity * Math.cos(elevation);
  let vy = r.velocity * Math.sin(elevation);
  let t = 0;
  const pts: ArcPoint[] = [{ t, x, y, v: r.velocity }];
  while (x < maxX && (y >= 0 || vy > 0) && t < 30) {
    const v = Math.hypot(vx, vy);
    const ax = -r.drag * v * vx;
    const ay = -G - r.drag * v * vy;
    vx += ax * DT;
    vy += ay * DT;
    x += vx * DT;
    y += vy * DT;
    t += DT;
    pts.push({ t, x, y, v: Math.hypot(vx, vy) });
  }
  return pts;
}

/** Height of the arc at horizontal distance `x` (linear interpolation), or null if the arc ends first. */
export function heightAt(arc: ArcPoint[], x: number): number | null {
  for (let i = 1; i < arc.length; i++) {
    if (arc[i].x >= x) {
      const a = arc[i - 1];
      const b = arc[i];
      const k = (x - a.x) / Math.max(b.x - a.x, 1e-9);
      return a.y + (b.y - a.y) * k;
    }
  }
  return null;
}

export interface FiringSolution {
  range: number;
  /** Launch angle above the line of sight, radians. */
  elevation: number;
  timeOfFlight: number;
  impactVelocity: number;
  /** Angle below the horizontal at which the shell arrives, radians. */
  descent: number;
  /** Drop in metres (relative to the line of sight) the shell would have at other ranges with this elevation. */
  dropAt: (x: number) => number;
}

/** Superelevation so a shot lands at `range` on a level line of sight. */
export function solveArc(r: Round, range: number): FiringSolution {
  let lo = 0;
  let hi = 0.35; // 20 degrees is plenty for a tank gun
  let arc = integrateArc(r, hi, range + 50);
  if ((heightAt(arc, range) ?? -1) < 0) hi = 0.35;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    arc = integrateArc(r, mid, range + 50);
    const h = heightAt(arc, range);
    if (h === null || h < 0) lo = mid;
    else hi = mid;
  }
  const elevation = (lo + hi) / 2;
  arc = integrateArc(r, elevation, range + 50);
  let at = arc[arc.length - 1];
  for (let i = 1; i < arc.length; i++) {
    if (arc[i].x >= range) {
      at = arc[i];
      break;
    }
  }
  const prev = arc[Math.max(0, arc.indexOf(at) - 1)];
  const descent = Math.atan2(prev.y - at.y, Math.max(at.x - prev.x, 1e-9));
  return {
    range,
    elevation,
    timeOfFlight: at.t,
    impactVelocity: at.v,
    descent,
    dropAt: (x) => -(heightAt(arc, x) ?? -Infinity),
  };
}

/** Milliradians of vertical lead between the sight setting and another range (negative = aim lower). */
export function rangeTickMils(r: Round, sightRange: number, otherRange: number): number {
  const a = solveArc(r, sightRange);
  const b = solveArc(r, otherRange);
  return (b.elevation - a.elevation) * 1000;
}

/** One-sigma angular dispersion (milliradians) by round family. */
export function dispersionMils(r: Round): number {
  switch (r.family) {
    case 'APFSDS':
      return 0.22;
    case 'HEAT':
      return 0.32;
    case 'HESH':
    case 'HE':
      return 0.45;
    default:
      return 0.3;
  }
}

/**
 * Range-estimation error for modes where the displayed range is only an estimate: the true range differs by a
 * seeded few percent (sigma 3 %, clamped to 7 %), which changes drop and kinetic penetration.
 */
export function estimatedRangeError(seed: number): number {
  const u1 = ((seed * 1103515245 + 12345) >>> 0) / 4294967296;
  const u2 = ((seed * 22695477 + 1) >>> 0) / 4294967296;
  const g = gaussian(Math.max(u1, 1e-6), u2);
  return Math.max(-0.07, Math.min(0.07, g * 0.03));
}

/** Standard normal sample from two uniforms. */
export const gaussian = (u1: number, u2: number) => Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))) * Math.cos(2 * Math.PI * u2);
