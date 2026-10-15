// Monte-Carlo kill-probability map: a grid of parallel rays across the tank's silhouette, several seeds each.
import { frameOf } from './shot';
import { collectHits, simulateShot } from './shot';
import { toWorld } from './frame';
import type { Round, ShotInput, Vehicle, VehicleState, Verdict } from './types';
import { cross, dot, madd, norm, scale, v3, type Vec3 } from './vec';

export const EFFECTIVE: Verdict[] = ['Disabled', 'Knocked out', 'Abandoned', 'Catastrophic (cook-off)'];
export const isEffective = (v: Verdict) => EFFECTIVE.includes(v);

export interface KillCell {
  i: number;
  j: number;
  /** World point where the ray first strikes armour. */
  point: Vec3;
  /** Fraction of seeds that left the tank disabled, knocked out or destroyed. */
  p: number;
  /** Fraction of seeds that penetrated. */
  pen: number;
}

export interface KillGrid {
  /** Unit vectors spanning the projection plane and the shot direction. */
  u: Vec3;
  w: Vec3;
  dir: Vec3;
  /** World-space origin of cell (0,0) on the far side of the tank. */
  origin: Vec3;
  cell: number;
  cols: number;
  rows: number;
}

/** Basis and extents for a grid of parallel rays travelling along `dir`. */
export function planGrid(v: Vehicle, dir: Vec3, yawDeg: number, cell: number): KillGrid {
  const d = norm(dir);
  const up = Math.abs(d.y) > 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
  const u = norm(cross(up, d));
  const w = norm(cross(d, u));
  const f = frameOf(v, yawDeg);
  let minU = Infinity, maxU = -Infinity, minW = Infinity, maxW = -Infinity, minD = Infinity;
  for (const p of v.plates) {
    for (const q0 of p.pts) {
      const q = p.group === 'turret' ? toWorld(q0, f) : q0;
      const a = dot(q, u);
      const b = dot(q, w);
      const c = dot(q, d);
      minU = Math.min(minU, a); maxU = Math.max(maxU, a);
      minW = Math.min(minW, b); maxW = Math.max(maxW, b);
      minD = Math.min(minD, c);
    }
  }
  const pad = cell;
  const cols = Math.ceil((maxU - minU + 2 * pad) / cell);
  const rows = Math.ceil((maxW - minW + 2 * pad) / cell);
  const origin = madd(madd(scale(d, minD - 8), u, minU - pad + cell / 2), w, minW - pad + cell / 2);
  return { u, w, dir: d, origin, cell, cols, rows };
}

export const cellOrigin = (g: KillGrid, i: number, j: number) => madd(madd(g.origin, g.u, i * g.cell), g.w, j * g.cell);

/** Probability (0..1) that a shot with this input leaves the tank combat-ineffective, over `seeds` trials. */
export function killProbability(v: Vehicle, state: VehicleState, r: Round, input: Omit<ShotInput, 'seed'>, seeds: number, seed0 = 1): { p: number; pen: number } {
  let kills = 0;
  let pens = 0;
  for (let k = 0; k < seeds; k++) {
    const res = simulateShot(v, r, { ...input, seed: seed0 + k * 7919 }, state);
    if (isEffective(res.summary.verdict)) kills++;
    if (res.summary.penetrated) pens++;
  }
  return { p: kills / seeds, pen: pens / seeds };
}

/** Compute one row of the map. Cells whose ray misses the tank are omitted. */
export function killRow(v: Vehicle, state: VehicleState, r: Round, g: KillGrid, j: number, distance: number, yawDeg: number, seeds: number): KillCell[] {
  const out: KillCell[] = [];
  const f = frameOf(v, yawDeg);
  for (let i = 0; i < g.cols; i++) {
    const origin = cellOrigin(g, i, j);
    const first = collectHits(v, state, origin, g.dir, { modules: false, crew: false }, f).find((h) => h.kind === 'plate');
    if (!first) continue;
    const point = madd(origin, g.dir, first.t);
    const { p, pen } = killProbability(v, state, r, { vehicleId: v.id, roundId: r.id, distance, origin, dir: g.dir, turretYaw: yawDeg }, seeds, 1 + i * 131 + j * 17);
    out.push({ i, j, point, p, pen });
  }
  return out;
}
