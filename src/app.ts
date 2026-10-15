import * as THREE from 'three';
import { FAMILIES, ROUNDS, roundById } from './data/rounds';
import { VEHICLES, vehicleById } from './data/vehicles';
import { createScene, type SceneCtx } from './render/scene';
import { ShotView, applyDamage } from './render/shotView';
import { buildTank, type TankView } from './render/tank';
import { cameraSectionPlane, setSectionPlane, setXray, shotSectionPlane, type SectionMode } from './render/xray';
import { penetrationAt } from './sim/penetration';
import { previewShot, simulateShot, type Preview } from './sim/shot';
import { initialState, STATION_LOSS, woundLevel } from './sim/state';
import type { Round, ShotResult, VehicleState } from './sim/types';
import { DEG, v3, type Vec3 } from './sim/vec';
import { fmt, h, select } from './ui/dom';

export interface Aim {
  point: THREE.Vector3;
  dir: THREE.Vector3;
}

export class App {
  ctx: SceneCtx;
  vehicleId = VEHICLES[0].id;
  roundId = 'br365k';
  distance = 500;
  respectCamera = true;
  yaw = 0;
  pitch = 5;
  xray = true;
  section: SectionMode = 'shot';
  tank!: TankView;
  vstate!: VehicleState;
  shots: ShotResult[] = [];
  current = -1;
  shotView: ShotView | null = null;
  replayT = 0;
  playing = false;
  speed = 0.25;
  aim: Aim | null = null;
  hover: Aim | null = null;
  preview: Preview | null = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private aimLine: THREE.Line;
  private aimMarker: THREE.Mesh;
  private ui = document.getElementById('ui')!;
  private left = h('div', { class: 'panel left' });
  private right = h('div', { class: 'panel right hidden' });
  private aimBox = h('div', { class: 'aimbox' });
  private downAt = { x: 0, y: 0 };
  private lastFrame = performance.now();

