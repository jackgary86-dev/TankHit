import * as THREE from 'three';
import { FAMILIES, ROUNDS, roundById } from './data/rounds';
import { VEHICLES, vehicleById } from './data/vehicles';
import { DamageDecals } from './render/decals';
import { GunnerView } from './render/gunner';
import { KillOverlay, killColor } from './render/killOverlay';
import { createScene, type SceneCtx } from './render/scene';
import { dispersionMils, gaussian } from './sim/ballistics';
import { killProbability } from './sim/killmap';
import type { KillMapMessage, KillMapRequest } from './sim/killmap.worker';
import { ShotView, applyDamage } from './render/shotView';
import { buildTank, setTurretYaw, type TankView } from './render/tank';
import { muted, setMuted, sfx } from './render/audio';
import { cameraSectionPlane, HEAT_STOPS, heatColor, setSectionPlane, setXray, shotSectionPlane, type SectionMode } from './render/xray';
import { penetrationAt } from './sim/penetration';
import { previewShot, simulateShot, type Preview } from './sim/shot';
import { initialState, STATION_LOSS, woundLevel } from './sim/state';
import type { Round, ShotResult, VehicleState } from './sim/types';
import { DEG, makeRng, v3, type Vec3 } from './sim/vec';
import { CHALLENGES, evaluateChallenge, loadStars, saveStars, type Challenge, type ChallengeResult } from './modes/challenges';
import { compareRounds } from './modes/compare';
import { isUnlocked, MAX_STARS, nextUnlock, REQUIRES, totalStars } from './modes/progression';
import { decodeShot, shareUrl } from './modes/share';
import { fmt, h, select } from './ui/dom';

