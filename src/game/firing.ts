import * as THREE from 'three';
import { ShotView } from '../render/shotView';
import { dispersionMils, estimatedRangeError, gaussian } from '../sim/ballistics';
import { simulateShot } from '../sim/shot';
import { makeRng, v3 } from '../sim/vec';
import { evaluateChallenge, saveStars } from '../modes/challenges';
import { canFire } from '../modes/duel';
import { afterPlayerShot } from '../ui/duelPanel';
import { afterDailyShot } from '../ui/dailyPanel';
import type { App } from '../app';

export function fire(app: App) {
  if (app.mode === 'compare') return app.runCompare();
  if (app.mode === 'duel') {
    const d = app.duel;
    if (!d || d.outcome !== 'active' || d.side !== 'player' || app.duelShowing !== 'enemy' || !canFire(d, 'player').ok) return;
  }
  if (app.challenge && app.challengeResult?.status !== 'active') return;
  const a = app.aim ?? app.hover;
  if (!a) return;
  const seed = (Math.random() * 2 ** 31) | 0;
  // Outside the sandbox the range is an estimate; the true range differs by a seeded few percent.
  const estimated = !!app.challenge || app.mode !== 'sandbox';
  const trueDistance = estimated ? Math.round(app.distance * (1 + estimatedRangeError(seed))) : app.distance;
  let origin = app.shotOrigin(a);
  // Dispersion applies in the sight, in challenges and other modes, and in the sandbox when perfect aim is off.
  const scatter = app.gunner.active || estimated || !app.perfectAim;
  if (scatter) {
    // Seeded dispersion: scatter the arrival point in the plane normal to the line of fire.
    const rng = makeRng(seed ^ 0x5bd1e995);
    const sigma = (dispersionMils(app.round) / 1000) * (app.mode === 'duel' && app.duel?.myState.gunnerReplaced ? 1.6 : 1);
    const mx = gaussian(rng(), rng()) * sigma;
    const my = gaussian(rng(), rng()) * sigma;
    const right = new THREE.Vector3().crossVectors(a.dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, a.dir).normalize();
    const p = a.point.clone().addScaledVector(right, Math.tan(mx) * trueDistance).addScaledVector(up, Math.tan(my) * trueDistance);
    origin = app.shotOrigin({ point: p, dir: a.dir });
  }
  const dir = v3(a.dir.x, a.dir.y, a.dir.z);
  const shot = simulateShot(
    app.vehicle,
    app.round,
    { vehicleId: app.vehicleId, roundId: app.roundId, distance: trueDistance, origin, dir, seed, turretYaw: app.turretYaw },
    app.vstate,
  );
  if (app.gunner.active) {
    // Leave the sight so the replay plays in the cutaway; G returns to the gun.
    const { target } = app.gunner.exit(app.ctx.camera);
    app.ctx.controls.enabled = true;
    app.ctx.controls.target.copy(target);
    app.hover = null;
    app.aim = null;
  }
  app.vstate = shot.stateAfter;
  app.shots.push(shot);
  app.decals.addFromShot(shot);
  app.spent.addFromShot(shot, app.shots.length - 1);
  if (app.challenge) {
    app.challengeResult = evaluateChallenge(app.challenge, app.vehicle, app.vstate, app.shots);
    if (app.challengeResult.status === 'won') saveStars(app.challenge.id, app.challengeResult.stars);
    if (app.mode === 'daily') afterDailyShot(app);
  }
  app.showShot(app.shots.length - 1, true);
  app.updatePreview();
  if (app.challenge) app.renderLeft();
  if (app.mode === 'duel' && app.duel) afterPlayerShot(app, shot);
}

export function showShot(app: App, i: number, play: boolean) {
  app.shotView?.dispose();
  app.current = i;
  const shot = app.shots[i];
  if ((shot.input.turretYaw ?? 0) !== app.turretYaw) app.setTurretYaw(shot.input.turretYaw ?? 0);
  app.shotView = new ShotView(app.tank, shot);
  app.spent.setCurrent(i);
  app.ctx.scene.add(app.shotView.group);
  app.replayT = play ? 0 : shot.duration;
  app.skipHold();
  app.playing = play;
  app.ride = -1;
  if (play && app.autoCam) app.frameImpact(shot);
  app.renderRight();
  app.renderTimeline();
  app.renderLog();
}
