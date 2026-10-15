import type { Vehicle } from '../../sim/types';
import { v3 } from '../../sim/vec';
import { ammoRow, box, dummy, frontQuad, hullPlates, mod, plate, rack, turretPlates } from '../builder';

// Hull spans x -2.95..2.95, top deck at y = 1.35. Turret ring centred at x = 0.6.
const TX = 0.6;

export const T34_85: Vehicle = {
  id: 't34-85',
  name: 'T-34-85',
  nation: 'USSR',
  br: '5.7',
  description: 'Sloped homogeneous steel. Simple layout with floor ammo racks – a good tank to learn angles on.',
  plates: [
    ...hullPlates({
      length: 5.9, width: 2.0, clearance: 0.4, height: 0.95, noseY: 0.85,
      ufp: { mm: 45, run: 0.87 },
      lfp: { mm: 45, run: 0.6 },
      side: 45, rear: 45, roof: 20, floor: 20,
      ring: { x: TX, r: 0.8 },
    }),
    ...turretPlates({
      center: { x: TX, z: 0 }, y0: 1.35, y1: 2.0,
      poly: [[1.05, 0.5], [0.4, 0.95], [-1.15, 0.85], [-1.35, 0.4], [-1.35, -0.4], [-1.15, -0.85], [0.4, -0.95], [1.05, -0.5]],
      topScale: 0.86, front: 90, cheek: 75, side: 75, rear: 52, roof: 20, mat: 'cast',
    }),
    { ...frontQuad('t-mantlet', 'Gun mantlet', 'turret', TX + 1.12, 1.48, 1.92, -0.36, 0.36, 90, 'cast'), covers: ['t-7'] },
    // Historical weak spots on the glacis: the driver's hatch bulge and the bow machine-gun ball mount.
    { ...plate('h-hatch', "Driver's hatch", 'hull', [v3(2.70, 1.0, 0.28), v3(2.70, 1.0, 0.58), v3(2.45, 1.26, 0.58), v3(2.45, 1.26, 0.28)], 45, v3(2.0, 1.1, 0.43)), covers: ['h-ufp'] },
    { ...plate('h-mg', 'Bow MG mount', 'hull', [v3(2.75, 0.98, -0.3), v3(2.75, 0.98, -0.56), v3(2.62, 1.2, -0.56), v3(2.62, 1.2, -0.3)], 45, v3(2.0, 1.1, -0.43)), covers: ['h-ufp'] },
  ],
  modules: [
    mod('engine', 'Engine (V-2-34)', 'engine', 'hull', box(v3(-2.55, 0.48, -0.65), v3(-1.2, 1.25, 0.65)), 140, 70),
    mod('transmission', 'Transmission', 'transmission', 'hull', box(v3(-2.9, 0.48, -0.85), v3(-2.6, 1.0, 0.85)), 120, 60),
    mod('fuel-l', 'Fuel tank (left)', 'fuel', 'hull', box(v3(-1.15, 0.85, 0.72), v3(0.0, 1.3, 0.97)), 70, 25),
    mod('fuel-r', 'Fuel tank (right)', 'fuel', 'hull', box(v3(-1.15, 0.85, -0.97), v3(0.0, 1.3, -0.72)), 70, 25),
    mod('radio', 'Radio', 'radio', 'hull', box(v3(1.55, 0.95, -0.95), v3(1.85, 1.2, -0.75)), 30, 10),
    mod('ring', 'Turret ring', 'turretRing', 'turret', box(v3(TX - 0.8, 1.3, -0.8), v3(TX + 0.8, 1.37, 0.8)), 100, 30, 'y'),
    mod('breech', 'Gun breech (ZiS-S-53)', 'breech', 'turret', box(v3(TX + 0.2, 1.55, -0.15), v3(TX + 1.05, 1.82, 0.15)), 90, 90),
    mod('optics', 'Gunner sight', 'optics', 'turret', box(v3(TX + 0.65, 1.75, 0.3), v3(TX + 1.0, 1.85, 0.4)), 20, 8),
    ...ammoRow({ rack: 'floor', group: 'hull', start: v3(0.15, 0.48, -0.78), step: v3(0, 0, 0.12), count: 14, axis: 'x', length: 0.95, dia: 0.11, families: ['AP', 'HE', 'AP'], propellant: 2.6, heFiller: 0.74 }),
    ...ammoRow({ rack: 'floor', group: 'hull', start: v3(0.15, 0.6, -0.78), step: v3(0, 0, 0.12), count: 14, axis: 'x', length: 0.95, dia: 0.11, families: ['HE', 'AP'], propellant: 2.6, heFiller: 0.74, startIndex: 14 }),
    ...ammoRow({ rack: 'turret', group: 'turret', start: v3(TX - 1.25, 1.55, 0), step: v3(0.12, 0, 0), count: 3, axis: 'z', length: 0.95, dia: 0.11, families: ['AP', 'HE'], propellant: 2.6, heFiller: 0.74 }),
    ...ammoRow({ rack: 'turret', group: 'turret', start: v3(TX - 1.25, 1.67, 0), step: v3(0.12, 0, 0), count: 3, axis: 'z', length: 0.95, dia: 0.11, families: ['HE', 'AP'], propellant: 2.6, heFiller: 0.74, startIndex: 3 }),
  ],
  crew: [
    dummy('driver', 'driver', 'Driver', 'hull', v3(1.45, 0.5, 0.42), { recline: true, scale: 0.9 }),
    dummy('radioman', 'radioman', 'Bow gunner', 'hull', v3(1.45, 0.5, -0.42), { recline: true, scale: 0.9 }),
    dummy('gunner', 'gunner', 'Gunner', 'turret', v3(TX + 0.15, 1.0, 0.45)),
    dummy('commander', 'commander', 'Commander', 'turret', v3(TX - 0.55, 1.05, 0.42)),
    dummy('loader', 'loader', 'Loader', 'turret', v3(TX - 0.1, 1.17, -0.45), { standing: true, scale: 0.9 }),
  ],
  turretPivot: v3(TX, 0, 0),
  racks: [rack('floor', 'Hull floor racks', 7), rack('turret', 'Turret bustle rack', 4)],
  visual: {
    hullLength: 5.9, hullWidth: 2.0, trackWidth: 0.5, groundClearance: 0.4,
    wheelCount: 5, wheelRadius: 0.4,
    barrel: { from: v3(TX + 1.12, 1.7, 0), length: 4.6, radius: 0.065 },
    color: 0x4b5a3a,
  },
};
