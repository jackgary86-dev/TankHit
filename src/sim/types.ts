import type { Vec3 } from './vec';

// ---------------------------------------------------------------- materials

export type MaterialId =
  | 'rha'
  | 'cast'
  | 'hha'
  | 'structural'
  | 'ceramic'
  | 'nera'
  | 'textolite'
  | 'rubber'
  | 'air'
  | 'era';

export interface Layer {
  mat: MaterialId;
  mm: number;
}

// ---------------------------------------------------------------- vehicle

export type PlateKind = 'plate' | 'spaced' | 'era';
export type PlateGroup = 'hull' | 'turret';

/** A planar convex armor plate. `pts` is the outer surface; it is extruded inward by its thickness. */
export interface Plate {
  id: string;
  name: string;
  group: PlateGroup;
  pts: Vec3[];
  /** Physical thickness, mm. For composites this equals the sum of layers. */
  mm: number;
  mat: MaterialId;
  layers?: Layer[];
  kind: PlateKind;
  /** A point on the inner side of the plate, used to orient the outward normal. */
  inside: Vec3;
  /** Plates this one sits in front of (mantlet, hatch, MG mount): a ray through this plate skips them. */
  covers?: string[];
}

export type ModuleType =
  | 'engine'
  | 'transmission'
  | 'fuel'
  | 'breech'
  | 'barrel'
  | 'turretRing'
  | 'radio'
  | 'optics'
  | 'autoloader'
  | 'ammo';

export interface Box {
  min: Vec3;
  max: Vec3;
}

export interface Module {
  id: string;
  name: string;
  type: ModuleType;
  group: PlateGroup;
  box: Box;
  /** Render as a cylinder along this axis instead of a box. */
  cyl?: 'x' | 'y' | 'z';
  hp: number;
  /** RHA-equivalent mm a penetrator loses passing through. */
  absorb: number;
  ammo?: AmmoInfo;
}

export interface AmmoInfo {
  rack: string;
  roundFamily: RoundFamily;
  /** kg of propellant – drives cook-off chance. */
  propellant: number;
  /** kg of explosive filler (0 for kinetic rounds). */
  filler: number;
}

export interface AmmoRack {
  id: string;
  name: string;
  /** Isolated behind blast doors with blow-out panels (e.g. Abrams bustle). */
  isolated: boolean;
  /** Ignited rounds needed before the rack detonates. */
  detonateAt: number;
  /** Water-jacketed ("wet") stowage: much harder to ignite and slower to spread. */
  wet?: boolean;
}

export type CrewRole = 'driver' | 'gunner' | 'commander' | 'loader' | 'radioman';
export type CrewZoneId = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR';

export interface CrewZone {
  zone: CrewZoneId;
  box: Box;
  hp: number;
}

export interface Crew {
  id: string;
  role: CrewRole;
  name: string;
  group: PlateGroup;
  zones: CrewZone[];
  /** Seat reference for rendering. */
  seat: Vec3;
}

export interface Vehicle {
  id: string;
  name: string;
  nation: string;
  br: string;
  description: string;
  plates: Plate[];
  modules: Module[];
  crew: Crew[];
  racks: AmmoRack[];
  /** Turret rotates about this point (y is ignored). */
  turretPivot: Vec3;
  /** Visual-only parameters for the renderer. */
  visual: VehicleVisual;
}

export interface VehicleVisual {
  hullLength: number;
  hullWidth: number;
  trackWidth: number;
  groundClearance: number;
  wheelCount: number;
  wheelRadius: number;
  barrel: { from: Vec3; length: number; radius: number };
  color: number;
}

// ---------------------------------------------------------------- rounds

export type RoundFamily = 'APFSDS' | 'AP' | 'APHE' | 'HEAT' | 'HESH' | 'HE';
export type PenMaterial = 'tungsten' | 'du' | 'steel';

