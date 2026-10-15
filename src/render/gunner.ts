import * as THREE from 'three';
import { dispersionMils, solveArc, type FiringSolution } from '../sim/ballistics';
import type { Round } from '../sim/types';
import { h } from '../ui/dom';

const TICK_RANGES = [400, 800, 1200, 1600, 2000, 2400, 2800];

/**
 * Gunner's sight: the camera sits at the gun `range` metres from the target with a fixed centre reticle.
 * Dragging traverses and elevates the view; the wheel changes magnification. The sight is laid for the
 * current range, and the reticle shows the lead needed for other ranges.
 */
export class GunnerView {
  active = false;
  yaw = Math.PI; // looking along -X (at the tank's front) by default
  pitch = 0;
  zoom = 1;
  gunPos = new THREE.Vector3();
  solution: FiringSolution | null = null;
  readonly overlay = h('div', { class: 'sight hidden' });
  private reticle = h('div', { class: 'reticle' });
  private hud = h('div', { class: 'sighthud' });
  private baseFov = 10;
  private saved = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45, far: 300 };
  private fog: THREE.Scene['fog'] = null;
  private scene: THREE.Scene | null = null;

  constructor() {
    this.overlay.append(this.reticle, this.hud);
  }

  enter(camera: THREE.PerspectiveCamera, scene: THREE.Scene, target: THREE.Vector3, range: number) {
    this.saved = { pos: camera.position.clone(), target: target.clone(), fov: camera.fov, far: camera.far };
    // The gun is up to 3 km away: push the far plane out and drop the atmospheric fog while in the sight.
    camera.far = range * 1.5 + 100;
    this.scene = scene;
    this.fog = scene.fog;
    scene.fog = null;
    // Keep the player's current bearing on the tank, but drop to gun height.
    const az = camera.position.clone().sub(target).setY(0).normalize();
    this.yaw = Math.atan2(-az.z, -az.x) + Math.PI; // look back toward the target
    this.pitch = 0;
    this.gunPos.copy(target).setY(0).addScaledVector(az, range).add(new THREE.Vector3(0, 2.0, 0));
    camera.position.copy(this.gunPos);
    this.baseFov = THREE.MathUtils.clamp((2 * Math.atan(9 / range) * 180) / Math.PI, 0.35, 30);
    this.active = true;
    this.overlay.classList.remove('hidden');
    this.update(camera);
  }

  exit(camera: THREE.PerspectiveCamera): { target: THREE.Vector3 } {
    this.active = false;
    this.overlay.classList.add('hidden');
    camera.position.copy(this.saved.pos);
    camera.fov = this.saved.fov;
    camera.far = this.saved.far;
    camera.updateProjectionMatrix();
    if (this.scene) this.scene.fog = this.fog;
    return { target: this.saved.target };
  }

  /** Current line of sight from the gun. */
  lookDir(): THREE.Vector3 {
    return new THREE.Vector3(-Math.cos(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.sin(this.yaw) * Math.cos(this.pitch));
  }

  onDrag(dx: number, dy: number, viewportH: number, camera: THREE.PerspectiveCamera) {
    const radPerPx = (camera.fov * Math.PI) / 180 / viewportH;
    this.yaw -= dx * radPerPx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * radPerPx, -0.3, 0.3);
  }

  onWheel(deltaY: number) {
    this.zoom = THREE.MathUtils.clamp(this.zoom * (deltaY > 0 ? 0.8 : 1.25), 0.5, 6);
  }

  update(camera: THREE.PerspectiveCamera) {
    camera.position.copy(this.gunPos);
    camera.lookAt(this.gunPos.clone().add(this.lookDir()));
    camera.fov = this.baseFov / this.zoom;
    camera.updateProjectionMatrix();
  }

  /** Arrival direction of a shell fired at `point` with the sight laid for the current range. */
  arrivalDir(point: THREE.Vector3): THREE.Vector3 {
    const horiz = point.clone().sub(this.gunPos).setY(0).normalize();
    const d = this.solution?.descent ?? 0;
    return horiz.multiplyScalar(Math.cos(d)).add(new THREE.Vector3(0, -Math.sin(d), 0)).normalize();
  }

  /** Re-lay the sight for a round and range and redraw the reticle (ticks scale with the current fov). */
  lay(round: Round, range: number, camera: THREE.PerspectiveCamera, viewportH: number) {
    this.solution = solveArc(round, range);
    const pxPerMil = viewportH / ((camera.fov * Math.PI) / 180) / 1000;
    const ticks: string[] = [];
    for (const r of TICK_RANGES) {
      const mils = (solveArc(round, r).elevation - this.solution.elevation) * 1000;
      const y = mils * pxPerMil; // farther ranges sit below the centre: you raise the gun to put them on the target
      if (Math.abs(y) > 320) continue;
      const w = r % 800 === 0 ? 34 : 22;
      ticks.push(`<line x1="${-w}" y1="${y.toFixed(1)}" x2="${w}" y2="${y.toFixed(1)}"/>`);
      ticks.push(`<text x="${w + 6}" y="${(y + 4).toFixed(1)}">${r}</text>`);
    }
    const sig = dispersionMils(round) * pxPerMil;
    const sigma = sig > 2 ? `<circle cx="0" cy="0" r="${(sig * 2).toFixed(1)}" class="sigma"/>` : '';
    // Static markup built from numbers only.
    this.reticle.innerHTML = `<svg width="800" height="800" viewBox="-400 -400 800 800">
      <line x1="-400" y1="0" x2="-60" y2="0"/><line x1="60" y1="0" x2="400" y2="0"/>
      <line x1="0" y1="-400" x2="0" y2="-60"/><line x1="0" y1="60" x2="0" y2="400"/>
      <circle cx="0" cy="0" r="3" class="dot"/>${sigma}${ticks.join('')}</svg>`;
    const s = this.solution;
    this.hud.replaceChildren(
      h('span', {}, `${round.name}`),
      h('span', {}, `Sight ${range} m`),
      h('span', {}, `ToF ${s.timeOfFlight.toFixed(2)} s`),
      h('span', {}, `Impact ${s.impactVelocity.toFixed(0)} m/s`),
      h('span', {}, `Descent ${((s.descent * 180) / Math.PI).toFixed(1)}°`),
      h('span', {}, `Lead ${((s.elevation * 180) / Math.PI).toFixed(2)}°`),
      h('span', {}, `σ ${dispersionMils(round).toFixed(2)} mil`),
      h('span', { class: 'muted' }, `×${(this.zoom * (10 / this.baseFov)).toFixed(1)}`),
    );
  }
}
