import * as THREE from 'three';
import { roundById } from '../data/rounds';
import { vehicleById } from '../data/vehicles';
import { dailyAnswer, dailyChallenge, dailyResultText, dailyScenario, loadDaily, MAX_ATTEMPTS, saveDaily, type DailyScenario } from '../modes/daily';
import { shareUrl } from '../modes/share';
import { h } from './dom';
import type { App } from '../app';

/** Daily overlay: today's scenario, attempts left, best result, share, and yesterday's answer. */
export function showDailyPicker(app: App) {
  const today = dailyScenario();
  const rec = loadDaily(today.date);
  const v = vehicleById(today.vehicleId);
  const r = roundById(today.roundId);
  const left = MAX_ATTEMPTS - rec.attempts;
  const yesterday = dailyScenario(new Date(Date.now() - 86400000));
  app.overlay.classList.remove('hidden');
  app.overlay.replaceChildren(
    h('div', { class: 'picker' },
      h('div', { class: 'row' }, h('h2', {}, `Daily #${today.number}`), h('span', { class: 'muted' }, today.date)),
      h('div', { class: 'cbrief' }, `${v.name} at ${today.distance} m with ${r.name} (${r.family}). Bearing ${today.yaw}°, pitch ${today.pitch}°, turret turned ${today.turretYaw}°. Knock it out in three shots – fewer shots, more stars.`),
      h('div', { class: 'cmeta' }, rec.attempts ? dailyResultText(today, rec) + ` · ${left} attempt${left === 1 ? '' : 's'} left` : `${MAX_ATTEMPTS} attempts · same scenario for everyone today`),
      h('div', { class: 'tutbtns' },
        h('button', { onclick: () => app.setMode('sandbox') }, 'Back'),
        rec.attempts ? h('button', { onclick: () => copyResult(app, today, rec) }, 'Copy result') : '',
        h('button', { onclick: () => showAnswer(app, yesterday) }, "Yesterday's answer"),
        left > 0 ? h('button', { class: 'primary', onclick: () => startDaily(app, today) }, rec.attempts ? 'Try again' : 'Play') : h('button', { disabled: true }, 'No attempts left'),
      ),
    ),
  );
}

function copyResult(app: App, s: DailyScenario, rec: ReturnType<typeof loadDaily>) {
  const last = app.shots[app.shots.length - 1];
  const text = dailyResultText(s, rec) + (last ? `\n${shareUrl(last.input)}` : '');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => undefined);
}

export function startDaily(app: App, s: DailyScenario) {
  app.overlay.classList.add('hidden');
  app.dailyScenario = s;
  app.startChallenge(dailyChallenge(s));
}

/** Called after each daily shot: records the attempt when the run ends. */
export function afterDailyShot(app: App) {
  const s = app.dailyScenario;
  const res = app.challengeResult;
  if (!s || !res || res.status === 'active') return;
  const rec = loadDaily(s.date);
  rec.attempts = Math.min(MAX_ATTEMPTS, rec.attempts + 1);
  if (res.status === 'won') {
    rec.won = true;
    if (res.stars > rec.bestStars) rec.bestStars = res.stars;
    if (!rec.bestShots || app.shots.length < rec.bestShots) rec.bestShots = app.shots.length;
  }
  saveDaily(rec);
  app.dailyScenario = null;
}

/** Load yesterday's scenario and mark the best aim point on the tank. */
function showAnswer(app: App, s: DailyScenario) {
  app.overlay.classList.add('hidden');
  app.setMode('sandbox');
  app.loadVehicle(s.vehicleId);
  app.roundId = s.roundId;
  app.distance = s.distance;
  app.respectCamera = false;
  app.yaw = s.yaw;
  app.pitch = s.pitch;
  app.setTurretYaw(s.turretYaw);
  const p = dailyAnswer(s);
  if (p) {
    const T = new THREE.Vector3(p.x, p.y, p.z);
    app.aim = { point: T, dir: app.shotDir(T) };
    app.updatePreview();
    app.ctx.controls.target.copy(T);
    app.ctx.camera.position.copy(T).addScaledVector(app.shotDir(T), -4).add(new THREE.Vector3(0, 1.5, 0));
  }
  app.renderLeft();
}
