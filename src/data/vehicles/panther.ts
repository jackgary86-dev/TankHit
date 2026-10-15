import type { Vehicle } from '../../sim/types';
import { v3 } from '../../sim/vec';
import { ammoRow, box, dummy, frontQuad, hullPlates, mod, rack, turretPlates } from '../builder';

// Hull spans x -3.45..3.45, deck at y = 1.55. The glacis is the famous 80 mm at 55 degrees.
const TX = 0.2;

export const PANTHER: Vehicle = {
  id: 'panther',
  name: 'Panther G',
  nation: 'Germany',
  br: '6.3',
  description: 'Well-sloped 80 mm glacis that shrugs off most mid-war guns, but only 50 mm sides and 79 rounds stacked in the hull sponsons. Gearbox in the nose.',
  plates: [
    ...hullPlates({
      length: 6.9, width: 2.4, clearance: 0.55, height: 1.0, noseY: 0.8,
      ufp: { mm: 80, run: 1.07 },
      lfp: { mm: 60, run: 0.35 },
      side: 50, rear: 40, roof: 16, floor: 25,
      ring: { x: TX, r: 0.85 },
    }),
    ...turretPlates({
      center: { x: TX, z: 0 }, y0: 1.55, y1: 2.25,
      poly: [[1.0, 0.5], [0.55, 0.9], [-0.9, 0.95], [-1.25, 0.55], [-1.25, -0.55], [-0.9, -0.95], [0.55, -0.9], [1.0, -0.5]],
      topScale: 0.78,
      front: 100, cheek: 100, side: 45, rear: 45, roof: 16,
    }),
    { ...frontQuad('t-mantlet', 'Gun mantlet (cast)', 'turret', TX + 1.05, 1.62, 2.15, -0.45, 0.45, 100, 'cast'), covers: ['t-7'] },
  ],
  modules: [
    mod('engine', 'Engine (Maybach HL 230)', 'engine', 'hull', box(v3(-3.2, 0.62, -0.7), v3(-1.7, 1.45, 0.7)), 150, 70),
    mod('transmission', 'Gearbox (AK 7-200)', 'transmission', 'hull', box(v3(1.9, 0.6, -0.4), v3(3.1, 1.15, 0.4)), 130, 60),
    mod('fuel-l', 'Fuel tank (rear left)', 'fuel', 'hull', box(v3(-3.3, 0.6, 0.75), v3(-1.8, 1.4, 1.15)), 80, 25),
    mod('fuel-r', 'Fuel tank (rear right)', 'fuel', 'hull', box(v3(-3.3, 0.6, -1.15), v3(-1.8, 1.4, -0.75)), 80, 25),
    mod('radio', 'Radio', 'radio', 'hull', box(v3(2.2, 1.2, -1.0), v3(2.6, 1.45, -0.6)), 30, 10),
    mod('ring', 'Turret ring', 'turretRing', 'turret', box(v3(TX - 0.85, 1.5, -0.85), v3(TX + 0.85, 1.57, 0.85)), 110, 30, 'y'),
    mod('breech', 'Gun breech (KwK 42)', 'breech', 'turret', box(v3(TX + 0.1, 1.78, -0.16), v3(TX + 1.0, 2.05, 0.16)), 100, 90),
    mod('optics', 'TZF 12a gunner sight', 'optics', 'turret', box(v3(TX + 0.6, 1.95, 0.3), v3(TX + 0.95, 2.1, 0.42)), 20, 8),
    // Sponson racks either side, plus a floor rack under the turret.
    ...[1.0, 1.17, 1.34].flatMap((y, row) =>
      ammoRow({ rack: 'sponson-l', group: 'hull', start: v3(-1.5, y, 1.0), step: v3(0.13, 0, 0), count: 12, axis: 'z', length: 0.9, dia: 0.1, families: ['APHE', 'HE', 'APHE'], propellant: 3.7, heFiller: 0.65, startIndex: row * 12 }),
    ),
    ...[1.0, 1.17, 1.34].flatMap((y, row) =>
      ammoRow({ rack: 'sponson-r', group: 'hull', start: v3(-1.5, y, -1.0), step: v3(0.13, 0, 0), count: 12, axis: 'z', length: 0.9, dia: 0.1, families: ['HE', 'APHE', 'APHE'], propellant: 3.7, heFiller: 0.65, startIndex: row * 12 }),
    ),
    ...ammoRow({ rack: 'floor', group: 'hull', start: v3(-0.6, 0.62, -0.45), step: v3(0, 0, 0.13), count: 7, axis: 'x', length: 0.9, dia: 0.1, families: ['APHE', 'HE'], propellant: 3.7, heFiller: 0.65 }),
  ],
  crew: [
    dummy('driver', 'driver', 'Driver', 'hull', v3(2.3, 0.6, 0.55), { recline: true, scale: 0.9 }),
    dummy('radioman', 'radioman', 'Radio operator', 'hull', v3(2.3, 0.6, -0.55), { recline: true, scale: 0.9 }),
    dummy('gunner', 'gunner', 'Gunner', 'turret', v3(TX + 0.2, 1.15, 0.45)),
    dummy('commander', 'commander', 'Commander', 'turret', v3(TX - 0.6, 1.3, 0.4)),
    dummy('loader', 'loader', 'Loader', 'turret', v3(TX - 0.1, 1.42, -0.45), { standing: true, scale: 0.9 }),
  ],
  turretPivot: v3(TX, 0, 0),
  racks: [rack('sponson-l', 'Left sponson rack', 8), rack('sponson-r', 'Right sponson rack', 8), rack('floor', 'Floor rack', 5)],
  visual: {
    hullLength: 6.9, hullWidth: 2.4, trackWidth: 0.66, groundClearance: 0.55,
    wheelCount: 8, wheelRadius: 0.43,
    barrel: { from: v3(TX + 1.05, 1.9, 0), length: 5.3, radius: 0.06 },
    color: 0x8f8a62,
  },
};
