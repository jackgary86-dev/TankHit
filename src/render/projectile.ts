import * as THREE from 'three';
import type { ImpactEvent, Round, Trace } from '../sim/types';
import { makeRng } from '../sim/vec';

// ------------------------------------------------------------------ pure: where is the shell at time T?

export type ShellPhase = 'muzzle' | 'flight' | 'inside' | 'ricochet' | 'stopped' | 'gone';

/**
 * Muzzle segment: the first MUZZLE_DUR seconds of a replay are a cut to the gun, where the sabot actually
 * separates, before jumping to the approach the sim traced. Purely visual; trace times are unchanged.
 */
export const MUZZLE_DUR = 0.22;
/** How far back from the trace origin the gun is drawn (true range, capped so the cut stays readable). */
export const muzzleDistance = (range: number) => Math.min(Math.max(range, 8), 25);

export interface ShellPose {
  pos: THREE.Vector3;
  /** Unit direction of travel (nose). */
  dir: THREE.Vector3;
  phase: ShellPhase;
  /** Seconds since the shot started. */
  t: number;
  /** Fraction of penetration left, 1 at launch (drives rod erosion). */
  remaining: number;
  /** Seconds since the first impact (negative before it). */
  sinceImpact: number;
  /** Metres travelled along the current trace (resets at a bounce). */
  along: number;
  /** Kind of the trace being ridden. */
  traceKind: Trace['kind'];
  /** Metres left on the current trace. */
  left: number;
  /** True while riding the last body trace. */
  onLast: boolean;
}

/** Traces that carry the projectile body: the approach/interior shell path and a ricochet bounce. */
export const bodyTraces = (traces: Trace[]) => traces.filter((t) => t.kind === 'shell' || t.kind === 'ricochet');

/**
 * Contact easing: a shell does not glide through a plate at constant speed. Over the last 15 % of the trace that
 * ends at the first impact it decelerates (ease-out); over the first 25 % of the trace that leaves the impact it
 * accelerates back up (ease-in). Trace end points are unchanged so the shot log and timeline still agree.
 */
export function easeContact(k: number, endsAtImpact: boolean, startsAtImpact: boolean): number {
  if (endsAtImpact && k > 0.85) {
    const u = (k - 0.85) / 0.15;
    return 0.85 + 0.15 * (1 - (1 - u) * (1 - u));
  }
  if (startsAtImpact && k < 0.25) {
    const u = k / 0.25;
    return 0.25 * u * u;
  }
  return k;
}

/**
 * Position and heading of the projectile at replay time T. The shell rides its traces in order; once the last
 * trace ends it stays at the end point (stopped) unless it left the vehicle or was consumed.
 */
