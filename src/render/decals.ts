import * as THREE from 'three';
import { roundById } from '../data/rounds';
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
  /** Penetration tunnels and craters: real geometry through the plate, with molten edges that cool. */
  private holes: { mesh: THREE.Mesh; shot: number; t: number }[] = [];
  private shots = 0;

  constructor(private view: TankView) {}

  addFromShot(shot: ShotResult) {
    const index = this.shots++;
    for (const imp of shot.impacts) {
      this.add(imp, shot);
      if (imp.kind === 'pen' || imp.kind === 'nonpen' || imp.kind === 'shatter') this.addHole(imp, shot, index);
    }
  }

  /** Tunnel through the plate thickness (pen) or a crater dimple (stopped shot), parented to hull/turret. */
  private addHole(imp: ImpactEvent, shot: ShotResult, index: number) {
    const plate = this.view.vehicle.plates.find((p) => p.id === imp.plateId);
    if (!plate || plate.kind === 'era') return;
    const round = roundById(shot.input.roundId);
    const r = Math.max(0.012, (round.family === 'APFSDS' ? (round.rodDiameter ?? 25) * 1.4 : round.caliber * 0.55) / 1000);
    const n = new THREE.Vector3(imp.normal.x, imp.normal.y, imp.normal.z).normalize();
    const d = new THREE.Vector3(shot.input.dir.x, shot.input.dir.y, shot.input.dir.z).normalize();
    const group = plate.group === 'turret' ? this.view.turret : this.view.hull;
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const p = new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z);
    let mesh: THREE.Mesh;
    if (imp.kind === 'pen') {
      const cos = Math.max(0.2, Math.abs(d.dot(n)));
      const len = (plate.mm / 1000) / cos + 0.01;
      const geo = new THREE.CylinderGeometry(r, r * 0.92, len, 18, 1, true);
      geo.rotateX(Math.PI / 2); // along +Z
      geo.translate(0, 0, len / 2 - 0.005);
      mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.8, side: THREE.DoubleSide, emissive: 0x000000 }));
      mesh.position.copy(group.worldToLocal(p.clone()));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().transformDirection(inv));
      // Petal lip around the entry.
      const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, r * 0.35, 8, 18), new THREE.MeshStandardMaterial({ color: 0x3b3e44, roughness: 0.6, metalness: 0.7, emissive: 0x000000 }));
      lip.position.z = 0.002;
      mesh.add(lip);
    } else {
      const geo = new THREE.SphereGeometry(r * 1.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.75, metalness: 0.6, side: THREE.BackSide, emissive: 0x000000 }));
      mesh.position.copy(group.worldToLocal(p.clone().addScaledVector(n, 0.004)));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().transformDirection(inv).negate());
      mesh.scale.set(1, 0.45, 1);
    }
    mesh.userData = { kind: 'hole' };
    group.add(mesh);
    this.holes.push({ mesh, shot: index, t: imp.t });
  }

  /** Molten edges glow for the shot being replayed and cool over ~2.5 s of replay time; older holes are cold. */
  update(currentShot: number, replayT: number) {
    for (const h of this.holes) {
      const age = h.shot === currentShot ? replayT - h.t : Infinity;
      const heat = age < 0 ? 0 : Math.max(0, 1 - age / 2.5);
      const set = (m: THREE.Mesh) => {
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.emissive.setRGB(1.3 * heat, 0.45 * heat, 0.06 * heat);
      };
      h.mesh.visible = h.shot !== currentShot || age >= 0;
      set(h.mesh);
      for (const c of h.mesh.children) set(c as THREE.Mesh);
    }
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
    for (const h of this.holes) {
      h.mesh.removeFromParent();
      h.mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
    }
    this.holes = [];
    this.shots = 0;
  }

  get count() {
    return this.meshes.length;
  }
}
