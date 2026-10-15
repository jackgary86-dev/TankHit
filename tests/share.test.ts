import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { CHALLENGES } from '../src/modes/challenges';
import { isUnlocked, nextUnlock, REQUIRES, totalStars } from '../src/modes/progression';
import { decodeShot, encodeShot } from '../src/modes/share';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { norm, v3 } from '../src/sim/vec';

describe('shareable shots', () => {
  it('round-trips a shot input through the URL hash', () => {
    const input = { vehicleId: 't72b', roundId: 'm829a1', distance: 1500, origin: v3(0.35, 0.62, 6), dir: norm(v3(0, 0.1, -1)), seed: 123456789, turretYaw: -30 };
    const back = decodeShot('#' + encodeShot(input))!;
    expect(back.vehicleId).toBe('t72b');
    expect(back.roundId).toBe('m829a1');
    expect(back.distance).toBe(1500);
    expect(back.seed).toBe(123456789);
    expect(back.turretYaw).toBe(-30);
    expect(back.origin.z).toBeCloseTo(6, 3);
    expect(back.dir.y).toBeCloseTo(input.dir.y, 3);
  });

  it('a decoded link reproduces the same replay', () => {
    const v = vehicleById('t34-85');
    const input = { vehicleId: v.id, roundId: 'br365k', distance: 300, origin: v3(0.2, 0.9, 6), dir: v3(0, 0, -1), seed: 42, turretYaw: 0 };
    const a = simulateShot(v, roundById('br365k'), input, initialState(v));
    const b = simulateShot(v, roundById('br365k'), decodeShot(encodeShot(input))!, initialState(v));
    expect(b.summary).toEqual(a.summary);
    expect(b.traces.length).toBe(a.traces.length);
  });

  it('rejects malformed hashes', () => {
    expect(decodeShot('#v=t34-85')).toBeNull();
    expect(decodeShot('#v=t34-85&r=m72&d=100&o=1,2&dir=0,0,-1&s=1')).toBeNull();
    expect(decodeShot('')).toBeNull();
  });
});

describe('progression', () => {
  it('every challenge has a threshold and the first ones are free', () => {
    for (const c of CHALLENGES) expect(REQUIRES[c.id]).toBeDefined();
    expect(CHALLENGES.filter((c) => isUnlocked(c, {})).length).toBeGreaterThanOrEqual(3);
    expect(CHALLENGES.filter((c) => isUnlocked(c, {})).length).toBeLessThan(CHALLENGES.length);
  });

  it('stars unlock challenges in order', () => {
    const stars = { 'first-blood': 3, 'pike-nose': 3 };
    expect(totalStars(stars)).toBe(6);
    expect(isUnlocked(CHALLENGES.find((c) => c.id === 'surgical')!, stars)).toBe(true);
    expect(isUnlocked(CHALLENGES.find((c) => c.id === 'belly-shot')!, stars)).toBe(false);
    expect(nextUnlock(stars)!.needed).toBe(3);
    const all: Record<string, number> = {};
    for (const c of CHALLENGES) all[c.id] = 3;
    expect(nextUnlock(all)).toBeNull();
  });
});
