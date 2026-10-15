import * as THREE from 'three';
import type { KillCell, KillGrid } from '../sim/killmap';

/** Blue (0 %) -> cyan -> yellow -> red (100 %). */
export function killColor(p: number): THREE.Color {
  const stops: [number, number][] = [[0, 0x2050ff], [0.25, 0x20c8ff], [0.5, 0xffe040], [0.75, 0xff7020], [1, 0xff2020]];
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i][0]) return new THREE.Color(stops[i - 1][1]).lerp(new THREE.Color(stops[i][1]), (p - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  }
  return new THREE.Color(0xff2020);
}

/** Camera-facing discs at each sampled impact point, coloured by kill probability. */
export class KillOverlay {
  readonly group = new THREE.Group();
  private cells: KillCell[] = [];
  private grid: KillGrid | null = null;
  private points: THREE.Points | null = null;

  reset(grid: KillGrid) {
    this.clear();
    this.grid = grid;
  }

  addRow(cells: KillCell[]) {
    this.cells.push(...cells);
    this.rebuild();
  }

  private rebuild() {
    if (!this.grid) return;
    this.points?.removeFromParent();
    this.points?.geometry.dispose();
    const n = this.cells.length;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.cells.forEach((c, k) => {
      pos.set([c.point.x, c.point.y, c.point.z], k * 3);
      const cc = killColor(c.p);
      col.set([cc.r, cc.g, cc.b], k * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: this.grid.cell * 2.4, vertexColors: true, transparent: true, opacity: 0.7, depthTest: false, depthWrite: false, sizeAttenuation: true, map: discSprite(), alphaTest: 0.2 });
    this.points = new THREE.Points(geo, mat);
    this.points.renderOrder = 8;
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  clear() {
    this.cells = [];
    this.points?.removeFromParent();
    this.points?.geometry.dispose();
    this.points = null;
  }

  get count() {
    return this.cells.length;
  }
}

let disc: THREE.Texture | null = null;
function discSprite(): THREE.Texture {
  if (disc) return disc;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(16, 16, 14, 0, Math.PI * 2);
  g.fill();
  disc = new THREE.CanvasTexture(c);
  return disc;
}
