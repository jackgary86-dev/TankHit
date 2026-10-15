import * as THREE from 'three';
import type { ShotResult, TraceKind } from '../sim/types';
import { boxCenter, moduleColor, type TankView } from './tank';

const TRACE_COLORS: Record<TraceKind, THREE.Color> = {
  shell: new THREE.Color(0xff4a2a),
  ricochet: new THREE.Color(0xffa040),
  spall: new THREE.Color(0xffc43a),
  frag: new THREE.Color(0xff8a2a),
  jet: new THREE.Color(0xa8e0ff),
};
const FADE = 1.4; // replay seconds a trace stays lit after it finishes

const DAMAGE_COLORS = [0xffd23f, 0xff8c1a, 0xff3b2f, 0x121212];

/** Draws one shot's traces, impacts and damage on top of a TankView at an arbitrary replay time. */
export class ShotView {
  readonly group = new THREE.Group();
  private lines: THREE.LineSegments;
  private heads: THREE.Points;
  private markers: THREE.Mesh[] = [];

  constructor(readonly view: TankView, readonly shot: ShotResult) {
    const n = shot.traces.length;
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    this.lines = new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
    );
    this.lines.renderOrder = 10;
    this.lines.frustumCulled = false;
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.heads = new THREE.Points(
      pg,
      new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, sizeAttenuation: true }),
    );
    this.heads.renderOrder = 11;
    this.heads.frustumCulled = false;
    this.group.add(this.lines, this.heads);

    for (const imp of shot.impacts) {
      const color = imp.kind === 'pen' ? 0x46ff7a : imp.kind === 'nonpen' ? 0xff3b2f : imp.kind === 'ricochet' ? 0xffa040 : imp.kind === 'era' ? 0xc8ff80 : 0xffe060;
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.035, 0.07, 24),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }),
      );
      m.position.set(imp.point.x, imp.point.y, imp.point.z);
      m.lookAt(m.position.clone().add(new THREE.Vector3(imp.normal.x, imp.normal.y, imp.normal.z)));
      m.renderOrder = 12;
      m.userData.t = imp.t;
      this.markers.push(m);
      this.group.add(m);
    }
  }

  /** Update everything for replay time `T` (seconds). */
  update(T: number) {
    const pos = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.lines.geometry.getAttribute('color') as THREE.BufferAttribute;
    const hpos = this.heads.geometry.getAttribute('position') as THREE.BufferAttribute;
    const hcol = this.heads.geometry.getAttribute('color') as THREE.BufferAttribute;
    this.shot.traces.forEach((tr, i) => {
      let k = 0;
      let bright = 0;
      if (T >= tr.t0) {
        k = tr.t1 > tr.t0 ? Math.min(1, (T - tr.t0) / (tr.t1 - tr.t0)) : 1;
        const age = T - tr.t1;
        bright = age <= 0 ? 1 : Math.max(0.12, 1 - age / FADE);
      }
      const ex = tr.from.x + (tr.to.x - tr.from.x) * k;
      const ey = tr.from.y + (tr.to.y - tr.from.y) * k;
      const ez = tr.from.z + (tr.to.z - tr.from.z) * k;
      pos.setXYZ(i * 2, tr.from.x, tr.from.y, tr.from.z);
      pos.setXYZ(i * 2 + 1, ex, ey, ez);
      const c = TRACE_COLORS[tr.kind];
      const e = tr.kind === 'spall' || tr.kind === 'frag' ? Math.min(1, 0.35 + tr.energy / 120) : 1;
      col.setXYZ(i * 2, c.r * bright * e * 0.5, c.g * bright * e * 0.5, c.b * bright * e * 0.5);
      col.setXYZ(i * 2 + 1, c.r * bright * e, c.g * bright * e, c.b * bright * e);
      const active = T >= tr.t0 && T <= tr.t1;
      hpos.setXYZ(i, ex, ey, ez);
      const hb = active ? 1 : 0;
      hcol.setXYZ(i, c.r * hb, c.g * hb, c.b * hb);
    });
    pos.needsUpdate = col.needsUpdate = hpos.needsUpdate = hcol.needsUpdate = true;

    for (const m of this.markers) m.visible = T >= (m.userData.t as number);
    applyDamage(this.view, this.shot, T);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    this.group.removeFromParent();
  }
}

/** Color modules by HP at replay time T, starting from the shot's pre-shot state. */
export function applyDamage(view: TankView, shot: ShotResult | null, T: number) {
  const v = view.vehicle;
  const hp: Record<string, number> = {};
  const flash: Record<string, number> = {};
  const base = shot ? shot.stateBefore : null;
  for (const m of v.modules) hp[m.id] = base ? base.moduleHp[m.id] : m.hp;
  if (shot) {
    for (const h of shot.moduleHits) {
      if (h.t <= T) {
        hp[h.moduleId] = h.hpAfter;
        flash[h.moduleId] = Math.max(0, 1 - (T - h.t) / 0.5);
      }
    }
  }
  for (const m of v.modules) {
    const mesh = view.moduleMeshes.get(m.id)!;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const frac = hp[m.id] / m.hp;
    let color = moduleColor(m);
    if (frac < 0.999) color = frac > 0.66 ? DAMAGE_COLORS[0] : frac > 0.33 ? DAMAGE_COLORS[1] : frac > 0 ? DAMAGE_COLORS[2] : DAMAGE_COLORS[3];
    mat.color.setHex(color);
    mat.emissive.setRGB(flash[m.id] ?? 0, (flash[m.id] ?? 0) * 0.6, 0);
  }
}

export const moduleWorldCenter = (view: TankView, id: string) => {
  const m = view.vehicle.modules.find((x) => x.id === id)!;
  return boxCenter(m.box);
};
