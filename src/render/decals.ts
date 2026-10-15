import * as THREE from 'three';
import type { ImpactEvent, ShotResult } from '../sim/types';
import type { TankView } from './tank';

let holeTex: THREE.Texture | null = null;
let scorchTex: THREE.Texture | null = null;

function radial(stops: [number, string][]): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [k, col] of stops) grad.addColorStop(k, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const hole = () => (holeTex ??= radial([[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(10,8,6,0.95)'], [0.6, 'rgba(40,30,20,0.6)'], [1, 'rgba(40,30,20,0)']]));
const scorch = () => (scorchTex ??= radial([[0, 'rgba(30,24,18,0.75)'], [0.5, 'rgba(30,24,18,0.35)'], [1, 'rgba(30,24,18,0)']]));

/**
 * Entry holes, gouges and scorch marks that stay on the armour between shots. Decals are parented to the
 * hull or turret group so they ride with turret traverse.
 */
export class DamageDecals {
  private meshes: THREE.Mesh[] = [];

  constructor(private view: TankView) {}

  addFromShot(shot: ShotResult) {
    for (const imp of shot.impacts) this.add(imp, shot);
  }

  private add(imp: ImpactEvent, shot: ShotResult) {
    const plate = this.view.vehicle.plates.find((p) => p.id === imp.plateId);
    if (!plate) return;
    const calibre = shot.summary.penAtTargetMm > 0 ? 0.08 : 0.06;
    let size: number;
    let map: THREE.Texture;
    let opacity = 1;
    switch (imp.kind) {
      case 'pen':
        size = calibre * 1.6; map = hole(); break;
      case 'nonpen':
      case 'shatter':
        size = calibre * 2.2; map = scorch(); opacity = 0.9; break;
      case 'ricochet':
        size = calibre * 3; map = scorch(); opacity = 0.6; break;
      case 'explode':
      case 'scab':
        size = calibre * 7; map = scorch(); opacity = 0.85; break;
      case 'era':
        size = calibre * 5; map = scorch(); opacity = 0.7; break;
    }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    const n = new THREE.Vector3(imp.normal.x, imp.normal.y, imp.normal.z).normalize();
    // Impact events carry world-space points; turret decals need to be expressed in the (yawed) turret group.
    const group = plate.group === 'turret' ? this.view.turret : this.view.hull;
    const p = new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z).addScaledVector(n, 0.004);
    const local = group.worldToLocal(p.clone());
    const localN = n.clone().transformDirection(new THREE.Matrix4().copy(group.matrixWorld).invert());
    mesh.position.copy(local);
    mesh.lookAt(local.clone().add(localN));
    mesh.rotateZ(((imp.t * 997) % 6.28)); // vary the orientation so repeated hits don't look stamped
    mesh.renderOrder = 3;
    mesh.userData = { kind: 'decal' };
    group.add(mesh);
    this.meshes.push(mesh);
  }

  clear() {
    for (const m of this.meshes) {
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.meshes = [];
  }

  get count() {
    return this.meshes.length;
  }
}
