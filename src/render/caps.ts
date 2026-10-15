import * as THREE from 'three';
import type { MaterialId } from '../sim/types';
import { rolledMap } from './armour';
import type { TankView } from './tank';

/**
 * Capped section cut. Clipping a closed mesh leaves a hollow shell; the classic fix is a stencil pass:
 * back faces increment and front faces decrement a stencil bit (both clipped by the plane), so the bit is set
 * exactly where the eye looks into solid material. A quad lying on the plane is then drawn only where the bit is
 * set. One bit per material group lets composite layers show their own colours on the cut face.
 */
type Group = 'steel' | 'nera' | 'ceramic' | 'textolite' | 'rubber';
const GROUPS: Group[] = ['steel', 'nera', 'ceramic', 'textolite', 'rubber'];
const BIT: Record<Group, number> = { steel: 1, nera: 2, ceramic: 4, textolite: 8, rubber: 16 };
const CAP_COLOR: Record<Group, number> = { steel: 0x5f646b, nera: 0x3f8aa6, ceramic: 0xd9d2b4, textolite: 0xb7a24a, rubber: 0x262626 };

const groupOf = (mat: MaterialId | undefined): Group | null => {
  switch (mat) {
    case 'nera': return 'nera';
    case 'ceramic': return 'ceramic';
    case 'textolite': return 'textolite';
    case 'rubber': return 'rubber';
    case 'air': return null;
    default: return 'steel';
  }
};

function stencilMaterial(bit: number, back: boolean, planes: THREE.Plane[]): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ side: back ? THREE.BackSide : THREE.FrontSide, colorWrite: false, depthWrite: false });
  m.clippingPlanes = planes;
  m.stencilWrite = true;
  m.stencilFunc = THREE.AlwaysStencilFunc;
  m.stencilWriteMask = bit;
  const op = back ? THREE.IncrementWrapStencilOp : THREE.DecrementWrapStencilOp;
  m.stencilFail = op;
  m.stencilZFail = op;
  m.stencilZPass = op;
  return m;
}

export class SectionCaps {
  readonly group = new THREE.Group();
  private planes: THREE.Plane[] = [new THREE.Plane()];
  private stencilMeshes: THREE.Mesh[] = [];
  private caps = new Map<Group, THREE.Mesh>();
  private active = false;

  constructor(view: TankView) {
    const add = (src: THREE.Mesh, g: Group, parent: THREE.Object3D) => {
      for (const back of [true, false]) {
        const sm = new THREE.Mesh(src.geometry, stencilMaterial(BIT[g], back, this.planes));
        sm.renderOrder = -2; // before the caps, after nothing in particular
        sm.visible = false;
        sm.userData = { kind: 'stencil' };
        parent.add(sm);
        this.stencilMeshes.push(sm);
      }
    };
    for (const [id, mesh] of view.plateMeshes) {
      const plate = view.vehicle.plates.find((p) => p.id === id)!;
      if (plate.kind === 'era') continue;
      const layers = plate.layers && plate.layers.length > 1 ? plate.layers : [{ mat: plate.mat, mm: plate.mm }];
      const g0 = groupOf(layers[0].mat);
      if (g0) add(mesh, g0, mesh.parent!);
      (view.layerMeshes.get(id) ?? []).forEach((lm, i) => {
        const g = groupOf(layers[i + 1]?.mat);
        if (g) add(lm, g, lm.parent!);
      });
    }
    for (const g of GROUPS) {
      const mat = new THREE.MeshStandardMaterial({ color: CAP_COLOR[g], roughness: g === 'steel' ? 0.55 : 0.8, metalness: g === 'steel' ? 0.6 : 0.05, roughnessMap: g === 'steel' ? rolledMap() ?? undefined : undefined });
      mat.stencilWrite = true;
      mat.stencilRef = BIT[g];
      mat.stencilFunc = THREE.EqualStencilFunc;
      mat.stencilFuncMask = BIT[g];
      mat.stencilWriteMask = BIT[g];
      // Clear the bit as we draw so nothing leaks into the next frame.
      mat.stencilFail = THREE.ZeroStencilOp;
      mat.stencilZFail = THREE.ZeroStencilOp;
      mat.stencilZPass = THREE.ZeroStencilOp;
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat);
      cap.renderOrder = -1;
      cap.visible = false;
      cap.userData = { kind: 'cap' };
      this.caps.set(g, cap);
      this.group.add(cap);
    }
  }

  /** Enable the caps for a plane (world space) or disable them. */
  set(plane: THREE.Plane | null) {
    this.active = !!plane;
    for (const sm of this.stencilMeshes) sm.visible = this.active;
    for (const cap of this.caps.values()) cap.visible = this.active;
    if (!plane) return;
    this.planes[0].copy(plane);
    // Caps sit on the plane, nudged a hair toward the viewer side (opposite the normal) to avoid z-fighting.
    const p = plane.normal.clone().multiplyScalar(-plane.constant - 0.0015);
    for (const cap of this.caps.values()) {
      cap.position.copy(p);
      cap.lookAt(p.clone().sub(plane.normal));
    }
  }

  get enabled() {
    return this.active;
  }

  dispose() {
    for (const sm of this.stencilMeshes) {
      sm.removeFromParent();
      (sm.material as THREE.Material).dispose();
    }
    for (const cap of this.caps.values()) {
      cap.geometry.dispose();
      (cap.material as THREE.Material).dispose();
    }
    this.group.removeFromParent();
  }
}
