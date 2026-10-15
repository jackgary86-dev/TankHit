import type { Vehicle } from '../../sim/types';
import { v3 } from '../../sim/vec';
import { ammoRow, box, dummy, frontQuad, hullPlates, mod, rack, turretPlates } from '../builder';

// Hull spans x -3.22..3.22, deck at y = 1.3. Low silhouette, heavy cast turret, ammunition beside the driver.
const TX = 0.3;

export const T55: Vehicle = {
  id: 't55',
  name: 'T-55',
  nation: 'USSR',
  br: '8.0',
  description: '100 mm glacis at 60°, a thick cast turret and a very low profile. Eighteen rounds stand in a rack beside the driver, right behind the glacis.',
  plates: [
    ...hullPlates({
      length: 6.45, width: 2.3, clearance: 0.42, height: 0.88, noseY: 0.7,
      ufp: { mm: 100, run: 1.04 },
      lfp: { mm: 100, run: 0.4 },
      side: 80, rear: 45, roof: 30, floor: 20,
      ring: { x: TX, r: 0.95 },
    }),
    ...turretPlates({
      center: { x: TX, z: 0 }, y0: 1.3, y1: 1.95,
      poly: [[1.3, 0.55], [0.85, 1.0], [-0.5, 1.1], [-1.15, 0.7], [-1.25, 0], [-1.15, -0.7], [-0.5, -1.1], [0.85, -1.0], [1.3, -0.55]],
      topScale: 0.6,
      front: 200, cheek: 180, side: 150, rear: 60, roof: 30,
      mat: 'cast',
    }),
    { ...frontQuad('t-mantlet', 'Gun mount', 'turret', TX + 1.35, 1.42, 1.8, -0.3, 0.3, 200, 'cast'), covers: ['t-8'] },
  ],
  modules: [
    mod('engine', 'Engine (V-55)', 'engine', 'hull', box(v3(-3.0, 0.5, -0.75), v3(-1.6, 1.25, 0.75)), 140, 70),
    mod('transmission', 'Transmission', 'transmission', 'hull', box(v3(-3.2, 0.5, -0.95), v3(-3.0, 1.0, 0.95)), 120, 60),
    mod('fuel-l', 'Fuel tank (front left)', 'fuel', 'hull', box(v3(1.3, 0.5, 0.75), v3(2.4, 1.2, 1.1)), 70, 25),
    mod('fuel-r', 'Fuel/ammo (front right)', 'fuel', 'hull', box(v3(0.4, 0.5, -1.12), v3(1.4, 1.2, -0.85)), 70, 25),
    mod('ring', 'Turret ring', 'turretRing', 'turret', box(v3(TX - 0.95, 1.25, -0.95), v3(TX + 0.95, 1.32, 0.95)), 100, 30, 'y'),
    mod('breech', 'Gun breech (D-10T2S)', 'breech', 'turret', box(v3(TX + 0.0, 1.5, -0.17), v3(TX + 1.3, 1.78, 0.17)), 100, 90),
    mod('optics', 'TSh-2B gunner sight', 'optics', 'turret', box(v3(TX + 0.7, 1.75, 0.35), v3(TX + 1.05, 1.9, 0.48)), 20, 8),
    // The front rack: 18 rounds standing beside the driver.
    ...[0.0, 0.17, 0.34].flatMap((dz, row) =>
      ammoRow({ rack: 'front', group: 'hull', start: v3(1.55, 0.5, -0.5 - dz), step: v3(0.14, 0, 0), count: 6, axis: 'y', length: 0.9, dia: 0.13, families: ['APHE', 'HE', 'HEAT'], propellant: 5.5, heFiller: 1.46, startIndex: row * 6 }),
    ),
    ...ammoRow({ rack: 'rear', group: 'hull', start: v3(-1.3, 0.55, -0.6), step: v3(0, 0, 0.14), count: 9, axis: 'x', length: 0.9, dia: 0.13, families: ['HE', 'APHE'], propellant: 5.5, heFiller: 1.46 }),
  ],
  crew: [
    dummy('driver', 'driver', 'Driver', 'hull', v3(1.6, 0.48, 0.55), { recline: true, scale: 0.85 }),
    dummy('gunner', 'gunner', 'Gunner', 'turret', v3(TX + 0.15, 0.95, 0.45)),
    dummy('commander', 'commander', 'Commander', 'turret', v3(TX - 0.5, 0.98, 0.42)),
    dummy('loader', 'loader', 'Loader', 'turret', v3(TX - 0.2, 1.12, -0.45), { standing: true, scale: 0.85 }),
  ],
  turretPivot: v3(TX, 0, 0),
  racks: [rack('front', 'Front hull rack', 5), rack('rear', 'Rear floor rack', 4)],
  visual: {
    hullLength: 6.45, hullWidth: 2.3, trackWidth: 0.58, groundClearance: 0.42,
    wheelCount: 5, wheelRadius: 0.41,
    barrel: { from: v3(TX + 1.35, 1.62, 0), length: 5.6, radius: 0.07 },
    color: 0x55603f,
  },
};
