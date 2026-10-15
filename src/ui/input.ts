import { pressViewKey } from './viewToggles';
import type { App } from '../app';

export function bindInput(app: App) {
  const el = app.ctx.renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    app.downAt = { x: e.clientX, y: e.clientY };
    app.camGoal = null;
  });
  let last = { x: 0, y: 0 };
  el.addEventListener('pointermove', (e) => {
    if (app.gunner.active) {
      if (e.buttons & 1) app.gunner.onDrag(e.clientX - last.x, e.clientY - last.y, el.clientHeight, app.ctx.camera);
      last = { x: e.clientX, y: e.clientY };
      return;
    }
    last = { x: e.clientX, y: e.clientY };
    app.hover = app.pick(e);
    if (!app.aim) app.updatePreview();
  });
  el.addEventListener('wheel', (e) => {
    if (!app.gunner.active) return;
    e.preventDefault();
    app.gunner.onWheel(e.deltaY);
    app.layGun();
  }, { passive: false });
  el.addEventListener('pointerup', (e) => {
    if (app.gunner.active) return;
    if (Math.hypot(e.clientX - app.downAt.x, e.clientY - app.downAt.y) > 4 || e.button !== 0) return;
    const a = app.pick(e);
    if (a) {
      app.aim = a;
      app.updatePreview();
    }
  });
  window.addEventListener('keydown', (e) => app.onKey(e));
}

export function onKey(app: App, e: KeyboardEvent) {
  const target = e.target as HTMLElement | null;
  if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') return;
  const k = e.key.toLowerCase();
  if (k === ' ') {
    e.preventDefault();
    app.fire();
  } else if (k === 'x') pressViewKey(app, 'xray');
  else if (k === 'c') pressViewKey(app, 'cutaway');
  else if (k === 'escape') app.clearAim();
  else if (k === 'p' || k === 'enter') app.togglePlay();
  else if (k === 'a') app.stepShot(-1);
  else if (k === 'd') app.stepShot(1);
  else if (k === 'w' || k === 's') app.rideShot((k === 'w' ? 1 : -1) * (e.shiftKey ? 0.6 : 0.2));
  else if (k === 'r') app.resetCamera();
  else if (k === 'h') pressViewKey(app, 'armour');
  else if (k === 'k') pressViewKey(app, 'killmap');
  else if (k === 'g') app.toggleGunner();
  else if (k === 'v') app.toggleAutoCam();
  else if (k === 'q' || k === 'e') app.setTurretYaw(app.turretYaw + (k === 'e' ? 5 : -5));
  else if (k === 'm') app.toggleMute();
}