export function shellPoseAt(traces: Trace[], impacts: ImpactEvent[], T: number, family: Round['family'], muzzleDist = 0): ShellPose {
  const body = bodyTraces(traces);
  const first = impacts[0];
  const sinceImpact = first ? T - first.t : -1;
  const pen0 = first?.penMm ?? 1;
  const pose = (p: { x: number; y: number; z: number }, d: THREE.Vector3, phase: ShellPhase, remaining: number, along = 0, traceKind: Trace['kind'] = 'shell', left = 0, onLast = false): ShellPose => ({
    pos: new THREE.Vector3(p.x, p.y, p.z), dir: d, phase, t: T, remaining, sinceImpact, along, traceKind, left, onLast,
  });
  if (!body.length) return pose({ x: 0, y: -10, z: 0 }, new THREE.Vector3(1, 0, 0), 'gone', 1);
  if (muzzleDist > 0 && T >= 0 && T < MUZZLE_DUR) {
    // At the gun: the shell covers ~2 m during the cut while the petals peel.
    const d = dirOf(body[0]);
    const u = T / MUZZLE_DUR;
    const gun = new THREE.Vector3(body[0].from.x, body[0].from.y, body[0].from.z).addScaledVector(d, -muzzleDist);
    const p = gun.addScaledVector(d, u * 2.0);
    return pose({ x: p.x, y: p.y, z: p.z }, d, 'muzzle', 1, u * 2.0, 'shell');
  }
  // HEAT: the body collapses against the plate over a few hundredths of a second, then is consumed.
  if (family === 'HEAT' && first && T >= first.t) return pose(first.point, dirOf(body[0]), T - first.t < HEAT_COLLAPSE ? 'stopped' : 'gone', 0);
  for (let i = 0; i < body.length; i++) {
    const tr = body[i];
    if (T < tr.t0) {
      const d = dirOf(tr);
      return pose(tr.from, d, 'flight', 1);
    }
    if (T <= tr.t1 || i === body.length - 1) {
      const kRaw = tr.t1 > tr.t0 ? Math.min(1, (T - tr.t0) / (tr.t1 - tr.t0)) : 1;
      const endsAtImpact = !!first && Math.abs(tr.t1 - first.t) < 1e-6;
      const startsAtImpact = !!first && Math.abs(tr.t0 - first.t) < 1e-6 && tr.kind === 'shell';
      const k = easeContact(kRaw, endsAtImpact, startsAtImpact);
      const p = { x: tr.from.x + (tr.to.x - tr.from.x) * k, y: tr.from.y + (tr.to.y - tr.from.y) * k, z: tr.from.z + (tr.to.z - tr.from.z) * k };
      const d = dirOf(tr);
      const len = Math.hypot(tr.to.x - tr.from.x, tr.to.y - tr.from.y, tr.to.z - tr.from.z);
      const along = k * len;
      const remaining = Math.max(0.15, Math.min(1, (tr.energy || pen0) / Math.max(pen0, 1e-6)));
      let phase: ShellPhase = tr.kind === 'ricochet' ? 'ricochet' : first && T >= first.t ? 'inside' : 'flight';
      if (T > tr.t1) {
        // Past the end of the last body trace.
        const last = impacts[impacts.length - 1];
        const left = !last || last.kind === 'ricochet' || (tr.kind === 'shell' && i === body.length - 1 && exitedVehicle(tr, impacts));
        phase = left ? 'gone' : last.kind === 'shatter' || last.kind === 'explode' ? 'gone' : 'stopped';
      }
      return pose(p, d, phase, remaining, along, tr.kind, len - along, i === body.length - 1);
    }
  }
  return pose(body[body.length - 1].to, dirOf(body[body.length - 1]), 'stopped', 0.15);
}

export const HEAT_COLLAPSE = 0.06;

const dirOf = (tr: Trace) => new THREE.Vector3(tr.to.x - tr.from.x, tr.to.y - tr.from.y, tr.to.z - tr.from.z).normalize();

/** The sim draws a 3 m exit tracer when a shell leaves the far side: the last body trace is long and unobstructed. */
function exitedVehicle(last: Trace, impacts: ImpactEvent[]): boolean {
  const len = Math.hypot(last.to.x - last.from.x, last.to.y - last.from.y, last.to.z - last.from.z);
  const lastImp = impacts[impacts.length - 1];
  return len > 2.5 && lastImp?.kind === 'pen';
}

// ------------------------------------------------------------------ meshes

// Finishes per family, matching the ammo-rack colours in render/tank.ts so a shell is identifiable at a glance.
const FAMILY_PAINT: Record<Round['family'], number> = { APFSDS: 0x1d1f22, AP: 0x9aa3ad, APHE: 0x4a4f55, HEAT: 0x5f6a3c, HESH: 0x1a1a1a, HE: 0x4f5a2e };
const BAND_PAINT: Record<Round['family'], number> = { APFSDS: 0xd8d8d8, AP: 0xffffff, APHE: 0xffffff, HEAT: 0x111111, HESH: 0xffd23f, HE: 0xffd23f };

let roughTex: THREE.Texture | null = null;
/** Faint machining/wear roughness so the finishes do not read as flat plastic. */
function roughness(): THREE.Texture | null {
  if (roughTex) return roughTex;
  if (typeof document === 'undefined') return null; // unit tests run without a DOM
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const v = 150 + Math.round(60 * Math.abs(Math.sin(x * 0.9 + y * 0.05)) + (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453 % 1) * 25);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  roughTex = new THREE.CanvasTexture(c);
  roughTex.wrapS = roughTex.wrapT = THREE.RepeatWrapping;
  roughTex.repeat.set(6, 2);
  return roughTex;
}

const paint = (color: number, metalness: number, rough: number) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness, roughnessMap: roughness(), emissive: 0x000000 });
const BRASS = () => new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.45, metalness: 0.85, roughnessMap: roughness() });
const DARK = () => paint(0x3a3d42, 0.7, 0.6);
const TUNGSTEN = () => paint(0x5a5e66, 1.0, 0.3);
/** Painted body for a family, with a lighter ogive on AP shot (bare steel nose). */
const BODY = (f: Round['family']) => paint(FAMILY_PAINT[f], f === 'AP' ? 0.9 : 0.5, f === 'AP' ? 0.4 : 0.6);
/** Thin coloured ring: identification band around the body. */
function markingBand(radius: number, x: number, color: number, width: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.015, radius * 1.015, width, 24, 1, true), new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide }));
  m.rotation.z = -Math.PI / 2;
  m.position.x = x;
  return m;
}

