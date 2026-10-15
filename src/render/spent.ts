import * as THREE from 'three';
import { roundById } from '../data/rounds';
import type { ShotResult } from '../sim/types';
import { buildProjectile, shellPoseAt } from './projectile';
import type { TankView } from './tank';

/**
 * What is left of each round after its replay: an AP shot bent and mushroomed where it stopped, a DU/tungsten
 * stub where the rod ran out, a crumpled non-penetrator lying under the plate. Persists between shots until the
 * vehicle is repaired. Ricochets, HEAT and burst shells leave nothing (the bursts' shards are transient).
 */
export class SpentRounds {
  private entries: { shot: number; obj: THREE.Object3D }[] = [];

  constructor(private view: TankView) {}

  addFromShot(shot: ShotResult, index: number) {
    const round = roundById(shot.input.roundId);
    const first = shot.impacts[0];
    if (!first || round.family === 'HEAT' || round.family === 'HESH' || round.family === 'HE') return;
    const end = shellPoseAt(shot.traces, shot.impacts, 1e6, round.family);
    const parts = buildProjectile(round);
    const g = parts.group;
    const n = new THREE.Vector3(first.normal.x, first.normal.y, first.normal.z).normalize();
    if (first.kind === 'pen' && end.phase === 'stopped') {
      // Came to rest inside: a bent full-calibre shot, or an eroded rod stub.
      g.position.copy(end.pos);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), end.dir);
      if (round.family === 'APFSDS') {
        parts.body.scale.set(Math.max(0.15, end.remaining), 1, 1);
        parts.body.position.x = -parts.length * 0.5 * (1 - Math.max(0.15, end.remaining));
        for (const p of parts.petals) p.visible = false;
      } else {
        parts.body.rotation.z = 0.25; // bent
        parts.body.scale.set(0.85, 1.25, 1.25); // nose mushroomed
        if (parts.cap) parts.cap.visible = false;
      }
      (parts.body.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.6);
    } else if (first.kind === 'nonpen') {
      // Crumpled and dropped: lies on the ground just out from the plate it hit.
      const cal = round.caliber / 1000;
      g.position.set(first.point.x, 0, first.point.z).addScaledVector(new THREE.Vector3(n.x, 0, n.z).normalize(), 0.45).setY(0.02 + cal * 0.5);
      const flat = new THREE.Vector3(-n.z, 0, n.x).normalize();
      g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), flat);
      parts.body.scale.set(0.55, 1.25, 1.25);
      if (parts.cap) parts.cap.visible = false;
      for (const p of parts.petals) p.visible = false;
      (parts.body.material as THREE.MeshStandardMaterial).color.multiplyScalar(0.5);
    } else {
      return; // ricochet, shatter, miss: nothing to leave behind
    }
    this.view.root.add(g);
    this.entries.push({ shot: index, obj: g });
  }

  /** Hide the remains of the shot currently being replayed (its own projectile shows it live). */
  setCurrent(index: number) {
    for (const e of this.entries) e.obj.visible = e.shot !== index;
  }

  clear() {
    for (const e of this.entries) {
      e.obj.removeFromParent();
      e.obj.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
    }
    this.entries = [];
  }

  get count() {
    return this.entries.length;
  }
}
