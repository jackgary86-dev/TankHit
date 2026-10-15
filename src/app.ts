import * as THREE from 'three';
import { roundById } from './data/rounds';
import { VEHICLES, vehicleById } from './data/vehicles';
import { DamageDecals } from './render/decals';
import { GunnerView } from './render/gunner';
import { KillOverlay } from './render/killOverlay';
import { createScene, type SceneCtx } from './render/scene';
import { ShotView, applyDamage } from './render/shotView';
import { isReadableSize, setReadableSize } from './render/projectile';
import { buildTank, disposeTank, type TankView } from './render/tank';
import { setXray, type SectionMode } from './render/xray';
import type { KillMapMessage } from './sim/killmap.worker';
import type { Preview } from './sim/shot';
import { initialState } from './sim/state';
import type { Round, ShotResult, VehicleState } from './sim/types';
import type { Challenge, ChallengeResult } from './modes/challenges';
import { h } from './ui/dom';
import { Tutorial } from './ui/tutorial';
import * as MkillMapCtl from './ui/killMapCtl';
import * as MgunnerCtl from './ui/gunnerCtl';
import * as McameraRig from './render/cameraRig';
import * as Msharing from './ui/sharing';
import * as MmodesPanel from './ui/modesPanel';
import * as MreplayPanel from './ui/replayPanel';
import * as MleftPanel from './ui/leftPanel';
import * as MresultsPanel from './ui/resultsPanel';
import * as Minput from './ui/input';
import * as Maiming from './game/aiming';
import * as Mfiring from './game/firing';
import * as MviewToggles from './ui/viewToggles';

export type Mode = 'sandbox' | 'challenges' | 'compare';

