import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { plateNormal } from '../data/builder';
import { armourMaterial, layerMaterial } from './armour';
import type { Box, Crew, Module, Plate, Vehicle } from '../sim/types';

export const AMMO_COLORS: Record<string, number> = {
  APFSDS: 0x9aa3ad,
  AP: 0xb08a4a,
  APHE: 0xb06a3a,
  HEAT: 0x7a8a3c,
  HESH: 0x8a5ab0,
  HE: 0x6f7a3c,
};

const MODULE_COLORS: Record<string, number> = {
  engine: 0x6f7c88,
  transmission: 0x5f6a74,
  fuel: 0x5c7a8c,
  breech: 0x7e8892,
  barrel: 0x7e8892,
  turretRing: 0x8a96a2,
  radio: 0x68747f,
  optics: 0x6a8aa0,
  autoloader: 0x77828c,
  ammo: 0xb08a4a,
};

export interface TankView {
  vehicle: Vehicle;
  root: THREE.Group;
  hull: THREE.Group;
  /** Outer turret group: positioned at the pivot and yawed. */
  turret: THREE.Group;
  pivot: THREE.Vector3;
  turretYaw: number;
  plateMeshes: Map<string, THREE.Mesh>;
  plateEdges: Map<string, THREE.LineSegments>;
  /** Inner composite layer slabs (outer layer is the plate mesh itself). */
  layerMeshes: Map<string, THREE.Mesh[]>;
  /** Current view state, kept so layer visibility can be recomputed. */
  xray: boolean;
  heat: boolean;
  sectioned: boolean;
  moduleMeshes: Map<string, THREE.Mesh>;
  crewGroups: Map<string, THREE.Group>;
  /** Meshes of each crew zone, keyed `${crewId}:${zone}` (several boxes may share a key). */
  zoneMeshes: Map<string, THREE.Mesh[]>;
  exterior: THREE.Object3D[];
  interior: THREE.Object3D[];
}

