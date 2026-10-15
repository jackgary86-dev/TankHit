// Helpers that turn compact vehicle specs into plates, modules, crew and ammo.
// Pure data – no rendering here.
import type {
  AmmoRack,
  Box,
  Crew,
  CrewRole,
  CrewZone,
  Layer,
  MaterialId,
  Module,
  ModuleType,
  Plate,
  PlateGroup,
  PlateKind,
  RoundFamily,
} from '../sim/types';
import { add, centroid, cross, dot, len, lerp, norm, scale, sub, v3, type Vec3 } from '../sim/vec';

export interface ArmorSpec {
  mm: number;
  mat?: MaterialId;
  layers?: Layer[];
}

const armor = (s: ArmorSpec | number, fallback: MaterialId): Omit<ArmorSpec, 'mat'> & { mat: MaterialId } => {
  if (typeof s === 'number') return { mm: s, mat: fallback };
  const mm = s.layers ? s.layers.reduce((a, l) => a + l.mm, 0) : s.mm;
  return { mm, mat: s.mat ?? fallback, layers: s.layers };
};

export function plate(
  id: string,
  name: string,
  group: PlateGroup,
  pts: Vec3[],
  spec: ArmorSpec | number,
  inside: Vec3,
  fallbackMat: MaterialId = 'rha',
  kind: PlateKind = 'plate',
): Plate {
  const a = armor(spec, fallbackMat);
  return { id, name, group, pts, mm: a.mm, mat: a.mat, layers: a.layers, kind, inside };
}

// ---------------------------------------------------------------- hull

export interface HullSpec {
  length: number;
  width: number;
  clearance: number;
  height: number;
  noseY: number;
  ufp: ArmorSpec & { run: number };
  lfp: ArmorSpec & { run: number };
  side: ArmorSpec | number;
  rear: ArmorSpec | number;
  roof: ArmorSpec | number;
  floor: ArmorSpec | number;
  mat?: MaterialId;
  /** Replace the upper front plate with a two-plate pike nose. */
  pike?: boolean;
  /** Turret ring opening in the roof: centre x and half-size. */
  ring?: { x: number; r: number };
}

export function hullPlates(h: HullSpec): Plate[] {
  const mat = h.mat ?? 'rha';
  const L2 = h.length / 2;
  const W2 = h.width / 2;
  const y0 = h.clearance;
  const top = y0 + h.height;
  const inside = v3(0, y0 + h.height / 2, 0);
  const xUfp = L2 - h.ufp.run;
  const xLfp = L2 - h.lfp.run;

  const side = (z: number): Vec3[] => [
    v3(-L2, y0, z),
    v3(xLfp, y0, z),
    v3(L2, h.noseY, z),
    v3(xUfp, top, z),
    v3(-L2, top, z),
  ];
  const plates: Plate[] = [];
  if (h.pike) {
    // Two angled glacis halves meeting in a ridge; built from planar triangles.
    const tip = v3(L2, h.noseY, 0);
    const ridge = v3(xUfp + 0.45, top, 0);
    for (const [side, z] of [['l', W2], ['r', -W2]] as const) {
      const nose = v3(L2, h.noseY, z);
      const corner = v3(xUfp, top, z);
      const label = side === 'l' ? 'left' : 'right';
      plates.push(
        plate(`h-ufp-${side}1`, `Upper front plate (${label})`, 'hull', [tip, nose, corner], h.ufp, inside, mat),
        plate(`h-ufp-${side}2`, `Upper front plate (${label}, pike)`, 'hull', [tip, corner, ridge], h.ufp, inside, mat),
      );
    }
    plates.push(plate('h-ufp-top', 'Hull roof (front)', 'hull', [v3(xUfp, top, W2), ridge, v3(xUfp, top, -W2)], h.roof, inside, mat));
  } else {
    plates.push(
      plate('h-ufp', 'Upper front plate', 'hull', [v3(L2, h.noseY, -W2), v3(L2, h.noseY, W2), v3(xUfp, top, W2), v3(xUfp, top, -W2)], h.ufp, inside, mat),
    );
  }
  plates.push(
    plate('h-lfp', 'Lower front plate', 'hull', [v3(xLfp, y0, -W2), v3(xLfp, y0, W2), v3(L2, h.noseY, W2), v3(L2, h.noseY, -W2)], h.lfp, inside, mat),
    plate('h-side-l', 'Hull side (left)', 'hull', side(W2), h.side, inside, mat),
    plate('h-side-r', 'Hull side (right)', 'hull', side(-W2), h.side, inside, mat),
    plate('h-rear', 'Hull rear', 'hull', [v3(-L2, y0, -W2), v3(-L2, y0, W2), v3(-L2, top, W2), v3(-L2, top, -W2)], h.rear, inside, mat),
    ...roofPlates(h, xUfp, top, L2, W2, inside, mat),
    plate('h-floor', 'Hull floor', 'hull', [v3(-L2, y0, -W2), v3(-L2, y0, W2), v3(xLfp, y0, W2), v3(xLfp, y0, -W2)], h.floor, inside, mat),
  );
  return plates;
}