export interface Aim {
  point: THREE.Vector3;
  dir: THREE.Vector3;}

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
  camGoal: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  gunnerPickT = 0;
  killWorker: Worker | null = null;
  killOverlay = new KillOverlay();
  killReq = 0;
  killSig = '';
  killTimer = 0;
  killStatus = h('div', { class: 'killstatus hidden' });
  killLegend = h('div', { class: 'legend kill hidden' });
  tutorial = new Tutorial();
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

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  aimLine: THREE.Line;
  aimMarker: THREE.Mesh;
  ui = document.getElementById('ui')!;
  left = h('div', { class: 'panel left' });
  right = h('div', { class: 'panel right hidden' });
  aimBox = h('div', { class: 'aimbox' });
  timeline = h('div', { class: 'timeline hidden' });
  log = h('div', { class: 'shotlog hidden' });
  topbar = h('div', { class: 'topbar' });
  overlay = h('div', { class: 'overlay hidden' });
  comparePanel = h('div', { class: 'panel right compare hidden' });
  legend = h('div', { class: 'legend hidden' });
  tlRange!: HTMLInputElement;
  tlTime!: HTMLSpanElement;
  tlPlay!: HTMLButtonElement;
  ride = -1;
  downAt = { x: 0, y: 0 };
  lastFrame = performance.now();

  constructor(container: HTMLElement) {
    this.ctx = createScene(container);
    ({ line: this.aimLine, marker: this.aimMarker } = Maiming.createAimGizmo(this.ctx.scene));
    this.ui.append(this.gunner.overlay, this.topbar, this.left, this.right, this.comparePanel, this.log, this.timeline, this.legend, this.killLegend, this.killStatus, this.overlay, this.tutorial.el);
    // Panels collapse when their heading is clicked (essential on phones).
    for (const panel of [this.left, this.right, this.comparePanel]) {
      panel.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'H2') panel.classList.toggle('collapsed');
      });
    }
    this.buildLegend();
    this.ctx.scene.add(this.killOverlay.group);
    this.loadVehicle(this.vehicleId);
    this.bindInput();
    this.renderLeft();
    this.renderTopbar();
    this.loadFromHash();
    window.addEventListener('hashchange', () => this.loadFromHash());
    if (!location.hash) this.tutorial.maybeShow();
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
    if (this.tank) disposeTank(this.tank);
    this.decals?.clear();
    this.killOverlay.clear();
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


  frame = (now: number) => {
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
    McameraRig.impactShake(this);
    this.updateSection();
    this.pollKillMap();
    this.ctx.composer.render();
    requestAnimationFrame(this.frame);
  };
  /** Inflate small-calibre shells for readability (off: true scale, the auto camera zooms instead). */
  toggleReadableSize() {
    setReadableSize(!isReadableSize());
    if (this.current >= 0) this.showShot(this.current, false);
    this.renderLeft();
  }

  // ------------------------------------------------------------ delegated to modules
  toggleKillMap = () => MkillMapCtl.toggleKillMap(this);
  pollKillMap = () => MkillMapCtl.pollKillMap(this);
  requestKillMap = (dir: THREE.Vector3) => MkillMapCtl.requestKillMap(this, dir);
  onKillMessage = (m: KillMapMessage) => MkillMapCtl.onKillMessage(this, m);
  buildKillLegend = () => MkillMapCtl.buildKillLegend(this);
  toggleGunner = () => MgunnerCtl.toggleGunner(this);
  layGun = () => MgunnerCtl.layGun(this);
  pollGunner = (now: number) => MgunnerCtl.pollGunner(this, now);
  toggleAutoCam = () => McameraRig.toggleAutoCam(this);
  frameImpact = (shot: ShotResult) => McameraRig.frameImpact(this, shot);
  updateAutoCam = () => McameraRig.updateAutoCam(this);
  resetCamera = () => McameraRig.resetCamera(this);
  shellPath = () => McameraRig.shellPath(this);
  rideShot = (delta: number) => McameraRig.rideShot(this, delta);
  loadFromHash = () => Msharing.loadFromHash(this);
  shareCurrent = () => Msharing.shareCurrent(this);
  setMode = (m: Mode) => MmodesPanel.setMode(this, m);
  renderTopbar = () => MmodesPanel.renderTopbar(this);
  showChallengePicker = () => MmodesPanel.showChallengePicker(this);
  startChallenge = (c: Challenge) => MmodesPanel.startChallenge(this, c);
  challengeBox = () => MmodesPanel.challengeBox(this);
  runCompare = () => MmodesPanel.runCompare(this);
  renderCompare = () => MmodesPanel.renderCompare(this);
  togglePlay = () => MreplayPanel.togglePlay(this);
  stepShot = (d: number) => MreplayPanel.stepShot(this, d);
  playSounds = (shot: ShotResult, from: number, to: number) => MreplayPanel.playSounds(this, shot, from, to);
  renderTimeline = () => MreplayPanel.renderTimeline(this);
  syncTimeline = () => MreplayPanel.syncTimeline(this);
  renderLog = () => MreplayPanel.renderLog(this);
  renderLeft = () => MleftPanel.renderLeft(this);
  renderAimBox = () => MleftPanel.renderAimBox(this);
  renderRight = () => MresultsPanel.renderRight(this);
  bindInput = () => Minput.bindInput(this);
  onKey = (e: KeyboardEvent) => Minput.onKey(this, e);
  shotDir = (point: THREE.Vector3) => Maiming.shotDir(this, point);
  pick = (e: PointerEvent) => Maiming.pick(this, e);
  pickNdc = (x: number, y: number) => Maiming.pickNdc(this, x, y);
  shotOrigin = (a: Aim) => Maiming.shotOrigin(this, a);
  updatePreview = () => Maiming.updatePreview(this);
  clearAim = () => Maiming.clearAim(this);
  setTurretYaw = (deg: number) => Maiming.setTurretYaw(this, deg);
  fire = () => Mfiring.fire(this);
  showShot = (i: number, play: boolean) => Mfiring.showShot(this, i, play);
  toggleHeat = () => MviewToggles.toggleHeat(this);
  toggleMute = () => MviewToggles.toggleMute(this);
  buildLegend = () => MviewToggles.buildLegend(this);
  toggleXray = () => MviewToggles.toggleXray(this);
  cycleSection = () => MviewToggles.cycleSection(this);
  updateSection = () => MviewToggles.updateSection(this);
}
