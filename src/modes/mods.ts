// Drop-in vehicles and rounds from JSON. Validated with the same checks the built-in data tests use.
import { plateNormal } from '../data/builder';
import { ROUNDS } from '../data/rounds';
import { VEHICLES } from '../data/vehicles';
import type { Round, Vehicle } from '../sim/types';
import { centroid, cross, dot, norm, sub } from '../sim/vec';

export interface ModFile {
  name: string;
  text: string;
}

export interface ModResult {
  name: string;
  kind: 'vehicle' | 'round' | 'unknown';
  id?: string;
  errors: string[];
}

const FAMILIES = ['APFSDS', 'AP', 'APHE', 'HEAT', 'HESH', 'HE'];
const MATERIALS = ['rha', 'cast', 'hha', 'structural', 'ceramic', 'nera', 'textolite', 'rubber', 'air', 'era'];
const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
const isVec = (p: unknown) => !!p && typeof p === 'object' && isNum((p as { x: unknown }).x) && isNum((p as { y: unknown }).y) && isNum((p as { z: unknown }).z);

export function validateRound(o: unknown): string[] {
  const e: string[] = [];
  const r = o as Partial<Round>;
  if (!r || typeof r !== 'object') return ['not an object'];
  if (typeof r.id !== 'string' || !/^[a-z0-9_-]+$/i.test(r.id)) e.push('id must be a short identifier');
  if (typeof r.name !== 'string') e.push('name missing');
  if (!FAMILIES.includes(r.family as string)) e.push(`family must be one of ${FAMILIES.join(', ')}`);
  for (const k of ['caliber', 'mass', 'velocity', 'drag', 'filler'] as const) if (!isNum(r[k])) e.push(`${k} must be a number`);
  if (r.family === 'APFSDS' && (!isNum(r.rodLength) || !isNum(r.rodDiameter))) e.push('APFSDS needs rodLength (m) and rodDiameter (mm)');
  if (!['tungsten', 'du', 'steel'].includes(r.penMaterial as string)) e.push('penMaterial must be tungsten, du or steel');
  return e;
}

export function validateVehicle(o: unknown): string[] {
  const e: string[] = [];
  const v = o as Partial<Vehicle>;
  if (!v || typeof v !== 'object') return ['not an object'];
  // Structural problems stop the check (nothing below is safe to read); everything else accumulates.
  const structural: string[] = [];
  if (!Array.isArray(v.plates) || !v.plates.length) structural.push('plates must be a non-empty array');
  if (!Array.isArray(v.modules)) structural.push('modules must be an array');
  if (!Array.isArray(v.crew) || !v.crew.length) structural.push('crew must be a non-empty array');
  if (!Array.isArray(v.racks)) structural.push('racks must be an array');
  if (structural.length) return structural;
  if (typeof v.id !== 'string' || !/^[a-z0-9_-]+$/i.test(v.id)) e.push('id must be a short identifier');
  if (typeof v.name !== 'string') e.push('name missing');
  if (!isVec(v.turretPivot)) e.push('turretPivot must be {x,y,z}');
  if (!v.visual || !isNum(v.visual.hullLength) || !v.visual.barrel) e.push('visual block incomplete');
  const ids = new Set<string>();
  for (const p of v.plates!) {
    if (ids.has(p.id)) e.push(`duplicate id ${p.id}`);
    ids.add(p.id);
    if (!['hull', 'turret'].includes(p.group)) e.push(`plate ${p.id}: group must be hull or turret`);
    if (!Array.isArray(p.pts) || p.pts.length < 3 || !p.pts.every(isVec)) { e.push(`plate ${p.id}: pts needs 3+ points`); continue; }
    if (!isNum(p.mm) || p.mm <= 0) e.push(`plate ${p.id}: mm must be > 0`);
    if (!MATERIALS.includes(p.mat)) e.push(`plate ${p.id}: unknown material ${p.mat}`);
    if (!isVec(p.inside)) e.push(`plate ${p.id}: inside point missing`);
    if (p.layers) {
      for (const l of p.layers) if (!MATERIALS.includes(l.mat) || !isNum(l.mm)) e.push(`plate ${p.id}: bad layer`);
      const sum = p.layers.reduce((a, l) => a + l.mm, 0);
      if (Math.abs(sum - p.mm) > 1e-6) e.push(`plate ${p.id}: layers sum to ${sum} mm but mm is ${p.mm}`);
    }
    try {
      const n = plateNormal(p);
      const [a, b, c] = p.pts;
      const n0 = norm(cross(sub(b, a), sub(c, a)));
      if (Math.abs(Math.abs(dot(n, n0)) - 1) > 1e-6) e.push(`plate ${p.id}: not planar`);
      for (const q of p.pts) if (Math.abs(dot(sub(q, a), n)) > 1e-6) e.push(`plate ${p.id}: point off the plane`);
      if (dot(n, sub(centroid(p.pts), p.inside)) <= 0) e.push(`plate ${p.id}: inside point is not inside`);
    } catch {
      e.push(`plate ${p.id}: degenerate geometry`);
    }
  }
  const rackIds = new Set(v.racks!.map((r) => r.id));
  for (const m of v.modules!) {
    if (ids.has(m.id)) e.push(`duplicate id ${m.id}`);
    ids.add(m.id);
    if (!m.box || !isVec(m.box.min) || !isVec(m.box.max)) e.push(`module ${m.id}: box missing`);
    if (m.ammo && !rackIds.has(m.ammo.rack)) e.push(`module ${m.id}: unknown rack ${m.ammo.rack}`);
  }
  for (const c of v.crew!) {
    if (ids.has(c.id)) e.push(`duplicate id ${c.id}`);
    ids.add(c.id);
    if (!c.zones?.some((z) => z.zone === 'head') || !c.zones?.some((z) => z.zone === 'torso')) e.push(`crew ${c.id}: needs head and torso zones`);
  }
  return e;
}

/** Parse and validate one file; on success the vehicle/round is registered (replacing a same-id mod). */
export function installMod(file: ModFile): ModResult {
  let obj: unknown;
  try {
    obj = JSON.parse(file.text);
  } catch (err) {
    return { name: file.name, kind: 'unknown', errors: [`invalid JSON: ${(err as Error).message}`] };
  }
  const o = obj as { plates?: unknown; family?: unknown; id?: string };
  if (o && typeof o === 'object' && 'plates' in o) {
    const errors = validateVehicle(obj);
    if (errors.length) return { name: file.name, kind: 'vehicle', id: o.id, errors };
    const v = obj as Vehicle;
    const i = VEHICLES.findIndex((x) => x.id === v.id);
    if (i >= 0) VEHICLES[i] = v;
    else VEHICLES.push(v);
    return { name: file.name, kind: 'vehicle', id: v.id, errors: [] };
  }
  if (o && typeof o === 'object' && 'family' in o) {
    const errors = validateRound(obj);
    if (errors.length) return { name: file.name, kind: 'round', id: o.id, errors };
    const r = obj as Round;
    const i = ROUNDS.findIndex((x) => x.id === r.id);
    if (i >= 0) ROUNDS[i] = r;
    else ROUNDS.push(r);
    return { name: file.name, kind: 'round', id: r.id, errors: [] };
  }
  return { name: file.name, kind: 'unknown', errors: ['neither a vehicle (has plates) nor a round (has family)'] };
}

const KEY = 'tankhit.mods';

/** Mods the player added in the browser, remembered per browser. */
export function loadStoredMods(): ModFile[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ModFile[];
  } catch {
    return [];
  }
}
export function storeMods(files: ModFile[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(files));
  } catch {
    /* no storage */
  }
}
