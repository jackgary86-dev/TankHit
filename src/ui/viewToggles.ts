import * as THREE from 'three';
import { muted, setMuted } from '../render/audio';
import { cameraSectionPlane, HEAT_STOPS, heatColor, setSectionPlane, setXray, shotSectionPlane, updateSeams } from '../render/xray';
import { h } from './dom';
import type { App } from '../app';

export function toggleHeat(app: App) {
  app.heat = !app.heat;
  setXray(app.tank, app.xray, app.heat);
  app.legend.classList.toggle('hidden', !app.heat);
  app.renderLeft();
}

export function toggleMute(app: App) {
  setMuted(!muted);
  app.renderLeft();
}

export function buildLegend(app: App) {
  app.buildKillLegend();
  const grad = HEAT_STOPS.map((mm) => `#${heatColor(mm).getHexString()} ${(100 * mm) / 500}%`).join(', ');
  app.legend.replaceChildren(
    h('div', { class: 'ltitle' }, 'Armor (KE RHA-equivalent, 0°)'),
    h('div', { class: 'bar', style: `background: linear-gradient(90deg, ${grad})` }),
    h('div', { class: 'labels' }, ...HEAT_STOPS.map((mm) => h('span', {}, `${mm}`))),
  );
}

export function toggleXray(app: App) {
  app.xray = !app.xray;
  setXray(app.tank, app.xray, app.heat);
  app.renderLeft();
}

export function cycleSection(app: App) {
  app.section = app.section === 'off' ? 'shot' : app.section === 'shot' ? 'camera' : 'off';
  app.renderLeft();
}

export function updateSection(app: App) {
  updateSeams(app.tank, app.ctx.camera.position);
  let plane: THREE.Plane | null = null;
  // The cutaway only makes sense in X-ray; a clipped painted hull just looks like the tank is missing a piece.
  if (app.gunner.active || !app.xray) {
    setSectionPlane(app.tank, null);
    return;
  }
  const shot = app.shots[app.current];
  const a = app.aim ?? app.hover;
  if (app.section === 'shot') {
    if (shot && !a) {
      const imp = shot.impacts[0];
      if (imp) plane = shotSectionPlane(new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z), new THREE.Vector3(shot.input.dir.x, shot.input.dir.y, shot.input.dir.z), app.ctx.camera.position);
    } else if (a && app.aim) {
      plane = shotSectionPlane(a.point, a.dir, app.ctx.camera.position);
    } else if (shot) {
      const imp = shot.impacts[0];
      if (imp) plane = shotSectionPlane(new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z), new THREE.Vector3(shot.input.dir.x, shot.input.dir.y, shot.input.dir.z), app.ctx.camera.position);
    }
  } else if (app.section === 'camera') {
    plane = cameraSectionPlane(new THREE.Vector3(0, 1, 0), app.ctx.camera.position);
  }
  setSectionPlane(app.tank, plane);
}