/** Hull roof, cut around the turret ring so shots can pass between turret and hull. */
function roofPlates(h: HullSpec, xUfp: number, top: number, L2: number, W2: number, inside: Vec3, mat: MaterialId): Plate[] {
  const quad = (id: string, name: string, x0: number, x1: number, z0: number, z1: number) =>
    plate(id, name, 'hull', [v3(x0, top, z0), v3(x0, top, z1), v3(x1, top, z1), v3(x1, top, z0)], h.roof, inside, mat);
  if (!h.ring) return [quad('h-roof', 'Hull roof', xUfp, -L2, -W2, W2)];
  const { x, r } = h.ring;
  const out: Plate[] = [];
  if (x + r < xUfp) out.push(quad('h-roof-f', 'Hull roof (front)', x + r, xUfp, -W2, W2));
  if (x - r > -L2) out.push(quad('h-roof-r', 'Hull roof (rear)', -L2, x - r, -W2, W2));
  out.push(quad('h-roof-l', 'Hull roof (left)', x - r, x + r, r, W2), quad('h-roof-rt', 'Hull roof (right)', x - r, x + r, -W2, -r));
  return out;
}

// ---------------------------------------------------------------- turret

export interface TurretSpec {
  center: { x: number; z: number };
  y0: number;
  y1: number;
  /** Footprint polygon (x,z) relative to center, in order around the turret. */
  poly: [number, number][];
  topScale: number;
  topShiftX?: number;
  front: ArmorSpec | number;
  /** Optional cheek/side-front armor for faces between front and side. */
  cheek?: ArmorSpec | number;
  side: ArmorSpec | number;
  rear: ArmorSpec | number;
  roof: ArmorSpec | number;
  mat?: MaterialId;
}

export function turretPlates(t: TurretSpec): Plate[] {
  const mat = t.mat ?? 'rha';
  const c = v3(t.center.x, 0, t.center.z);
  const inside = v3(t.center.x, (t.y0 + t.y1) / 2, t.center.z);
  const bottom = t.poly.map(([x, z]) => v3(c.x + x, t.y0, c.z + z));
  const top = t.poly.map(([x, z]) => v3(c.x + x * t.topScale + (t.topShiftX ?? 0), t.y1, c.z + z * t.topScale));
  const plates: Plate[] = [];
  const n = t.poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = bottom[i], b = bottom[j];
    const mid = lerp(a, b, 0.5);
    const outward = norm(v3(mid.x - inside.x, 0, mid.z - inside.z));
    // Use the edge-perpendicular direction (more accurate than the centroid ray).
    const edge = norm(sub(b, a));
    let face = norm(cross(edge, v3(0, 1, 0)));
    if (dot(face, outward) < 0) face = scale(face, -1);
    let spec: ArmorSpec | number;
    let name: string;
    if (face.x > 0.8) { spec = t.front; name = 'Turret front'; }
    else if (face.x > 0.3) { spec = t.cheek ?? t.front; name = 'Turret cheek'; }
    else if (face.x < -0.6) { spec = t.rear; name = 'Turret rear'; }
    else { spec = t.side; name = 'Turret side'; }
    if (name !== 'Turret front' && name !== 'Turret rear') name += face.z > 0 ? ' (left)' : ' (right)';
    plates.push(plate(`t-${i}`, name, 'turret', [a, b, top[j], top[i]], spec, inside, mat));
  }
  plates.push(plate('t-roof', 'Turret roof', 'turret', [...top], t.roof, inside, mat));
  return plates;
}

