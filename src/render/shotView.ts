import * as THREE from 'three';
import { checkIncapacitated } from '../sim/state';
import type { CrewZoneId, ShotResult, TraceKind } from '../sim/types';
import { roundById } from '../data/rounds';
import { Burst } from './particles';
import { ProjectileView } from './projectile';
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
  private wounds: THREE.Mesh[] = [];
  private fx: { kind: string; t: number; obj: THREE.Object3D }[] = [];
  private bursts: { t: number; b: Burst }[] = [];
  private projectile: ProjectileView;
  /** Deformation meshes parented to the hull/turret (petalled holes, bulges). */
  private plateFx: THREE.Object3D[] = [];

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
    this.projectile = new ProjectileView(roundById(shot.input.roundId), shot.traces, shot.impacts, shot.input.seed);
    this.group.add(this.projectile.object, ...this.projectile.chunkObjects);

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
    this.buildWounds();
    this.buildBigEvents();
    this.buildParticles();
    for (const imp of shot.impacts) {
      if (imp.kind !== 'explode' && imp.kind !== 'scab' && imp.kind !== 'era' && imp.kind !== 'shatter') continue;
      const blast = new THREE.Mesh(
        new THREE.SphereGeometry(1, 20, 14),
        new THREE.MeshBasicMaterial({ color: imp.kind === 'era' ? 0xfff0a0 : 0xffa040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      blast.position.set(imp.point.x, imp.point.y, imp.point.z);
      blast.userData.era = imp.kind === 'era';
      this.add('blast', imp.t, blast);
    }
  }

  private buildBigEvents() {
    for (const e of this.shot.bigEvents) {
      const p = new THREE.Vector3(e.point.x, e.point.y, e.point.z);
      if (e.kind === 'detonation') {
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(1, 32, 20),
          new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        ball.position.copy(p);
        const light = new THREE.PointLight(0xffa040, 0, 25, 1.5);
        light.position.copy(p).add(new THREE.Vector3(0, 0.5, 0));
        const g = new THREE.Group();
        g.add(ball, light);
        this.add('detonation', e.t, g);
      } else if (e.kind === 'blowout') {
        const geo = new THREE.ConeGeometry(0.45, 3.2, 20, 1, true);
        geo.translate(0, 1.6, 0);
        geo.rotateX(Math.PI);
        geo.translate(0, 3.2, 0);
        const jet = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        jet.position.copy(p);
        const light = new THREE.PointLight(0xff8a30, 0, 15, 1.5);
        light.position.copy(p).add(new THREE.Vector3(0, 1.2, 0));
        const g = new THREE.Group();
        g.add(jet, light);
        this.add('blowout', e.t, g);
      } else if (e.kind === 'fire') {
        const light = new THREE.PointLight(0xff6a1a, 0, 8, 1.6);
        light.position.copy(p);
        const glow = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 16, 12),
          new THREE.MeshBasicMaterial({ color: 0xff5a10, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        glow.position.copy(p);
        const g = new THREE.Group();
        g.add(light, glow);
        this.add('fire', e.t, g);
      }
    }
  }

  private burst(t: number, at: { x: number; y: number; z: number }, o: ConstructorParameters<typeof Burst>[1]) {
    const b = new Burst(new THREE.Vector3(at.x, at.y, at.z), o, this.bursts.length * 97 + this.shot.input.seed % 1000);
    this.bursts.push({ t, b });
    this.group.add(b.points);
  }

  /** Contact effects at the first plate: a flash and sparks scaled by impact energy, plus plate deformation. */
  private buildContact() {
    const first = this.shot.impacts[0];
    if (!first || !first.plateId) return;
    const energy = Math.min(1, ((first.penMm ?? 100) / 500) * 0.7 + 0.3);
    const n = new THREE.Vector3(first.normal.x, first.normal.y, first.normal.z).normalize();
    const p = new THREE.Vector3(first.point.x, first.point.y, first.point.z);
    const plate = this.view.vehicle.plates.find((q) => q.id === first.plateId);
    const group = plate?.group === 'turret' ? this.view.turret : this.view.hull;
    const toLocal = (w: THREE.Vector3) => group.worldToLocal(w.clone());
    const localN = n.clone().transformDirection(new THREE.Matrix4().copy(group.matrixWorld).invert());

    // Flash at the contact point.
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
    );
    flash.position.copy(p).addScaledVector(n, 0.02);
    flash.userData.energy = energy;
    this.add('flash', first.t, flash);
    const sparkDir = n.clone().multiplyScalar(0.9).add(new THREE.Vector3(0, 0.3, 0)).normalize();
    this.burst(first.t, first.point, { count: Math.round(30 + 50 * energy), color: 0xffd080, speed: 2.5 + 3 * energy, lift: -4, size: 0.04, grow: -0.4, life: 0.5, additive: true, spread: sparkDir.clone().addScalar(1).multiplyScalar(0.5).add(new THREE.Vector3(0.4, 0.4, 0.4)) });

    if (first.kind === 'pen') {
      // Petalled hole: six petals folded in along the shot, growing as the shell pushes through.
      const cal = Math.max(0.03, (this.shot.summary.penAtTargetMm > 300 ? 0.03 : 0.085) * (first.kind === 'pen' ? 1 : 1));
      const petals = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const tri = new THREE.Mesh(
          new THREE.ConeGeometry(cal * 0.55, cal * 1.6, 3, 1, true),
          new THREE.MeshStandardMaterial({ color: 0x5a5d62, metalness: 0.8, roughness: 0.45, side: THREE.DoubleSide, emissive: 0x401800 }),
        );
        tri.geometry.translate(0, cal * 0.8, 0);
        const holder = new THREE.Group();
        holder.rotation.z = (i / 6) * Math.PI * 2;
        tri.rotation.x = -1.1; // folded inward (toward -normal in local frame)
        holder.add(tri);
        petals.add(holder);
      }
      petals.position.copy(toLocal(p));
      petals.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), localN);
      petals.userData = { t: first.t, kind: 'petals' };
      petals.visible = false;
      group.add(petals);
      this.plateFx.push(petals);
    } else if (first.kind === 'nonpen' || first.kind === 'shatter') {
      // Bulge on the inside face.
      const t = Math.max((plate?.mm ?? 20) / 1000, 0.01);
      const bulge = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x6a6d72, metalness: 0.7, roughness: 0.5 }),
      );
      bulge.position.copy(toLocal(p.clone().addScaledVector(n, -t)));
      bulge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), localN.clone().negate());
      bulge.scale.set(1, 0.35 * energy, 1);
      bulge.userData = { t: first.t, kind: 'bulge' };
      bulge.visible = false;
      group.add(bulge);
      this.plateFx.push(bulge);
    } else if (first.kind === 'ricochet') {
      // Spark streak skating along the plate in the deflected direction.
      const d = new THREE.Vector3(this.shot.input.dir.x, this.shot.input.dir.y, this.shot.input.dir.z).normalize();
      const refl = d.clone().sub(n.clone().multiplyScalar(2 * d.dot(n))).normalize();
      this.burst(first.t, first.point, { count: 40, color: 0xffc060, speed: 6, lift: -2, size: 0.04, grow: -0.3, life: 0.45, additive: true, spread: refl.clone().multiplyScalar(0.9).addScalar(0.15) });
    }
  }

  private buildParticles() {
    this.buildContact();
    for (const imp of this.shot.impacts) {
      if (imp.kind === 'pen' || imp.kind === 'nonpen' || imp.kind === 'ricochet') {
        this.burst(imp.t, imp.point, { count: imp.kind === 'pen' ? 26 : 18, color: 0xffb050, speed: 2.2, lift: -3, size: 0.05, grow: -0.5, life: 0.6, additive: true });
      }
      if (imp.kind === 'explode' || imp.kind === 'scab' || imp.kind === 'era') {
        this.burst(imp.t, imp.point, { count: 30, color: 0xffa040, speed: 3, lift: -2, size: 0.06, grow: -0.5, life: 0.5, additive: true });
        this.burst(imp.t + 0.05, imp.point, { count: 26, color: 0x5a5a58, speed: 1.2, lift: 0.6, size: 0.5, grow: 2.5, life: 3, additive: false });
      }
    }
    for (const e of this.shot.bigEvents) {
      if (e.kind === 'detonation') {
        this.burst(e.t, e.point, { count: 90, color: 0xffc070, speed: 9, lift: -6, size: 0.09, grow: -0.4, life: 1.6, additive: true });
        this.burst(e.t + 0.1, e.point, { count: 70, color: 0x2e2c2a, speed: 3.5, lift: 1.4, size: 1.2, grow: 3, life: 5, additive: false });
      } else if (e.kind === 'blowout') {
        this.burst(e.t, e.point, { count: 60, color: 0xffa040, speed: 7, lift: 2, size: 0.12, grow: 0.5, life: 1.8, additive: true, spread: new THREE.Vector3(0.25, 2.2, 0.25) });
        this.burst(e.t + 0.3, e.point, { count: 50, color: 0x3a3836, speed: 3, lift: 1.5, size: 0.9, grow: 3, life: 5, additive: false, spread: new THREE.Vector3(0.4, 1.6, 0.4) });
      } else if (e.kind === 'fire') {
        this.burst(e.t, e.point, { count: 40, color: 0x444240, speed: 0.8, lift: 0.9, size: 0.6, grow: 3, life: 6, additive: false, spread: new THREE.Vector3(0.6, 1, 0.6) });
      }
    }
  }

  private add(kind: string, t: number, obj: THREE.Object3D) {
    obj.visible = false;
    this.fx.push({ kind, t, obj });
    this.group.add(obj);
  }

  private updateBigEvents(T: number) {
    let tossAge = -1;
    for (const f of this.fx) {
      const age = T - f.t;
      f.obj.visible = age >= 0;
      if (age < 0) continue;
      const flick = 0.75 + 0.25 * Math.sin(T * 47) * Math.sin(T * 13);
      if (f.kind === 'detonation') {
        tossAge = age;
        const ball = f.obj.children[0] as THREE.Mesh;
        const light = f.obj.children[1] as THREE.PointLight;
        const s = Math.min(2.2, 0.3 + age * 5);
        ball.scale.setScalar(s);
        (ball.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.7 - age / 1.8);
        (ball.material as THREE.MeshBasicMaterial).color.setHSL(0.09 - Math.min(0.06, age * 0.04), 1, Math.max(0.35, 0.75 - age * 0.3));
        light.intensity = Math.max(0, 60 * (1 - age / 2.5)) * flick;
      } else if (f.kind === 'blowout') {
        const jet = f.obj.children[0] as THREE.Mesh;
        const light = f.obj.children[1] as THREE.PointLight;
        const life = Math.max(0, 1 - age / 2.4);
        jet.scale.set(flick, Math.min(1, age * 4) * life + 0.01, flick);
        (jet.material as THREE.MeshBasicMaterial).opacity = 0.8 * life;
        light.intensity = 25 * life * flick;
      } else if (f.kind === 'flash') {
        const m = f.obj as THREE.Mesh;
        const e = m.userData.energy as number;
        m.scale.setScalar(0.03 + (0.12 + 0.2 * e) * Math.min(1, age * 12));
        (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - age / (0.12 + 0.1 * e));
        m.visible = age < 0.25;
      } else if (f.kind === 'blast') {
        const m = f.obj as THREE.Mesh;
        const era = !!m.userData.era;
        m.scale.setScalar(era ? 0.04 + Math.min(0.2, age * 2.0) : 0.05 + Math.min(0.55, age * 2.5));
        (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, era ? 0.7 - age * 4 : 0.85 - age * 1.6);
      } else if (f.kind === 'fire') {
        const light = f.obj.children[0] as THREE.PointLight;
        const glow = f.obj.children[1] as THREE.Mesh;
        light.intensity = 6 * flick * Math.min(1, age * 3);
        glow.scale.setScalar(0.6 + flick * 0.6);
      }
    }
    // Catastrophic: the turret is thrown off.
    const tur = this.view.turret;
    const pv = this.view.pivot;
    const yaw = this.view.turretYaw;
    if (tossAge >= 0) {
      const u = Math.min(tossAge, 1.6);
      tur.position.set(pv.x - 0.6 * u, Math.max(0, 4 * u - 2.1 * u * u), pv.z + 0.9 * u);
      tur.rotation.set(u * 0.9, yaw + u * 0.6, u * 0.4);
    } else {
      tur.position.copy(pv);
      tur.rotation.set(0, yaw, 0);
    }
  }

  /** Glowing wound channels inside the gel dummies – stylised cavity, not gore. */
  private buildWounds() {
    for (const w of this.shot.crewHits) {
      const r = Math.min(0.03, 0.008 + w.damage / 2500);
      const geo = new THREE.CapsuleGeometry(r, w.length, 4, 10);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff5530, transparent: true, opacity: 0.85, depthTest: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(geo, mat);
      const d = new THREE.Vector3(w.dir.x, w.dir.y, w.dir.z).normalize();
      m.position.set(w.point.x, w.point.y, w.point.z).addScaledVector(d, w.length / 2);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      m.renderOrder = 13;
      m.userData.t = w.t;
      m.userData.full = w.length;
      this.wounds.push(m);
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
        bright = age <= 0 ? 1 : Math.max(0.3, 1 - age / FADE);
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
      const active = T >= tr.t0 && T <= tr.t1 && tr.kind !== 'shell' && tr.kind !== 'ricochet';
      hpos.setXYZ(i, ex, ey, ez);
      const hb = active ? 1 : 0;
      hcol.setXYZ(i, c.r * hb, c.g * hb, c.b * hb);
    });
    pos.needsUpdate = col.needsUpdate = hpos.needsUpdate = hcol.needsUpdate = true;

    this.projectile.update(T);
    for (const fx of this.plateFx) {
      const age = T - (fx.userData.t as number);
      fx.visible = age >= 0;
      if (!fx.visible) continue;
      const u = Math.min(1, age / 0.1);
      if (fx.userData.kind === 'petals') {
        fx.scale.setScalar(0.2 + 0.8 * u);
        for (const holder of fx.children) (holder.children[0] as THREE.Mesh).rotation.x = -0.2 - 0.9 * u;
      } else {
        fx.scale.y = 0.35 * u;
      }
    }
    for (const m of this.markers) m.visible = T >= (m.userData.t as number);
    for (const w of this.wounds) {
      const age = T - (w.userData.t as number);
      w.visible = age >= 0;
      // The channel lengthens along the fragment path, while the gel around it balloons into a temporary
      // cavity (up to ~3x the radius) that collapses back over half a second, leaving the permanent track.
      const grow = Math.min(1, Math.max(0.05, age / 0.25));
      const pulse = age < 0.12 ? age / 0.12 : Math.max(0, 1 - (age - 0.12) / 0.55);
      const swell = 1 + 2.2 * pulse;
      w.scale.set(swell, grow, swell);
      const mat = w.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.35 + 0.65 * (1 - pulse) * (age < 0.4 ? 1 : 0.7) + 0.2 * pulse;
      mat.color.setRGB(1, 0.33 + 0.4 * pulse, 0.19 + 0.3 * pulse);
    }
    applyDamage(this.view, this.shot, T);
    this.updateBigEvents(T);
    for (const { t, b } of this.bursts) b.update(T - t);
  }

  dispose() {
    this.projectile.dispose();
    for (const fx of this.plateFx) {
      fx.removeFromParent();
      fx.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
    }
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    this.group.removeFromParent();
    this.view.turret.position.copy(this.view.pivot);
    this.view.turret.rotation.set(0, this.view.turretYaw, 0);
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
  const ignite: Record<string, number> = {};
  const burn: Record<string, number> = {};
  const det: Record<string, number> = {};
  if (shot) {
    for (const e of shot.ammoEvents) {
      if (e.kind === 'ignite') ignite[e.moduleId] = e.t;
      if (e.kind === 'burn') burn[e.moduleId] = Math.min(burn[e.moduleId] ?? Infinity, e.t);
      if (e.kind === 'detonate') det[e.moduleId] = e.t;
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
    if (m.ammo) {
      mesh.visible = !(base?.ammoGone[m.id]) && !(det[m.id] !== undefined && T >= det[m.id]);
      const ti = ignite[m.id];
      const tb = burn[m.id];
      if (ti !== undefined && T >= ti) {
        // Glow orange -> red -> white while the propellant catches, then char.
        const k = Math.min(1, (T - ti) / 0.35);
        const glow = k < 0.5 ? new THREE.Color(0xff8a00).lerp(new THREE.Color(0xff2000), k * 2) : new THREE.Color(0xff2000).lerp(new THREE.Color(0xffffff), (k - 0.5) * 2);
        mat.emissive.copy(glow).multiplyScalar(1.6);
        mat.color.copy(glow);
      }
      if (tb !== undefined && T >= tb + 0.25) {
        mat.color.setHex(0x161616);
        mat.emissive.setRGB(0.25 + 0.15 * Math.sin(T * 30), 0.06, 0);
      }
    }
  }
  // Reactive armor blocks vanish once they fire.
  for (const p of v.plates) {
    if (p.kind !== 'era') continue;
    const spentBefore = !!base?.eraSpent[p.id];
    const firedAt = shot?.impacts.find((i) => i.kind === 'era' && i.plateId === p.id)?.t;
    const mesh = view.plateMeshes.get(p.id)!;
    // The brick blows outward along its normal for a quarter second, then is gone.
    const fly = firedAt !== undefined && T >= firedAt ? Math.min(1, (T - firedAt) / 0.25) : 0;
    const imp = shot?.impacts.find((i) => i.kind === 'era' && i.plateId === p.id);
    if (imp && fly > 0 && fly < 1) {
      const nn = new THREE.Vector3(imp.normal.x, imp.normal.y, imp.normal.z);
      mesh.position.copy(nn.multiplyScalar(0.35 * fly));
      mesh.rotation.set(fly * 2.5, 0, fly * 1.5);
    } else {
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
    }
    const visible = !spentBefore && !(firedAt !== undefined && fly >= 1);
    mesh.visible = visible;
    view.plateEdges.get(p.id)!.visible = visible && !!view.plateEdges.get(p.id)!.userData.xray;
  }
  applyCrew(view, shot, T);
}

const GEL = new THREE.Color(0xf2b27a);
const HURT = new THREE.Color(0xd8452e);
const DOWN = new THREE.Color(0x4a2620);

/** Tint gel dummies by zone damage at replay time T. */
export function applyCrew(view: TankView, shot: ShotResult | null, T: number) {
  const v = view.vehicle;
  for (const c of v.crew) {
    const zoneHp = shot ? { ...shot.stateBefore.crew[c.id].zoneHp } : ({} as Record<CrewZoneId, number>);
    if (!shot) for (const z of c.zones) zoneHp[z.zone] = z.hp;
    let down = shot ? shot.stateBefore.crew[c.id].incapacitated : false;
    const flash: Partial<Record<CrewZoneId, number>> = {};
    if (shot) {
      for (const hit of shot.crewHits) {
        if (hit.crewId !== c.id || hit.t > T) continue;
        zoneHp[hit.zone] -= hit.damage;
        flash[hit.zone] = Math.max(flash[hit.zone] ?? 0, 1 - (T - hit.t) / 0.4);
      }
      const det = shot.bigEvents.find((e) => e.kind === 'detonation');
      down = down || checkIncapacitated(v, c.id, zoneHp) || (!!det && T >= det.t);
    }
    for (const z of c.zones) {
      const meshes = view.zoneMeshes.get(`${c.id}:${z.zone}`) ?? [];
      const frac = Math.max(0, zoneHp[z.zone]) / z.hp;
      for (const m of meshes) {
        const mat = m.material as THREE.MeshPhysicalMaterial;
        mat.color.copy(down ? DOWN : GEL.clone().lerp(HURT, 1 - frac));
        const f = Math.max(0, flash[z.zone] ?? 0);
        mat.emissive.setRGB(0.23 + f, 0.1 + f * 0.4, 0.02);
      }
    }
  }
}

export const moduleWorldCenter = (view: TankView, id: string) => {
  const m = view.vehicle.modules.find((x) => x.id === id)!;
  return boxCenter(m.box);
};
