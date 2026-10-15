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

export type ViewMode = 'painted' | 'cut' | 'xray' | 'cutaway' | 'armour' | 'killmap';
export const VIEW_MODES: { id: ViewMode; label: string; key: string; tip: string }[] = [
  { id: 'painted', label: 'Painted', key: '', tip: 'The tank as it looks from outside' },
  { id: 'cut', label: 'Cut', key: 'C', tip: 'Painted tank sliced open along the shot with solid cross-sections (press C again to cut facing the camera)' },
  { id: 'xray', label: 'X-ray', key: 'X', tip: 'See the crew, ammunition and modules through the armour' },
  { id: 'cutaway', label: 'Cutaway', key: 'Shift+C', tip: 'X-ray with a section plane along the shot' },
  { id: 'armour', label: 'Armour map', key: 'H', tip: 'Plates coloured by thickness (KE RHA-equivalent)' },
  { id: 'killmap', label: 'Kill map', key: 'K', tip: 'Chance of a knock-out across the whole silhouette for the current round' },
];

/** The one view the player is in, derived from the underlying flags so they can never disagree. */
export function viewMode(app: App): ViewMode {
  if (app.killMap) return 'killmap';
  if (app.heat) return 'armour';
  if (app.xray && app.section !== 'off') return 'cutaway';
  if (app.xray) return 'xray';
  if (app.section !== 'off') return 'cut';
  return 'painted';
}

/** Switch views; every mode sets every flag, so no invalid combination can be reached. */
export function setViewMode(app: App, mode: ViewMode) {
  const was = viewMode(app);
  if (app.killMap && mode !== 'killmap') app.toggleKillMap();
  app.heat = mode === 'armour';
  app.xray = mode === 'xray' || mode === 'cutaway' || mode === 'killmap';
  if (mode === 'cutaway' || mode === 'cut') app.section = was === mode ? (app.section === 'shot' ? 'camera' : 'shot') : 'shot';
  else app.section = 'off';
  // The painted cut shows the interior through the opening; the paint hides it everywhere else.
  setXray(app.tank, app.xray, app.heat, app.xray || mode === 'cut');
  app.legend.classList.toggle('hidden', !app.heat);
  if (mode === 'killmap' && !app.killMap) app.toggleKillMap();
  app.renderLeft();
}

/** Mode keys: select the mode, or press the active mode's key again to go back to Painted. */
export function pressViewKey(app: App, mode: ViewMode) {
  const cur = viewMode(app);
  if (cur === mode && mode !== 'cutaway' && mode !== 'cut') setViewMode(app, 'painted');
  else setViewMode(app, mode);
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
  if (app.gunner.active) {
    setSectionPlane(app.tank, null);
    app.caps.set(null);
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
  // Painted cut: fill the sliced plates with solid cross-sections (X-ray shows the layers directly).
  app.caps.set(plane && !app.xray ? plane : null);
}