/** Off by default: projectiles are true to calibre and rod length and the auto camera does the work. */
let readableSize = false;
export const setReadableSize = (on: boolean) => (readableSize = on);
export const isReadableSize = () => readableSize;

/** Visual scale: 1 (true scale) unless the readable-size option is on, which inflates small calibres only. */
export function visualScale(r: Round): number {
  if (!readableSize) return 1;
  return r.caliber < 90 ? 1.6 : r.caliber < 110 ? 1.35 : 1.2;
}

/** Ogive (pointed nose) profile revolved around the X axis; length and radius in metres. Nose at +X. */
function ogive(length: number, radius: number, bluntness = 0.0, segments = 24): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const u = i / n; // 0 = base, 1 = nose
    const rr = radius * Math.sqrt(1 - Math.pow(u, 2.2)) * (1 - bluntness) + radius * bluntness * (1 - u);
    pts.push(new THREE.Vector2(Math.max(rr, radius * bluntness * 0.4), u * length));
  }
  const g = new THREE.LatheGeometry(pts, segments);
  g.rotateZ(-Math.PI / 2); // lathe axis Y -> X
  return g;
}

export interface ProjectileParts {
  group: THREE.Group;
  /** Rod/body mesh scaled along X as it erodes. */
  body: THREE.Mesh;
  /** Discarded sabot petals (APFSDS only). */
  petals: THREE.Mesh[];
  cap?: THREE.Mesh;
  /** Overall length (m) at visual scale, nose at +X, base at -X. */
  length: number;
}

/** Build a projectile for a round. The group's +X axis is the nose. */
export function buildProjectile(r: Round): ProjectileParts {
  const s = visualScale(r);
  const group = new THREE.Group();
  const petals: THREE.Mesh[] = [];
  let body: THREE.Mesh;
  let cap: THREE.Mesh | undefined;
  let length: number;
  const cal = (r.caliber / 1000) * s;

  if (r.family === 'APFSDS') {
    const L = r.rodLength ?? 0.5; // rod length is never inflated: it is the one dimension people know
    const D = ((r.rodDiameter ?? 25) / 1000) * s;
    length = L;
    const rodGeo = new THREE.CylinderGeometry(D / 2, D / 2, L * 0.85, 12);
    rodGeo.rotateZ(-Math.PI / 2);
    rodGeo.translate(-L * 0.075, 0, 0);
    const tip = new THREE.ConeGeometry(D / 2, L * 0.15, 12);
    tip.rotateZ(-Math.PI / 2);
    tip.translate(L * 0.425, 0, 0);
    body = new THREE.Mesh(mergeGeo([rodGeo, tip]), TUNGSTEN());
    body.add(markingBand(D / 2, -L * 0.3, BAND_PAINT.APFSDS, L * 0.04));
    // Fins at the base.
    for (let i = 0; i < 5; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.12, D * 2.2, D * 0.25), DARK());
      fin.position.set(-L * 0.44, 0, 0);
      fin.rotation.x = (i / 5) * Math.PI * 2;
      fin.translateY(D * 1.1);
      body.add(fin);
    }
    // Three sabot petals around the rod, discarded right after launch.
    for (let i = 0; i < 3; i++) {
      const petal = new THREE.Mesh(new THREE.CylinderGeometry(cal * 0.48, cal * 0.3, L * 0.4, 10, 1, true, 0, (Math.PI * 2) / 3 - 0.15), BRASS());
      petal.geometry.rotateZ(-Math.PI / 2);
      petal.rotation.x = (i / 3) * Math.PI * 2;
      petal.position.set(L * 0.05, 0, 0);
      petals.push(petal);
      group.add(petal);
    }
    group.add(body);
  } else if (r.family === 'HEAT') {
    length = cal * 4.2;
    const bodyGeo = new THREE.CylinderGeometry(cal / 2, cal * 0.45, length * 0.55, 20);
    bodyGeo.rotateZ(-Math.PI / 2);
    bodyGeo.translate(-length * 0.1, 0, 0);
    const nose = ogive(length * 0.3, cal / 2, 0.1);
    nose.translate(length * 0.175, 0, 0);
    const probe = new THREE.CylinderGeometry(cal * 0.08, cal * 0.06, length * 0.2, 8);
    probe.rotateZ(-Math.PI / 2);
    probe.translate(length * 0.52, 0, 0);
    body = new THREE.Mesh(mergeGeo([bodyGeo, nose, probe]), BODY('HEAT'));
    body.add(markingBand(cal / 2, -length * 0.2, BAND_PAINT.HEAT, cal * 0.12));
    for (let i = 0; i < 6; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(length * 0.14, cal * 0.9, cal * 0.04), DARK());
      fin.position.set(-length * 0.33, 0, 0);
      fin.rotation.x = (i / 6) * Math.PI * 2;
      fin.translateY(cal * 0.6);
      body.add(fin);
    }
    group.add(body);
  } else {
    // Full-calibre shot: AP / APHE / HESH / HE. Driving band + ogive; APCBC gets a ballistic cap.
    const blunt = r.family === 'HESH' ? 0.55 : r.family === 'HE' ? 0.25 : 0.05;
    length = cal * (r.family === 'HESH' ? 3.2 : 3.6);
    const base = new THREE.CylinderGeometry(cal / 2, cal / 2, length * 0.45, 24);
    base.rotateZ(-Math.PI / 2);
    base.translate(-length * 0.275, 0, 0);
    const nose = ogive(length * 0.55, cal / 2, blunt);
    nose.translate(-length * 0.05, 0, 0);
    body = new THREE.Mesh(mergeGeo([base, nose]), BODY(r.family));
    body.add(markingBand(cal / 2, -length * 0.05, BAND_PAINT[r.family], cal * 0.14));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(cal * 0.52, cal * 0.52, cal * 0.18, 24), BRASS());
    band.rotation.z = -Math.PI / 2;
    band.position.set(-length * 0.38, 0, 0);
    body.add(band);
    if (r.capped) {
      cap = new THREE.Mesh(ogive(length * 0.32, cal * 0.42, 0.02), DARK());
      cap.position.set(length * 0.2, 0, 0);
      group.add(cap);
    }
    group.add(body);
  }
  group.traverse((o) => {
    o.castShadow = false;
    (o as THREE.Mesh).renderOrder = 15;
  });
  return { group, body, petals, cap, length };
}

