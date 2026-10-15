import type { Layer, Vehicle } from '../../sim/types';
import { v3 } from '../../sim/vec';
import { ammoRow, box, dummy, frontQuad, hullPlates, mod, rack, skirt, turretPlates } from '../builder';

// Hull spans x -4.15..4.15, deck at y = 1.5. Chobham front, bagged charges in water-jacketed bins.
const TX = 0.2;
const TURRET_FRONT: Layer[] = [
  { mat: 'rha', mm: 60 },
  { mat: 'nera', mm: 450 },
  { mat: 'ceramic', mm: 150 },
  { mat: 'rha', mm: 60 },
];
const TURRET_SIDE: Layer[] = [
  { mat: 'rha', mm: 40 },
  { mat: 'nera', mm: 180 },
  { mat: 'rha', mm: 30 },
];

export const CHALLENGER_1: Vehicle = {
  id: 'chally1',
  name: 'Challenger 1',
  nation: 'UK',
  br: '10.0',
  description: 'Chobham composite over the front arc. Bagged propellant charges live in water-jacketed bins below the turret ring, so hull hits rarely brew up; projectiles are stowed separately in the turret.',
  plates: [
    ...hullPlates({
      length: 8.3, width: 2.5, clearance: 0.5, height: 1.0, noseY: 1.0,
      ufp: { mm: 0, run: 1.9, layers: [{ mat: 'rha', mm: 40 }, { mat: 'nera', mm: 400 }, { mat: 'ceramic', mm: 100 }, { mat: 'rha', mm: 40 }] },
      lfp: { mm: 0, run: 0.5, layers: [{ mat: 'rha', mm: 50 }, { mat: 'nera', mm: 200 }, { mat: 'rha', mm: 50 }] },
      side: 50, rear: 40, roof: 40, floor: 30,
      ring: { x: TX, r: 1.0 },
    }),
    ...turretPlates({
      center: { x: TX, z: 0 }, y0: 1.5, y1: 2.3,
      poly: [[1.7, 0.75], [1.1, 1.3], [-1.5, 1.3], [-1.9, 0.9], [-1.9, -0.9], [-1.5, -1.3], [1.1, -1.3], [1.7, -0.75]],
      topScale: 0.9,
      front: { mm: 0, layers: TURRET_FRONT },
      cheek: { mm: 0, layers: TURRET_FRONT },
      side: { mm: 0, layers: TURRET_SIDE },
      rear: 45, roof: 40,
    }),
    { ...frontQuad('t-mantlet', 'Gun mantlet', 'turret', TX + 1.75, 1.65, 2.15, -0.4, 0.4, { mm: 0, layers: [{ mat: 'rha', mm: 120 }, { mat: 'nera', mm: 220 }, { mat: 'rha', mm: 60 }] }), covers: ['t-7'] },
    skirt('sk-l', 'Composite skirt (left)', 1.2, 4.0, 0.55, 1.45, 1.25 + 0.65 + 0.06, { mm: 0, layers: [{ mat: 'rha', mm: 15 }, { mat: 'nera', mm: 80 }, { mat: 'rha', mm: 15 }] }),
    skirt('sk-r', 'Composite skirt (right)', 1.2, 4.0, 0.55, 1.45, -(1.25 + 0.65 + 0.06), { mm: 0, layers: [{ mat: 'rha', mm: 15 }, { mat: 'nera', mm: 80 }, { mat: 'rha', mm: 15 }] }),
  ],
  modules: [
    mod('engine', 'Engine (Condor V12)', 'engine', 'hull', box(v3(-4.0, 0.58, -0.9), v3(-2.2, 1.4, 0.9)), 160, 70),
    mod('transmission', 'Transmission (TN37)', 'transmission', 'hull', box(v3(-4.13, 0.58, -1.05), v3(-4.0, 1.1, 1.05)), 120, 60),
    mod('fuel-l', 'Fuel tank (rear left)', 'fuel', 'hull', box(v3(-2.1, 0.6, 0.8), v3(-1.0, 1.35, 1.2)), 80, 25),
    mod('fuel-r', 'Fuel tank (rear right)', 'fuel', 'hull', box(v3(-2.1, 0.6, -1.2), v3(-1.0, 1.35, -0.8)), 80, 25),
    mod('ring', 'Turret ring', 'turretRing', 'turret', box(v3(TX - 1.0, 1.45, -1.0), v3(TX + 1.0, 1.52, 1.0)), 110, 30, 'y'),
    mod('breech', 'Gun breech (L11A5)', 'breech', 'turret', box(v3(TX + 0.3, 1.75, -0.18), v3(TX + 1.7, 2.05, 0.18)), 100, 90),
    mod('optics', 'TOGS / gunner sight', 'optics', 'turret', box(v3(TX + 1.0, 2.0, -0.95), v3(TX + 1.5, 2.2, -0.7)), 25, 8),
    mod('radio', 'Radio', 'radio', 'turret', box(v3(TX - 1.6, 1.6, -0.9), v3(TX - 1.2, 1.9, -0.5)), 30, 10),
    // Bagged charges in water-jacketed bins below the ring (the 'wet' rack), projectiles in the turret.
    ...[0.6, 0.78].flatMap((y, row) =>
      ammoRow({ rack: 'charges', group: 'hull', start: v3(-0.9, y, 0.95), step: v3(0.16, 0, 0), count: 9, axis: 'z', length: 0.5, dia: 0.15, families: ['APFSDS', 'HESH'], propellant: 6.5, heFiller: 0, startIndex: row * 9 }),
    ),
    ...[0.6, 0.78].flatMap((y, row) =>
      ammoRow({ rack: 'charges', group: 'hull', start: v3(-0.9, y, -0.95), step: v3(0.16, 0, 0), count: 9, axis: 'z', length: 0.5, dia: 0.15, families: ['HESH', 'APFSDS'], propellant: 6.5, heFiller: 0, startIndex: 18 + row * 9 }),
    ),
    ...[1.62, 1.8].flatMap((y, row) =>
      ammoRow({ rack: 'projectiles', group: 'turret', start: v3(TX - 1.7, y, -0.5), step: v3(0, 0, 0.17), count: 7, axis: 'x', length: 0.6, dia: 0.12, families: ['HESH', 'APFSDS'], propellant: 0.05, heFiller: 4.0, startIndex: row * 7 }),
    ),
  ],
  crew: [
    dummy('driver', 'driver', 'Driver', 'hull', v3(2.1, 0.55, 0.0), { recline: true, scale: 0.9 }),
    dummy('gunner', 'gunner', 'Gunner', 'turret', v3(TX + 0.5, 1.05, -0.6)),
    dummy('commander', 'commander', 'Commander', 'turret', v3(TX - 0.35, 1.2, -0.6)),
    dummy('loader', 'loader', 'Loader', 'turret', v3(TX - 0.1, 1.42, 0.55), { standing: true, scale: 0.9 }),
  ],
  turretPivot: v3(TX, 0, 0),
  racks: [rack('charges', 'Charge bins (wet)', 10, false, true), rack('projectiles', 'Turret projectile stowage', 6)],
  visual: {
    hullLength: 8.3, hullWidth: 2.5, trackWidth: 0.65, groundClearance: 0.5,
    wheelCount: 6, wheelRadius: 0.4,
    barrel: { from: v3(TX + 1.75, 1.9, 0), length: 6.6, radius: 0.085 },
    color: 0x6b6a52,
  },
};
