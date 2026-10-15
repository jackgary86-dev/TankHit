import { describe, expect, it } from 'vitest';
import { roundById, ROUNDS } from '../src/data/rounds';
import { VEHICLES, vehicleById } from '../src/data/vehicles';
import { installMod, validateRound, validateVehicle } from '../src/modes/mods';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { v3 } from '../src/sim/vec';

describe('mods', () => {
  it('every built-in vehicle and round passes the validator (the example files are built from them)', () => {
    for (const v of VEHICLES) expect(validateVehicle(JSON.parse(JSON.stringify(v)))).toEqual([]);
    for (const r of ROUNDS) expect(validateRound(JSON.parse(JSON.stringify(r)))).toEqual([]);
  });

  it('rejects broken files with readable errors', () => {
    expect(installMod({ name: 'x.json', text: '{ not json' }).errors[0]).toMatch(/invalid JSON/);
    expect(installMod({ name: 'x.json', text: '{"hello":1}' }).errors[0]).toMatch(/neither a vehicle/);
    const bad = JSON.parse(JSON.stringify(vehicleById('t34-85')));
    bad.id = 'bad tank';
    bad.plates[0].pts[1].y += 0.5; // bends the plate out of its plane
    bad.modules[0].ammo = { rack: 'nope', roundFamily: 'AP', propellant: 1, filler: 0 };
    const errs = validateVehicle(bad);
    expect(errs.some((e) => /id must be/.test(e))).toBe(true);
    expect(errs.some((e) => /planar|off the plane/.test(e))).toBe(true);
    expect(errs.some((e) => /unknown rack/.test(e))).toBe(true);
    expect(VEHICLES.some((v) => v.id === 'bad tank')).toBe(false);
  });

  it('installs a modded tank and a modded round that then fight correctly', () => {
    const t = JSON.parse(JSON.stringify(vehicleById('t34-85')));
    t.id = 'mod-t34';
    t.name = 'Modded T-34';
    for (const p of t.plates) if (p.id.startsWith('h-side')) p.mm = 200; // thick sides
    const res = installMod({ name: 'mod-t34.json', text: JSON.stringify(t) });
    expect(res.errors).toEqual([]);
    expect(vehicleById('mod-t34').name).toBe('Modded T-34');
    const r = JSON.parse(JSON.stringify(roundById('m72')));
    r.id = 'mod-ap';
    r.name = 'Modded AP';
    r.velocity = 1200;
    expect(installMod({ name: 'mod-ap.json', text: JSON.stringify(r) }).errors).toEqual([]);
    const v = vehicleById('mod-t34');
    const shot = simulateShot(v, roundById('mod-ap'), { vehicleId: v.id, roundId: 'mod-ap', distance: 100, origin: v3(0.2, 0.95, 6), dir: v3(0, 0, -1), seed: 1 }, initialState(v));
    expect(shot.impacts[0].plateId).toBe('h-side-l');
    expect(shot.summary.penetrated).toBe(false); // 200 mm side beats a 75 mm shot
    // Re-installing the same id replaces, not duplicates.
    installMod({ name: 'mod-t34.json', text: JSON.stringify(t) });
    expect(VEHICLES.filter((x) => x.id === 'mod-t34').length).toBe(1);
  });
});
