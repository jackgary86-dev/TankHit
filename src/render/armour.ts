import * as THREE from 'three';
import { MATERIALS } from '../sim/materials';
import type { MaterialId, Plate } from '../sim/types';

// ------------------------------------------------------------------ procedural surface maps

let rolledTex: THREE.Texture | null = null;
let castTex: THREE.Texture | null = null;

function canvasTex(size: number, fill: (x: number, y: number) => number, repeat: number): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.max(0, Math.min(255, Math.round(fill(x, y))));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  return t;
}

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/** Rolled plate: long faint mill streaks with fine grain. Used as roughness and bump. */
export function rolledMap(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  return (rolledTex ??= canvasTex(128, (x, y) => 170 + 30 * Math.sin(x * 0.35 + Math.sin(y * 0.05) * 2) + 25 * (hash(x, y) - 0.5) + 10 * Math.sin(y * 1.7), 3));
}

/** Cast steel: blotchy, pitted surface. */
export function castMap(): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  return (castTex ??= canvasTex(128, (x, y) => {
    let v = 180;
    for (let k = 0; k < 3; k++) {
      const f = 0.08 * (k + 1);
      v += (hash(Math.floor(x * f), Math.floor(y * f)) - 0.5) * 60 / (k + 1);
    }
    if (hash(x * 3, y * 7) > 0.985) v -= 90; // pits
    return v;
  }, 2));
}

// ------------------------------------------------------------------ materials

/** Painted armour plate: rolled or cast steel, ERA brick or thin skirt, tinted with the vehicle's paint. */
export function armourMaterial(p: Plate, paint: number): THREE.MeshStandardMaterial {
  const cast = p.mat === 'cast';
  const map = cast ? castMap() : rolledMap();
  const m = new THREE.MeshStandardMaterial({
    color: p.kind === 'era' ? 0x4f5a3c : paint,
    roughness: cast ? 0.85 : 0.62,
    metalness: p.kind === 'spaced' ? 0.55 : 0.35,
    roughnessMap: map ?? undefined,
    bumpMap: map ?? undefined,
    bumpScale: cast ? 0.012 : 0.004,
    side: THREE.DoubleSide,
  });
  return m;
}

/** Inner composite layer slab: coloured by material so a cut shows the stack as bands. */
export function layerMaterial(mat: MaterialId): THREE.MeshStandardMaterial {
  const info = MATERIALS[mat];
  const metal = mat === 'rha' || mat === 'hha' || mat === 'structural' || mat === 'cast';
  return new THREE.MeshStandardMaterial({
    color: info.color,
    roughness: mat === 'ceramic' ? 0.9 : mat === 'rubber' ? 0.95 : 0.55,
    metalness: metal ? 0.5 : 0.05,
    roughnessMap: metal ? (rolledMap() ?? undefined) : undefined,
    side: THREE.DoubleSide,
    transparent: mat === 'air',
    opacity: mat === 'air' ? 0.15 : 1,
  });
}

/**
 * X-ray shell: alpha rises toward grazing angles (fresnel) so plates stay solid at their silhouettes and edges
 * while the interior shows through the faces.
 */
export function xrayMaterial(color: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
    metalness: 0.2,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.2);
      gl_FragColor.a *= mix(0.07, 0.6, fres);`,
    );
  };
  m.customProgramCacheKey = () => 'tankhit-xray';
  return m;
}

/** Human-readable layer list for the hover panel. */
export function describeLayers(p: Plate): { name: string; mm: number }[] {
  const layers = p.layers ?? [{ mat: p.mat, mm: p.mm }];
  return layers.map((l) => ({ name: MATERIALS[l.mat].name, mm: l.mm }));
}
