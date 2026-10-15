// Penetration formulas. All functions are pure and unit-tested.
import { MATERIALS } from './materials';
import type { Plate, Round, RoundFamily } from './types';

export const isKinetic = (f: RoundFamily) => f === 'APFSDS' || f === 'AP' || f === 'APHE';

export const velocityAt = (r: Round, distance: number) => r.velocity * Math.exp(-r.drag * Math.max(0, distance));

const DENSITY = { tungsten: 17600, du: 18600, steel: 7850 } as const;
const TARGET_DENSITY = 7850;
/** Target-strength term, calibrated so M829A1 gives ~540 mm at the muzzle. */
const LO_K = 1.83e6;

/** Simplified Lanz–Odermatt long-rod model. Returns mm RHA at normal incidence. */
export function lanzOdermatt(r: Round, v: number): number {
  const L = (r.rodLength ?? 0.5) * 1000; // mm
  const D = r.rodDiameter ?? 25;
  const ld = L / D;
  const a = 0.994;
  const shape = 1 / Math.tanh(0.283 + 0.0656 * ld);
  const dens = Math.sqrt(DENSITY[r.penMaterial] / TARGET_DENSITY);
  const strength = Math.exp(-LO_K / (v * v));
  const duBonus = r.penMaterial === 'du' ? 1.05 : 1; // self-sharpening
  return L * a * shape * dens * strength * duBonus;
}

/** De Marre for full-calibre armour-piercing shot. Returns mm RHA at normal incidence. */
export function deMarre(r: Round, v: number): number {
  const C = 0.00169;
  const base = (C * Math.pow(r.mass, 0.71) * Math.pow(v, 1.43)) / Math.pow(r.caliber / 100, 1.07);
  const cap = r.capped ? 1.1 : 1;
  const cavity = r.family === 'APHE' ? 0.95 : 1;
  return base * cap * cavity;
}

/** Penetration at range, mm RHA at 0° (before armour angle). */
export function penetrationAt(r: Round, distance: number): number {
  switch (r.family) {
    case 'APFSDS':
      return lanzOdermatt(r, velocityAt(r, distance));
    case 'AP':
    case 'APHE':
      return deMarre(r, velocityAt(r, distance));
    case 'HEAT':
      return r.caliber * (r.cdFactor ?? 4);
    case 'HE':
      return 18 * Math.sqrt(r.filler);
    case 'HESH':
      return 0;
  }
}

/** Degrees the projectile turns into the plate on impact. */
export function normalization(r: Round): number {
  switch (r.family) {
    case 'APFSDS':
      return 1.5;
    case 'AP':
    case 'APHE':
      return r.capped ? 6 : 10;
    default:
      return 0;
  }
}

/** Physical plate thickness → RHA-equivalent at normal incidence for this threat. */
export function plateEquivalent(p: Plate, kinetic: boolean): number {
  const layers = p.layers ?? [{ mat: p.mat, mm: p.mm }];
  return layers.reduce((s, l) => s + l.mm * (kinetic ? MATERIALS[l.mat].ke : MATERIALS[l.mat].ce), 0);
}

/** Line-of-sight RHA-equivalent thickness at the given impact angle (deg from the plate normal). */
export function losThickness(p: Plate, angleDeg: number, r: Round): number {
  const eff = Math.max(0, angleDeg - normalization(r));
  const cos = Math.max(Math.cos((eff * Math.PI) / 180), 0.05);
  return plateEquivalent(p, isKinetic(r.family)) / cos;
}

/** Probability (0..1) of a ricochet / fuze failure at this angle. */
export function ricochetChance(r: Round, angleDeg: number, plateMm: number): number {
  if (isKinetic(r.family) && r.caliber >= 3 * plateMm) return 0; // overmatch
  const [lo, hi] =
    r.family === 'APFSDS' ? [76, 84] :
    r.family === 'AP' || r.family === 'APHE' ? [66, 78] :
    r.family === 'HEAT' ? [76, 85] :
    [78, 86];
  if (angleDeg <= lo) return 0;
  if (angleDeg >= hi) return 1;
  return (angleDeg - lo) / (hi - lo);
}