function mergeGeo(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g0 of gs) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

// ------------------------------------------------------------------ animated view

const UP = new THREE.Vector3(0, 1, 0);
const SABOT_T = 0.12; // replay seconds after launch when the petals peel away

/** Drives a projectile mesh along a shot's traces; everything is a function of replay time. */
export class ProjectileView {
  readonly parts: ProjectileParts;
  private trail: THREE.Mesh;
  private tumbleAxis = new THREE.Vector3(0.3, 1, 0.2).normalize();
  /** Shards of the shell body thrown when it shatters or bursts. */
  private chunks: { mesh: THREE.Mesh; dir: THREE.Vector3; speed: number; spin: THREE.Vector3 }[] = [];
  private breakAt: { t: number; point: THREE.Vector3 } | null = null;
  /** Whether the shell leaves the scene at the end of its last trace (miss, exit, ricochet) rather than stopping. */
  private leaves = false;
  private fadeMats: THREE.Material[] = [];

  constructor(readonly round: Round, readonly traces: Trace[], readonly impacts: ImpactEvent[], seed = 1, readonly range = 0) {
    this.parts = buildProjectile(round);
    this.buildChunks(seed);
    this.leaves = shellPoseAt(traces, impacts, 1e6, round.family).phase === 'gone' && round.family !== 'HEAT' && !impacts.some((i) => i.kind === 'shatter' || i.kind === 'explode');
    this.parts.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m && !this.fadeMats.includes(m)) this.fadeMats.push(m);
    });
    // Fading ribbon behind the nose: a unit cone along -X, scaled to the recent path each frame.
    const cone = new THREE.ConeGeometry(1, 1, 10, 1, true);
    cone.rotateZ(Math.PI / 2); // tip toward +X (the shell), base trailing behind
    cone.translate(-0.5, 0, 0);
    this.trail = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0xff4a2a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.trail.renderOrder = 14;
    this.parts.group.add(this.trail);
  }

  get object() {
    return this.parts.group;
  }

  /** Shatter / burst: 6–10 shards cut to the shell's calibre, scattered deterministically from the seed. */
  private buildChunks(seed: number) {
    const ev = this.impacts.find((i) => i.kind === 'shatter' || i.kind === 'explode');
    if (!ev) return;
    this.breakAt = { t: ev.t, point: new THREE.Vector3(ev.point.x, ev.point.y, ev.point.z) };
    const rng = makeRng(seed ^ 0x9e3779b9);
    const cal = this.round.caliber / 1000;
    const n = 6 + Math.floor(rng() * 5);
    const axis = new THREE.Vector3(ev.normal.x, ev.normal.y, ev.normal.z).normalize();
    // Shatter sprays back off the face; a burst goes everywhere.
    const burst = ev.kind === 'explode';
    const mat = (this.parts.body.material as THREE.MeshStandardMaterial).clone();
    for (let i = 0; i < n; i++) {
      const size = cal * (0.18 + rng() * 0.3);
      const geo = new THREE.TetrahedronGeometry(size, 0);
      geo.scale(1, 0.5 + rng(), 0.6 + rng() * 0.6);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 15;
      const d = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
      if (!burst && d.dot(axis) < 0.2) d.add(axis.clone().multiplyScalar(1.2)).normalize();
      this.chunks.push({ mesh, dir: d, speed: (burst ? 4 : 2.5) * (0.5 + rng()), spin: new THREE.Vector3(rng(), rng(), rng()).multiplyScalar(12) });
    }
  }

  /** Chunks live in world space beside the projectile group. */
  get chunkObjects() {
    return this.chunks.map((c) => c.mesh);
  }

  private updateChunks(T: number) {
    if (!this.breakAt) return;
    const age = T - this.breakAt.t;
    for (const c of this.chunks) {
      c.mesh.visible = age >= 0 && age < 1.4;
      if (!c.mesh.visible) continue;
      const travel = (c.speed * (1 - Math.exp(-age * 3))) / 3; // drag-limited
      c.mesh.position.copy(this.breakAt.point).addScaledVector(c.dir, travel).add(new THREE.Vector3(0, -4.9 * age * age, 0));
      if (c.mesh.position.y < 0.02) c.mesh.position.y = 0.02;
      c.mesh.rotation.set(c.spin.x * age, c.spin.y * age, c.spin.z * age);
      (c.mesh.material as THREE.MeshStandardMaterial).opacity = 1;
    }
  }

  update(T: number) {
    this.updateChunks(T);
    const p = shellPoseAt(this.traces, this.impacts, T, this.round.family, this.range > 0 ? muzzleDistance(this.range) : 0);
    const g = this.parts.group;
    g.visible = p.phase !== 'gone' && T >= 0;
    if (!g.visible) return;
    // Leaving the scene: fade over the last metre of the final trace instead of popping out.
    const fade = this.leaves && p.onLast && p.phase !== 'stopped' ? Math.min(1, p.left / 1.0) : 1;
    for (const m of this.fadeMats) {
      m.transparent = fade < 1 || m.transparent;
      m.opacity = fade < 1 ? fade * (m === (this.trail?.material as THREE.Material) ? 0.55 : 1) : m === (this.trail?.material as THREE.Material) ? m.opacity : 1;
    }
    g.position.copy(p.pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), p.dir);
    const launchT = bodyTraces(this.traces)[0]?.t0 ?? 0;
    // With a muzzle cut the petals separate at the gun; otherwise shortly after the trace starts.
    const sinceLaunch = this.range > 0 ? T + 0.1 : T - launchT;
    const sinceLaunchBody = Math.max(0, sinceLaunch);
    // Trail: up to half a metre of the path just flown, thinner and dimmer as it ages; none while sitting still.
    const trailLen = p.phase === 'stopped' ? 0 : Math.min(0.5, p.along);
    this.trail.visible = trailLen > 0.02;
    if (this.trail.visible) {
      const r = (this.round.caliber / 1000) * 0.45;
      this.trail.scale.set(trailLen, r, r);
      this.trail.position.x = -this.parts.length * 0.5;
      const tm = this.trail.material as THREE.MeshBasicMaterial;
      tm.color.setHex(p.traceKind === 'ricochet' ? 0xffa040 : p.phase === 'inside' ? 0xffc080 : 0xff4a2a);
      tm.opacity = 0.55 * (trailLen / 0.5);
    }
    // Spin-stabilised shot rotates about its axis; rods do not.
    if (this.round.family !== 'APFSDS' && this.round.family !== 'HEAT') g.rotateX(sinceLaunchBody * 40);
    // Ricochets tumble end over end.
    if (p.phase === 'ricochet') g.rotateOnAxis(this.tumbleAxis, p.sinceImpact * 18);

    // ---- reactions at the plate (all keyed to time since the first impact)
    const body = this.parts.body;
    const first = this.impacts[0];
    const si = p.sinceImpact;
    body.scale.set(1, 1, 1);
    body.position.set(0, 0, 0);
    if (first && si >= 0) {
      const n = new THREE.Vector3(first.normal.x, first.normal.y, first.normal.z);
      if (this.round.family === 'HEAT') {
        // Nose collapses into the plate as the charge fires.
        const u = Math.min(1, si / HEAT_COLLAPSE);
        body.scale.set(1 - 0.7 * u, 1 + 0.4 * u, 1 + 0.4 * u);
        body.position.x = -this.parts.length * 0.35 * u;
      } else if (this.round.family === 'HESH') {
        // Filler squashes into a pancake on the face before it detonates.
        const u = Math.min(1, si / 0.08);
        body.scale.set(1 - 0.85 * u, 1 + 1.8 * u, 1 + 1.8 * u);
        body.position.x = -this.parts.length * 0.42 * u;
        g.visible = si < 0.14;
      } else if (first.kind === 'nonpen' || first.kind === 'shatter') {
        // Crumples against the face, then the spent shot drops away from the plate.
        const u = Math.min(1, si / 0.1);
        body.scale.set(1 - 0.45 * u, 1 + 0.25 * u, 1 + 0.25 * u);
        if (si > 0.1) {
          const f = si - 0.1;
          const drop = new THREE.Vector3(first.point.x, first.point.y, first.point.z).addScaledVector(n, 0.08 + f * 0.6).add(new THREE.Vector3(0, -4.9 * f * f, 0));
          g.position.copy(drop);
          g.rotateOnAxis(this.tumbleAxis, f * 9);
          g.visible = first.kind !== 'shatter' && drop.y > 0.05 && f < 1.5;
        }
      }
    }
    // Rod erosion inside the target: shorten from the nose and heat the tip.
    if (this.round.family === 'APFSDS' && first?.kind === 'pen') {
      const k = p.phase === 'inside' || p.phase === 'stopped' ? p.remaining : 1;
      body.scale.set(k, 1, 1);
      body.position.x = -this.parts.length * 0.5 * (1 - k);
      const mat = body.material as THREE.MeshStandardMaterial;
      const heat = p.sinceImpact >= 0 ? Math.max(0, 1 - p.sinceImpact / 1.5) : 0;
      mat.emissive.setRGB(heat * 1.4, heat * 0.5, heat * 0.08); // bright enough to bloom
    } else {
      const mat = body.material as THREE.MeshStandardMaterial;
      if (this.round.family === 'APFSDS') {
        const heat = p.sinceImpact >= 0 ? Math.max(0, 1 - p.sinceImpact / 1.5) : 0;
        mat.emissive.setRGB(heat, heat * 0.35, heat * 0.05);
      }
      const heat = p.sinceImpact >= 0 ? Math.max(0, 0.6 - p.sinceImpact / 1.2) : 0;
      mat.emissive.setRGB(heat * 1.2, heat * 0.45, heat * 0.08);
    }
    // Ballistic cap is stripped on the first plate.
    if (this.parts.cap) this.parts.cap.visible = p.sinceImpact < 0;

    // Sabot petals peel outward and fall behind after launch.
    for (let i = 0; i < this.parts.petals.length; i++) {
      const petal = this.parts.petals[i];
      const a = sinceLaunch - SABOT_T;
      // Petals only exist in the muzzle cut (or, without one, in the first second of flight).
      petal.visible = a < 1.2 && (this.range <= 0 || p.phase === 'muzzle');
      if (a <= 0) {
        petal.position.set(this.parts.length * 0.05, 0, 0);
        petal.rotation.set((i / 3) * Math.PI * 2, 0, 0);
        continue;
      }
      // Local frame: +X nose. Petals swing out radially and lag behind.
      const ang = (i / 3) * Math.PI * 2;
      const radial = new THREE.Vector3(0, Math.cos(ang), Math.sin(ang));
      petal.position.copy(radial.multiplyScalar(a * 1.6)).add(new THREE.Vector3(-a * 2.2, -a * a * 2.0, 0));
      petal.rotation.set(ang, 0, -a * 4);
    }
  }

  dispose() {
    for (const c of this.chunks) {
      c.mesh.removeFromParent();
      c.mesh.geometry.dispose();
    }
    this.parts.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    this.parts.group.removeFromParent();
  }
}

export { UP };
