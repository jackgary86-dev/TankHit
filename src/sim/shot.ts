// Shot simulation: traces the projectile through armor and interior and records a replayable timeline.
import { dirToLocal, dirToWorld, groupToWorld, IDENTITY, toLocal, type Frame } from './frame';
import { normalOf, rayBox, rayPlate } from './geometry';
import { fuzeArms, isKinetic, losThickness, penetrationAt, ricochetChance, shatterChance, velocityAt } from './penetration';
import { aliveCrew, checkIncapacitated, cloneState } from './state';
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
import { DEG, dist, dot, madd, makeRng, norm, randomInCone, scale, sub, type Rng, type Vec3 } from './vec';

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

/** Outward plate normal in world space, accounting for turret traverse. */
export const worldNormal = (p: Plate, f: Frame) => (p.group === 'turret' ? dirToWorld(normalOf(p), f) : normalOf(p));

/** Everything the ray touches, sorted by distance. Spent ERA and destroyed ammo are skipped. */
export function collectHits(v: Vehicle, s: VehicleState, origin: Vec3, dir: Vec3, o: CollectOpts = {}, f: Frame = IDENTITY): HitTarget[] {
  const maxT = o.maxT ?? Infinity;
  const out: HitTarget[] = [];
  // Turret-group geometry is tested in the turret's local frame; distances along the ray are unchanged.
  const oL = toLocal(origin, f);
  const dL = dirToLocal(dir, f);
  const O = (g: string) => (g === 'turret' ? oL : origin);
  const D = (g: string) => (g === 'turret' ? dL : dir);
  if (o.plates !== false) {
    for (const p of v.plates) {
      if (p.kind === 'era' && s.eraSpent[p.id]) continue;
      const t = rayPlate(O(p.group), D(p.group), p);
      if (t !== null && t <= maxT) out.push({ kind: 'plate', t, plate: p });
    }
  }
  if (o.modules !== false) {
    for (const m of v.modules) {
      if (s.ammoGone[m.id]) continue;
      const t = rayBox(O(m.group), D(m.group), m.box);
      if (t !== null && t <= maxT) out.push({ kind: 'module', t, module: m });
    }
  }
  if (o.crew !== false) {
    for (const c of v.crew) {
      for (const z of c.zones) {
        const t = rayBox(O(c.group), D(c.group), z.box);
        if (t !== null && t <= maxT) out.push({ kind: 'crew', t, crew: c, zone: z });
      }
    }
  }
  out.sort((a, b) => a.t - b.t);
  // Mantlets, hatches and MG mounts cover an opening in the plate behind them.
  const covered = new Set<string>();
  const coverT: Record<string, number> = {};
  for (const h of out) {
    if (h.kind === 'plate' && h.plate.covers) for (const id of h.plate.covers) { covered.add(id); coverT[id] = h.t; }
  }
  const uncovered = covered.size
    ? out.filter((h) => !(h.kind === 'plate' && covered.has(h.plate.id) && h.t >= coverT[h.plate.id] && h.t - coverT[h.plate.id] < 0.6))
    : out;
  // A ray crossing the seam between two plates touches both at the same distance – charge only one.
  return uncovered.filter((h, i) => !(h.kind === 'plate' && i > 0 && uncovered[i - 1].kind === 'plate' && h.t - uncovered[i - 1].t < 2e-3));
}

/**
 * Multiplier applied to a penetrator's remaining penetration by an explosive reactive armor block.
 * Blocks of 20 mm+ are treated as heavy (Kontakt-5 style) and also bite long rods.
 */
export function eraFactor(p: Plate, r: Round): number {
  const heavy = p.mm >= 20;
  if (r.family === 'HEAT') return heavy ? 0.4 : 0.45;
  if (r.family === 'APFSDS') return heavy ? 0.75 : 0.95;
  if (r.family === 'AP' || r.family === 'APHE') return heavy ? 0.85 : 0.97;
  return 1;
}

/** HEAT jets lose penetration per metre travelled through air after the charge fires. */
export const JET_AIR_LOSS = 90;

