import type { Vehicle } from '../../sim/types';
import { v3 } from '../../sim/vec';
import { ammoRow, box, dummy, frontQuad, hullPlates, mod, rack, turretPlates } from '../builder';

// Hull spans x -2.95..2.95, deck at y = 1.65 (tall hull). Wet-stowage racks under the turret floor.
const TX = 0.5;

export const M4A3: Vehicle = {
  id: 'm4a3',
  name: 'M4A3 (76) W',
  nation: 'USA',
  br: '5.3',
  description: 'Tall, moderately sloped 63 mm glacis and a 76 mm T23 turret. "Wet" stowage keeps the main-gun ammunition in water-jacketed floor racks, so hits are far less likely to brew the tank up.',
  plates: [
    ...hullPlates({
      length: 5.9, width: 2.2, clearance: 0.45, height: 1.2, noseY: 0.95,
      ufp: { mm: 63.5, run: 0.75 },
      lfp: { mm: 51, run: 0.5, mat: 'cast' },
      side: 38, rear: 38, roof: 19, floor: 19,
      ring: { x: TX, r: 0.85 },
    }),
    ...turretPlates({
      center: { x: TX, z: 0 }, y0: 1.65, y1: 2.4,
      poly: [[1.0, 0.5], [0.5, 0.95], [-0.8, 1.0], [-1.3, 0.7], [-1.3, -0.7], [-0.8, -1.0], [0.5, -0.95], [1.0, -0.5]],
      topScale: 0.85,
      front: 63.5, cheek: 63.5, side: 63.5, rear: 63.5, roof: 25,
      mat: 'cast',
    }),
    { ...frontQuad('t-mantlet', 'Gun mantlet (T23)', 'turret', TX + 1.05, 1.75, 2.3, -0.45, 0.45, 89, 'cast'), covers: ['t-7'] },
    // Hatch hoods on the glacis for the driver and assistant driver.
    { ...frontQuad('h-hatch-l', "Driver's hatch hood", 'hull', 2.45, 1.45, 1.7, 0.3, 0.7, 51, 'cast'), covers: ['h-ufp'] },
    { ...frontQuad('h-hatch-r', "Assistant driver's hatch hood", 'hull', 2.45, 1.45, 1.7, -0.7, -0.3, 51, 'cast'), covers: ['h-ufp'] },
  ],
  modules: [
    mod('engine', 'Engine (Ford GAA)', 'engine', 'hull', box(v3(-2.75, 0.55, -0.7), v3(-1.3, 1.5, 0.7)), 140, 70),
    mod('transmission', 'Transmission (nose)', 'transmission', 'hull', box(v3(2.0, 0.5, -0.5), v3(2.85, 1.0, 0.5)), 120, 60),
    mod('fuel-l', 'Fuel tank (left sponson)', 'fuel', 'hull', box(v3(-2.7, 1.0, 0.75), v3(-1.3, 1.6, 1.05)), 70, 25),
    mod('fuel-r', 'Fuel tank (right sponson)', 'fuel', 'hull', box(v3(-2.7, 1.0, -1.05), v3(-1.3, 1.6, -0.75)), 70, 25),
    mod('radio', 'Radio (bustle)', 'radio', 'turret', box(v3(TX - 1.25, 1.85, -0.3), v3(TX - 0.95, 2.1, 0.3)), 30, 10),
    mod('ring', 'Turret ring', 'turretRing', 'turret', box(v3(TX - 0.85, 1.6, -0.85), v3(TX + 0.85, 1.67, 0.85)), 100, 30, 'y'),
    mod('breech', 'Gun breech (M1A2 76 mm)', 'breech', 'turret', box(v3(TX + 0.15, 1.9, -0.15), v3(TX + 1.0, 2.15, 0.15)), 90, 90),
    mod('optics', 'M71D gunner sight', 'optics', 'turret', box(v3(TX + 0.6, 2.05, -0.4), v3(TX + 0.95, 2.2, -0.28)), 20, 8),
    // Wet stowage: 71 rounds in water-jacketed racks under the turret floor.
    ...[0.52, 0.66].flatMap((y, row) =>
      ammoRow({ rack: 'wet-l', group: 'hull', start: v3(-0.9, y, 0.25), step: v3(0.13, 0, 0), count: 14, axis: 'z', length: 0.9, dia: 0.1, families: ['AP', 'HE', 'AP'], propellant: 1.6, heFiller: 0.39, startIndex: row * 14 }),
    ),
    ...[0.52, 0.66].flatMap((y, row) =>
      ammoRow({ rack: 'wet-r', group: 'hull', start: v3(-0.9, y, -0.25), step: v3(0.13, 0, 0), count: 14, axis: 'z', length: 0.9, dia: 0.1, families: ['HE', 'AP', 'AP'], propellant: 1.6, heFiller: 0.39, startIndex: row * 14 }),
    ),
  ],
  crew: [
    dummy('driver', 'driver', 'Driver', 'hull', v3(1.7, 0.6, 0.5), { recline: true, scale: 0.9 }),
    dummy('radioman', 'radioman', 'Assistant driver', 'hull', v3(1.7, 0.6, -0.5), { recline: true, scale: 0.9 }),
    dummy('gunner', 'gunner', 'Gunner', 'turret', v3(TX + 0.15, 1.25, -0.5)),
    dummy('commander', 'commander', 'Commander', 'turret', v3(TX - 0.65, 1.4, -0.45)),
    dummy('loader', 'loader', 'Loader', 'turret', v3(TX - 0.1, 1.55, 0.5), { standing: true, scale: 0.9 }),
  ],
  turretPivot: v3(TX, 0, 0),
  racks: [rack('wet-l', 'Wet floor rack (left)', 12, false, true), rack('wet-r', 'Wet floor rack (right)', 12, false, true)],
  visual: {
    hullLength: 5.9, hullWidth: 2.2, trackWidth: 0.42, groundClearance: 0.45,
    wheelCount: 6, wheelRadius: 0.3,
    barrel: { from: v3(TX + 1.05, 2.0, 0), length: 4.0, radius: 0.06 },
    color: 0x5f6b45,
  },
};
