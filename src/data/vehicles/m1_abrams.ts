import type { Layer, Vehicle } from '../../sim/types';
import { v3 } from '../../sim/vec';
import { ammoRow, box, dummy, frontQuad, hullPlates, mod, rack, skirt, turretPlates } from '../builder';

// Hull spans x -3.8..3.8, deck at y = 1.43. Long turret with an isolated ammunition bustle.
const TX = 0.0;
const TURRET_FRONT: Layer[] = [
  { mat: 'rha', mm: 50 },
  { mat: 'nera', mm: 350 },
  { mat: 'ceramic', mm: 100 },
  { mat: 'rha', mm: 50 },
];

export const M1_ABRAMS: Vehicle = {
  id: 'm1',
  name: 'M1 Abrams',
  nation: 'USA',
  br: '10.0',
  description: 'Burlington composite turret front, thin 82° upper plate, and main-gun ammo isolated in the turret bustle behind blast doors with blow-out panels.',
  plates: [
    ...hullPlates({
      length: 7.6, width: 2.3, clearance: 0.48, height: 0.95, noseY: 1.15,
      ufp: { mm: 50, run: 2.0 },
      lfp: { mm: 0, run: 0.67, layers: [{ mat: 'rha', mm: 40 }, { mat: 'nera', mm: 300 }, { mat: 'rha', mm: 40 }] },
      side: 30, rear: 30, roof: 30, floor: 25,
      ring: { x: TX, r: 1.0 },
    }),
    ...turretPlates({
      center: { x: TX, z: 0 }, y0: 1.43, y1: 2.2,
      poly: [[2.0, 0.55], [1.5, 1.05], [-1.2, 1.05], [-2.2, 0.9], [-2.2, -0.9], [-1.2, -1.05], [1.5, -1.05], [2.0, -0.55]],
      topScale: 0.96,
      front: { mm: 0, layers: TURRET_FRONT },
      cheek: { mm: 0, layers: TURRET_FRONT },
      side: { mm: 0, layers: [{ mat: 'rha', mm: 40 }, { mat: 'nera', mm: 80 }, { mat: 'rha', mm: 20 }] },
      rear: 30, roof: 40,
    }),
    frontQuad('t-mantlet', 'Gun mantlet', 'turret', TX + 2.05, 1.6, 2.05, -0.35, 0.35, 150),
    frontQuad('t-bulkhead', 'Ammo blast doors', 'turret', TX - 1.2, 1.45, 2.15, -1.0, 1.0, 25),
    skirt('sk-l', 'Composite side skirt (left)', 1.4, 3.6, 0.6, 1.4, 1.15 + 0.63 + 0.06, { mm: 0, layers: [{ mat: 'rha', mm: 10 }, { mat: 'nera', mm: 50 }, { mat: 'rha', mm: 10 }] }),
    skirt('sk-r', 'Composite side skirt (right)', 1.4, 3.6, 0.6, 1.4, -(1.15 + 0.63 + 0.06), { mm: 0, layers: [{ mat: 'rha', mm: 10 }, { mat: 'nera', mm: 50 }, { mat: 'rha', mm: 10 }] }),
  ],
  modules: [
    mod('engine', 'Engine (AGT1500 turbine)', 'engine', 'hull', box(v3(-3.6, 0.56, -0.8), v3(-2.1, 1.35, 0.8)), 150, 70),
    mod('transmission', 'Transmission', 'transmission', 'hull', box(v3(-3.78, 0.56, -1.0), v3(-3.6, 1.1, 1.0)), 120, 60),
    mod('fuel-l', 'Fuel tank (front left)', 'fuel', 'hull', box(v3(1.8, 0.6, 0.55), v3(3.0, 1.3, 1.1)), 80, 25),
    mod('fuel-r', 'Fuel tank (front right)', 'fuel', 'hull', box(v3(1.8, 0.6, -1.1), v3(3.0, 1.3, -0.55)), 80, 25),
    mod('ring', 'Turret ring', 'turretRing', 'turret', box(v3(TX - 1.0, 1.38, -1.0), v3(TX + 1.0, 1.45, 1.0)), 110, 30, 'y'),
    mod('breech', 'Gun breech (M68)', 'breech', 'turret', box(v3(TX + 0.4, 1.68, -0.17), v3(TX + 1.95, 1.98, 0.17)), 100, 90),
    mod('optics', 'Gunner primary sight', 'optics', 'turret', box(v3(TX + 1.2, 1.9, -0.75), v3(TX + 1.7, 2.1, -0.55)), 25, 8),
    mod('radio', 'Radio', 'radio', 'turret', box(v3(TX - 1.1, 1.6, 0.6), v3(TX - 0.8, 1.9, 0.95)), 30, 10),
    ...[1.62, 1.76, 1.9].flatMap((y, row) =>
      ammoRow({ rack: 'bustle', group: 'turret', start: v3(TX - 1.75, y, -0.77), step: v3(0, 0, 0.14), count: 12, axis: 'x', length: 0.95, dia: 0.12, families: ['APFSDS', 'APFSDS', 'HEAT'], propellant: 6.0, heFiller: 1.0, startIndex: row * 12 }),
    ),
    ...ammoRow({ rack: 'hull', group: 'hull', start: v3(0.9, 0.62, -0.9), step: v3(0, 0.14, 0), count: 3, axis: 'z', length: 0.95, dia: 0.12, families: ['APFSDS', 'HEAT'], propellant: 6.0, heFiller: 1.0 }),
  ],
  crew: [
    dummy('driver', 'driver', 'Driver', 'hull', v3(1.95, 0.55, 0), { recline: true, scale: 0.9 }),
    dummy('gunner', 'gunner', 'Gunner', 'turret', v3(TX + 0.65, 1.02, -0.5)),
    dummy('commander', 'commander', 'Commander', 'turret', v3(TX - 0.25, 1.2, -0.5)),
    dummy('loader', 'loader', 'Loader', 'turret', v3(TX - 0.1, 1.38, 0.5), { standing: true, scale: 0.9 }),
  ],
  turretPivot: v3(TX, 0, 0),
  racks: [rack('bustle', 'Turret bustle (isolated)', 6, true), rack('hull', 'Hull ready rack', 3)],
  visual: {
    hullLength: 7.6, hullWidth: 2.3, trackWidth: 0.63, groundClearance: 0.48,
    wheelCount: 7, wheelRadius: 0.32,
    barrel: { from: v3(TX + 2.05, 1.85, 0), length: 5.0, radius: 0.08 },
    color: 0x9a8a62,
  },
};
