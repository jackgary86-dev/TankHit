import * as THREE from 'three';
import type { TankView } from './tank';

export type SectionMode = 'off' | 'shot' | 'camera';

const XRAY_PLATE = (era: boolean) =>
  new THREE.MeshStandardMaterial({
    color: era ? 0xa8c880 : 0x9cc3d8,
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

const XRAY_GEAR = () =>
  new THREE.MeshStandardMaterial({ color: 0x1c2026, transparent: true, opacity: 0.35, depthWrite: false, roughness: 0.9 });

interface Swappable extends THREE.Mesh {
  userData: { solid?: THREE.Material; xray?: THREE.Material; [k: string]: unknown };
}

/** Switch between the painted exterior and the translucent analysis view. */
export function setXray(view: TankView, on: boolean) {
  for (const [id, mesh] of view.plateMeshes) {
    const m = mesh as Swappable;
    m.userData.solid ??= m.material as THREE.Material;
    m.userData.xray ??= XRAY_PLATE(view.vehicle.plates.find((p) => p.id === id)?.kind === 'era');
    m.material = on ? m.userData.xray : m.userData.solid;
    m.castShadow = !on;
    view.plateEdges.get(id)!.visible = on;
  }
  for (const o of view.exterior) {
    const m = o as Swappable;
    m.userData.solid ??= m.material as THREE.Material;
    m.userData.xray ??= XRAY_GEAR();
    m.material = on ? m.userData.xray : m.userData.solid;
  }
  for (const o of view.interior) o.visible = on;
}

/** Apply a clipping plane to the shell (plates, edges and running gear) – interior stays whole. */
export function setSectionPlane(view: TankView, plane: THREE.Plane | null) {
  const planes = plane ? [plane] : [];
  const apply = (mat: THREE.Material | undefined) => {
    if (!mat) return;
    mat.clippingPlanes = planes;
    mat.clipShadows = true;
    mat.needsUpdate = true;
  };
  for (const [id, mesh] of view.plateMeshes) {
    const m = mesh as Swappable;
    apply(m.userData.xray);
    apply(m.userData.solid);
    apply(m.material as THREE.Material);
    apply(view.plateEdges.get(id)!.material as THREE.Material);
  }
  for (const o of view.exterior) {
    const m = o as Swappable;
    apply(m.userData.xray);
    apply(m.userData.solid);
    apply(m.material as THREE.Material);
  }
}

/**
 * Plane containing the shot line and the vertical, oriented so the half facing the camera is cut away.
 * Falls back to a camera-facing plane through `point` when the shot is near vertical.
 */
export function shotSectionPlane(point: THREE.Vector3, dir: THREE.Vector3, cameraPos: THREE.Vector3): THREE.Plane {
  let n = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
  if (n.lengthSq() < 1e-4) n = new THREE.Vector3().subVectors(point, cameraPos).setY(0);
  n.normalize();
  if (n.dot(new THREE.Vector3().subVectors(cameraPos, point)) > 0) n.negate();
  // Offset slightly toward the camera so the struck plate itself stays visible.
  const p = point.clone().addScaledVector(n, -0.05);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(n, p);
}

/** Plane through the vehicle centre facing the camera, offset by `offset` metres. */
export function cameraSectionPlane(center: THREE.Vector3, cameraPos: THREE.Vector3, offset = 0): THREE.Plane {
  const n = new THREE.Vector3().subVectors(center, cameraPos).setY(0).normalize();
  const p = center.clone().addScaledVector(n, offset);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(n, p);
}
