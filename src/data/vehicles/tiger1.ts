import type { Vehicle } from '../../sim/types';
import { v3 } from '../../sim/vec';
import { ammoRow, box, dummy, frontQuad, hullPlates, mod, rack, turretPlates } from '../builder';

// Hull spans x -3.15..3.15, deck at y = 1.52. Nearly vertical slabs; gearbox in the nose.
const TX = 0.4;

export const TIGER_I: Vehicle = {
  id: 'tiger1',
  name: 'Tiger I',
  nation: 'Germany',
  br: '6.0',
  description: 'Thick but unsloped plates: 100 mm front, 80 mm sides. Ninety-two 88 mm rounds are packed into the hull sponsons either side of the fighting compartment.',
  plates: [
    ...hullPlates({
      length: 6.3, width: 2.4, clearance: 0.47, height: 1.05, noseY: 0.95,
      ufp: { mm: 100, run: 0.1 },
      lfp: { mm: 100, run: 0.2 },
      side: 80, rear: 80, roof: 25, floor: 25,
      ring: { x: TX, r: 0.95 },
    }),
    ...turretPlates({
      center: { x: TX, z: 0 }, y0: 1.52, y1: 2.25,
      poly: [[1.0, 0.55], [0.6, 0.95], [-0.9, 0.95], [-1.2, 0.6], [-1.2, -0.6], [-0.9, -0.95], [0.6, -0.95], [1.0, -0.55]],
      topScale: 0.92,
      front: 100, cheek: 100, side: 80, rear: 80, roof: 25,
    }),
    { ...frontQuad('t-mantlet', 'Gun mantlet', 'turret', TX + 1.05, 1.6, 2.15, -0.5, 0.5, 120), covers: ['t-7'] },
    // Driver's visor and the hull MG ball – the classic Tiger weak spots.
    { ...frontQuad('h-visor', "Driver's visor", 'hull', 3.17, 1.2, 1.35, 0.3, 0.6, 70), covers: ['h-ufp'] },
    { ...frontQuad('h-mg', 'Hull MG ball mount', 'hull', 3.2, 1.05, 1.35, -0.65, -0.35, 80, 'cast'), covers: ['h-ufp'] },
  ],
  modules: [
    mod('engine', 'Engine (Maybach HL 230)', 'engine', 'hull', box(v3(-2.9, 0.55, -0.7), v3(-1.4, 1.4, 0.7)), 150, 70),
    mod('transmission', 'Gearbox (Maybach OLVAR)', 'transmission', 'hull', box(v3(1.9, 0.55, -0.4), v3(3.05, 1.1, 0.4)), 130, 60),
    mod('fuel-l', 'Fuel tank (rear left)', 'fuel', 'hull', box(v3(-3.0, 0.55, 0.75), v3(-1.5, 1.4, 1.15)), 80, 25),
    mod('fuel-r', 'Fuel tank (rear right)', 'fuel', 'hull', box(v3(-3.0, 0.55, -1.15), v3(-1.5, 1.4, -0.75)), 80, 25),
    mod('radio', 'Radio', 'radio', 'hull', box(v3(2.2, 1.15, -1.0), v3(2.6, 1.4, -0.6)), 30, 10),
    mod('ring', 'Turret ring', 'turretRing', 'turret', box(v3(TX - 0.95, 1.47, -0.95), v3(TX + 0.95, 1.54, 0.95)), 110, 30, 'y'),
    mod('breech', 'Gun breech (KwK 36)', 'breech', 'turret', box(v3(TX + 0.1, 1.75, -0.17), v3(TX + 1.0, 2.05, 0.17)), 100, 90),
    mod('optics', 'TZF 9b gunner sight', 'optics', 'turret', box(v3(TX + 0.6, 1.95, 0.3), v3(TX + 0.95, 2.1, 0.42)), 20, 8),
    // Sponson bins either side of the fighting compartment, two layers deep.
    ...[0.95, 1.12, 1.29].flatMap((y, row) =>
      ammoRow({ rack: 'sponson-l', group: 'hull', start: v3(-1.3, y, 1.0), step: v3(0.13, 0, 0), count: 16, axis: 'z', length: 0.93, dia: 0.11, families: ['APHE', 'HE', 'APHE'], propellant: 2.4, heFiller: 0.9, startIndex: row * 16 }),
    ),
    ...[0.95, 1.12, 1.29].flatMap((y, row) =>
      ammoRow({ rack: 'sponson-r', group: 'hull', start: v3(-1.3, y, -1.0), step: v3(0.13, 0, 0), count: 16, axis: 'z', length: 0.93, dia: 0.11, families: ['HE', 'APHE', 'APHE'], propellant: 2.4, heFiller: 0.9, startIndex: row * 16 }),
    ),
  ],
  crew: [
    dummy('driver', 'driver', 'Driver', 'hull', v3(2.3, 0.55, 0.5), { recline: true, scale: 0.9 }),
    dummy('radioman', 'radioman', 'Radio operator', 'hull', v3(2.3, 0.55, -0.5), { recline: true, scale: 0.9 }),
    dummy('gunner', 'gunner', 'Gunner', 'turret', v3(TX + 0.2, 1.1, 0.5)),
    dummy('commander', 'commander', 'Commander', 'turret', v3(TX - 0.6, 1.25, 0.45)),
    dummy('loader', 'loader', 'Loader', 'turret', v3(TX - 0.1, 1.4, -0.5), { standing: true, scale: 0.9 }),
  ],
  turretPivot: v3(TX, 0, 0),
  racks: [rack('sponson-l', 'Left sponson bins', 8), rack('sponson-r', 'Right sponson bins', 8)],
  visual: {
    hullLength: 6.3, hullWidth: 2.4, trackWidth: 0.72, groundClearance: 0.47,
    wheelCount: 8, wheelRadius: 0.4,
    barrel: { from: v3(TX + 1.05, 1.88, 0), length: 4.9, radius: 0.07 },
    color: 0x8a7d58,
  },
};
