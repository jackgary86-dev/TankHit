import * as THREE from 'three';
import { setTurretYaw as setTankYaw } from '../render/tank';
import { previewShot } from '../sim/shot';
import { DEG, v3, type Vec3 } from '../sim/vec';
import type { Aim, App } from '../app';

/** Shot direction for a target point under the current angle mode. */
export function shotDir(app: App, point: THREE.Vector3): THREE.Vector3 {
  if (app.gunner.active) return app.gunner.arrivalDir(point);
  if (app.respectCamera) return point.clone().sub(app.ctx.camera.position).normalize();
  // yaw 0 = shooting from the front (travelling -X), positive yaw swings to the left side.
  const y = app.yaw * DEG;
  const p = app.pitch * DEG;
  return new THREE.Vector3(-Math.cos(y) * Math.cos(p), -Math.sin(p), -Math.sin(y) * Math.cos(p)).normalize();
}

export function pick(app: App, e: PointerEvent): Aim | null {
  const r = app.ctx.renderer.domElement.getBoundingClientRect();
  return app.pickNdc(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}

export function pickNdc(app: App, x: number, y: number): Aim | null {
  app.pointer.set(x, y);
  app.raycaster.setFromCamera(app.pointer, app.ctx.camera);
  const meshes = [...app.tank.plateMeshes.values()];
  const hit = app.raycaster.intersectObjects(meshes, false)[0];
  if (!hit) return null;
  const point = hit.point.clone();
  return { point, dir: app.shotDir(point) };
}

/** Origin of the simulated shot: a few metres back along the line of fire. */
export function shotOrigin(_app: App, a: Aim): Vec3 {
  const o = a.point.clone().addScaledVector(a.dir, -6);
  return v3(o.x, o.y, o.z);
}

export function updatePreview(app: App) {
  const a = app.aim ?? app.hover;
  if (a && !app.respectCamera) a.dir = app.shotDir(a.point);
  if (!a) {
    app.preview = null;
    app.aimLine.visible = app.aimMarker.visible = false;
  } else {
    const d = v3(a.dir.x, a.dir.y, a.dir.z);
    app.preview = previewShot(app.vehicle, app.vstate, app.round, app.shotOrigin(a), d, app.distance, app.turretYaw);
    const from = a.point.clone().addScaledVector(a.dir, -6);
    app.aimLine.geometry.setFromPoints([from, a.point]);
    app.aimLine.computeLineDistances();
    app.aimLine.visible = true;
    app.aimMarker.position.copy(app.preview ? new THREE.Vector3(app.preview.point.x, app.preview.point.y, app.preview.point.z) : a.point);
    app.aimMarker.lookAt(app.aimMarker.position.clone().sub(a.dir));
    app.aimMarker.visible = true;
    const color = !app.preview ? 0xffffff : app.preview.rating === 'good' ? 0x4cd964 : app.preview.rating === 'marginal' ? 0xffd23f : 0xff4b3e;
    (app.aimMarker.material as THREE.MeshBasicMaterial).color.setHex(color);
    (app.aimLine.material as THREE.LineDashedMaterial).color.setHex(color);
    (app.aimMarker.material as THREE.MeshBasicMaterial).opacity = app.aim ? 1 : 0.6;
  }
  app.renderAimBox();
}

export function clearAim(app: App) {
  app.aim = null;
  app.updatePreview();
}

export function setTurretYaw(app: App, deg: number) {
  app.turretYaw = ((((deg + 180) % 360) + 360) % 360) - 180;
  setTankYaw(app.tank, app.turretYaw * DEG);
  app.updatePreview();
  const el = app.left.querySelector<HTMLInputElement>('input[data-turret]');
  if (el) {
    el.value = String(app.turretYaw);
    (el.nextElementSibling as HTMLElement).textContent = `${app.turretYaw}°`;
  }
}

/** Dashed line of fire and the ring marker drawn at the aim point. */
export function createAimGizmo(scene: THREE.Scene): { line: THREE.Line; marker: THREE.Mesh } {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineDashedMaterial({ color: 0xff5a3a, dashSize: 0.15, gapSize: 0.08, depthTest: false, transparent: true }),
  );
  line.renderOrder = 20;
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.09, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true }),
  );
  marker.renderOrder = 21;
  scene.add(line, marker);
  return { line, marker };
}
