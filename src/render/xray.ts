import * as THREE from 'three';
import { plateEquivalent } from '../sim/penetration';
import type { TankView } from './tank';

/** Blue (thin) -> cyan -> green -> yellow -> red (thick), by KE RHA-equivalent at 0 degrees. */
export function heatColor(mm: number): THREE.Color {
  const stops: [number, number][] = [[0, 0x2050ff], [40, 0x20c8ff], [100, 0x30e060], [200, 0xffe040], [350, 0xff7020], [500, 0xff2020]];
  for (let i = 1; i < stops.length; i++) {
    if (mm <= stops[i][0]) {
      const [m0, c0] = stops[i - 1];
      const [m1, c1] = stops[i];
      return new THREE.Color(c0).lerp(new THREE.Color(c1), (mm - m0) / (m1 - m0));
    }
  }
  return new THREE.Color(stops[stops.length - 1][1]);
}
export const HEAT_STOPS = [0, 40, 100, 200, 350, 500];

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

/** Switch between the painted exterior and the translucent analysis view, optionally with the armor heatmap. */
export function setXray(view: TankView, on: boolean, heat = false) {
  for (const [id, mesh] of view.plateMeshes) {
    const m = mesh as Swappable;
    const plate = view.vehicle.plates.find((p) => p.id === id)!;
    m.userData.solid ??= m.material as THREE.Material;
    m.userData.xray ??= XRAY_PLATE(plate.kind === 'era');
    if (!m.userData.heat) {
      const hm = new THREE.MeshStandardMaterial({ color: heatColor(plateEquivalent(plate, true)), roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide });
      m.userData.heat = hm;
    }
    const hm = m.userData.heat as THREE.MeshStandardMaterial;
    hm.transparent = on;
    hm.opacity = on ? 0.42 : 1;
    hm.depthWrite = !on;
    hm.needsUpdate = true;
    m.material = heat ? hm : on ? m.userData.xray : m.userData.solid;
    m.castShadow = !on;
    const edge = view.plateEdges.get(id)!;
    edge.userData.xray = on;
    edge.visible = on && mesh.visible;
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
    apply(m.userData.heat as THREE.Material | undefined);
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