export type Mode = 'sandbox' | 'challenges' | 'compare';

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
  turretYaw = 0;
  xray = true;
  heat = false;
  killMap = false;
  gunner = new GunnerView();
  decals!: DamageDecals;
  autoCam = true;
  private camGoal: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  private gunnerPickT = 0;
  private killWorker: Worker | null = null;
  private killOverlay = new KillOverlay();
  private killReq = 0;
  private killSig = '';
  private killTimer = 0;
  private killStatus = h('div', { class: 'killstatus hidden' });
  private killLegend = h('div', { class: 'legend kill hidden' });
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
  mode: Mode = 'sandbox';
  challenge: Challenge | null = null;
  challengeResult: ChallengeResult | null = null;
  compareIds: string[] = ['m829a1', '3bm42', 'm456a2', 'pzgr39'];

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private aimLine: THREE.Line;
  private aimMarker: THREE.Mesh;
  private ui = document.getElementById('ui')!;
  private left = h('div', { class: 'panel left' });
  private right = h('div', { class: 'panel right hidden' });
  private aimBox = h('div', { class: 'aimbox' });
  private timeline = h('div', { class: 'timeline hidden' });
  private log = h('div', { class: 'shotlog hidden' });
  private topbar = h('div', { class: 'topbar' });
  private overlay = h('div', { class: 'overlay hidden' });
  private comparePanel = h('div', { class: 'panel right compare hidden' });
  private legend = h('div', { class: 'legend hidden' });
  private tlRange!: HTMLInputElement;
  private tlTime!: HTMLSpanElement;
  private tlPlay!: HTMLButtonElement;
  private ride = -1;
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
    this.ui.append(this.gunner.overlay, this.topbar, this.left, this.right, this.comparePanel, this.log, this.timeline, this.legend, this.killLegend, this.killStatus, this.overlay);
    this.buildLegend();
    this.ctx.scene.add(this.killOverlay.group);
    this.loadVehicle(this.vehicleId);
    this.bindInput();
    this.renderLeft();
    this.renderTopbar();
    this.loadFromHash();
    window.addEventListener('hashchange', () => this.loadFromHash());
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
    this.decals = new DamageDecals(this.tank);
    this.ctx.scene.add(this.tank.root);
    setXray(this.tank, this.xray, this.heat);
    this.resetDamage();
  }

  resetDamage() {
    this.vstate = initialState(this.vehicle);
    this.decals?.clear();
    this.challengeResult = this.challenge ? { status: 'active', stars: 0 } : null;
    this.comparePanel.classList.add('hidden');
    this.shots = [];
    this.current = -1;
    this.shotView?.dispose();
    this.shotView = null;
    applyDamage(this.tank, null, 0);
    this.renderRight();
    this.renderTimeline();
    this.renderLog();
  }

  // ------------------------------------------------------------ aiming

  private bindInput() {
    const el = this.ctx.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY };
      this.camGoal = null;
    });
    let last = { x: 0, y: 0 };
    el.addEventListener('pointermove', (e) => {
      if (this.gunner.active) {
        if (e.buttons & 1) this.gunner.onDrag(e.clientX - last.x, e.clientY - last.y, el.clientHeight, this.ctx.camera);
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      last = { x: e.clientX, y: e.clientY };
      this.hover = this.pick(e);
      if (!this.aim) this.updatePreview();
    });
    el.addEventListener('wheel', (e) => {
      if (!this.gunner.active) return;
      e.preventDefault();
      this.gunner.onWheel(e.deltaY);
      this.layGun();
    }, { passive: false });
    el.addEventListener('pointerup', (e) => {
      if (this.gunner.active) return;
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
    else if (k === 'p' || k === 'enter') this.togglePlay();
    else if (k === 'a') this.stepShot(-1);
    else if (k === 'd') this.stepShot(1);
    else if (k === 'w' || k === 's') this.rideShot((k === 'w' ? 1 : -1) * (e.shiftKey ? 0.6 : 0.2));
    else if (k === 'r') this.resetCamera();
    else if (k === 'h') this.toggleHeat();
    else if (k === 'k') this.toggleKillMap();
    else if (k === 'g') this.toggleGunner();
    else if (k === 'v') this.toggleAutoCam();
    else if (k === 'q' || k === 'e') this.setTurretYaw(this.turretYaw + (k === 'e' ? 5 : -5));
    else if (k === 'm') this.toggleMute();
  }

  setTurretYaw(deg: number) {
    this.turretYaw = ((((deg + 180) % 360) + 360) % 360) - 180;
    setTurretYaw(this.tank, this.turretYaw * DEG);
    this.updatePreview();
    const el = this.left.querySelector<HTMLInputElement>('input[data-turret]');
    if (el) {
      el.value = String(this.turretYaw);
      (el.nextElementSibling as HTMLElement).textContent = `${this.turretYaw}°`;
    }
  }

  // ------------------------------------------------------------ kill-probability map

  toggleKillMap() {
    this.killMap = !this.killMap;
    this.killLegend.classList.toggle('hidden', !this.killMap);
    if (!this.killMap) {
      this.killOverlay.clear();
      this.killStatus.classList.add('hidden');
      this.killSig = '';
    }
    this.renderLeft();
  }

  /** Direction shots travel for the map: the camera's line of sight, or the manual yaw/pitch. */
  private mapDir(): THREE.Vector3 {
    if (!this.respectCamera) return this.shotDir(new THREE.Vector3());
    return this.ctx.controls.target.clone().sub(this.ctx.camera.position).normalize();
  }

  /** Re-run the map whenever anything it depends on changes (debounced). */
  private pollKillMap() {
    if (!this.killMap) return;
    const d = this.mapDir();
    const q = (x: number) => Math.round(x * 12);
    const sig = [this.vehicleId, this.roundId, this.distance, this.turretYaw, this.shots.length, this.mode, q(d.x), q(d.y), q(d.z)].join('|');
    if (sig === this.killSig) return;
    this.killSig = sig;
    clearTimeout(this.killTimer);
    this.killTimer = window.setTimeout(() => this.requestKillMap(d), 350);
  }

  private requestKillMap(dir: THREE.Vector3) {
    if (!this.killWorker) {
      this.killWorker = new Worker(new URL('./sim/killmap.worker.ts', import.meta.url), { type: 'module' });
      this.killWorker.onmessage = (e: MessageEvent<KillMapMessage>) => this.onKillMessage(e.data);
    }
    const id = ++this.killReq;
    const req: KillMapRequest = {
      id, vehicleId: this.vehicleId, roundId: this.roundId, distance: this.distance, yawDeg: this.turretYaw,
      state: structuredClone(this.vstate), dir: v3(dir.x, dir.y, dir.z), cell: 0.14, seeds: 4,
    };
    this.killWorker.postMessage(req);
    this.killStatus.textContent = 'Computing kill map…';
    this.killStatus.classList.remove('hidden');
  }

  private onKillMessage(m: KillMapMessage) {
    if (m.id !== this.killReq || !this.killMap) return;
    if (m.kind === 'grid') this.killOverlay.reset(m.grid);
    else if (m.kind === 'row') this.killOverlay.addRow(m.cells);
    else this.killStatus.classList.add('hidden');
  }

  private buildKillLegend() {
    const grad = [0, 0.25, 0.5, 0.75, 1].map((p) => `#${killColor(p).getHexString()} ${p * 100}%`).join(', ');
    this.killLegend.replaceChildren(
      h('div', { class: 'ltitle' }, 'Chance to disable / knock out'),
      h('div', { class: 'bar', style: `background: linear-gradient(90deg, ${grad})` }),
      h('div', { class: 'labels' }, ...[0, 25, 50, 75, 100].map((n) => h('span', {}, `${n}%`))),
    );
  }

  // ------------------------------------------------------------ gunner's sight

  toggleGunner() {
    if (this.gunner.active) {
      const { target } = this.gunner.exit(this.ctx.camera);
      this.ctx.controls.target.copy(target);
      this.ctx.controls.enabled = true;
      this.hover = null;
      this.clearAim();
    } else {
      this.aim = null;
      this.ctx.controls.enabled = false;
      this.gunner.enter(this.ctx.camera, this.ctx.scene, this.ctx.controls.target, this.distance);
      this.layGun();
    }
    this.renderLeft();
  }

  /** Re-lay the sight for the current round and range. */
  private layGun() {
    if (!this.gunner.active) return;
    this.gunner.lay(this.round, this.distance, this.ctx.camera, this.ctx.renderer.domElement.clientHeight);
  }

  /** What is under the reticle right now (throttled: the aim box runs 16 simulations). */
  private pollGunner(now: number) {
    if (!this.gunner.active) return;
    this.gunner.update(this.ctx.camera);
    if (now - this.gunnerPickT < 120) return;
    this.gunnerPickT = now;
    const a = this.pickNdc(0, 0);
    const changed = !!a !== !!this.hover || (a && this.hover && a.point.distanceToSquared(this.hover.point) > 1e-4);
    if (changed) {
      this.hover = a;
      this.updatePreview();
    }
  }

  // ------------------------------------------------------------ auto camera

  toggleAutoCam() {
    this.autoCam = !this.autoCam;
    if (!this.autoCam) this.camGoal = null;
    this.renderLeft();
  }

  /** Pick a three-quarter view of the first impact, looking along the shot, from the side away from the hull interior. */
  private frameImpact(shot: ShotResult) {
    const imp = shot.impacts[0];
    const d = new THREE.Vector3(shot.input.dir.x, shot.input.dir.y, shot.input.dir.z).normalize();
    const p = imp ? new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z) : new THREE.Vector3(shot.input.origin.x, shot.input.origin.y, shot.input.origin.z).addScaledVector(d, 6);
    const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
    // Keep the camera on whichever side it is already on so the cut does not flip the view.
    const cur = this.ctx.camera.position.clone().sub(p);
    if (cur.dot(side) < 0) side.negate();
    const pos = p.clone().addScaledVector(d, -2.6).addScaledVector(side, 3.2).add(new THREE.Vector3(0, 1.9, 0));
    this.camGoal = { pos, target: p.clone() };
    this.ride = -1;
  }

  /** Ease toward the framing goal and, while playing, follow the penetrator head. */
  private updateAutoCam() {
    if (!this.autoCam || !this.camGoal || this.gunner.active) return;
    const shot = this.shots[this.current];
    const goal = this.camGoal;
    if (shot && this.playing) {
      const head = shot.traces.find((t) => (t.kind === 'shell' || t.kind === 'jet') && this.replayT >= t.t0 && this.replayT <= t.t1);
      const imp = shot.impacts[0];
      if (head && imp) {
        const k = (this.replayT - head.t0) / Math.max(head.t1 - head.t0, 1e-6);
        const hp = new THREE.Vector3(head.from.x + (head.to.x - head.from.x) * k, head.from.y + (head.to.y - head.from.y) * k, head.from.z + (head.to.z - head.from.z) * k);
        // Keep the impact in frame: follow the head only within a metre of where it strikes.
        const ip = new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z);
        goal.target.copy(ip).add(hp.sub(ip).clampLength(0, 1.0));
      }
    }
    this.ctx.camera.position.lerp(goal.pos, 0.08);
    this.ctx.controls.target.lerp(goal.target, 0.12);
    if (this.ctx.camera.position.distanceTo(goal.pos) < 0.02 && !this.playing) this.camGoal = null;
  }

  toggleHeat() {
    this.heat = !this.heat;
    setXray(this.tank, this.xray, this.heat);
    this.legend.classList.toggle('hidden', !this.heat);
    this.renderLeft();
  }

  toggleMute() {
    setMuted(!muted);
    this.renderLeft();
  }

  private buildLegend() {
    this.buildKillLegend();
    const grad = HEAT_STOPS.map((mm) => `#${heatColor(mm).getHexString()} ${(100 * mm) / 500}%`).join(', ');
    this.legend.replaceChildren(
      h('div', { class: 'ltitle' }, 'Armor (KE RHA-equivalent, 0°)'),
      h('div', { class: 'bar', style: `background: linear-gradient(90deg, ${grad})` }),
      h('div', { class: 'labels' }, ...HEAT_STOPS.map((mm) => h('span', {}, `${mm}`))),
    );
  }

  /** Play sound cues for replay events crossed between the previous and current replay time. */
  private playSounds(shot: ShotResult, from: number, to: number) {
    const crossed = (t: number) => t > from && t <= to;
    if (from <= 0 && to > 0) sfx.fire();
    for (const imp of shot.impacts) {
      if (!crossed(imp.t)) continue;
      if (imp.kind === 'pen') sfx.pen();
      else if (imp.kind === 'nonpen') sfx.nonpen();
      else if (imp.kind === 'ricochet') sfx.ricochet();
      else if (imp.kind === 'shatter') sfx.nonpen();
      else sfx.blast();
    }
    for (const e of shot.bigEvents) {
      if (!crossed(e.t)) continue;
      if (e.kind === 'detonation') sfx.detonation();
      else if (e.kind === 'blowout') sfx.whoosh();
      else if (e.kind === 'fire') sfx.crackle();
    }
  }

  togglePlay() {
    const shot = this.shots[this.current];
    if (!shot) return;
    if (!this.playing && this.replayT >= shot.duration - 1e-3) this.replayT = 0;
    this.playing = !this.playing;
    this.syncTimeline();
  }

  stepShot(d: number) {
    if (!this.shots.length) return;
    const i = Math.max(0, Math.min(this.shots.length - 1, this.current + d));
    if (i !== this.current) this.showShot(i, true);
  }

  resetCamera() {
    this.ride = -1;
    this.camGoal = null;
    this.ctx.camera.position.set(7.5, 4.5, 7.5);
    this.ctx.controls.target.set(0, 1.1, 0);
  }

  /** Points along the main penetrator path of the current shot. */
  private shellPath(): THREE.Vector3[] {
    const shot = this.shots[this.current];
    if (!shot) return [];
    const pts: THREE.Vector3[] = [];
    for (const t of shot.traces.filter((x) => x.kind === 'shell' || x.kind === 'jet' || x.kind === 'ricochet')) {
      if (!pts.length) pts.push(new THREE.Vector3(t.from.x, t.from.y, t.from.z));
      pts.push(new THREE.Vector3(t.to.x, t.to.y, t.to.z));
    }
    return pts;
  }

  /** Move the camera along the shot path (W/S). */
  rideShot(delta: number) {
    this.camGoal = null;
    const pts = this.shellPath();
    if (pts.length < 2) return;
    const lens = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
    const total = lens.reduce((a, b) => a + b, 0);
    this.ride = Math.max(0, Math.min(total, (this.ride < 0 ? 4 : this.ride) + delta));
    const at = (d: number) => {
      let acc = 0;
      for (let i = 0; i < lens.length; i++) {
        if (acc + lens[i] >= d) return pts[i].clone().lerp(pts[i + 1], (d - acc) / Math.max(lens[i], 1e-6));
        acc += lens[i];
      }
      return pts[pts.length - 1].clone();
    };
    const here = at(this.ride);
    const ahead = at(Math.min(total, this.ride + 1.2));
    const dir = ahead.clone().sub(here);
    if (dir.lengthSq() < 1e-4) dir.copy(pts[pts.length - 1]).sub(pts[0]);
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    this.ctx.camera.position.copy(here).addScaledVector(dir, -1.4).addScaledVector(side, 0.7).add(new THREE.Vector3(0, 0.6, 0));
    this.ctx.controls.target.copy(here).addScaledVector(dir, 1.2);
  }

  toggleXray() {
    this.xray = !this.xray;
    setXray(this.tank, this.xray, this.heat);
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
    if (this.gunner.active) return this.gunner.arrivalDir(point);
    if (this.respectCamera) return point.clone().sub(this.ctx.camera.position).normalize();
    // yaw 0 = shooting from the front (travelling -X), positive yaw swings to the left side.
    const y = this.yaw * DEG;
    const p = this.pitch * DEG;
    return new THREE.Vector3(-Math.cos(y) * Math.cos(p), -Math.sin(p), -Math.sin(y) * Math.cos(p)).normalize();
  }

  private pick(e: PointerEvent): Aim | null {
    const r = this.ctx.renderer.domElement.getBoundingClientRect();
    return this.pickNdc(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private pickNdc(x: number, y: number): Aim | null {
    this.pointer.set(x, y);
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
      this.preview = previewShot(this.vehicle, this.vstate, this.round, this.shotOrigin(a), d, this.distance, this.turretYaw);
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

  // ------------------------------------------------------------ sharing

  /** Reproduce a shot from a share link (#v=…&r=…&o=…&dir=…&s=…). */
  loadFromHash() {
    const input = decodeShot(location.hash);
    if (!input) return;
    try {
      vehicleById(input.vehicleId);
      roundById(input.roundId);
    } catch {
      return;
    }
    if (this.mode !== 'sandbox') this.setMode('sandbox');
    if (this.gunner.active) this.toggleGunner();
    if (input.vehicleId !== this.vehicleId) this.loadVehicle(input.vehicleId);
    else this.resetDamage();
    this.roundId = input.roundId;
    this.distance = input.distance;
    this.setTurretYaw(input.turretYaw ?? 0);
    const shot = simulateShot(this.vehicle, this.round, input, this.vstate);
    this.vstate = shot.stateAfter;
    this.shots.push(shot);
    this.decals.addFromShot(shot);
    this.showShot(0, true);
    this.renderLeft();
    // Frame the impact.
    const imp = shot.impacts[0];
    if (imp) {
      const p = new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z);
      const d = new THREE.Vector3(input.dir.x, input.dir.y, input.dir.z);
      this.ctx.controls.target.copy(p);
      this.ctx.camera.position.copy(p).addScaledVector(d, -5).add(new THREE.Vector3(0, 2.5, 0));
    }
  }

  shareCurrent() {
    const shot = this.shots[this.current];
    if (!shot) return;
    const url = shareUrl(shot.input);
    history.replaceState(null, '', `#${url.split('#')[1]}`);
    const btn = this.right.querySelector<HTMLButtonElement>('button.share');
    const done = (ok: boolean) => {
      if (btn) btn.textContent = ok ? 'Link copied' : 'Link in address bar';
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
    else done(false);
  }

  // ------------------------------------------------------------ modes

  setMode(m: Mode) {
    this.mode = m;
    this.challenge = null;
    this.overlay.classList.add('hidden');
    if (m === 'challenges') this.showChallengePicker();
    this.resetDamage();
    this.renderTopbar();
    this.renderLeft();
  }

  renderTopbar() {
    const tab = (m: Mode, label: string) => h('button', { class: this.mode === m ? 'on' : '', onclick: () => this.setMode(m) }, label);
    this.topbar.replaceChildren(
      h('span', { class: 'logo' }, 'TANK', h('b', {}, 'HIT')),
      tab('sandbox', 'Sandbox'),
      tab('challenges', 'Challenges'),
      tab('compare', 'Compare Rounds'),
    );
  }

  showChallengePicker() {
    const stars = loadStars();
    const total = totalStars(stars);
    const next = nextUnlock(stars);
    this.overlay.classList.remove('hidden');
    this.overlay.replaceChildren(
      h('div', { class: 'picker' },
        h('div', { class: 'row' }, h('h2', {}, 'Challenges'), h('span', { class: 'total' }, `★ ${total} / ${MAX_STARS}`)),
        h('div', { class: 'muted' }, next
          ? `Fewer shots earn more stars. ${next.needed} more star${next.needed === 1 ? '' : 's'} unlock${next.needed === 1 ? 's' : ''} “${next.challenge.name}”.`
          : 'Fewer shots earn more stars. Everything is unlocked – well done.'),
        ...CHALLENGES.map((c) => {
          const open = isUnlocked(c, stars);
          return h('button', { class: `challenge ${open ? '' : 'locked'}`, disabled: !open, onclick: () => open && this.startChallenge(c) },
            h('div', { class: 'cname' }, c.name, open ? h('span', { class: 'stars' }, starText(stars[c.id] ?? 0)) : h('span', { class: 'lock' }, `★ ${REQUIRES[c.id]} to unlock`)),
            h('div', { class: 'cbrief' }, open ? c.brief : 'Locked.'),
            h('div', { class: 'cmeta' }, `${vehicleById(c.vehicleId).name} · ${c.rounds.map((r) => roundById(r).name).join(' / ')} · ${c.distance} m · ${c.maxShots} shots`),
          );
        }),
        h('button', { class: 'close', onclick: () => this.setMode('sandbox') }, 'Back to sandbox'),
      ),
    );
  }

  startChallenge(c: Challenge) {
    this.overlay.classList.add('hidden');
    this.challenge = c;
    this.roundId = c.rounds[0];
    this.distance = c.distance;
    if (c.fixedAngle) {
      this.respectCamera = false;
      this.yaw = c.fixedAngle.yaw;
      this.pitch = c.fixedAngle.pitch;
    }
    this.loadVehicle(c.vehicleId);
    this.setTurretYaw(c.turretYaw ?? 0);
    this.clearAim();
    this.renderLeft();
  }

  private challengeBox(): HTMLElement | null {
    const c = this.challenge;
    if (!c) return null;
    const res = this.challengeResult ?? { status: 'active', stars: 0 };
    const status =
      res.status === 'won' ? h('div', { class: 'cstatus won' }, 'Complete! ', starText(res.stars)) :
      res.status === 'failed' ? h('div', { class: 'cstatus failed' }, `Failed – ${res.reason ?? ''}`) :
      h('div', { class: 'cstatus' }, `Shots ${this.shots.length} / ${c.maxShots}`);
    return h('div', { class: 'challengebox' },
      h('div', { class: 'cname' }, c.name),
      h('div', { class: 'cbrief' }, c.brief),
      status,
      h('div', { class: 'buttons' },
        h('button', { onclick: () => this.startChallenge(c) }, 'Retry'),
        h('button', { onclick: () => this.showChallengePicker() }, 'All challenges'),
      ),
    );
  }

  runCompare() {
    const a = this.aim ?? this.hover;
    if (!a || !this.compareIds.length) return;
    const seed = (Math.random() * 2 ** 31) | 0;
    this.vstate = initialState(this.vehicle);
    this.shots = compareRounds(this.vehicle, this.compareIds, this.shotOrigin(a), v3(a.dir.x, a.dir.y, a.dir.z), this.distance, seed, this.turretYaw);
    this.showShot(0, true);
    this.renderCompare();
  }

  renderCompare() {
    const shots = this.shots;
    this.comparePanel.classList.toggle('hidden', !shots.length || this.mode !== 'compare');
    this.right.classList.add('hidden');
    if (!shots.length) return;
    const row = (label: string, f: (s: ShotResult) => string | HTMLElement) =>
      h('tr', {}, h('th', {}, label), ...shots.map((s) => h('td', {}, f(s))));
    const v = this.vehicle;
    this.comparePanel.replaceChildren(
      h('h2', {}, 'Compare Rounds'),
      h('div', { class: 'muted' }, `Same point, same seed, fresh ${v.name} for every round. Click a column to replay it.`),
      h('table', { class: 'cmp' },
        h('tr', {}, h('th', {}), ...shots.map((s, i) => h('th', { class: `col ${i === this.current ? 'on' : ''}`, onclick: () => { this.showShot(i, true); this.renderCompare(); } }, roundById(s.input.roundId).name))),
        row('Family', (s) => roundById(s.input.roundId).family),
        row('Pen @ range', (s) => `${fmt(s.summary.penAtTargetMm)} mm`),
        row('LOS', (s) => `${fmt(s.summary.losMm)} mm`),
        row('Penetrated', (s) => (s.summary.penetrated ? 'Yes' : 'No')),
        row('Residual', (s) => `${fmt(s.summary.residualMm)} mm`),
        row('Spall', (s) => `${s.summary.spallCount}`),
        row('Crew hit', (s) => `${s.summary.crewHit.length}`),
        row('Crew out', (s) => `${s.summary.crewIncapacitated.length}`),
        row('Modules', (s) => `${s.summary.modulesDamaged.length}`),
        row('Cook-off', (s) => (s.summary.cookOff === 'none' ? '—' : s.summary.cookOff)),
        row('Result', (s) => h('span', { class: verdictClass(s.summary.verdict) }, s.summary.verdict)),
      ),
    );
  }

  // ------------------------------------------------------------ firing

  fire() {
    if (this.mode === 'compare') return this.runCompare();
    if (this.challenge && this.challengeResult?.status !== 'active') return;
    const a = this.aim ?? this.hover;
    if (!a) return;
    const seed = (Math.random() * 2 ** 31) | 0;
    let origin = this.shotOrigin(a);
    if (this.gunner.active) {
      // Seeded dispersion: scatter the arrival point in the plane normal to the line of fire.
      const rng = makeRng(seed ^ 0x5bd1e995);
      const sigma = dispersionMils(this.round) / 1000;
      const mx = gaussian(rng(), rng()) * sigma;
      const my = gaussian(rng(), rng()) * sigma;
      const right = new THREE.Vector3().crossVectors(a.dir, new THREE.Vector3(0, 1, 0)).normalize();
      const up = new THREE.Vector3().crossVectors(right, a.dir).normalize();
      const p = a.point.clone().addScaledVector(right, Math.tan(mx) * this.distance).addScaledVector(up, Math.tan(my) * this.distance);
      origin = this.shotOrigin({ point: p, dir: a.dir });
    }
    const dir = v3(a.dir.x, a.dir.y, a.dir.z);
    const shot = simulateShot(
      this.vehicle,
      this.round,
      { vehicleId: this.vehicleId, roundId: this.roundId, distance: this.distance, origin, dir, seed, turretYaw: this.turretYaw },
      this.vstate,
    );
    if (this.gunner.active) {
      // Leave the sight so the replay plays in the cutaway; G returns to the gun.
      const { target } = this.gunner.exit(this.ctx.camera);
      this.ctx.controls.enabled = true;
      this.ctx.controls.target.copy(target);
      this.hover = null;
      this.aim = null;
    }
    this.vstate = shot.stateAfter;
    this.shots.push(shot);
    this.decals.addFromShot(shot);
    if (this.challenge) {
      this.challengeResult = evaluateChallenge(this.challenge, this.vehicle, this.vstate, this.shots);
      if (this.challengeResult.status === 'won') saveStars(this.challenge.id, this.challengeResult.stars);
    }
    this.showShot(this.shots.length - 1, true);
    this.updatePreview();
    if (this.challenge) this.renderLeft();
  }

  showShot(i: number, play: boolean) {
    this.shotView?.dispose();
    this.current = i;
    const shot = this.shots[i];
    if ((shot.input.turretYaw ?? 0) !== this.turretYaw) this.setTurretYaw(shot.input.turretYaw ?? 0);
    this.shotView = new ShotView(this.tank, shot);
    this.ctx.scene.add(this.shotView.group);
    this.replayT = play ? 0 : shot.duration;
    this.playing = play;
    this.ride = -1;
    if (play && this.autoCam) this.frameImpact(shot);
    this.renderRight();
    this.renderTimeline();
    this.renderLog();
  }

  renderTimeline() {
    const shot = this.shots[this.current];
    this.timeline.classList.toggle('hidden', !shot);
    if (!shot) return;
    this.tlPlay = h('button', { class: 'play', onclick: () => this.togglePlay() }, '>');
    this.tlRange = h('input', { type: 'range', min: 0, max: shot.duration.toFixed(3), step: 0.005, value: this.replayT });
    this.tlRange.addEventListener('input', () => {
      this.playing = false;
      this.replayT = Number(this.tlRange.value);
      this.syncTimeline();
    });
    this.tlTime = h('span', { class: 'time' });
    const speeds = [0.1, 0.25, 1].map((sp) =>
      h('button', { class: `speed ${this.speed === sp ? 'on' : ''}`, onclick: () => { this.speed = sp; this.renderTimeline(); } }, `${sp}x`),
    );
    // Event ticks along the scrubber.
    const ticks = h('div', { class: 'ticks' });
    const mark = (t: number, cls: string) => ticks.append(h('i', { class: cls, style: `left:${(100 * t) / shot.duration}%` }));
    for (const imp of shot.impacts) mark(imp.t, imp.kind);
    for (const e of shot.bigEvents) mark(e.t, e.kind);
    const track = h('div', { class: 'track' }, this.tlRange, ticks);
    this.timeline.replaceChildren(this.tlPlay, track, this.tlTime, ...speeds,
      h('span', { class: 'keys' }, 'P play/pause  ·  A/D switch shot  ·  W/S ride shot path (Shift = faster)  ·  R reset camera'));
    this.syncTimeline();
  }

  private syncTimeline() {
    const shot = this.shots[this.current];
    if (!shot || !this.tlRange) return;
    this.tlRange.value = String(this.replayT);
    this.tlTime.textContent = `${this.replayT.toFixed(2)} / ${shot.duration.toFixed(2)} s`;
    this.tlPlay.textContent = this.playing ? '||' : '>';
  }

  renderLog() {
    this.log.classList.toggle('hidden', !this.shots.length);
    this.log.replaceChildren(
      h('span', { class: 'title' }, 'Hits'),
      ...this.shots.map((s, i) =>
        h('button', { class: `entry ${i === this.current ? 'on' : ''} ${verdictClass(s.summary.verdict)}`, onclick: () => this.showShot(i, true) },
          h('b', {}, `#${i + 1}`), ` ${roundById(s.input.roundId).name} · ${s.summary.verdict}`),
      ),
    );
    this.log.scrollLeft = this.log.scrollWidth;
  }

  // ------------------------------------------------------------ panels

  renderLeft() {
    this.layGun();
    const r = this.round;
    const fam = r.family;
    const allowed = this.challenge ? ROUNDS.filter((x) => this.challenge!.rounds.includes(x.id)) : ROUNDS;
    const families = FAMILIES.filter((f) => allowed.some((x) => x.family === f));
    const roundsOfFam = allowed.filter((x) => x.family === fam);
    const pen = penetrationAt(r, this.distance);
    const dist = h('input', { type: 'range', min: 0, max: 3000, step: 50, value: this.distance, disabled: !!this.challenge });
    const distVal = h('span', { class: 'val' }, `${this.distance} m`);
    const penVal = h('span', { class: 'val' }, `${fmt(pen)} mm`);
    dist.addEventListener('input', () => {
      this.distance = Number(dist.value);
      distVal.textContent = `${this.distance} m`;
      penVal.textContent = `${fmt(penetrationAt(this.round, this.distance))} mm`;
      this.layGun();
      this.updatePreview();
    });
    const angleCtl = h('div', { class: this.respectCamera ? 'hidden' : 'angles' });
    if (!this.respectCamera) {
      const locked = !!this.challenge?.fixedAngle;
      const yaw = h('input', { type: 'range', min: -180, max: 180, step: 1, value: this.yaw, disabled: locked });
      const pitch = h('input', { type: 'range', min: -20, max: 70, step: 1, value: this.pitch, disabled: locked });
      const yv = h('span', { class: 'val' }, `${this.yaw}°`);
      const pv = h('span', { class: 'val' }, `${this.pitch}°`);
      yaw.addEventListener('input', () => { this.yaw = Number(yaw.value); yv.textContent = `${this.yaw}°`; this.updatePreview(); });
      pitch.addEventListener('input', () => { this.pitch = Number(pitch.value); pv.textContent = `${this.pitch}°`; this.updatePreview(); });
      angleCtl.append(h('label', {}, 'Yaw (0 = frontal)'), h('div', { class: 'row' }, yaw, yv), h('label', {}, 'Pitch (down)'), h('div', { class: 'row' }, pitch, pv));
    }
    const tur = h('input', { type: 'range', min: -180, max: 180, step: 1, value: this.turretYaw, 'data-turret': true });
    const turVal = h('span', { class: 'val' }, `${this.turretYaw}°`);
    tur.disabled = !!this.challenge;
    tur.addEventListener('input', () => this.setTurretYaw(Number(tur.value)));
    const cam = h('input', { type: 'checkbox', disabled: !!this.challenge?.fixedAngle });
    cam.checked = this.respectCamera;
    cam.addEventListener('change', () => {
      this.respectCamera = cam.checked;
      this.renderLeft();
      this.updatePreview();
    });

    const target = select(VEHICLES.map((v) => ({ value: v.id, label: `[${v.br}] ${v.name}` })), this.vehicleId, (id) => {
      this.loadVehicle(id);
      this.clearAim();
      this.renderLeft();
    });
    target.disabled = !!this.challenge;
    const compareList = this.mode === 'compare'
      ? h('div', { class: 'cmplist' },
          h('label', {}, `Rounds to compare (${this.compareIds.length}/4)`),
          ...ROUNDS.map((x) => {
            const cb = h('input', { type: 'checkbox' });
            cb.checked = this.compareIds.includes(x.id);
            cb.disabled = !cb.checked && this.compareIds.length >= 4;
            cb.addEventListener('change', () => {
              this.compareIds = cb.checked ? [...this.compareIds, x.id] : this.compareIds.filter((id) => id !== x.id);
              this.renderLeft();
            });
            return h('label', { class: 'check small' }, cb, ` ${x.name}`, h('span', { class: 'muted' }, ` ${x.family}`));
          }))
      : null;

    this.left.replaceChildren(
      h('h2', {}, this.mode === 'compare' ? 'Compare Rounds' : this.challenge ? 'Challenge' : 'Protection Analysis'),
      this.challengeBox() ?? '',
      h('label', {}, 'Target'),
      target,
      h('div', { class: 'desc' }, this.vehicle.description),
      h('label', {}, 'Round type'),
      select(families.map((f) => ({ value: f, label: f })), fam, (f) => {
        this.roundId = allowed.find((x) => x.family === f)!.id;
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
      h('label', {}, 'Turret traverse [Q/E]'),
      h('div', { class: 'row' }, tur, turVal),
      h('div', { class: 'row big' }, h('span', {}, 'Penetration'), penVal),
      h('label', { class: 'check' }, cam, ' Respect camera angle'),
      angleCtl,
      this.aimBox,
      compareList ?? '',
      h('div', { class: 'buttons' },
        h('button', { class: 'fire', onclick: () => this.fire() }, this.mode === 'compare' ? 'COMPARE  [Space]' : 'FIRE  [Space]'),
        h('button', { onclick: () => this.clearAim() }, 'Clear aim [Esc]'),
        h('button', { onclick: () => this.resetDamage() }, 'Repair vehicle'),
      ),
      h('div', { class: 'buttons' },
        h('button', { class: this.xray ? 'on' : '', onclick: () => this.toggleXray() }, 'X-ray [X]'),
        h('button', { class: this.section !== 'off' ? 'on' : '', onclick: () => this.cycleSection() }, `Section: ${this.section} [C]`),
        h('button', { class: this.heat ? 'on' : '', onclick: () => this.toggleHeat() }, 'Armor map [H]'),
        h('button', { class: this.killMap ? 'on' : '', onclick: () => this.toggleKillMap() }, 'Kill map [K]'),
        h('button', { class: this.gunner.active ? 'on' : '', onclick: () => this.toggleGunner() }, "Gunner's sight [G]"),
        h('button', { class: this.autoCam ? 'on' : '', onclick: () => this.toggleAutoCam() }, 'Auto camera [V]'),
        h('button', { class: muted ? '' : 'on', onclick: () => this.toggleMute() }, muted ? 'Sound off [M]' : 'Sound on [M]'),
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
    const a = this.aim ?? this.hover;
    let kill = '';
    if (a) {
      const d = v3(a.dir.x, a.dir.y, a.dir.z);
      const { p: kp, pen } = killProbability(this.vehicle, this.vstate, this.round, { vehicleId: this.vehicleId, roundId: this.roundId, distance: this.distance, origin: this.shotOrigin(a), dir: d, turretYaw: this.turretYaw }, 16);
      kill = `${Math.round(kp * 100)}% knock-out · ${Math.round(pen * 100)}% pen`;
    }
    const chip = h('span', { class: `chip ${p.rating}` }, kill || (p.rating === 'good' ? 'Likely penetration' : p.rating === 'marginal' ? 'Marginal' : p.ricochet > 0.5 ? 'Ricochet likely' : 'Unlikely'));
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
    if (this.mode === 'compare') {
      this.right.classList.add('hidden');
      if (shot) this.renderCompare();
      return;
    }
    if (!shot) {
      this.right.classList.add('hidden');
      return;
    }
    this.right.classList.remove('hidden');
    const s = shot.summary;
    const v = this.vehicle;
    const sev = verdictClass(s.verdict);
    const crewRows = v.crew.map((c) => {
      const lvl = woundLevel(v, shot.stateAfter, c.id);
      const zones = [...new Set(shot.crewHits.filter((x) => x.crewId === c.id).map((x) => x.zone))];
      return h('div', { class: `crewrow ${lvl.split(' ')[0].toLowerCase()}` },
        h('span', {}, c.name, zones.length ? h('small', {}, ` ${zones.join(', ')}`) : null),
        h('span', {}, lvl === 'Incapacitated' ? `${lvl} · ${STATION_LOSS[c.role]}` : lvl));
    });
    this.right.replaceChildren(
      h('div', { class: 'row' }, h('h2', {}, `Shot ${this.current + 1}`), h('button', { class: 'share', onclick: () => this.shareCurrent() }, 'Share link')),
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
    if (this.gunner.active) this.pollGunner(now);
    else {
      this.updateAutoCam();
      this.ctx.controls.update();
    }
    const shot = this.shots[this.current];
    if (shot && this.playing) {
      const before = this.replayT;
      this.replayT += dt * this.speed;
      this.playSounds(shot, before === 0 ? -1 : before, this.replayT);
      if (this.replayT >= shot.duration) {
        this.replayT = shot.duration;
        this.playing = false;
      }
    }
    if (shot) {
      this.replayT = Math.min(Math.max(0, this.replayT), shot.duration);
      this.syncTimeline();
    }
    this.shotView?.update(this.replayT);
    this.updateSection();
    this.pollKillMap();
    this.ctx.composer.render();
    requestAnimationFrame(this.frame);
  };

  private updateSection() {
    let plane: THREE.Plane | null = null;
    if (this.gunner.active) {
      setSectionPlane(this.tank, null);
      return;
    }
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

export function verdictClass(v: string) {
  return v.startsWith('Catastrophic') || v === 'Knocked out' ? 'bad' : v === 'Disabled' || v === 'Crew injured' ? 'warn' : v.startsWith('Non') || v === 'Ricochet' ? 'muted' : 'ok';
}

const starText = (n: number) =>
  h('span', { class: 'starset' }, ...[0, 1, 2].map((i) => h('i', { class: i < n ? 'full' : '' }, i < n ? '★' : '☆')));

function stat(k: string, v: string) {
  return h('div', { class: 'stat' }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
}