export interface Round {
  id: string;
  name: string;
  family: RoundFamily;
  gun: string;
  caliber: number; // mm (bore caliber)
  mass: number; // kg of projectile (penetrator for APFSDS)
  velocity: number; // m/s muzzle
  drag: number; // velocity loss coefficient per metre
  /** APFSDS rod length (m) and diameter (mm). */
  rodLength?: number;
  rodDiameter?: number;
  penMaterial: PenMaterial;
  /** Explosive filler, kg TNT equivalent. */
  filler: number;
  /** APCBC/APHE ballistic cap bonus. */
  capped?: boolean;
  /** HEAT jet penetration in charge diameters. */
  cdFactor?: number;
  /** APHE fuze delay as travel distance (m) after penetration. */
  fuzeDelay?: number;
  description: string;
}

// ---------------------------------------------------------------- damage state

export interface CrewState {
  zoneHp: Record<CrewZoneId, number>;
  incapacitated: boolean;
}

export interface VehicleState {
  moduleHp: Record<string, number>;
  /** Ammo that has burned or detonated. */
  ammoGone: Record<string, boolean>;
  crew: Record<string, CrewState>;
  /** ERA blocks that already fired. */
  eraSpent: Record<string, boolean>;
  destroyed: boolean;
  onFire: boolean;
  /** Surviving crew have abandoned the vehicle (fire, cook-off). */
  abandoned?: boolean;
  /** The commander has taken over the gun after the gunner was lost. */
  gunnerReplaced?: boolean;
}

// ---------------------------------------------------------------- shot results

export type TraceKind = 'shell' | 'jet' | 'spall' | 'frag' | 'ricochet';

export interface Trace {
  kind: TraceKind;
  from: Vec3;
  to: Vec3;
  t0: number;
  t1: number;
  energy: number;
}

export type ImpactKind = 'pen' | 'nonpen' | 'ricochet' | 'scab' | 'explode' | 'era' | 'shatter';

export interface ImpactEvent {
  t: number;
  kind: ImpactKind;
  point: Vec3;
  normal: Vec3;
  plateId?: string;
  losMm?: number;
  penMm?: number;
  angleDeg?: number;
}

export interface ModuleHit {
  t: number;
  moduleId: string;
  damage: number;
  hpAfter: number;
  point: Vec3;
}

export interface CrewHit {
  t: number;
  crewId: string;
  zone: CrewZoneId;
  point: Vec3;
  dir: Vec3;
  /** Wound channel length (m). */
  length: number;
  damage: number;
}

export type AmmoEventKind = 'ignite' | 'burn' | 'detonate';

export interface AmmoEvent {
  t: number;
  moduleId: string;
  kind: AmmoEventKind;
}

export type BigEventKind = 'detonation' | 'blowout' | 'fire' | 'ammoFireOut' | 'bailout' | 'takeover';

export interface BigEvent {
  t: number;
  kind: BigEventKind;
  point: Vec3;
  rack?: string;
}

export type Verdict =
  | 'Miss'
  | 'Ricochet'
  | 'Non-penetration'
  | 'Penetration – no damage'
  | 'Crew injured'
  | 'Disabled'
  | 'Knocked out'
  | 'Abandoned'
  | 'Ammo lost, crew safe'
  | 'Catastrophic (cook-off)';

export interface ShotSummary {
  penetrated: boolean;
  firstPlate?: string;
  armorDefeatedMm: number;
  losMm: number;
  penAtTargetMm: number;
  residualMm: number;
  angleDeg: number;
  spallCount: number;
  crewHit: string[];
  crewIncapacitated: string[];
  modulesDamaged: string[];
  modulesDestroyed: string[];
  cookOff: 'none' | 'fire' | 'detonation' | 'blowout';
  verdict: Verdict;
}

export interface ShotInput {
  vehicleId: string;
  roundId: string;
  distance: number;
  origin: Vec3;
  dir: Vec3;
  seed: number;
  /** Turret traverse in degrees, positive toward the right side. */
  turretYaw?: number;
}

export interface ShotResult {
  input: ShotInput;
  traces: Trace[];
  impacts: ImpactEvent[];
  moduleHits: ModuleHit[];
  crewHits: CrewHit[];
  ammoEvents: AmmoEvent[];
  bigEvents: BigEvent[];
  stateBefore: VehicleState;
  stateAfter: VehicleState;
  summary: ShotSummary;
  duration: number;
}