/** Vertical rectangle facing +X (e.g. gun mantlet). */
export function frontQuad(
  id: string, name: string, group: PlateGroup, x: number, y0: number, y1: number, z0: number, z1: number,
  spec: ArmorSpec | number, mat: MaterialId = 'rha', kind: PlateKind = 'plate',
): Plate {
  return plate(id, name, group, [v3(x, y0, z0), v3(x, y0, z1), v3(x, y1, z1), v3(x, y1, z0)], spec, v3(x - 1, (y0 + y1) / 2, (z0 + z1) / 2), mat, kind);
}

/** Vertical side skirt along X at lateral offset z. */
export function skirt(id: string, name: string, x0: number, x1: number, y0: number, y1: number, z: number, spec: ArmorSpec | number, mat: MaterialId = 'rha'): Plate {
  return plate(id, name, 'hull', [v3(x0, y0, z), v3(x1, y0, z), v3(x1, y1, z), v3(x0, y1, z)], spec, v3((x0 + x1) / 2, (y0 + y1) / 2, z - Math.sign(z)), mat, 'spaced');
}

/** Covers a 4-point plate with a grid of explosive reactive armor blocks offset outward. */
export function eraOnPlate(p: Plate, rows: number, cols: number, prefix: string, offset = 0.06, mm = 15): Plate[] {
  if (p.pts.length !== 4) throw new Error('eraOnPlate needs a quad');
  const n = plateNormal(p);
  const [a, b, c, d] = p.pts.map((q) => add(q, scale(n, offset)));
  const gap = 0.06;
  const out: Plate[] = [];
  const at = (u: number, v: number) => lerp(lerp(a, b, u), lerp(d, c, u), v);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const u0 = k / cols + gap / cols, u1 = (k + 1) / cols - gap / cols;
      const v0 = r / rows + gap / rows, v1 = (r + 1) / rows - gap / rows;
      out.push({
        id: `${prefix}-${r}-${k}`,
        name: 'ERA block',
        group: p.group,
        pts: [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)],
        mm,
        mat: 'era',
        kind: 'era',
        inside: sub(at(0.5 * (u0 + u1), 0.5 * (v0 + v1)), n),
      });
    }
  }
  return out;
}

/** Outward unit normal of a plate. */
export function plateNormal(p: Plate): Vec3 {
  const [a, b, c] = p.pts;
  let n = norm(cross(sub(b, a), sub(c, a)));
  if (len(n) < 0.5 && p.pts.length > 3) n = norm(cross(sub(c, a), sub(p.pts[3], a)));
  if (dot(n, sub(centroid(p.pts), p.inside)) < 0) n = scale(n, -1);
  return n;
}

// ---------------------------------------------------------------- modules

export const box = (min: Vec3, max: Vec3): Box => ({ min, max });
export const boxC = (c: Vec3, size: Vec3): Box => ({
  min: v3(c.x - size.x / 2, c.y - size.y / 2, c.z - size.z / 2),
  max: v3(c.x + size.x / 2, c.y + size.y / 2, c.z + size.z / 2),
});

export function mod(
  id: string, name: string, type: ModuleType, group: PlateGroup, b: Box, hp: number, absorb: number, cyl?: 'x' | 'y' | 'z',
): Module {
  return { id, name, type, group, box: b, hp, absorb, cyl };
}

export interface AmmoRowSpec {
  rack: string;
  group: PlateGroup;
  start: Vec3;
  step: Vec3;
  count: number;
  axis: 'x' | 'y' | 'z';
  length: number;
  dia: number;
  /** Families cycle through this list round by round. */
  families: RoundFamily[];
  propellant: number;
  heFiller: number;
  startIndex?: number;
}

