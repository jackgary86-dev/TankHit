import type { Vehicle } from '../../sim/types';
import { v3 } from '../../sim/vec';
import { ammoRow, box, dummy, frontQuad, hullPlates, mod, rack, turretPlates } from '../builder';

// Hull spans x -3.45..3.45, deck at y = 1.45. Everything is cast: elliptical hull, hemispherical turret.
const TX = 0.4;

export const M48: Vehicle = {
  id: 'm48',
  name: 'M48 Patton',
  nation: 'USA',
  br: '7.7',
  description: 'Cast elliptical hull and a thick hemispherical turret; a ready rack of 90 mm rounds sits on the turret floor beside the loader.',
  plates: [
    ...hullPlates({
      length: 6.9, width: 2.4, clearance: 0.42, height: 1.03, noseY: 0.85,
      ufp: { mm: 110, run: 1.0, mat: 'cast' },
      lfp: { mm: 76, run: 0.5, mat: 'cast' },
      side: { mm: 76, mat: 'cast' }, rear: 35, roof: 57, floor: 38,
      mat: 'cast',
      ring: { x: TX, r: 1.0 },
    }),
    ...turretPlates({
      center: { x: TX, z: 0 }, y0: 1.45, y1: 2.25,
      poly: [[1.2, 0.6], [0.7, 1.05], [-0.7, 1.15], [-1.35, 0.75], [-1.5, 0], [-1.35, -0.75], [-0.7, -1.15], [0.7, -1.05], [1.2, -0.6]],
      topScale: 0.55,
      front: 178, cheek: 150, side: 76, rear: 51, roof: 25,
      mat: 'cast',
    }),
    { ...frontQuad('t-mantlet', 'Gun shield (cast)', 'turret', TX + 1.25, 1.6, 2.05, -0.42, 0.42, 114, 'cast'), covers: ['t-8'] },
  ],
  modules: [
    mod('engine', 'Engine (AVDS-1790)', 'engine', 'hull', box(v3(-3.25, 0.5, -0.8), v3(-1.6, 1.4, 0.8)), 150, 70),
    mod('transmission', 'Transmission (CD-850)', 'transmission', 'hull', box(v3(-3.43, 0.5, -1.0), v3(-3.25, 1.05, 1.0)), 120, 60),
    mod('fuel-l', 'Fuel tank (left)', 'fuel', 'hull', box(v3(-1.5, 0.5, 0.8), v3(-0.3, 1.3, 1.15)), 80, 25),
    mod('fuel-r', 'Fuel tank (right)', 'fuel', 'hull', box(v3(-1.5, 0.5, -1.15), v3(-0.3, 1.3, -0.8)), 80, 25),
    mod('ring', 'Turret ring', 'turretRing', 'turret', box(v3(TX - 1.0, 1.4, -1.0), v3(TX + 1.0, 1.47, 1.0)), 110, 30, 'y'),
    mod('breech', 'Gun breech (M41 90 mm)', 'breech', 'turret', box(v3(TX + 0.1, 1.68, -0.16), v3(TX + 1.2, 1.95, 0.16)), 100, 90),
    mod('optics', 'Rangefinder / sight', 'optics', 'turret', box(v3(TX + 0.4, 1.95, -0.9), v3(TX + 0.9, 2.1, -0.7)), 25, 8),
    mod('radio', 'Radio (bustle)', 'radio', 'turret', box(v3(TX - 1.4, 1.65, -0.3), v3(TX - 1.1, 1.9, 0.3)), 30, 10),
    // Ready rack on the turret floor beside the loader, and hull floor stowage.
    ...ammoRow({ rack: 'ready', group: 'turret', start: v3(TX - 0.9, 1.5, 0.55), step: v3(0.13, 0, 0), count: 8, axis: 'y', length: 0.8, dia: 0.1, families: ['AP', 'HEAT', 'HE'], propellant: 3.6, heFiller: 0.9 }),
    ...[0.52, 0.66].flatMap((y, row) =>
      ammoRow({ rack: 'floor', group: 'hull', start: v3(-0.7, y, -0.5), step: v3(0.13, 0, 0), count: 14, axis: 'z', length: 0.8, dia: 0.1, families: ['AP', 'HE', 'HEAT'], propellant: 3.6, heFiller: 0.9, startIndex: row * 14 }),
    ),
  ],
  crew: [
    dummy('driver', 'driver', 'Driver', 'hull', v3(2.1, 0.55, 0.0), { recline: true, scale: 0.9 }),
    dummy('gunner', 'gunner', 'Gunner', 'turret', v3(TX + 0.3, 1.1, -0.5)),
    dummy('commander', 'commander', 'Commander', 'turret', v3(TX - 0.45, 1.2, -0.5)),
    dummy('loader', 'loader', 'Loader', 'turret', v3(TX - 0.1, 1.38, 0.5), { standing: true, scale: 0.9 }),
  ],
  turretPivot: v3(TX, 0, 0),
  racks: [rack('ready', 'Turret ready rack', 4), rack('floor', 'Hull floor stowage', 8)],
  visual: {
    hullLength: 6.9, hullWidth: 2.4, trackWidth: 0.58, groundClearance: 0.42,
    wheelCount: 6, wheelRadius: 0.33,
    barrel: { from: v3(TX + 1.25, 1.82, 0), length: 4.4, radius: 0.07 },
    color: 0x5a6446,
  },
};
