import { describe, expect, it } from 'vitest';
import { eraOnPlate, frontQuad, hullPlates, skirt } from '../src/data/builder';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import type { Vehicle } from '../src/sim/types';
import { v3 } from '../src/sim/vec';

const t34 = vehicleById('t34-85');

/** Box-ish test vehicle; `front` is a vertical plate at x = 2. */
function testVehicle(front: Parameters<typeof frontQuad>[8], extra: (f: ReturnType<typeof frontQuad>) => Vehicle['plates'] = () => []): Vehicle {
  const hull = hullPlates({
    length: 4, width: 2, clearance: 0.4, height: 1.2, noseY: 1.0,
    ufp: { mm: 20, run: 0.01 }, lfp: { mm: 20, run: 0.01 }, side: 20, rear: 20, roof: 20, floor: 20,
  }).filter((p) => p.id !== 'h-ufp' && p.id !== 'h-lfp');
  const f = frontQuad('front', 'Front', 'hull', 2, 0.4, 1.6, -1, 1, front);
  return {
    id: 'test', name: 'Test', nation: '-', br: '-', description: '',
    plates: [...hull, f, ...extra(f)],
    modules: [],
    crew: [],
    racks: [],
    visual: t34.visual,
  };
}

const fire = (v: Vehicle, roundId: string, opts: { y?: number; z?: number; seed?: number } = {}) =>
  simulateShot(v, roundById(roundId), {
    vehicleId: v.id, roundId, distance: 500,
    origin: v3(9, opts.y ?? 1.0, opts.z ?? 0.1), dir: v3(-1, 0, 0), seed: opts.seed ?? 1,
  }, initialState(v));

describe('HEAT', () => {
  it('penetrates plain steel below its jet penetration', () => {
    const s = fire(testVehicle(300), 'm456a2');
    expect(s.summary.penetrated).toBe(true);
    expect(s.traces.some((t) => t.kind === 'jet')).toBe(true);
  });

  it('is stopped by ERA that it would otherwise defeat', () => {
    const plain = fire(testVehicle(300), 'm456a2', { y: 0.7 });
    const era = fire(testVehicle(300, (f) => eraOnPlate(f, 2, 2, 'era')), 'm456a2', { y: 0.7 });
    expect(plain.summary.penetrated).toBe(true);
    expect(era.summary.penetrated).toBe(false);
    expect(era.impacts.some((i) => i.kind === 'era')).toBe(true);
    expect(Object.keys(era.stateAfter.eraSpent).length).toBe(1);
  });

  it('loses penetration to standoff from a spaced plate', () => {
    const v = testVehicle(370, () => [{ ...frontQuad('sk', 'Skirt', 'hull', 3.2, 0.4, 1.6, -1, 1, 10), kind: 'spaced' as const }]);
    expect(fire(testVehicle(370), 'm456a2').summary.penetrated).toBe(true);
    expect(fire(v, 'm456a2').summary.penetrated).toBe(false);
  });

  it('composite stops HEAT better than KE of similar penetration', () => {
    const comp = testVehicle({ mm: 0, layers: [{ mat: 'rha', mm: 40 }, { mat: 'nera', mm: 220 }, { mat: 'rha', mm: 40 }] });
    // ~400 mm HEAT vs ~420 mm KE (M833): KE equiv 201 mm, CE equiv 355 mm.
    const ke = fire(comp, 'm833').summary;
    const ce = fire(comp, 'm456a2').summary;
    expect(ke.residualMm).toBeGreaterThan(ce.residualMm);
  });
});

describe('HESH', () => {
  it('scabs a thin homogeneous plate without penetrating', () => {
    const s = fire(testVehicle(60), 'l35');
    expect(s.summary.penetrated).toBe(false);
    expect(s.impacts[0].kind).toBe('scab');
    expect(s.summary.spallCount).toBeGreaterThan(20);
  });

  it('does nothing against thick or composite plates', () => {
    expect(fire(testVehicle(250), 'l35').summary.spallCount).toBe(0);
    expect(fire(testVehicle({ mm: 0, layers: [{ mat: 'rha', mm: 30 }, { mat: 'ceramic', mm: 40 }] }), 'l35').summary.spallCount).toBe(0);
  });

  it('is wasted on a side skirt', () => {
    const v = testVehicle(60, () => [skirt('sk', 'Skirt', -1, 1, 0.4, 1.6, 0, 6)].map((p) => ({ ...p, pts: [v3(3, 0.4, -1), v3(3, 0.4, 1), v3(3, 1.6, 1), v3(3, 1.6, -1)], inside: v3(2.5, 1, 0) })));
    const s = fire(v, 'l35');
    expect(s.impacts[0].kind).toBe('explode');
    expect(s.summary.spallCount).toBe(0);
  });
});

describe('APHE', () => {
  it('bursts inside after penetrating', () => {
    const s = fire(testVehicle(60), 'pzgr39');
    expect(s.summary.penetrated).toBe(true);
    expect(s.impacts.some((i) => i.kind === 'explode')).toBe(true);
    expect(s.traces.some((t) => t.kind === 'frag')).toBe(true);
  });
});

describe('HE', () => {
  it('punches a thin roof from above', () => {
    const r = roundById('of471');
    const s = simulateShot(t34, r, { vehicleId: t34.id, roundId: r.id, distance: 300, origin: v3(0.3, 6, 0.3), dir: v3(0, -1, 0), seed: 1 }, initialState(t34));
    expect(s.summary.penetrated).toBe(true);
    expect(s.traces.some((t) => t.kind === 'frag')).toBe(true);
  });

  it('only blasts the outside of thick plates', () => {
    const s = fire(testVehicle(100), 'of412');
    expect(s.summary.penetrated).toBe(false);
    expect(s.impacts[0].kind).toBe('explode');
  });
});