export function boxCenter(b: Box): THREE.Vector3 {
  return new THREE.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
}
export function boxSize(b: Box): THREE.Vector3 {
  return new THREE.Vector3(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
}

/** Extrude the plate polygon inward by its physical thickness. */
export function plateGeometry(p: Plate, fromMm = 0, toMm = p.mm): THREE.BufferGeometry {
  const n = plateNormal(p);
  const d0 = fromMm / 1000;
  const d1 = Math.max(toMm / 1000, d0 + 0.008);
  const nv = new THREE.Vector3(n.x, n.y, n.z);
  const outer = p.pts.map((q) => new THREE.Vector3(q.x, q.y, q.z).addScaledVector(nv, -d0));
  const inner = p.pts.map((q) => new THREE.Vector3(q.x, q.y, q.z).addScaledVector(nv, -d1));
  const pos: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const k = outer.length;
  for (let i = 1; i < k - 1; i++) {
    tri(outer[0], outer[i], outer[i + 1]);
    tri(inner[0], inner[i + 1], inner[i]);
  }
  for (let i = 0; i < k; i++) {
    const j = (i + 1) % k;
    tri(outer[i], inner[i], inner[j]);
    tri(outer[i], inner[j], outer[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // Fix winding so every face points away from the plate's interior reference point.
  const nAttr: number[] = [];
  const centre = new THREE.Vector3();
  outer.forEach((q) => centre.add(q));
  inner.forEach((q) => centre.add(q));
  centre.multiplyScalar(1 / (2 * k));
  for (let i = 0; i < pos.length; i += 9) {
    const a = new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]);
    const b = new THREE.Vector3(pos[i + 3], pos[i + 4], pos[i + 5]);
    const c = new THREE.Vector3(pos[i + 6], pos[i + 7], pos[i + 8]);
    const fn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const mid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (fn.dot(mid.sub(centre)) < 0) {
      // swap b and c
      for (let q = 0; q < 3; q++) {
        const tmp = pos[i + 3 + q];
        pos[i + 3 + q] = pos[i + 6 + q];
        pos[i + 6 + q] = tmp;
      }
      fn.negate();
    }
    for (let q = 0; q < 3; q++) nAttr.push(fn.x, fn.y, fn.z);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nAttr, 3));
  return g;
}

export function moduleColor(m: Module): number {
  if (m.ammo) return AMMO_COLORS[m.ammo.roundFamily] ?? MODULE_COLORS.ammo;
  return MODULE_COLORS[m.type] ?? 0x888888;
}

function moduleGeometry(m: Module): THREE.BufferGeometry {
  const s = boxSize(m.box);
  if (m.cyl) {
    const axisLen = s[m.cyl];
    const r = m.cyl === 'x' ? Math.min(s.y, s.z) / 2 : m.cyl === 'y' ? Math.min(s.x, s.z) / 2 : Math.min(s.x, s.y) / 2;
    let g: THREE.BufferGeometry;
    if (m.ammo) {
      // Cartridge: case + tapered projectile.
      const caseLen = axisLen * 0.62;
      const projLen = axisLen - caseLen;
      const body = new THREE.CylinderGeometry(r, r, caseLen, 12);
      body.translate(0, -axisLen / 2 + caseLen / 2, 0);
      const tip = new THREE.CylinderGeometry(r * 0.15, r * 0.82, projLen, 12);
      tip.translate(0, axisLen / 2 - projLen / 2, 0);
      g = mergeGeometries([body, tip]);
    } else {
      g = new THREE.CylinderGeometry(r, r, axisLen, 28, 1, m.type === 'turretRing');
    }
    if (m.cyl === 'x') g.rotateZ(-Math.PI / 2);
    if (m.cyl === 'z') g.rotateX(Math.PI / 2);
    return g;
  }
  return new RoundedBoxGeometry(s.x, s.y, s.z, 2, Math.min(0.03, Math.min(s.x, s.y, s.z) / 4));
}

function mergeGeometries(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
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

export function buildTank(v: Vehicle): TankView {
  const root = new THREE.Group();
  root.name = v.id;
  const hull = new THREE.Group();
  const turret = new THREE.Group();
  const pivot = new THREE.Vector3(v.turretPivot.x, 0, v.turretPivot.z);
  turret.position.copy(pivot);
  // Turret children are authored in vehicle space; the inner group shifts them so the outer group yaws about the pivot.
  const turretInner = new THREE.Group();
  turretInner.position.copy(pivot).negate();
  turret.add(turretInner);
  root.add(hull, turret);
  const view: TankView = {
    vehicle: v, root, hull, turret, pivot, turretYaw: 0,
    plateMeshes: new Map(), plateEdges: new Map(), layerMeshes: new Map(), xray: false, heat: false, sectioned: false, moduleMeshes: new Map(), crewGroups: new Map(), zoneMeshes: new Map(),
    exterior: [], interior: [],
  };
  const groupOf = (g: 'hull' | 'turret') => (g === 'hull' ? hull : turretInner);

  for (const p of v.plates) {
    // Composite plates are built as one slab per layer so a section cut shows the stack as coloured bands;
    // the outer layer carries the paint and is the pickable plate mesh.
    const layers = p.layers && p.layers.length > 1 ? p.layers : [{ mat: p.mat, mm: p.mm }];
    const geo = plateGeometry(p, 0, layers[0].mm);
    const mesh = new THREE.Mesh(geo, armourMaterial(p, v.visual.color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { kind: 'plate', id: p.id };
    groupOf(p.group).add(mesh);
    view.plateMeshes.set(p.id, mesh);
    const inner: THREE.Mesh[] = [];
    let depth = layers[0].mm;
    for (let i = 1; i < layers.length; i++) {
      const l = layers[i];
      const lm = new THREE.Mesh(plateGeometry(p, depth, depth + l.mm), layerMaterial(l.mat));
      lm.userData = { kind: 'layer', id: p.id, mat: l.mat };
      lm.receiveShadow = true;
      lm.visible = false;
      groupOf(p.group).add(lm);
      inner.push(lm);
      depth += l.mm;
    }
    view.layerMeshes.set(p.id, inner);
    // Plate edges double as weld seams in the painted view and glowing outlines in X-ray.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(plateGeometry(p), 25),
      new THREE.LineBasicMaterial({ color: 0x15171a, transparent: true, opacity: 0.45 }),
    );
    edges.userData = { kind: 'edge' };
    groupOf(p.group).add(edges);
    view.plateEdges.set(p.id, edges);
  }

  for (const m of v.modules) {
    const mesh = new THREE.Mesh(
      moduleGeometry(m),
      new THREE.MeshStandardMaterial({ color: moduleColor(m), roughness: 0.6, metalness: 0.3, emissive: 0x000000 }),
    );
    mesh.position.copy(boxCenter(m.box));
    mesh.userData = { kind: 'module', id: m.id };
    mesh.castShadow = false;
    groupOf(m.group).add(mesh);
    view.moduleMeshes.set(m.id, mesh);
    view.interior.push(mesh);
  }

  for (const c of v.crew) {
    const g = buildDummy(c, view);
    groupOf(c.group).add(g);
    view.crewGroups.set(c.id, g);
    view.interior.push(g);
  }

  addRunningGear(v, hull, view);
  addBarrel(v, turretInner, view);
  return view;
}

/** Point the turret (radians, positive = right). */
export function setTurretYaw(view: TankView, yaw: number) {
  view.turretYaw = yaw;
  view.turret.position.copy(view.pivot);
  view.turret.rotation.set(0, yaw, 0);
}

const gelMaterial = () =>
  new THREE.MeshPhysicalMaterial({
    color: 0xf2b27a,
    roughness: 0.25,
    transmission: 0,
    transparent: true,
    opacity: 0.62,
    emissive: 0x3a1a05,
    depthWrite: false,
  });

function buildDummy(c: Crew, view: TankView): THREE.Group {
  const g = new THREE.Group();
  g.userData = { kind: 'crew', id: c.id };
  for (const z of c.zones) {
    const s = boxSize(z.box);
    const geo = z.zone === 'head'
      ? new THREE.SphereGeometry(Math.min(s.x, s.y, s.z) / 2 + 0.01, 18, 14)
      : new RoundedBoxGeometry(s.x, s.y, s.z, 3, Math.min(s.x, s.y, s.z) / 2.05);
    if (z.zone === 'head') geo.scale(1, s.y / Math.min(s.x, s.y, s.z), 1);
    const mesh = new THREE.Mesh(geo, gelMaterial());
    mesh.position.copy(boxCenter(z.box));
    mesh.userData = { kind: 'crewZone', id: c.id, zone: z.zone };
    mesh.renderOrder = 2;
    g.add(mesh);
    const key = `${c.id}:${z.zone}`;
    const list = view.zoneMeshes.get(key) ?? [];
    list.push(mesh);
    view.zoneMeshes.set(key, list);
  }
  return g;
}

function addRunningGear(v: Vehicle, hull: THREE.Group, view: TankView) {
  const { hullLength: L, hullWidth: W, trackWidth: tw, groundClearance: gc, wheelCount, wheelRadius: r } = v.visual;
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.9, metalness: 0.4 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: v.visual.color, roughness: 0.8, metalness: 0.2 });
  for (const side of [1, -1]) {
    const z = side * (W / 2 + tw / 2 + 0.02);
    // Track loop as a flattened rounded box.
    const track = new THREE.Mesh(new RoundedBoxGeometry(L + 0.2, gc + 0.42, tw, 4, Math.min(0.3, (gc + 0.42) / 2.1)), trackMat);
    track.position.set(0, (gc + 0.42) / 2, z);
    track.castShadow = true;
    track.receiveShadow = true;
    track.userData = { kind: 'gear' };
    hull.add(track);
    view.exterior.push(track);
    for (let i = 0; i < wheelCount; i++) {
      const x = -L / 2 + 0.5 + (i * (L - 1.0)) / Math.max(1, wheelCount - 1);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, tw + 0.04, 24), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, r * 0.95, z);
      wheel.castShadow = true;
      wheel.userData = { kind: 'gear' };
      hull.add(wheel);
      view.exterior.push(wheel);
    }
    // Fender
    const fender = new THREE.Mesh(new THREE.BoxGeometry(L + 0.3, 0.02, tw + 0.06), wheelMat);
    fender.position.set(0, gc + 0.47, z);
    fender.userData = { kind: 'gear' };
    hull.add(fender);
    view.exterior.push(fender);
  }
}

function addBarrel(v: Vehicle, turret: THREE.Group, view: TankView) {
  const b = v.visual.barrel;
  const geo = new THREE.CylinderGeometry(b.radius * 0.85, b.radius, b.length, 20);
  geo.rotateZ(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: v.visual.color, roughness: 0.6, metalness: 0.35 }));
  mesh.position.set(b.from.x + b.length / 2, b.from.y, b.from.z);
  mesh.castShadow = true;
  mesh.userData = { kind: 'gear' };
  turret.add(mesh);
  view.exterior.push(mesh);
}

/** Free every GPU resource a tank view owns (geometries, materials, including the cached X-ray/heat variants). */
export function disposeTank(view: TankView) {
  view.root.removeFromParent();
  view.root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) (mat as THREE.Material | undefined)?.dispose?.();
    for (const key of ['solid', 'xray', 'heat'] as const) (o.userData[key] as THREE.Material | undefined)?.dispose?.();
  });
}
