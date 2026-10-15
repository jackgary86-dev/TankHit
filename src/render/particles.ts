import * as THREE from 'three';

let sprite: THREE.Texture | null = null;
function softSprite(): THREE.Texture {
  if (sprite) return sprite;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  sprite = new THREE.CanvasTexture(c);
  return sprite;
}

/** Deterministic hash so a particle burst looks identical on every replay of the same shot. */
const hash = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export interface BurstOpts {
  count: number;
  color: number;
  /** Initial speed (m per replay second). */
  speed: number;
  /** Upward drift (m/s²), negative for sparks falling. */
  lift: number;
  size: number;
  grow: number;
  life: number;
  additive: boolean;
  spread?: THREE.Vector3;
}

/** A particle burst whose state is a pure function of its age – scrubbing the timeline just works. */
export class Burst {
  readonly points: THREE.Points;
  private dirs: THREE.Vector3[] = [];

  constructor(readonly origin: THREE.Vector3, readonly o: BurstOpts, seed: number) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(o.count * 3), 3));
    for (let i = 0; i < o.count; i++) {
      const u = hash(seed + i, 1) * 2 - 1;
      const th = hash(seed + i, 2) * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = 0.4 + hash(seed + i, 3) * 0.6;
      const d = new THREE.Vector3(r * Math.cos(th), Math.abs(u) * 0.8 + 0.2, r * Math.sin(th)).multiplyScalar(sp);
      if (o.spread) d.multiply(o.spread);
      this.dirs.push(d);
    }
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: o.color,
        size: o.size,
        map: softSprite(),
        transparent: true,
        depthWrite: false,
        blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        opacity: 0,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
  }

  update(age: number) {
    const o = this.o;
    const visible = age >= 0 && age <= o.life;
    this.points.visible = visible;
    if (!visible) return;
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const drag = 1 - Math.exp(-age * 2.2); // particles slow down
    for (let i = 0; i < this.dirs.length; i++) {
      const d = this.dirs[i];
      const travel = (o.speed * drag) / 2.2;
      pos.setXYZ(i, this.origin.x + d.x * travel, this.origin.y + d.y * travel + o.lift * age * age * 0.5, this.origin.z + d.z * travel);
    }
    pos.needsUpdate = true;
    const mat = this.points.material as THREE.PointsMaterial;
    const k = age / o.life;
    mat.size = o.size * (1 + o.grow * k);
    mat.opacity = Math.min(1, age * 8) * (1 - k) * (o.additive ? 1 : 0.55);
  }
}