/** Impact angle in degrees between the ray and the plate normal (0 = perpendicular). */
export const impactAngle = (dir: Vec3, p: Plate, f: Frame = IDENTITY) => Math.acos(Math.min(1, Math.abs(dot(dir, worldNormal(p, f))))) / DEG;

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
export const frameOf = (v: Vehicle, yawDeg = 0): Frame => ({ pivot: v.turretPivot, yaw: yawDeg * DEG });

export function previewShot(v: Vehicle, s: VehicleState, r: Round, origin: Vec3, dir: Vec3, distance: number, yawDeg = 0): Preview | null {
  const f = frameOf(v, yawDeg);
  const hits = collectHits(v, s, origin, dir, { modules: false, crew: false }, f);
  const first = hits.find((h) => h.kind === 'plate') as Extract<HitTarget, { kind: 'plate' }> | undefined;
  if (!first) return null;
  const p = first.plate;
  const angleDeg = impactAngle(dir, p, f);
  let losMm = p.kind === 'era' ? 0 : losThickness(p, angleDeg, r);
  let penMm = penetrationAt(r, distance);
  // Fold ERA / spaced armor into the main plate behind it (within 0.8 m).
  if (p.kind !== 'plate') {
    if (p.kind === 'era') penMm *= eraFactor(p, r);
    const behind = hits.find((h) => h.kind === 'plate' && h.plate.kind === 'plate' && h.t - first.t < 0.8) as typeof first | undefined;
    if (behind) {
      losMm += losThickness(behind.plate, impactAngle(dir, behind.plate, f), r);
      if (r.family === 'HEAT') penMm -= JET_AIR_LOSS * (behind.t - first.t);
    }
  }
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
  readonly frame: Frame;
  /** World-space outward normal of a plate. */
  readonly nrm = (p: Plate) => worldNormal(p, this.frame);
  /** World position of a point authored in a group's space. */
  readonly wp = (g: 'hull' | 'turret', p: Vec3) => groupToWorld(g, p, this.frame);
  readonly res: ShotResult;
  penetrated = false;
  armorDefeated = 0;
  firstLos = 0;
  firstAngle = 0;
  firstPlate?: string;
  residual = 0;
  spallCount = 0;
  /** Ammo struck this shot that rolled an ignition, with the time it caught. */
  ignitions = new Map<string, number>();
  fuelFire: { t: number; point: Vec3 } | null = null;

  constructor(readonly v: Vehicle, readonly r: Round, readonly input: ShotInput, before: VehicleState) {
    this.rng = makeRng(input.seed);
    this.frame = frameOf(v, input.turretYaw ?? 0);
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
    const hits = collectHits(v, state, input.origin, dir, {}, this.frame);
    let pos = input.origin;
    let t = 0;
    let entered = false;
    let fuzeAt = Infinity; // ray distance at which an APHE filler goes off
    let exploded = false;
    let exited = false;
    if (!hits.some((h) => h.kind === 'plate')) this.trace('shell', input.origin, madd(input.origin, dir, 14), 0, SPEED.approach, P);
    const explode = (at: number) => {
      const point = madd(input.origin, dir, at);
      t = this.trace('shell', pos, point, t, SPEED.shell, P);
      pos = point;
      exploded = true;
      this.res.impacts.push({ t, kind: 'explode', point, normal: scale(dir, -1) });
      this.emitFragments(point, dir, t, Math.min(90, Math.round(30 + r.filler * 400)), 100, 40 + r.filler * 250, 'frag');
    };

    for (const h of hits) {
      if (h.t > fuzeAt && !exploded) {
        explode(fuzeAt);
        break;
      }
      const point = madd(input.origin, dir, h.t);
      t = this.trace(entered ? 'shell' : 'shell', pos, point, t, entered ? SPEED.shell : SPEED.approach, P);
      pos = point;
      if (h.kind === 'plate') {
        const p = h.plate;
        const angle = impactAngle(dir, p, this.frame);
        const n = this.nrm(p);
        const entering = dot(dir, n) < 0;
        if (p.kind === 'era') {
          P *= eraFactor(p, r);
          state.eraSpent[p.id] = true;
          this.res.impacts.push({ t, kind: 'era', point, normal: n, plateId: p.id, penMm: P, angleDeg: angle });
          continue;
        }
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
        if (entering && !entered && this.rng() < shatterChance(r, velocityAt(r, input.distance), p.mm)) {
          this.res.impacts.push({ t, kind: 'shatter', point, normal: n, plateId: p.id, losMm: los, penMm: P, angleDeg: angle });
          this.emitFragments(madd(point, n, 0.02), n, t, 14, 70, 20, 'frag');
          P = 0;
          break;
        }
        if (P >= los) {
          P -= los;
          this.armorDefeated += los;
          this.penetrated = this.penetrated || (entering && p.kind === 'plate');
          this.res.impacts.push({ t, kind: 'pen', point, normal: n, plateId: p.id, losMm: los, penMm: P + los, angleDeg: angle });
          if (entering && r.family === 'APHE' && fuzeAt === Infinity && fuzeArms(r, p.mm)) fuzeAt = h.t + (r.fuzeDelay ?? 1.2);
          entered = entering && p.kind === 'plate' ? true : entered;
          if (entering && p.kind === 'plate') this.spallFromPen(madd(point, dir, 0.03), dir, n, t, P, p.mm);
          if (!entering && entered) {
            // Leaving the vehicle: an APHE fuze still running means over-penetration with no burst.
            exited = true;
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
    // APHE that stopped inside (or never reached its fuze distance before stopping) goes off where it is.
    if (fuzeAt !== Infinity && !exploded && !exited) explode(Math.min(fuzeAt, dist(input.origin, pos)));
    this.residual = Math.max(0, P);
    return this.finish();
  }

  /** First plate (outer surface) the shell strikes, with the approach tracer drawn. */
  private strike(): { h: Extract<HitTarget, { kind: 'plate' }>; point: Vec3; t: number; angle: number; hits: HitTarget[] } | null {
    const { v, input, state } = this;
    const dir = norm(input.dir);
    const hits = collectHits(v, state, input.origin, dir, {}, this.frame);
    const idx = hits.findIndex((h) => h.kind === 'plate');
    if (idx < 0) {
      this.trace('shell', input.origin, madd(input.origin, dir, 14), 0, SPEED.approach, 0);
      return null;
    }
    const h = hits[idx] as Extract<HitTarget, { kind: 'plate' }>;
    const point = madd(input.origin, dir, h.t);
    const t = this.trace('shell', input.origin, point, 0, SPEED.approach, 1);
    const angle = impactAngle(dir, h.plate, this.frame);
    if (!this.firstPlate) {
      this.firstPlate = h.plate.id;
      this.firstAngle = angle;
      this.firstLos = h.plate.kind === 'era' ? 0 : losThickness(h.plate, angle, this.r);
    }
    return { h, point, t, angle, hits: hits.slice(idx) };
  }

  /** Shaped charge: the jet forms at the first plate (skirts and ERA set it off early). */
  runHeat() {
    const { r, state } = this;
    const dir = norm(this.input.dir);
    const s0 = this.strike();
    if (!s0) return this.finish();
    const n0 = this.nrm(s0.h.plate);
    if (this.rng() < ricochetChance(r, s0.angle, s0.h.plate.mm)) {
      this.res.impacts.push({ t: s0.t, kind: 'ricochet', point: s0.point, normal: n0, plateId: s0.h.plate.id, angleDeg: s0.angle });
      const refl = norm(sub(dir, scale(n0, 2 * dot(dir, n0))));
      this.trace('ricochet', s0.point, madd(s0.point, refl, 4), s0.t, SPEED.approach, 1);
      return this.finish();
    }
    let P = penetrationAt(r, this.input.distance);
    let t = s0.t;
    let pos = s0.point;
    let prevT = s0.h.t;
    let entered = false;
    for (const h of s0.hits) {
      P -= JET_AIR_LOSS * Math.max(0, h.t - prevT);
      prevT = h.t;
      if (P <= 0) break;
      const point = madd(this.input.origin, dir, h.t);
      t = this.trace('jet', pos, point, t, SPEED.jet, P);
      pos = point;
      if (h.kind === 'plate') {
        const p = h.plate;
        const angle = impactAngle(dir, p, this.frame);
        const n = this.nrm(p);
        const entering = dot(dir, n) < 0;
        if (p.kind === 'era') {
          P *= eraFactor(p, r);
          state.eraSpent[p.id] = true;
          this.res.impacts.push({ t, kind: 'era', point, normal: n, plateId: p.id, penMm: P, angleDeg: angle });
          continue;
        }
        const los = losThickness(p, angle, r);
        if (P >= los) {
          P -= los;
          this.armorDefeated += los;
          this.penetrated = this.penetrated || (entering && p.kind === 'plate');
          this.res.impacts.push({ t, kind: 'pen', point, normal: n, plateId: p.id, losMm: los, penMm: P + los, angleDeg: angle });
          if (entering && p.kind === 'plate') {
            entered = true;
            this.spallFromPen(madd(point, dir, 0.03), dir, n, t, P, p.mm);
          } else if (!entering && entered) {
            this.trace('jet', point, madd(point, dir, Math.min(2, P / JET_AIR_LOSS)), t, SPEED.jet, P);
            break;
          }
        } else {
          this.res.impacts.push({ t, kind: 'nonpen', point, normal: n, plateId: p.id, losMm: los, penMm: P, angleDeg: angle });
          P = 0;
          break;
        }
      } else if (entered) {
        P = this.hitInternal(h, point, dir, t, P * 0.8);
      }
    }
    if (P > 0 && !entered) this.trace('jet', pos, madd(pos, dir, Math.min(1.5, P / JET_AIR_LOSS)), t, SPEED.jet, P);
    this.residual = Math.max(0, P);
    return this.finish();
  }

  /** High-explosive squash head: no penetration, scabs the inside face of thin homogeneous plates. */
  runHesh() {
    const { r, state } = this;
    const s0 = this.strike();
    if (!s0) return this.finish();
    const p = s0.h.plate;
    const n = this.nrm(p);
    if (s0.angle > 80) {
      this.res.impacts.push({ t: s0.t, kind: 'ricochet', point: s0.point, normal: n, plateId: p.id, angleDeg: s0.angle });
      return this.finish();
    }
    if (p.kind === 'era') state.eraSpent[p.id] = true;
    const scabs = p.kind === 'plate' && !p.layers && p.mm <= r.caliber * 1.3 && s0.angle < 70;
    if (!scabs) {
      this.res.impacts.push({ t: s0.t, kind: 'explode', point: s0.point, normal: n, plateId: p.id, angleDeg: s0.angle, losMm: p.mm });
      return this.finish();
    }
    this.penetrated = false;
    this.res.impacts.push({ t: s0.t, kind: 'scab', point: s0.point, normal: n, plateId: p.id, angleDeg: s0.angle, losMm: p.mm });
    const inner = madd(s0.point, n, -(p.mm / 1000) - 0.02);
    const strength = 1 - p.mm / (r.caliber * 1.3) * 0.6;
    this.emitFragments(inner, scale(n, -1), s0.t + 0.05, Math.round(30 + r.filler * 12), 55, (40 + r.filler * 8) * strength, 'spall');
    return this.finish();
  }

  /** Fragmentation HE: punches thin plates, otherwise blast on the outside (overpressure through thin roofs). */
  runHe() {
    const { r, v, state } = this;
    const dir = norm(this.input.dir);
    const s0 = this.strike();
    if (!s0) return this.finish();
    const p = s0.h.plate;
    const n = this.nrm(p);
    if (this.rng() < ricochetChance(r, s0.angle, p.mm)) {
      this.res.impacts.push({ t: s0.t, kind: 'ricochet', point: s0.point, normal: n, plateId: p.id, angleDeg: s0.angle });
      return this.finish();
    }
    if (p.kind === 'era') state.eraSpent[p.id] = true;
    const pen = penetrationAt(r, this.input.distance);
    const los = losThickness(p, s0.angle, r);
    if (p.kind === 'plate' && pen >= los) {
      this.penetrated = true;
      this.armorDefeated = los;
      this.res.impacts.push({ t: s0.t, kind: 'pen', point: s0.point, normal: n, plateId: p.id, losMm: los, penMm: pen, angleDeg: s0.angle });
      const inside = madd(s0.point, dir, 0.08);
      this.emitFragments(inside, dir, s0.t + 0.02, Math.round(30 + r.filler * 20), 75, 35 + r.filler * 10, 'frag');
      this.residual = pen - los;
      return this.finish();
    }
    this.res.impacts.push({ t: s0.t, kind: 'explode', point: s0.point, normal: n, plateId: p.id, losMm: los, penMm: pen, angleDeg: s0.angle });
    // Overpressure through a thin roof hurts the crew compartment beneath it.
    if (n.y > 0.7 && p.mm <= 25 && r.filler >= 1) {
      for (const c of v.crew.filter((c) => c.group === p.group || p.group === 'hull')) {
        const torso = c.zones.find((z) => z.zone === 'torso')!;
        const head = c.zones.find((z) => z.zone === 'head')!;
        const hc = this.wp(c.group, { x: (head.box.min.x + head.box.max.x) / 2, y: (head.box.min.y + head.box.max.y) / 2, z: (head.box.min.z + head.box.max.z) / 2 });
        if (dist(hc, s0.point) > 1.6) continue;
        this.damageCrew(c, torso, 22 * r.filler, hc, { x: 0, y: -1, z: 0 }, s0.t + 0.05, 0.04);
        this.damageCrew(c, head, 10 * r.filler, hc, { x: 0, y: -1, z: 0 }, s0.t + 0.05, 0.03);
      }
    }
    return this.finish();
  }

  /** Penetrator passes through an internal module / crew zone. Returns remaining pen. */
  hitInternal(h: HitTarget, point: Vec3, dir: Vec3, t: number, P: number): number {
    if (h.kind === 'module') {
      this.damageModule(h.module, 60 + P * 0.3, point, t, true);
      return P - h.module.absorb;
    }
    if (h.kind !== 'crew') return P;
    this.damageCrew(h.crew, h.zone, 80 + P * 0.2, point, dir, t, 0.5);
    return P - 4;
  }

  damageModule(m: Module, amount: number, point: Vec3, t: number, byPenetrator: boolean) {
    const hp = this.state.moduleHp[m.id];
    if (hp <= 0 && !m.ammo) return;
    const dmg = Math.min(Math.max(hp, 0), amount);
    this.state.moduleHp[m.id] = hp - dmg;
    this.res.moduleHits.push({ t, moduleId: m.id, damage: dmg, hpAfter: hp - dmg, point });
    if (m.ammo && !this.ignitions.has(m.id)) {
      let chance = byPenetrator ? 0.8 : Math.min(0.6, amount / 90);
      chance *= 0.6 + Math.min(1, m.ammo.propellant / 6) * 0.6;
      if (this.r.penMaterial === 'du') chance += 0.15; // pyrophoric DU fragments
      if (this.rng() < chance) this.ignitions.set(m.id, t);
    }
    if (m.type === 'fuel' && !this.fuelFire) {
      const chance = byPenetrator ? 0.35 : Math.min(0.2, amount / 300);
      if (this.rng() < chance) this.fuelFire = { t, point };
    }
  }

  /** Propagate ammo fires through racks; detonate or vent through blow-out panels. */
  resolveCookoff() {
    const { v, state } = this;
    if (this.fuelFire) {
      state.onFire = true;
      this.res.bigEvents.push({ t: this.fuelFire.t + 0.1, kind: 'fire', point: this.fuelFire.point });
    }
    if (!this.ignitions.size) return;
    const ammo = v.modules.filter((m) => m.ammo && !state.ammoGone[m.id]);
    const centre = (m: Module) => this.wp(m.group, { x: (m.box.min.x + m.box.max.x) / 2, y: (m.box.min.y + m.box.max.y) / 2, z: (m.box.min.z + m.box.max.z) / 2 });
    const lit = new Map<string, number>();
    const queue = [...this.ignitions.entries()].map(([id, t]) => ({ id, t }));
    while (queue.length) {
      queue.sort((a, b) => a.t - b.t);
      const { id, t } = queue.shift()!;
      if (lit.has(id)) continue;
      lit.set(id, t);
      const m = v.modules.find((x) => x.id === id)!;
      // A direct penetrator hit on a high-explosive round can detonate it outright.
      const c = centre(m);
      for (const n of ammo) {
        if (lit.has(n.id)) continue;
        const d = dist(c, centre(n));
        const sameRack = n.ammo!.rack === m.ammo!.rack;
        if (d > (sameRack ? 0.32 : 0.25)) continue;
        if (this.rng() < (sameRack ? 0.62 : 0.3)) queue.push({ id: n.id, t: t + 0.18 + this.rng() * 0.45 });
      }
    }
    for (const [id, t] of lit) {
      this.res.ammoEvents.push({ t, moduleId: id, kind: 'ignite' });
      this.res.ammoEvents.push({ t: t + 0.35, moduleId: id, kind: 'burn' });
      state.ammoGone[id] = true;
      state.moduleHp[id] = 0;
      this.res.duration = Math.max(this.res.duration, t + 0.6);
    }
    state.onFire = true;
    const firstT = Math.min(...lit.values());
    const firstM = v.modules.find((x) => x.id === [...lit.entries()].find(([, t]) => t === firstT)![0])!;
    this.res.bigEvents.push({ t: firstT + 0.1, kind: 'fire', point: centre(firstM), rack: firstM.ammo!.rack });

    // Racks that reach their threshold detonate (or vent if isolated).
    const heHit = [...this.ignitions.keys()].some((id) => (v.modules.find((x) => x.id === id)!.ammo!.filler ?? 0) > 0.5);
    for (const rack of v.racks) {
      const inRack = [...lit.entries()].filter(([id]) => v.modules.find((x) => x.id === id)!.ammo!.rack === rack.id).sort((a, b) => a[1] - b[1]);
      if (!inRack.length) continue;
      const threshold = heHit ? Math.max(1, rack.detonateAt - 2) : rack.detonateAt;
      if (inRack.length < threshold) continue;
      const t = inRack[threshold - 1][1] + 0.3;
      const rackMods = v.modules.filter((x) => x.ammo?.rack === rack.id);
      const pts = rackMods.map(centre);
      const point = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length, z: pts.reduce((a, p) => a + p.z, 0) / pts.length };
      for (const m of rackMods) {
        if (!state.ammoGone[m.id]) this.res.ammoEvents.push({ t: t + this.rng() * 0.2, moduleId: m.id, kind: rack.isolated ? 'burn' : 'detonate' });
        state.ammoGone[m.id] = true;
        state.moduleHp[m.id] = 0;
      }
      if (rack.isolated) {
        this.res.bigEvents.push({ t, kind: 'blowout', point, rack: rack.id });
        this.res.duration = Math.max(this.res.duration, t + 2.5);
      } else {
        this.res.bigEvents.push({ t, kind: 'detonation', point, rack: rack.id });
        this.emitFragments(point, { x: 0, y: 1, z: 0 }, t, 60, 180, 140, 'frag');
        for (const c of v.crew) state.crew[c.id].incapacitated = true;
        state.destroyed = true;
        this.res.duration = Math.max(this.res.duration, t + 3.5);
        break;
      }
    }
    // Burning propellant scorches crew close to it (if the vehicle didn't simply explode).
    if (!state.destroyed) {
      for (const c of v.crew) {
        const torso = c.zones.find((z) => z.zone === 'torso')!;
        const tc = this.wp(c.group, { x: (torso.box.min.x + torso.box.max.x) / 2, y: (torso.box.min.y + torso.box.max.y) / 2, z: (torso.box.min.z + torso.box.max.z) / 2 });
        for (const [id, t] of lit) {
          const m = v.modules.find((x) => x.id === id)!;
          if (v.racks.find((r) => r.id === m.ammo!.rack)?.isolated) continue;
          if (dist(tc, centre(m)) < 0.9) {
            this.damageCrew(c, torso, 30, tc, norm(sub(tc, centre(m))), t + 0.4, 0.06);
            break;
          }
        }
      }
    }
  }

  /** Gel dummy hit: subtract zone HP, record a wound channel, check incapacitation. */
  damageCrew(c: Crew, z: CrewZone, amount: number, point: Vec3, dir: Vec3, t: number, length: number) {
    const st = this.state.crew[c.id];
    const mult = z.zone === 'head' ? 1.6 : z.zone === 'torso' ? 1.1 : 0.8;
    const dmg = amount * mult;
    st.zoneHp[z.zone] -= dmg;
    this.res.crewHits.push({ t, crewId: c.id, zone: z.zone, point, dir, length, damage: dmg });
    if (!st.incapacitated && checkIncapacitated(this.v, c.id, st.zoneHp)) st.incapacitated = true;
  }

  /** Spall cone thrown off the inside face after a penetration; `n` is the plate's outward normal. */
  spallFromPen(exit: Vec3, dir: Vec3, n: Vec3, t: number, residual: number, plateMm: number) {
    const r = this.r;
    // The cone leans from the shot line toward the plate's inner normal (the back face throws scabs straight off).
    const axis = norm(madd(dir, n, -0.6));
    const resF = 0.6 + Math.min(1, residual / 200) * 0.6;
    let count: number, half: number, energy: number;
    switch (r.family) {
      case 'APFSDS':
        count = 18 + residual / 12; half = 16; energy = 38; break;
      case 'AP':
        count = 22 + r.caliber / 4 + residual / 8; half = 24; energy = 46; break;
      case 'APHE':
        count = 14 + r.caliber / 6 + residual / 12; half = 22; energy = 40; break;
      case 'HEAT':
        count = 12 + residual / 15; half = 10; energy = 52; break;
      default:
        count = 20; half = 30; energy = 35;
    }
    count *= 0.7 + Math.min(plateMm, 150) / 250; // thicker plates throw more spall
    this.emitFragments(exit, axis, t, Math.min(70, Math.round(count)), half, energy * resF, 'spall');
  }

  /** Emit `count` fragments in a cone (half-angle deg; 180 = sphere) and trace each through the interior. */
  emitFragments(origin: Vec3, axis: Vec3, t0: number, count: number, halfDeg: number, energy: number, kind: 'spall' | 'frag') {
    const speed = kind === 'spall' ? SPEED.spall : SPEED.frag;
    for (let i = 0; i < count; i++) {
      const d = randomInCone(axis, halfDeg * DEG, this.rng);
      let E = energy * (0.55 + this.rng() * 0.9);
      const range = 1.5 + E / 18;
      const hits = collectHits(this.v, this.state, origin, d, { maxT: range }, this.frame);
      let end = madd(origin, d, range);
      for (const h of hits) {
        const p = madd(origin, d, h.t);
        const th = t0 + h.t / speed;
        if (h.kind === 'plate') {
          end = p;
          E = 0;
          break;
        }
        if (h.kind === 'module') {
          this.damageModule(h.module, E * 0.6, p, th, false);
          E -= h.module.absorb * 1.5;
        } else {
          this.damageCrew(h.crew, h.zone, E * 0.7, p, d, th, Math.min(0.35, 0.05 + E / 250));
          E -= 25;
        }
        if (E <= 4) {
          end = p;
          break;
        }
      }
      this.trace(kind, origin, end, t0, speed, energy);
      this.spallCount++;
    }
  }

  finish(): ShotResult {
    this.resolveCookoff();
    this.res.summary = summarize(this);
    this.res.duration += 0.8;
    return this.res;
  }
}

export function simulateShot(v: Vehicle, r: Round, input: ShotInput, before: VehicleState): ShotResult {
  const sim = new ShotSim(v, r, input, before);
  switch (r.family) {
    case 'HEAT':
      return sim.runHeat();
    case 'HESH':
      return sim.runHesh();
    case 'HE':
      return sim.runHe();
    default:
      return sim.runKinetic();
  }
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