  constructor(container: HTMLElement) {
    this.ctx = createScene(container);
    this.aimLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xff5a3a, dashSize: 0.15, gapSize: 0.08, depthTest: false, transparent: true }),
    );
    this.aimLine.renderOrder = 20;
    this.aimMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.09, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true }),
    );
    this.aimMarker.renderOrder = 21;
    this.ctx.scene.add(this.aimLine, this.aimMarker);
    this.ui.append(this.left, this.right);
    this.loadVehicle(this.vehicleId);
    this.bindInput();
    this.renderLeft();
    requestAnimationFrame(this.frame);
  }

  get vehicle() {
    return vehicleById(this.vehicleId);
  }
  get round(): Round {
    return roundById(this.roundId);
  }

  // ------------------------------------------------------------ vehicle

  loadVehicle(id: string) {
    if (this.tank) this.tank.root.removeFromParent();
    this.shotView?.dispose();
    this.shotView = null;
    this.vehicleId = id;
    this.tank = buildTank(this.vehicle);
    this.ctx.scene.add(this.tank.root);
    setXray(this.tank, this.xray);
    this.resetDamage();
  }

  resetDamage() {
    this.vstate = initialState(this.vehicle);
    this.shots = [];
    this.current = -1;
    this.shotView?.dispose();
    this.shotView = null;
    applyDamage(this.tank, null, 0);
    this.renderRight();
  }

  // ------------------------------------------------------------ aiming

  private bindInput() {
    const el = this.ctx.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (this.downAt = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointermove', (e) => {
      this.hover = this.pick(e);
      if (!this.aim) this.updatePreview();
    });
    el.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 4 || e.button !== 0) return;
      const a = this.pick(e);
      if (a) {
        this.aim = a;
        this.updatePreview();
      }
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).type !== 'range') return;
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      this.fire();
    } else if (k === 'x') this.toggleXray();
    else if (k === 'c') this.cycleSection();
    else if (k === 'escape') this.clearAim();
  }

  toggleXray() {
    this.xray = !this.xray;
    setXray(this.tank, this.xray);
    this.renderLeft();
  }

  cycleSection() {
    this.section = this.section === 'off' ? 'shot' : this.section === 'shot' ? 'camera' : 'off';
    this.renderLeft();
  }

  clearAim() {
    this.aim = null;
    this.updatePreview();
  }

  /** Shot direction for a target point under the current angle mode. */
  shotDir(point: THREE.Vector3): THREE.Vector3 {
    if (this.respectCamera) return point.clone().sub(this.ctx.camera.position).normalize();
    // yaw 0 = shooting from the front (travelling -X), positive yaw swings to the left side.
    const y = this.yaw * DEG;
    const p = this.pitch * DEG;
    return new THREE.Vector3(-Math.cos(y) * Math.cos(p), -Math.sin(p), -Math.sin(y) * Math.cos(p)).normalize();
  }

  private pick(e: PointerEvent): Aim | null {
    const r = this.ctx.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.ctx.camera);
    const meshes = [...this.tank.plateMeshes.values()];
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const point = hit.point.clone();
    return { point, dir: this.shotDir(point) };
  }

  /** Origin of the simulated shot: a few metres back along the line of fire. */
  shotOrigin(a: Aim): Vec3 {
    const o = a.point.clone().addScaledVector(a.dir, -6);
    return v3(o.x, o.y, o.z);
  }

  updatePreview() {
    const a = this.aim ?? this.hover;
    if (a && !this.respectCamera) a.dir = this.shotDir(a.point);
    if (!a) {
      this.preview = null;
      this.aimLine.visible = this.aimMarker.visible = false;
    } else {
      const d = v3(a.dir.x, a.dir.y, a.dir.z);
      this.preview = previewShot(this.vehicle, this.vstate, this.round, this.shotOrigin(a), d, this.distance);
      const from = a.point.clone().addScaledVector(a.dir, -6);
      this.aimLine.geometry.setFromPoints([from, a.point]);
      this.aimLine.computeLineDistances();
      this.aimLine.visible = true;
      this.aimMarker.position.copy(this.preview ? new THREE.Vector3(this.preview.point.x, this.preview.point.y, this.preview.point.z) : a.point);
      this.aimMarker.lookAt(this.aimMarker.position.clone().sub(a.dir));
      this.aimMarker.visible = true;
      const color = !this.preview ? 0xffffff : this.preview.rating === 'good' ? 0x4cd964 : this.preview.rating === 'marginal' ? 0xffd23f : 0xff4b3e;
      (this.aimMarker.material as THREE.MeshBasicMaterial).color.setHex(color);
      (this.aimLine.material as THREE.LineDashedMaterial).color.setHex(color);
      (this.aimMarker.material as THREE.MeshBasicMaterial).opacity = this.aim ? 1 : 0.6;
    }
    this.renderAimBox();
  }

  // ------------------------------------------------------------ firing

  fire() {
    const a = this.aim ?? this.hover;
    if (!a) return;
    const dir = v3(a.dir.x, a.dir.y, a.dir.z);
    const shot = simulateShot(
      this.vehicle,
      this.round,
      { vehicleId: this.vehicleId, roundId: this.roundId, distance: this.distance, origin: this.shotOrigin(a), dir, seed: (Math.random() * 2 ** 31) | 0 },
      this.vstate,
    );
    this.vstate = shot.stateAfter;
    this.shots.push(shot);
    this.showShot(this.shots.length - 1, true);
    this.updatePreview();
  }

  showShot(i: number, play: boolean) {
    this.shotView?.dispose();
    this.current = i;
    const shot = this.shots[i];
    this.shotView = new ShotView(this.tank, shot);
    this.ctx.scene.add(this.shotView.group);
    this.replayT = play ? 0 : shot.duration;
    this.playing = play;
    this.renderRight();
  }

  // ------------------------------------------------------------ panels

  renderLeft() {
    const r = this.round;
    const fam = r.family;
    const roundsOfFam = ROUNDS.filter((x) => x.family === fam);
    const pen = penetrationAt(r, this.distance);
    const dist = h('input', { type: 'range', min: 0, max: 3000, step: 50, value: this.distance });
    const distVal = h('span', { class: 'val' }, `${this.distance} m`);
    const penVal = h('span', { class: 'val' }, `${fmt(pen)} mm`);
    dist.addEventListener('input', () => {
      this.distance = Number(dist.value);
      distVal.textContent = `${this.distance} m`;
      penVal.textContent = `${fmt(penetrationAt(this.round, this.distance))} mm`;
      this.updatePreview();
    });
    const angleCtl = h('div', { class: this.respectCamera ? 'hidden' : 'angles' });
    if (!this.respectCamera) {
      const yaw = h('input', { type: 'range', min: -180, max: 180, step: 1, value: this.yaw });
      const pitch = h('input', { type: 'range', min: -20, max: 70, step: 1, value: this.pitch });
      const yv = h('span', { class: 'val' }, `${this.yaw}°`);
      const pv = h('span', { class: 'val' }, `${this.pitch}°`);
      yaw.addEventListener('input', () => { this.yaw = Number(yaw.value); yv.textContent = `${this.yaw}°`; this.updatePreview(); });
      pitch.addEventListener('input', () => { this.pitch = Number(pitch.value); pv.textContent = `${this.pitch}°`; this.updatePreview(); });
      angleCtl.append(h('label', {}, 'Yaw (0 = frontal)'), h('div', { class: 'row' }, yaw, yv), h('label', {}, 'Pitch (down)'), h('div', { class: 'row' }, pitch, pv));
    }
    const cam = h('input', { type: 'checkbox' });
    cam.checked = this.respectCamera;
    cam.addEventListener('change', () => {
      this.respectCamera = cam.checked;
      this.renderLeft();
      this.updatePreview();
    });

    this.left.replaceChildren(
      h('h2', {}, 'Protection Analysis'),
      h('label', {}, 'Target'),
      select(VEHICLES.map((v) => ({ value: v.id, label: `[${v.br}] ${v.name}` })), this.vehicleId, (id) => {
        this.loadVehicle(id);
        this.clearAim();
        this.renderLeft();
      }),
      h('div', { class: 'desc' }, this.vehicle.description),
      h('label', {}, 'Round type'),
      select(FAMILIES.map((f) => ({ value: f, label: f })), fam, (f) => {
        this.roundId = ROUNDS.find((x) => x.family === f)!.id;
        this.renderLeft();
        this.updatePreview();
      }),
      h('label', {}, 'Shell'),
      select(roundsOfFam.map((x) => ({ value: x.id, label: `${x.name} — ${x.gun}` })), this.roundId, (id) => {
        this.roundId = id;
        this.renderLeft();
        this.updatePreview();
      }),
      h('div', { class: 'desc' }, r.description),
      h('div', { class: 'stats' },
        stat('Calibre', `${r.caliber} mm`),
        stat('Velocity', `${r.velocity} m/s`),
        stat('Mass', `${r.mass} kg`),
        stat('Filler', r.filler ? `${r.filler} kg` : '—'),
      ),
      h('label', {}, 'Distance'),
      h('div', { class: 'row' }, dist, distVal),
      h('div', { class: 'row big' }, h('span', {}, 'Penetration'), penVal),
      h('label', { class: 'check' }, cam, ' Respect camera angle'),
      angleCtl,
      this.aimBox,
      h('div', { class: 'buttons' },
        h('button', { class: 'fire', onclick: () => this.fire() }, 'FIRE  [Space]'),
        h('button', { onclick: () => this.clearAim() }, 'Clear aim [Esc]'),
        h('button', { onclick: () => this.resetDamage() }, 'Repair vehicle'),
      ),
      h('div', { class: 'buttons' },
        h('button', { class: this.xray ? 'on' : '', onclick: () => this.toggleXray() }, 'X-ray [X]'),
        h('button', { class: this.section !== 'off' ? 'on' : '', onclick: () => this.cycleSection() }, `Section: ${this.section} [C]`),
      ),
      h('div', { class: 'hint' }, 'Drag to orbit · click armor to lock aim · Space to fire'),
    );
    this.renderAimBox();
  }

  renderAimBox() {
    const p = this.preview;
    if (!p) {
      this.aimBox.replaceChildren(h('div', { class: 'muted' }, 'Hover the hull to inspect armor'));
      return;
    }
    const chip = h('span', { class: `chip ${p.rating}` }, p.rating === 'good' ? 'Likely penetration' : p.rating === 'marginal' ? 'Marginal' : p.ricochet > 0.5 ? 'Ricochet likely' : 'Unlikely');
    this.aimBox.replaceChildren(
      h('div', { class: 'aimtitle' }, p.plate.name, this.aim ? h('span', { class: 'lock' }, 'LOCKED') : null),
      h('div', { class: 'stats' },
        stat('Plate', `${fmt(p.plate.mm)} mm`),
        stat('Angle', `${fmt(p.angleDeg)}°`),
        stat('LOS (equiv.)', `${fmt(p.losMm)} mm`),
        stat('Your pen', `${fmt(p.penMm)} mm`),
      ),
      chip,
    );
  }

  renderRight() {
    const shot = this.shots[this.current];
    if (!shot) {
      this.right.classList.add('hidden');
      return;
    }
    this.right.classList.remove('hidden');
    const s = shot.summary;
    const v = this.vehicle;
    const sev = s.verdict.startsWith('Catastrophic') || s.verdict === 'Knocked out' ? 'bad' : s.verdict === 'Disabled' || s.verdict === 'Crew injured' ? 'warn' : s.verdict.startsWith('Non') || s.verdict === 'Ricochet' ? 'muted' : 'ok';
    const crewRows = v.crew.map((c) => {
      const lvl = woundLevel(v, shot.stateAfter, c.id);
      const zones = [...new Set(shot.crewHits.filter((x) => x.crewId === c.id).map((x) => x.zone))];
      return h('div', { class: `crewrow ${lvl.split(' ')[0].toLowerCase()}` },
        h('span', {}, c.name, zones.length ? h('small', {}, ` ${zones.join(', ')}`) : null),
        h('span', {}, lvl === 'Incapacitated' ? `${lvl} · ${STATION_LOSS[c.role]}` : lvl));
    });
    this.right.replaceChildren(
      h('h2', {}, `Shot ${this.current + 1}`),
      h('div', { class: `verdict ${sev}` }, s.verdict),
      h('div', { class: 'stats' },
        stat('Round', roundById(shot.input.roundId).name),
        stat('Distance', `${shot.input.distance} m`),
        stat('Penetrated', s.penetrated ? 'Yes' : 'No'),
        stat('Impact angle', `${fmt(s.angleDeg)}°`),
        stat('Pen at target', `${fmt(s.penAtTargetMm)} mm`),
        stat('Armor defeated', `${fmt(s.armorDefeatedMm)} mm`),
        stat('Residual pen', `${fmt(s.residualMm)} mm`),
        stat('Spall fragments', `${s.spallCount}`),
        stat('Cook-off', s.cookOff === 'none' ? 'No' : s.cookOff),
      ),
      h('h3', {}, 'Crew'),
      ...crewRows,
      h('h3', {}, 'Modules hit'),
      s.modulesDamaged.length
        ? h('div', { class: 'modlist' }, ...s.modulesDamaged.map((id) => {
            const m = v.modules.find((x) => x.id === id)!;
            const dead = shot.stateAfter.moduleHp[id] <= 0;
            return h('span', { class: `mod ${dead ? 'dead' : ''}` }, m.name);
          }))
        : h('div', { class: 'muted' }, 'None'),
    );
  }

  // ------------------------------------------------------------ loop

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.ctx.controls.update();
    const shot = this.shots[this.current];
    if (shot && this.playing) {
      this.replayT += dt * this.speed;
      if (this.replayT >= shot.duration) {
        this.replayT = shot.duration;
        this.playing = false;
      }
    }
    this.shotView?.update(this.replayT);
    this.updateSection();
    this.ctx.renderer.render(this.ctx.scene, this.ctx.camera);
    requestAnimationFrame(this.frame);
  };

  private updateSection() {
    let plane: THREE.Plane | null = null;
    const shot = this.shots[this.current];
    const a = this.aim ?? this.hover;
    if (this.section === 'shot') {
      if (shot && !a) {
        const imp = shot.impacts[0];
        if (imp) plane = shotSectionPlane(new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z), new THREE.Vector3(shot.input.dir.x, shot.input.dir.y, shot.input.dir.z), this.ctx.camera.position);
      } else if (a && this.aim) {
        plane = shotSectionPlane(a.point, a.dir, this.ctx.camera.position);
      } else if (shot) {
        const imp = shot.impacts[0];
        if (imp) plane = shotSectionPlane(new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z), new THREE.Vector3(shot.input.dir.x, shot.input.dir.y, shot.input.dir.z), this.ctx.camera.position);
      }
    } else if (this.section === 'camera') {
      plane = cameraSectionPlane(new THREE.Vector3(0, 1, 0), this.ctx.camera.position);
    }
    setSectionPlane(this.tank, plane);
  }
}

function stat(k: string, v: string) {
  return h('div', { class: 'stat' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
}
