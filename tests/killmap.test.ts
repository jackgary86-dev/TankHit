import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { cellOrigin, killProbability, killRow, planGrid } from '../src/sim/killmap';
import { initialState } from '../src/sim/state';
import { dot, v3 } from '../src/sim/vec';

const t34 = vehicleById('t34-85');

describe('kill-probability map', () => {
  it('plans a grid that covers the silhouette from the side', () => {
    const g = planGrid(t34, v3(0, 0, -1), 0, 0.25);
    expect(g.cols).toBeGreaterThan(20); // ~6 m long hull
    expect(g.rows).toBeGreaterThan(7); // ~2 m tall
    expect(Math.abs(dot(g.u, g.dir))).toBeLessThan(1e-9);
    expect(Math.abs(dot(g.w, g.dir))).toBeLessThan(1e-9);
    // Grid origin sits well on the near side of the tank along the shot direction.
    expect(dot(cellOrigin(g, 0, 0), g.dir)).toBeLessThan(-3);
  });

  it('a row through the fighting compartment has cells, a row above the tank has none', () => {
    const g = planGrid(t34, v3(0, 0, -1), 0, 0.3);
    const r = roundById('m829a1');
    const mid = killRow(t34, initialState(t34), r, g, Math.floor(g.rows / 2), 500, 0, 2);
    const top = killRow(t34, initialState(t34), r, g, g.rows - 1, 500, 0, 2);
    expect(mid.length).toBeGreaterThan(5);
    expect(top.length).toBe(0);
    for (const c of mid) {
      expect(c.p).toBeGreaterThanOrEqual(0);
      expect(c.p).toBeLessThanOrEqual(1);
    }
  });

  it('kill probability is high for a big rod through the crew and low for a weak shot on the turret front', () => {
    const strong = killProbability(t34, initialState(t34), roundById('m829a1'), { vehicleId: t34.id, roundId: 'm829a1', distance: 500, origin: v3(0.6, 1.55, 6), dir: v3(0, 0, -1) }, 8);
    const weak = killProbability(t34, initialState(t34), roundById('m72'), { vehicleId: t34.id, roundId: 'm72', distance: 1500, origin: v3(8, 1.6, 0.6), dir: v3(-1, 0, 0) }, 8);
    expect(strong.p).toBeGreaterThan(0.6);
    expect(weak.p).toBe(0);
    expect(weak.pen).toBe(0);
  });
});
