import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { narrate } from '../src/sim/narrative';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { v3 } from '../src/sim/vec';

const t34 = vehicleById('t34-85');
const fire = (rid: string, origin = v3(0.2, 0.95, 6), dir = v3(0, 0, -1), seed = 1) =>
  simulateShot(t34, roundById(rid), { vehicleId: t34.id, roundId: rid, distance: 300, origin, dir, seed }, initialState(t34));

describe('crew reactions', () => {
  it('survivors bail out of a burning tank about two seconds after it lights, and the tank counts as abandoned', () => {
    const shots = Array.from({ length: 40 }, (_, i) => fire('m82', v3(0.2, 0.95, 6), v3(0, 0, -1), i + 1));
    const burning = shots.find((s) => s.summary.cookOff === 'fire' && !s.stateAfter.destroyed)!;
    expect(burning).toBeDefined();
    const bail = burning.bigEvents.find((e) => e.kind === 'bailout')!;
    const fireEv = burning.bigEvents.find((e) => e.kind === 'fire')!;
    expect(bail).toBeDefined();
    expect(bail.t).toBeCloseTo(fireEv.t + 2.0, 5);
    expect(burning.stateAfter.abandoned).toBe(true);
    expect(burning.summary.verdict).toBe('Abandoned');
    expect(narrate(burning, t34, roundById('m82')).text).toMatch(/bailed out/);
    expect(burning.duration).toBeGreaterThan(bail.t);
  });

  it('a vented Abrams bustle does not make the crew bail out', () => {
    const m1 = vehicleById('m1');
    const s = simulateShot(m1, roundById('m829a1'), { vehicleId: m1.id, roundId: 'm829a1', distance: 500, origin: v3(-1.75, 1.76, 6), dir: v3(0, 0, -1), seed: 2 }, initialState(m1));
    expect(s.summary.cookOff).toBe('blowout');
    expect(s.bigEvents.some((e) => e.kind === 'bailout')).toBe(false);
    expect(s.stateAfter.abandoned).toBeFalsy();
  });

  it('the commander takes the gun when the gunner is lost', () => {
    // Through the turret side at gunner height; find a seed where the gunner goes down but the commander lives.
    const shots = Array.from({ length: 40 }, (_, i) => fire('pzgr39', v3(0.75, 1.5, 6), v3(0, 0, -1), i + 1));
    const s = shots.find((x) => x.stateAfter.crew.gunner.incapacitated && !x.stateAfter.crew.commander.incapacitated && !x.stateAfter.abandoned)!;
    expect(s).toBeDefined();
    const ev = s.bigEvents.find((e) => e.kind === 'takeover')!;
    expect(ev).toBeDefined();
    expect(s.stateAfter.gunnerReplaced).toBe(true);
    expect(narrate(s, t34, roundById('pzgr39')).text).toMatch(/commander took over the gun/);
  });
});
