import { describe, expect, it } from 'vitest';
import { DEG, dot, makeRng, norm, randomInCone, v3 } from '../src/sim/vec';

describe('vec', () => {
  it('normalizes', () => {
    const n = norm(v3(3, 4, 0));
    expect(n.x).toBeCloseTo(0.6);
    expect(n.y).toBeCloseTo(0.8);
  });

  it('rng is deterministic', () => {
    const a = makeRng(42), b = makeRng(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });

  it('cone samples stay inside the cone', () => {
    const rng = makeRng(1);
    const axis = norm(v3(1, 0.2, -0.3));
    for (let i = 0; i < 200; i++) {
      const d = randomInCone(axis, 20 * DEG, rng);
      expect(dot(d, axis)).toBeGreaterThanOrEqual(Math.cos(20 * DEG) - 1e-9);
    }
  });
});
