// Shot simulation: traces the projectile through armor and interior and records a replayable timeline.
import { normalOf, rayBox, rayPlate } from './geometry';
import { isKinetic, losThickness, penetrationAt, ricochetChance } from './penetration';
import { aliveCrew, cloneState } from './state';
import type {
  Crew,
  CrewZone,
  Module,
  Plate,
  Round,
  ShotInput,
  ShotResult,
  ShotSummary,
  Vehicle,
  VehicleState,
  Verdict,
} from './types';
import { DEG, dist, dot, madd, makeRng, norm, scale, sub, type Rng, type Vec3 } from './vec';

/** Replay-time speeds (metres per replay second). Purely visual pacing. */
export const SPEED = { approach: 8, shell: 3, jet: 5, spall: 2.2, frag: 2.6 } as const;
export const APPROACH = 6; // metres of incoming tracer drawn before impact

export type HitTarget =
  | { kind: 'plate'; t: number; plate: Plate }
  | { kind: 'module'; t: number; module: Module }
  | { kind: 'crew'; t: number; crew: Crew; zone: CrewZone };

export interface CollectOpts {
  plates?: boolean;
  modules?: boolean;
  crew?: boolean;
  maxT?: number;
}

/** Everything the ray touches, sorted by distance. Spent ERA and destroyed ammo are skipped. */
export function collectHits(v: Vehicle, s: VehicleState, origin: Vec3, dir: Vec3, o: CollectOpts = {}): HitTarget[] {
  const maxT = o.maxT ?? Infinity;
  const out: HitTarget[] = [];
  if (o.plates !== false) {
    for (const p of v.plates) {
      if (p.kind === 'era' && s.eraSpent[p.id]) continue;
      const t = rayPlate(origin, dir, p);
      if (t !== null && t <= maxT) out.push({ kind: 'plate', t, plate: p });
    }
  }
  if (o.modules !== false) {
    for (const m of v.modules) {
      if (s.ammoGone[m.id]) continue;
      const t = rayBox(origin, dir, m.box);
      if (t !== null && t <= maxT) out.push({ kind: 'module', t, module: m });
    }
  }
  if (o.crew !== false) {
    for (const c of v.crew) {
      for (const z of c.zones) {
        const t = rayBox(origin, dir, z.box);
        if (t !== null && t <= maxT) out.push({ kind: 'crew', t, crew: c, zone: z });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Impact angle in degrees between the ray and the plate normal (0 = perpendicular). */
export const impactAngle = (dir: Vec3, p: Plate) => Math.acos(Math.min(1, Math.abs(dot(dir, normalOf(p))))) / DEG;

export interface Preview {
  plate: Plate;
  point: Vec3;
  angleDeg: number;
  losMm: number;
  penMm: number;
  ricochet: number;
  /** good = likely pen, marginal, bad = unlikely. */
  rating: 'good' | 'marginal' | 'bad';
}

/** Cheap look-ahead used by the aiming UI: first plate struck, its LOS and the round's penetration. */
export function previewShot(v: Vehicle, s: VehicleState, r: Round, origin: Vec3, dir: Vec3, distance: number): Preview | null {
  const hits = collectHits(v, s, origin, dir, { modules: false, crew: false });
  const first = hits.find((h) => h.kind === 'plate') as Extract<HitTarget, { kind: 'plate' }> | undefined;
  if (!first) return null;
  const p = first.plate;
  const angleDeg = impactAngle(dir, p);
  let losMm = losThickness(p, angleDeg, r);
  // Count a stacked main plate behind spaced armor / ERA within 0.6 m.
  if (p.kind !== 'plate') {
    const behind = hits.find((h) => h.kind === 'plate' && h.plate.kind === 'plate' && h.t - first.t < 0.6) as typeof first | undefined;
    if (behind) losMm += losThickness(behind.plate, impactAngle(dir, behind.plate), r);
  }
  const penMm = penetrationAt(r, distance);
  const ricochet = ricochetChance(r, angleDeg, p.mm);
  let rating: Preview['rating'];
  if (r.family === 'HESH' || r.family === 'HE') {
    rating = r.family === 'HESH' ? (p.mm <= r.caliber * 1.3 && angleDeg < 70 ? 'good' : 'bad') : penMm > losMm ? 'good' : 'bad';
  } else {
    rating = ricochet > 0.5 ? 'bad' : penMm > losMm * 1.1 ? 'good' : penMm > losMm * 0.9 ? 'marginal' : 'bad';
  }
  return { plate: p, point: madd(origin, dir, first.t), angleDeg, losMm, penMm, ricochet, rating };
}

// ------------------------------------------------------------------ simulation

export class ShotSim {
  readonly rng: Rng;
  readonly state: VehicleState;
  readonly res: ShotResult;
  penetrated = false;
  armorDefeated = 0;
  firstLos = 0;
  firstAngle = 0;
  firstPlate?: string;
  residual = 0;
  spallCount = 0;

  constructor(readonly v: Vehicle, readonly r: Round, readonly input: ShotInput, before: VehicleState) {
    this.rng = makeRng(input.seed);
    this.state = cloneState(before);
    this.res = {
      input,
      traces: [],
      impacts: [],
      moduleHits: [],
      crewHits: [],
      ammoEvents: [],
      bigEvents: [],
      stateBefore: cloneState(before),
      stateAfter: this.state,
      summary: undefined as unknown as ShotSummary,
      duration: 0,
    };
  }

  trace(kind: ShotResult['traces'][number]['kind'], from: Vec3, to: Vec3, t0: number, speed: number, energy = 1) {
    const t1 = t0 + dist(from, to) / speed;
    this.res.traces.push({ kind, from, to, t0, t1, energy });
    this.res.duration = Math.max(this.res.duration, t1);
    return t1;
  }

  /** Main projectile path for kinetic rounds. */
  runKinetic() {
    const { v, r, input, state } = this;
    const dir = norm(input.dir);
    let P = penetrationAt(r, input.distance);
    const hits = collectHits(v, state, input.origin, dir);
    let pos = input.origin;
    let t = 0;
    let entered = false;

    for (const h of hits) {
      const point = madd(input.origin, dir, h.t);
      t = this.trace(entered ? 'shell' : 'shell', pos, point, t, entered ? SPEED.shell : SPEED.approach, P);
      pos = point;
      if (h.kind === 'plate') {
        const p = h.plate;
        const angle = impactAngle(dir, p);
        const n = normalOf(p);
        const entering = dot(dir, n) < 0;
        const los = losThickness(p, angle, r);
        if (!this.firstPlate) {
          this.firstPlate = p.id;
          this.firstLos = los;
          this.firstAngle = angle;
        }
        if (entering && this.rng() < ricochetChance(r, angle, p.mm)) {
          this.res.impacts.push({ t, kind: 'ricochet', point, normal: n, plateId: p.id, losMm: los, penMm: P, angleDeg: angle });
          const refl = norm(sub(dir, scale(n, 2 * dot(dir, n))));
          this.trace('ricochet', point, madd(point, refl, 4), t, SPEED.approach, P);
          return this.finish();
        }
        if (P >= los) {
          P -= los;
          this.armorDefeated += los;
          this.penetrated = true;
          this.res.impacts.push({ t, kind: 'pen', point, normal: n, plateId: p.id, losMm: los, penMm: P + los, angleDeg: angle });
          entered = entering ? true : entered;
          if (!entering) {
            // Leaving the vehicle: draw a short exit tracer and stop.
            this.trace('shell', point, madd(point, dir, 3), t, SPEED.approach, P);
            break;
          }
        } else {
          this.res.impacts.push({ t, kind: 'nonpen', point, normal: n, plateId: p.id, losMm: los, penMm: P, angleDeg: angle });
          P = 0;
          break;
        }
      } else if (entered) {
        P = this.hitInternal(h, point, dir, t, P);
        if (P <= 0) break;
      }
    }
    this.residual = Math.max(0, P);
    return this.finish();
  }

  /** Penetrator or fragment passes through an internal module / crew zone. Returns remaining pen. */
  hitInternal(h: HitTarget, point: Vec3, _dir: Vec3, t: number, P: number): number {
    if (h.kind === 'module') {
      const m = h.module;
      const hp = this.state.moduleHp[m.id];
      const dmg = Math.min(hp, 40 + P * 0.5);
      this.state.moduleHp[m.id] = hp - dmg;
      this.res.moduleHits.push({ t, moduleId: m.id, damage: dmg, hpAfter: hp - dmg, point });
      return P - m.absorb;
    }
    return P - 3;
  }

  finish(): ShotResult {
    this.res.summary = summarize(this);
    this.res.duration += 0.8;
    return this.res;
  }
}

export function simulateShot(v: Vehicle, r: Round, input: ShotInput, before: VehicleState): ShotResult {
  const sim = new ShotSim(v, r, input, before);
  return sim.runKinetic();
}

// ------------------------------------------------------------------ summary

function summarize(sim: ShotSim): ShotSummary {
  const { v, res, state } = sim;
  const before = res.stateBefore;
  const crewHit = [...new Set(res.crewHits.map((h) => h.crewId))];
  const crewIncapacitated = v.crew.filter((c) => state.crew[c.id].incapacitated && !before.crew[c.id].incapacitated).map((c) => c.id);
  const modulesDamaged = [...new Set(res.moduleHits.map((h) => h.moduleId))];
  const modulesDestroyed = modulesDamaged.filter((id) => state.moduleHp[id] <= 0 && before.moduleHp[id] > 0);
  const big = res.bigEvents.map((e) => e.kind);
  const cookOff: ShotSummary['cookOff'] = big.includes('detonation') ? 'detonation' : big.includes('blowout') ? 'blowout' : res.ammoEvents.length ? 'fire' : 'none';
  const ricochet = res.impacts[0]?.kind === 'ricochet';
  const anyInside = res.moduleHits.length > 0 || res.crewHits.length > 0 || sim.spallCount > 0;

  let verdict: Verdict;
  const alive = aliveCrew(v, state).length;
  const critical = modulesDestroyed.some((id) => {
    const t = v.modules.find((m) => m.id === id)?.type;
    return t === 'engine' || t === 'breech' || t === 'transmission';
  });
  if (cookOff === 'detonation') verdict = 'Catastrophic (cook-off)';
  else if (alive < 2 || state.destroyed) verdict = 'Knocked out';
  else if (crewIncapacitated.length > 0 || critical) verdict = 'Disabled';
  else if (cookOff === 'blowout') verdict = 'Ammo lost, crew safe';
  else if (crewHit.length > 0) verdict = 'Crew injured';
  else if (ricochet) verdict = 'Ricochet';
  else if (sim.penetrated || anyInside) verdict = 'Penetration – no damage';
  else verdict = 'Non-penetration';
  if (alive < 2) state.destroyed = true;

  return {
    penetrated: sim.penetrated,
    firstPlate: sim.firstPlate,
    armorDefeatedMm: sim.armorDefeated,
    losMm: sim.firstLos,
    penAtTargetMm: penetrationAt(sim.r, sim.input.distance),
    residualMm: sim.residual,
    angleDeg: sim.firstAngle,
    spallCount: sim.spallCount,
    crewHit,
    crewIncapacitated,
    modulesDamaged,
    modulesDestroyed,
    cookOff,
    verdict,
  };
}

export const kineticFamily = isKinetic;
