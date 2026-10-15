import type { App } from '../app';

export function toggleGunner(app: App) {
  if (app.gunner.active) {
    const { target } = app.gunner.exit(app.ctx.camera);
    app.ctx.controls.target.copy(target);
    app.ctx.controls.enabled = true;
    app.hover = null;
    app.clearAim();
  } else {
    app.aim = null;
    app.ctx.controls.enabled = false;
    app.gunner.enter(app.ctx.camera, app.ctx.scene, app.ctx.controls.target, app.distance);
    app.layGun();
  }
  app.renderLeft();
}

/** Re-lay the sight for the current round and range. */
export function layGun(app: App) {
  if (!app.gunner.active) return;
  app.gunner.lay(app.round, app.distance, app.ctx.camera, app.ctx.renderer.domElement.clientHeight);
}

/** What is under the reticle right now (throttled: the aim box runs 16 simulations). */
export function pollGunner(app: App, now: number) {
  if (!app.gunner.active) return;
  app.gunner.update(app.ctx.camera);
  if (now - app.gunnerPickT < 120) return;
  app.gunnerPickT = now;
  const a = app.pickNdc(0, 0);
  const changed = !!a !== !!app.hover || (a && app.hover && a.point.distanceToSquared(app.hover.point) > 1e-4);
  if (changed) {
    app.hover = a;
    app.updatePreview();
  }
}
