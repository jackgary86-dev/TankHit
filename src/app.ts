import * as THREE from 'three';
import { roundById } from './data/rounds';
import { VEHICLES, vehicleById } from './data/vehicles';
import { DamageDecals } from './render/decals';
import { SpentRounds } from './render/spent';
import { SectionCaps } from './render/caps';
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
import type { Duel } from './modes/duel';
import * as MduelPanel from './ui/duelPanel';
import * as MdailyPanel from './ui/dailyPanel';
import type { DailyScenario } from './modes/daily';
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

export type Mode = 'sandbox' | 'challenges' | 'compare' | 'duel' | 'daily';

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
  spent!: SpentRounds;
  caps!: SectionCaps;
  autoCam = true;
  /** Sandbox only: shots land exactly where aimed (analysis). Off, and in every other mode, dispersion applies. */
  perfectAim = true;
  /** The player's own vehicle (duels, 'threat to me'); remembered per browser. */
  myVehicleId = (() => { try { return localStorage.getItem('tankhit.myVehicle') ?? 't34-85'; } catch { return 't34-85'; } })();
  /** Threat mode: the kill map is pointed at *my* tank for the chosen enemy round, range and hull angle. */
  threatMode = false;
  duel: Duel | null = null;
  dailyScenario: DailyScenario | null = null;
  duelShowing: 'enemy' | 'me' = 'enemy';
  duelPanel = h('div', { class: 'panel right duel hidden' });
  private enemyBeforeThreat = '';
  camGoal: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
  lastAtMuzzle = false;
  gunnerPickT = 0;
  killWorker: Worker | null = null;
  killOverlay = new KillOverlay();
  killReq = 0;
  killSig = '';
  killTimer = 0;
  killStatus = h('div', { class: 'killstatus hidden' });
  killLegend = h('div', { class: 'legend kill hidden' });
  tutorial = new Tutorial();
  section: SectionMode = 'off';
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
    this.ui.append(this.gunner.overlay, this.topbar, this.left, this.right, this.comparePanel, this.duelPanel, this.log, this.timeline, this.legend, this.killLegend, this.killStatus, this.overlay, this.tutorial.el);
    // Panels collapse when their heading is clicked (essential on phones).
    for (const panel of [this.left, this.right, this.comparePanel]) {
      panel.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'H2') {
          panel.classList.toggle('collapsed');
          panel.dataset.opened = panel.classList.contains('collapsed') ? '' : '1';
        }
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
    // focus() and scrollIntoView() can still shift an overflow:hidden page; keep the viewport pinned.
    const pin = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      for (const el of [document.documentElement, document.body, this.ui]) if (el.scrollLeft || el.scrollTop) { el.scrollLeft = 0; el.scrollTop = 0; }
    };
    window.addEventListener('scroll', pin, { passive: true });
    this.ui.addEventListener('scroll', pin, { passive: true });
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
    this.caps?.dispose();
    this.decals?.clear();
    this.killOverlay.clear();
    this.shotView?.dispose();
    this.shotView = null;
    this.vehicleId = id;
    this.tank = buildTank(this.vehicle);
    this.decals = new DamageDecals(this.tank);
    this.spent?.clear();
    this.spent = new SpentRounds(this.tank);
    this.caps = new SectionCaps(this.tank);
    this.ctx.scene.add(this.caps.group);
    this.ctx.scene.add(this.tank.root);
    setXray(this.tank, this.xray, this.heat);
    this.resetDamage();
  }

  /** Show a vehicle with an existing damage state and shot history (duels swap sides without resetting). */
  loadVehicleWithState(id: string, state: VehicleState, shots: ShotResult[]) {
    this.loadVehicle(id);
    this.vstate = state;
    this.shots = shots;
    this.current = -1;
    for (let i = 0; i < shots.length; i++) {
      this.decals.addFromShot(shots[i]);
      this.spent.addFromShot(shots[i], i);
    }
    applyDamage(this.tank, shots.length ? shots[shots.length - 1] : null, 1e9);
    this.renderRight();
    this.renderTimeline();
    this.renderLog();
  }

  showDuelPicker = () => MduelPanel.showDuelPicker(this);
  showDailyPicker = () => MdailyPanel.showDailyPicker(this);
  renderDuelPanel = () => MduelPanel.renderDuelPanel(this);

  resetDamage() {
    this.vstate = initialState(this.vehicle);
    this.decals?.clear();
    this.spent?.clear();
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
    this.decals?.update(this.current, this.replayT);
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

  setMyVehicle(id: string) {
    this.myVehicleId = id;
    try { localStorage.setItem('tankhit.myVehicle', id); } catch { /* no storage */ }
    if (this.threatMode) this.loadVehicle(id);
    this.renderLeft();
  }

  /** Flip between 'what can I do to them' and 'what can they do to me'. */
  toggleThreat() {
    this.threatMode = !this.threatMode;
    if (this.threatMode) {
      this.enemyBeforeThreat = this.vehicleId;
      this.loadVehicle(this.myVehicleId);
      this.respectCamera = false; // the yaw slider becomes my hull angle against their line of fire
      this.setTurretYaw(0);
      MviewToggles.setViewMode(this, 'killmap');
    } else {
      if (this.enemyBeforeThreat) this.loadVehicle(this.enemyBeforeThreat);
      MviewToggles.setViewMode(this, 'xray');
    }
    this.buildKillLegend();
    this.clearAim();
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
