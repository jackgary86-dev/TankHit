import * as THREE from 'three';
import { roundById } from '../data/rounds';
import { shellPoseAt } from './projectile';
import type { ShotResult } from '../sim/types';
import type { App } from '../app';

export function toggleAutoCam(app: App) {
  app.autoCam = !app.autoCam;
  if (!app.autoCam) app.camGoal = null;
  app.renderLeft();
}

/** Pick a three-quarter view of the first impact, looking along the shot, from the side away from the hull interior. */
export function frameImpact(app: App, shot: ShotResult) {
  const imp = shot.impacts[0];
  const d = new THREE.Vector3(shot.input.dir.x, shot.input.dir.y, shot.input.dir.z).normalize();
  const p = imp ? new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z) : new THREE.Vector3(shot.input.origin.x, shot.input.origin.y, shot.input.origin.z).addScaledVector(d, 6);
  const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
  // Keep the camera on whichever side it is already on so the cut does not flip the view.
  const cur = app.ctx.camera.position.clone().sub(p);
  if (cur.dot(side) < 0) side.negate();
  const pos = p.clone().addScaledVector(d, -2.6).addScaledVector(side, 3.2).add(new THREE.Vector3(0, 1.9, 0));
  app.camGoal = { pos, target: p.clone() };
  app.ride = -1;
}

/** Ease toward the framing goal and, while playing, follow the penetrator head. */
/** Brief camera shake after the first impact, scaled by energy; deterministic in replay time. */
export function impactShake(app: App) {
  const shot = app.shots[app.current];
  const first = shot?.impacts[0];
  if (!shot || !first || app.gunner.active) return;
  const age = app.replayT - first.t;
  if (age < 0 || age > 0.35) return;
  const energy = Math.min(1, ((first.penMm ?? 100) / 500) * 0.7 + 0.3);
  const amp = 0.035 * energy * (1 - age / 0.35);
  const s = (f: number, ph: number) => Math.sin(age * f + ph) * amp;
  app.ctx.camera.position.add(new THREE.Vector3(s(90, 0), s(113, 1.3), s(70, 2.1)));
}

export function updateAutoCam(app: App) {
  if (!app.autoCam || !app.camGoal || app.gunner.active) return;
  const shot = app.shots[app.current];
  const goal = app.camGoal;
  const imp = shot?.impacts[0];
  const approaching = !!shot && !!imp && app.playing && app.replayT < imp.t - 0.04;
  let pos = goal.pos;
  if (shot && imp && approaching) {
    // Approach: ride close behind and beside the shell so a true-scale projectile fills the frame.
    const round = roundById(shot.input.roundId);
    const p = shellPoseAt(shot.traces, shot.impacts, app.replayT, round.family);
    const size = round.family === 'APFSDS' ? (round.rodLength ?? 0.5) : (round.caliber / 1000) * 3.5;
    const side = new THREE.Vector3().crossVectors(p.dir, new THREE.Vector3(0, 1, 0)).normalize();
    if (app.ctx.camera.position.clone().sub(p.pos).dot(side) < 0) side.negate();
    const back = Math.max(0.6, size * 2.2);
    pos = p.pos.clone().addScaledVector(p.dir, -back * 0.55).addScaledVector(side, back * 0.75).add(new THREE.Vector3(0, back * 0.45, 0));
    goal.target.copy(p.pos).addScaledVector(p.dir, size * 0.3);
  } else if (shot && imp && app.playing) {
    // After contact: settle on the impact framing and follow the penetrator within a metre of the strike.
    const head = shot.traces.find((t) => (t.kind === 'shell' || t.kind === 'jet') && app.replayT >= t.t0 && app.replayT <= t.t1);
    if (head) {
      const k = (app.replayT - head.t0) / Math.max(head.t1 - head.t0, 1e-6);
      const hp = new THREE.Vector3(head.from.x + (head.to.x - head.from.x) * k, head.from.y + (head.to.y - head.from.y) * k, head.from.z + (head.to.z - head.from.z) * k);
      const ip = new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z);
      goal.target.copy(ip).add(hp.sub(ip).clampLength(0, 1.0));
    }
  }
  // Track the shell tightly on the approach; ease back to the wide framing after contact.
  app.ctx.camera.position.lerp(pos, approaching ? 0.25 : 0.1);
  app.ctx.controls.target.lerp(goal.target, approaching ? 0.35 : 0.12);
  if (app.ctx.camera.position.distanceTo(goal.pos) < 0.02 && !app.playing) app.camGoal = null;
}

export function resetCamera(app: App) {
  app.ride = -1;
  app.camGoal = null;
  app.ctx.camera.position.set(7.5, 4.5, 7.5);
  app.ctx.controls.target.set(0, 1.1, 0);
}

/** Points along the main penetrator path of the current shot. */
export function shellPath(app: App): THREE.Vector3[] {
  const shot = app.shots[app.current];
  if (!shot) return [];
  const pts: THREE.Vector3[] = [];
  for (const t of shot.traces.filter((x) => x.kind === 'shell' || x.kind === 'jet' || x.kind === 'ricochet')) {
    if (!pts.length) pts.push(new THREE.Vector3(t.from.x, t.from.y, t.from.z));
    pts.push(new THREE.Vector3(t.to.x, t.to.y, t.to.z));
  }
  return pts;
}

/** Move the camera along the shot path (W/S). */
export function rideShot(app: App, delta: number) {
  app.camGoal = null;
  const pts = app.shellPath();
  if (pts.length < 2) return;
  const lens = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
  const total = lens.reduce((a, b) => a + b, 0);
  app.ride = Math.max(0, Math.min(total, (app.ride < 0 ? 4 : app.ride) + delta));
  const at = (d: number) => {
    let acc = 0;
    for (let i = 0; i < lens.length; i++) {
      if (acc + lens[i] >= d) return pts[i].clone().lerp(pts[i + 1], (d - acc) / Math.max(lens[i], 1e-6));
      acc += lens[i];
    }
    return pts[pts.length - 1].clone();
  };
  const here = at(app.ride);
  const ahead = at(Math.min(total, app.ride + 1.2));
  const dir = ahead.clone().sub(here);
  if (dir.lengthSq() < 1e-4) dir.copy(pts[pts.length - 1]).sub(pts[0]);
  dir.normalize();
  const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  app.ctx.camera.position.copy(here).addScaledVector(dir, -1.4).addScaledVector(side, 0.7).add(new THREE.Vector3(0, 0.6, 0));
  app.ctx.controls.target.copy(here).addScaledVector(dir, 1.2);
}
