import type { Vehicle } from '../../sim/types';
import { v3 } from '../../sim/vec';
import { ammoRow, box, dummy, frontQuad, hullPlates, mod, rack, turretPlates } from '../builder';

// Hull spans x -3.1..3.1, deck at y = 1.3. Pike nose and a low cast dome turret.
const TX = 0.3;

export const IS3: Vehicle = {
  id: 'is3',
  name: 'IS-3',
  nation: 'USSR',
  br: '7.7',
  description: 'Thick cast steel at extreme angles: a "pike nose" glacis and a flattened dome turret that throws shots off at odd angles.',
  plates: [
    ...hullPlates({
      length: 6.2, width: 2.0, clearance: 0.45, height: 0.85, noseY: 0.95,
      ufp: { mm: 110, run: 1.1 },
      lfp: { mm: 110, run: 0.6 },
      side: 90, rear: 60, roof: 20, floor: 20,
      pike: true,
    }),
    ...turretPlates({
      center: { x: TX, z: 0 }, y0: 1.3, y1: 1.95,
      poly: [[1.25, 0.45], [0.95, 0.95], [0.2, 1.2], [-0.7, 1.1], [-1.2, 0.55], [-1.25, 0], [-1.2, -0.55], [-0.7, -1.1], [0.2, -1.2], [0.95, -0.95], [1.25, -0.45]],
      topScale: 0.55,
      front: 250, cheek: 220, side: 160, rear: 100, roof: 30,
      mat: 'cast',
    }),
    frontQuad('t-mantlet', 'Gun mantlet (Saukopf)', 'turret', TX + 1.3, 1.45, 1.8, -0.3, 0.3, 250, 'cast'),
  ],
  modules: [
    mod('engine', 'Engine (V-11)', 'engine', 'hull', box(v3(-2.9, 0.5, -0.7), v3(-1.5, 1.2, 0.7)), 140, 70),
    mod('transmission', 'Transmission', 'transmission', 'hull', box(v3(-3.08, 0.5, -0.85), v3(-2.9, 1.0, 0.85)), 120, 60),
    mod('fuel-l', 'Fuel tank (left)', 'fuel', 'hull', box(v3(-1.4, 0.75, 0.72), v3(-0.3, 1.25, 0.97)), 70, 25),
    mod('fuel-r', 'Fuel tank (right)', 'fuel', 'hull', box(v3(-1.4, 0.75, -0.97), v3(-0.3, 1.25, -0.72)), 70, 25),
    mod('ring', 'Turret ring', 'turretRing', 'turret', box(v3(TX - 0.85, 1.25, -0.85), v3(TX + 0.85, 1.32, 0.85)), 100, 30, 'y'),
    mod('breech', 'Gun breech (D-25T)', 'breech', 'turret', box(v3(TX - 0.2, 1.48, -0.17), v3(TX + 1.2, 1.76, 0.17)), 100, 90),
    mod('optics', 'Gunner sight', 'optics', 'turret', box(v3(TX + 0.7, 1.7, 0.3), v3(TX + 1.0, 1.82, 0.42)), 20, 8),
    // Two-piece ammunition: projectiles in the turret rear, charges along the hull floor.
    ...ammoRow({ rack: 'turret', group: 'turret', start: v3(TX - 1.0, 1.5, 0), step: v3(0.13, 0, 0), count: 3, axis: 'z', length: 0.6, dia: 0.13, families: ['APHE', 'HE'], propellant: 0.2, heFiller: 3.6 }),
    ...ammoRow({ rack: 'turret', group: 'turret', start: v3(TX - 1.0, 1.64, 0), step: v3(0.13, 0, 0), count: 3, axis: 'z', length: 0.6, dia: 0.13, families: ['HE', 'APHE'], propellant: 0.2, heFiller: 3.6, startIndex: 3 }),
    ...ammoRow({ rack: 'charges', group: 'hull', start: v3(-0.5, 0.53, -0.7), step: v3(0, 0, 0.14), count: 11, axis: 'x', length: 0.7, dia: 0.14, families: ['AP'], propellant: 7.0, heFiller: 0 }),
  ],
  crew: [
    dummy('driver', 'driver', 'Driver', 'hull', v3(1.45, 0.5, 0), { recline: true, scale: 0.88 }),
    dummy('gunner', 'gunner', 'Gunner', 'turret', v3(TX + 0.05, 0.95, 0.45)),
    dummy('commander', 'commander', 'Commander', 'turret', v3(TX - 0.6, 0.95, 0.4)),
    dummy('loader', 'loader', 'Loader', 'turret', v3(TX - 0.3, 1.12, -0.45), { standing: true, scale: 0.88 }),
  ],
  racks: [rack('turret', 'Turret projectile rack', 4), rack('charges', 'Floor propellant charges', 5)],
  visual: {
    hullLength: 6.2, hullWidth: 2.0, trackWidth: 0.58, groundClearance: 0.45,
    wheelCount: 6, wheelRadius: 0.36,
    barrel: { from: v3(TX + 1.3, 1.62, 0), length: 5.5, radius: 0.08 },
    color: 0x4e5a3c,
  },
};
