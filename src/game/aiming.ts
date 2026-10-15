import * as THREE from 'three';
import { setTurretYaw as setTankYaw } from '../render/tank';
import { frameOf, previewShot, worldNormal } from '../sim/shot';
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
    const hit = app.preview ? new THREE.Vector3(app.preview.point.x, app.preview.point.y, app.preview.point.z) : a.point;
    app.aimMarker.position.copy(hit);
    // Sit on the plate face: face along the plate's outward normal (turret traverse applied), a hair proud of it.
    if (app.preview) {
      const n = worldNormal(app.preview.plate, frameOf(app.vehicle, app.turretYaw));
      const nv = new THREE.Vector3(n.x, n.y, n.z);
      app.aimMarker.position.addScaledVector(nv, 0.006);
      app.aimMarker.lookAt(app.aimMarker.position.clone().add(nv));
    } else {
      app.aimMarker.lookAt(app.aimMarker.position.clone().sub(a.dir));
    }
    app.aimMarker.visible = true;
    const color = !app.preview ? 0xffffff : app.preview.rating === 'good' ? 0x4cd964 : app.preview.rating === 'marginal' ? 0xffd23f : 0xff4b3e;
    const locked = !!app.aim;
    const mm = app.aimMarker.material as THREE.MeshBasicMaterial;
    mm.color.setHex(color);
    mm.opacity = locked ? 1 : 0.55;
    app.aimMarker.scale.setScalar(locked ? 1 : 0.85);
    const dot = app.aimMarker.getObjectByName('aimDot') as THREE.Mesh | undefined;
    if (dot) {
      (dot.material as THREE.MeshBasicMaterial).color.setHex(color);
      (dot.material as THREE.MeshBasicMaterial).opacity = locked ? 1 : 0.55;
    }
    (app.aimLine.material as THREE.LineDashedMaterial).color.setHex(color);
    const tube = app.aimLine.getObjectByName('aimTube') as THREE.Mesh | undefined;
    const stub = app.aimLine.getObjectByName('aimStub') as THREE.Mesh | undefined;
    if (tube && stub) {
      placeTube(tube, from, hit, locked ? 0.012 : 0.008);
      placeTube(stub, hit, hit.clone().addScaledVector(a.dir, 0.3), locked ? 0.009 : 0.006);
      (tube.material as THREE.MeshBasicMaterial).color.setHex(color);
      (stub.material as THREE.MeshBasicMaterial).color.setHex(color);
      (tube.material as THREE.MeshBasicMaterial).opacity = locked ? 0.5 : 0.3;
      (stub.material as THREE.MeshBasicMaterial).opacity = locked ? 0.35 : 0.2;
    }
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
  // Glowing tube along the line of fire (readable against the ground) and a short stub continuing into the plate.
  const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const tube = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  tube.name = 'aimTube';
  tube.renderOrder = 19;
  const stub = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  stub.name = 'aimStub';
  stub.renderOrder = 19;
  line.add(tube, stub);
  // Ring drawn on the plate face (oriented along its normal), with a centre dot.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.085, 40),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true }),
  );
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.014, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true }));
  dot.name = 'aimDot';
  marker.add(dot);
  marker.renderOrder = 21;
  scene.add(line, marker);
  return { line, marker };
}

/** Place a unit cylinder (Y axis) between two world points with the given radius. */
function placeTube(m: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3, radius: number) {
  const d = to.clone().sub(from);
  const len = d.length();
  m.visible = len > 1e-4;
  if (!m.visible) return;
  m.position.copy(from).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.scale.set(radius, len, radius);
}
