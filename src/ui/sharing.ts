import * as THREE from 'three';
import { roundById } from '../data/rounds';
import { vehicleById } from '../data/vehicles';
import { decodeShot, shareUrl } from '../modes/share';
import { simulateShot } from '../sim/shot';
import type { App } from '../app';

/** Reproduce a shot from a share link (#v=…&r=…&o=…&dir=…&s=…). */
export function loadFromHash(app: App) {
  const input = decodeShot(location.hash);
  if (!input) return;
  try {
    vehicleById(input.vehicleId);
    roundById(input.roundId);
  } catch {
    return;
  }
  if (app.mode !== 'sandbox') app.setMode('sandbox');
  if (app.gunner.active) app.toggleGunner();
  if (input.vehicleId !== app.vehicleId) app.loadVehicle(input.vehicleId);
  else app.resetDamage();
  app.roundId = input.roundId;
  app.distance = input.distance;
  app.setTurretYaw(input.turretYaw ?? 0);
  const shot = simulateShot(app.vehicle, app.round, input, app.vstate);
  app.vstate = shot.stateAfter;
  app.shots.push(shot);
  app.decals.addFromShot(shot);
  app.showShot(0, true);
  app.renderLeft();
  // Frame the impact.
  const imp = shot.impacts[0];
  if (imp) {
    const p = new THREE.Vector3(imp.point.x, imp.point.y, imp.point.z);
    const d = new THREE.Vector3(input.dir.x, input.dir.y, input.dir.z);
    app.ctx.controls.target.copy(p);
    app.ctx.camera.position.copy(p).addScaledVector(d, -5).add(new THREE.Vector3(0, 2.5, 0));
  }
}

export function shareCurrent(app: App) {
  const shot = app.shots[app.current];
  if (!shot) return;
  const url = shareUrl(shot.input);
  history.replaceState(null, '', `#${url.split('#')[1]}`);
  const btn = app.right.querySelector<HTMLButtonElement>('button.share');
  const done = (ok: boolean) => {
    if (btn) btn.textContent = ok ? 'Link copied' : 'Link in address bar';
  };
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(() => done(true), () => done(false));
  else done(false);
}
