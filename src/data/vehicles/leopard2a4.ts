import type { Layer, Vehicle } from '../../sim/types';
import { v3 } from '../../sim/vec';
import { ammoRow, box, dummy, frontQuad, hullPlates, mod, rack, skirt, turretPlates } from '../builder';

// Hull spans x -3.85..3.85, deck at y = 1.45. Slab-sided turret with the bustle on the left rear.
const TX = 0.3;
const TURRET_FRONT: Layer[] = [
  { mat: 'rha', mm: 60 },
  { mat: 'nera', mm: 450 },
  { mat: 'ceramic', mm: 150 },
  { mat: 'rha', mm: 60 },
];
const TURRET_SIDE: Layer[] = [
  { mat: 'rha', mm: 40 },
  { mat: 'nera', mm: 150 },
  { mat: 'rha', mm: 30 },
];

export const LEOPARD_2A4: Vehicle = {
  id: 'leo2a4',
  name: 'Leopard 2A4',
  nation: 'Germany',
  br: '10.3',
  description: 'Spaced multi-layer turret and glacis, heavy front skirts. Fifteen rounds sit in an isolated bustle with blow-out panels – but 27 more are racked in the hull beside the driver.',
  plates: [
    ...hullPlates({
      length: 7.7, width: 2.4, clearance: 0.5, height: 0.95, noseY: 1.05,
      ufp: { mm: 0, run: 2.3, layers: [{ mat: 'rha', mm: 30 }, { mat: 'nera', mm: 300 }, { mat: 'rha', mm: 40 }] },
      lfp: { mm: 0, run: 0.6, layers: [{ mat: 'rha', mm: 40 }, { mat: 'nera', mm: 250 }, { mat: 'rha', mm: 40 }] },
      side: 35, rear: 25, roof: 25, floor: 20,
      ring: { x: TX, r: 1.0 },
    }),
    ...turretPlates({
      center: { x: TX, z: 0 }, y0: 1.45, y1: 2.25,
      poly: [[1.6, 0.7], [1.0, 1.3], [-1.6, 1.3], [-1.8, 0.9], [-1.8, -0.9], [-1.6, -1.3], [1.0, -1.3], [1.6, -0.7]],
      topScale: 0.95,
      front: { mm: 0, layers: TURRET_FRONT },
      cheek: { mm: 0, layers: TURRET_FRONT },
      side: { mm: 0, layers: TURRET_SIDE },
      rear: 40, roof: 40,
    }),
    { ...frontQuad('t-mantlet', 'Gun mantlet', 'turret', TX + 1.65, 1.6, 2.1, -0.4, 0.4, { mm: 0, layers: [{ mat: 'rha', mm: 120 }, { mat: 'nera', mm: 200 }, { mat: 'rha', mm: 60 }] }), covers: ['t-7'] },
    frontQuad('t-bulkhead', 'Bustle blast door', 'turret', TX - 1.0, 1.5, 2.2, 0.0, 1.25, 20),
    skirt('sk-l', 'Heavy front skirt (left)', 1.4, 3.8, 0.55, 1.45, 1.2 + 0.65 + 0.06, { mm: 0, layers: [{ mat: 'rha', mm: 20 }, { mat: 'nera', mm: 90 }, { mat: 'rha', mm: 20 }] }),
    skirt('sk-r', 'Heavy front skirt (right)', 1.4, 3.8, 0.55, 1.45, -(1.2 + 0.65 + 0.06), { mm: 0, layers: [{ mat: 'rha', mm: 20 }, { mat: 'nera', mm: 90 }, { mat: 'rha', mm: 20 }] }),
    skirt('sk-l2', 'Rubber skirt (left)', -3.7, 1.4, 0.8, 1.45, 1.2 + 0.65 + 0.04, { mm: 10, mat: 'rubber' }),
    skirt('sk-r2', 'Rubber skirt (right)', -3.7, 1.4, 0.8, 1.45, -(1.2 + 0.65 + 0.04), { mm: 10, mat: 'rubber' }),
  ],
  modules: [
    mod('engine', 'Engine (MB 873)', 'engine', 'hull', box(v3(-3.6, 0.58, -0.9), v3(-1.9, 1.38, 0.9)), 160, 70),
    mod('transmission', 'Transmission (Renk)', 'transmission', 'hull', box(v3(-3.83, 0.58, -1.05), v3(-3.6, 1.1, 1.05)), 120, 60),
    mod('fuel-l', 'Fuel tank (rear left)', 'fuel', 'hull', box(v3(-1.85, 0.6, 0.75), v3(-0.9, 1.35, 1.15)), 80, 25),
    mod('fuel-r', 'Fuel tank (rear right)', 'fuel', 'hull', box(v3(-1.85, 0.6, -1.15), v3(-0.9, 1.35, -0.75)), 80, 25),
    mod('ring', 'Turret ring', 'turretRing', 'turret', box(v3(TX - 1.0, 1.4, -1.0), v3(TX + 1.0, 1.47, 1.0)), 110, 30, 'y'),
    mod('breech', 'Gun breech (Rh-120 L/44)', 'breech', 'turret', box(v3(TX + 0.2, 1.72, -0.18), v3(TX + 1.6, 2.02, 0.18)), 100, 90),
    mod('optics', 'EMES-15 gunner sight', 'optics', 'turret', box(v3(TX + 1.1, 2.0, -0.95), v3(TX + 1.55, 2.2, -0.7)), 25, 8),
    mod('radio', 'Radio', 'radio', 'turret', box(v3(TX - 1.5, 1.6, -0.9), v3(TX - 1.1, 1.9, -0.5)), 30, 10),
    // Bustle: 15 rounds behind the blast door, blow-out panels above.
    ...[1.62, 1.78, 1.94].flatMap((y, row) =>
      ammoRow({ rack: 'bustle', group: 'turret', start: v3(TX - 1.55, y, 0.2), step: v3(0, 0, 0.17), count: 5, axis: 'x', length: 0.98, dia: 0.13, families: ['APFSDS', 'HEAT', 'APFSDS'], propellant: 7.0, heFiller: 1.7, startIndex: row * 5 }),
    ),
    // Hull rack: 27 rounds standing beside the driver, front left – no isolation.
    ...[0.62, 0.78, 0.94].flatMap((y, row) =>
      ammoRow({ rack: 'hull', group: 'hull', start: v3(2.95, y, 0.15), step: v3(-0.17, 0, 0), count: 9, axis: 'z', length: 0.98, dia: 0.13, families: ['APFSDS', 'APFSDS', 'HEAT'], propellant: 7.0, heFiller: 1.7, startIndex: row * 9 }),
    ),
  ],
  crew: [
    dummy('driver', 'driver', 'Driver', 'hull', v3(2.1, 0.55, -0.55), { recline: true, scale: 0.9 }),
    dummy('gunner', 'gunner', 'Gunner', 'turret', v3(TX + 0.6, 1.05, -0.6)),
    dummy('commander', 'commander', 'Commander', 'turret', v3(TX - 0.35, 1.2, -0.6)),
    dummy('loader', 'loader', 'Loader', 'turret', v3(TX - 0.1, 1.4, 0.55), { standing: true, scale: 0.9 }),
  ],
  turretPivot: v3(TX, 0, 0),
  racks: [rack('bustle', 'Turret bustle (isolated)', 6, true), rack('hull', 'Hull rack beside the driver', 5)],
  visual: {
    hullLength: 7.7, hullWidth: 2.4, trackWidth: 0.65, groundClearance: 0.5,
    wheelCount: 7, wheelRadius: 0.35,
    barrel: { from: v3(TX + 1.65, 1.9, 0), length: 5.3, radius: 0.085 },
    color: 0x5c6b4a,
  },
};