export function ammoRow(s: AmmoRowSpec): Module[] {
  const out: Module[] = [];
  for (let i = 0; i < s.count; i++) {
    const c = add(s.start, scale(s.step, i));
    const size = v3(s.dia, s.dia, s.dia);
    size[s.axis] = s.length;
    const fam = s.families[i % s.families.length];
    const filler = fam === 'HE' || fam === 'HESH' ? s.heFiller : fam === 'HEAT' ? s.heFiller * 0.6 : fam === 'APHE' ? s.heFiller * 0.1 : 0;
    const idx = (s.startIndex ?? 0) + i;
    out.push({
      id: `${s.rack}-${idx}`,
      name: `${fam} round`,
      type: 'ammo',
      group: s.group,
      box: boxC(c, size),
      cyl: s.axis,
      hp: 25,
      absorb: 20,
      ammo: { rack: s.rack, roundFamily: fam, propellant: s.propellant, filler },
    });
  }
  return out;
}

export const rack = (id: string, name: string, detonateAt: number, isolated = false, wet = false): AmmoRack => ({ id, name, isolated, detonateAt, wet });

// ---------------------------------------------------------------- crew

/**
 * Ballistic-gel dummy. `seat` is the seat surface under the hips; the dummy faces +X.
 * `standing` produces upright legs (loaders); `recline` tilts the driver back.
 */
export function dummy(
  id: string, role: CrewRole, name: string, group: PlateGroup, seat: Vec3, opts: { standing?: boolean; recline?: boolean; scale?: number } = {},
): Crew {
  const s = opts.scale ?? 1;
  const P = (dx: number, dy: number, dz: number) => v3(seat.x + dx * s, seat.y + dy * s, seat.z + dz * s);
  const S = (x: number, y: number, z: number) => v3(x * s, y * s, z * s);
  const zones: CrewZone[] = [];
  const z = (zone: CrewZone['zone'], c: Vec3, size: Vec3, hp: number) => zones.push({ zone, box: boxC(c, size), hp });
  if (opts.standing) {
    z('legL', P(0, -0.42, 0.1), S(0.16, 0.84, 0.15), 30);
    z('legR', P(0, -0.42, -0.1), S(0.16, 0.84, 0.15), 30);
    z('torso', P(0, 0.3, 0), S(0.24, 0.6, 0.38), 60);
    z('head', P(0, 0.75, 0), S(0.21, 0.25, 0.19), 25);
    z('armL', P(0.05, 0.28, 0.25), S(0.13, 0.5, 0.11), 25);
    z('armR', P(0.05, 0.28, -0.25), S(0.13, 0.5, 0.11), 25);
  } else if (opts.recline) {
    z('legL', P(0.3, 0.07, 0.1), S(0.5, 0.15, 0.15), 30);
    z('legL', P(0.75, 0.04, 0.1), S(0.42, 0.13, 0.13), 30);
    z('legR', P(0.3, 0.07, -0.1), S(0.5, 0.15, 0.15), 30);
    z('legR', P(0.75, 0.04, -0.1), S(0.42, 0.13, 0.13), 30);
    z('torso', P(-0.06, 0.36, 0), S(0.26, 0.56, 0.38), 60);
    z('head', P(-0.08, 0.79, 0), S(0.21, 0.25, 0.19), 25);
    z('armL', P(0.14, 0.38, 0.25), S(0.4, 0.12, 0.11), 25);
    z('armR', P(0.14, 0.38, -0.25), S(0.4, 0.12, 0.11), 25);
  } else {
    z('legL', P(0.24, 0.07, 0.1), S(0.46, 0.15, 0.15), 30);
    z('legL', P(0.47, -0.2, 0.1), S(0.14, 0.42, 0.14), 30);
    z('legR', P(0.24, 0.07, -0.1), S(0.46, 0.15, 0.15), 30);
    z('legR', P(0.47, -0.2, -0.1), S(0.14, 0.42, 0.14), 30);
    z('torso', P(-0.02, 0.36, 0), S(0.24, 0.56, 0.38), 60);
    z('head', P(0, 0.79, 0), S(0.21, 0.25, 0.19), 25);
    z('armL', P(0.14, 0.38, 0.25), S(0.4, 0.12, 0.11), 25);
    z('armR', P(0.14, 0.38, -0.25), S(0.4, 0.12, 0.11), 25);
  }
  return { id, role, name, group, zones, seat };
}
