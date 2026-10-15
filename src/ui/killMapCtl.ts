import * as THREE from 'three';
import { killColor } from '../render/killOverlay';
import type { KillMapMessage, KillMapRequest } from '../sim/killmap.worker';
import { v3 } from '../sim/vec';
import { h } from './dom';
import type { App } from '../app';

export function toggleKillMap(app: App) {
  app.killMap = !app.killMap;
  app.killLegend.classList.toggle('hidden', !app.killMap);
  if (!app.killMap) {
    app.killOverlay.clear();
    app.killStatus.classList.add('hidden');
    app.killSig = '';
  }
  app.renderLeft();
}

/** Re-run the map whenever anything it depends on changes (debounced). */
export function pollKillMap(app: App) {
  if (!app.killMap) return;
  const d = mapDir(app);
  const q = (x: number) => Math.round(x * 12);
  const sig = [app.vehicleId, app.roundId, app.distance, app.turretYaw, app.shots.length, app.mode, q(d.x), q(d.y), q(d.z)].join('|');
  if (sig === app.killSig) return;
  app.killSig = sig;
  clearTimeout(app.killTimer);
  app.killTimer = window.setTimeout(() => app.requestKillMap(d), 350);
}

export function requestKillMap(app: App, dir: THREE.Vector3) {
  if (!app.killWorker) {
    app.killWorker = new Worker(new URL('../sim/killmap.worker.ts', import.meta.url), { type: 'module' });
    app.killWorker.onmessage = (e: MessageEvent<KillMapMessage>) => app.onKillMessage(e.data);
  }
  const id = ++app.killReq;
  const req: KillMapRequest = {
    id, vehicleId: app.vehicleId, roundId: app.roundId, distance: app.distance, yawDeg: app.turretYaw,
    state: structuredClone(app.vstate), dir: v3(dir.x, dir.y, dir.z), cell: 0.14, seeds: 4,
  };
  app.killWorker.postMessage(req);
  app.killStatus.textContent = 'Computing kill map…';
  app.killStatus.classList.remove('hidden');
}

export function onKillMessage(app: App, m: KillMapMessage) {
  if (m.id !== app.killReq || !app.killMap) return;
  if (m.kind === 'grid') app.killOverlay.reset(m.grid);
  else if (m.kind === 'row') app.killOverlay.addRow(m.cells);
  else app.killStatus.classList.add('hidden');
}

export function buildKillLegend(app: App) {
  const grad = [0, 0.25, 0.5, 0.75, 1].map((p) => `#${killColor(p).getHexString()} ${p * 100}%`).join(', ');
  app.killLegend.replaceChildren(
    h('div', { class: 'ltitle' }, 'Chance to disable / knock out'),
    h('div', { class: 'bar', style: `background: linear-gradient(90deg, ${grad})` }),
    h('div', { class: 'labels' }, ...[0, 25, 50, 75, 100].map((n) => h('span', {}, `${n}%`))),
  );
}

/** Direction shots travel for the map: the camera's line of sight, or the manual yaw/pitch. */
export function mapDir(app: App): THREE.Vector3 {
  if (!app.respectCamera) return app.shotDir(new THREE.Vector3());
  return app.ctx.controls.target.clone().sub(app.ctx.camera.position).normalize();
}
