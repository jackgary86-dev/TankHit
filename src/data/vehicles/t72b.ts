import type { Layer, Module, Plate, Vehicle } from '../../sim/types';
import { v3 } from '../../sim/vec';
import { ammoRow, box, boxC, dummy, eraOnPlate, frontQuad, hullPlates, mod, rack, skirt, turretPlates } from '../builder';

// Hull spans x -3.35..3.35, deck at y = 1.32. Low dome turret over a carousel autoloader.
const TX = 0.35;
const TURRET_FRONT: Layer[] = [
  { mat: 'cast', mm: 200 },
  { mat: 'nera', mm: 200 },
  { mat: 'cast', mm: 150 },
];

const hull = hullPlates({
  length: 6.7, width: 2.1, clearance: 0.47, height: 0.85, noseY: 0.98,
  ufp: { mm: 0, run: 0.84, layers: [{ mat: 'rha', mm: 16 }, { mat: 'rha', mm: 60 }, { mat: 'textolite', mm: 105 }, { mat: 'rha', mm: 50 }] },
  lfp: { mm: 80, run: 0.88 },
  side: 80, rear: 40, roof: 20, floor: 20,
});
const turret = turretPlates({
  center: { x: TX, z: 0 }, y0: 1.32, y1: 2.0,
  poly: [[1.4, 0.6], [0.9, 1.05], [-0.6, 1.1], [-1.2, 0.75], [-1.3, 0], [-1.2, -0.75], [-0.6, -1.1], [0.9, -1.05], [1.4, -0.6]],
  topScale: 0.7,
  front: { mm: 0, layers: TURRET_FRONT },
  cheek: { mm: 0, layers: TURRET_FRONT },
  side: { mm: 200, mat: 'cast' },
  rear: { mm: 70, mat: 'cast' },
  roof: { mm: 45, mat: 'cast' },
  mat: 'cast',
});
const ufp = hull.find((p) => p.id === 'h-ufp')!;
const era: Plate[] = [
  ...eraOnPlate(ufp, 2, 5, 'era-ufp', 0.05),
  ...turret.filter((p) => p.name.startsWith('Turret cheek') || p.name === 'Turret front').flatMap((p, i) => eraOnPlate(p, 2, 3, `era-t${i}`, 0.06)),
];

/** 22 cassettes around the carousel under the turret, laid flat. */
function carousel(): Module[] {
  const out: Module[] = [];
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = ((i + 1) / (n + 2)) * Math.PI * 2 + Math.PI; // gap facing the driver
    const c = v3(TX + Math.cos(a) * 0.72, 0.6, Math.sin(a) * 0.72);
    const alongX = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a));
    const fam = i % 3 === 0 ? 'HE' : i % 3 === 1 ? 'APFSDS' : 'HEAT';
    out.push({
      id: `carousel-${i}`, name: `${fam} round (carousel)`, type: 'ammo', group: 'hull',
      box: boxC(c, alongX ? v3(0.42, 0.13, 0.13) : v3(0.13, 0.13, 0.42)),
      cyl: alongX ? 'x' : 'z', hp: 25, absorb: 20,
      ammo: { rack: 'carousel', roundFamily: fam, propellant: 5.0, filler: fam === 'HE' ? 3.4 : fam === 'HEAT' ? 1.7 : 0 },
    });
  }
  return out;
}

export const T72B: Vehicle = {
  id: 't72b',
  name: 'T-72B',
  nation: 'USSR',
  br: '9.7',
  description: 'Textolite-sandwich glacis and "Super Dolly Parton" turret under Kontakt-1 ERA. 22 rounds sit in the carousel autoloader under the crew – notoriously prone to cooking off.',
  plates: [
    ...hull,
    ...turret,
    ...era,
    frontQuad('t-mantlet', 'Gun mantlet', 'turret', TX + 1.45, 1.5, 1.85, -0.3, 0.3, 200, 'cast'),
    skirt('sk-l', 'Rubber side skirt (left)', -3.0, 3.0, 0.75, 1.3, 1.05 + 0.58 + 0.04, { mm: 10, mat: 'rubber' }),
    skirt('sk-r', 'Rubber side skirt (right)', -3.0, 3.0, 0.75, 1.3, -(1.05 + 0.58 + 0.04), { mm: 10, mat: 'rubber' }),
  ],
  modules: [
    mod('engine', 'Engine (V-84)', 'engine', 'hull', box(v3(-3.1, 0.52, -0.75), v3(-1.7, 1.25, 0.75)), 140, 70),
    mod('transmission', 'Transmission', 'transmission', 'hull', box(v3(-3.33, 0.52, -0.95), v3(-3.1, 1.0, 0.95)), 120, 60),
    mod('fuel-r', 'Fuel tank / rack (front right)', 'fuel', 'hull', box(v3(1.4, 0.55, -1.02), v3(2.3, 1.25, -0.72)), 70, 25),
    mod('fuel-l', 'Fuel tank (front left)', 'fuel', 'hull', box(v3(1.4, 0.55, 0.72), v3(2.3, 1.25, 1.02)), 70, 25),
    mod('autoloader', 'Autoloader mechanism', 'autoloader', 'hull', box(v3(TX - 0.25, 0.5, -0.25), v3(TX + 0.25, 0.75, 0.25)), 80, 40, 'y'),
    mod('ring', 'Turret ring', 'turretRing', 'turret', box(v3(TX - 0.95, 1.27, -0.95), v3(TX + 0.95, 1.34, 0.95)), 100, 30, 'y'),
    mod('breech', 'Gun breech (2A46M)', 'breech', 'turret', box(v3(TX + 0.0, 1.55, -0.18), v3(TX + 1.4, 1.83, 0.18)), 100, 90),
    mod('optics', 'Gunner sight (1A40)', 'optics', 'turret', box(v3(TX + 0.7, 1.8, 0.4), v3(TX + 1.1, 1.95, 0.55)), 20, 8),
    ...carousel(),
    ...ammoRow({ rack: 'hull', group: 'hull', start: v3(1.55, 0.78, -0.62), step: v3(0.15, 0, 0), count: 5, axis: 'y', length: 0.45, dia: 0.13, families: ['HE', 'APFSDS', 'HEAT'], propellant: 5.0, heFiller: 3.4 }),
  ],
  crew: [
    dummy('driver', 'driver', 'Driver', 'hull', v3(1.55, 0.5, 0), { recline: true, scale: 0.85 }),
    dummy('gunner', 'gunner', 'Gunner', 'turret', v3(TX + 0.1, 1.0, 0.45)),
    dummy('commander', 'commander', 'Commander', 'turret', v3(TX + 0.0, 1.0, -0.45)),
  ],
  racks: [rack('carousel', 'Carousel autoloader', 3), rack('hull', 'Hull racks', 3)],
  visual: {
    hullLength: 6.7, hullWidth: 2.1, trackWidth: 0.58, groundClearance: 0.47,
    wheelCount: 6, wheelRadius: 0.38,
    barrel: { from: v3(TX + 1.45, 1.68, 0), length: 6.0, radius: 0.085 },
    color: 0x55603f,
  },
};
