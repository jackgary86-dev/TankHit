import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { evaluateChallenge } from '../src/modes/challenges';
import { dailyAnswer, dailyChallenge, dailyResultText, dailyScenario } from '../src/modes/daily';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { arrivalDir } from '../src/modes/duel';
import { madd } from '../src/sim/vec';

describe('daily shot', () => {
  it('is the same for everyone on the same UTC date and differs day to day', () => {
    const a = dailyScenario(new Date(Date.UTC(2026, 9, 15, 3)));
    const b = dailyScenario(new Date(Date.UTC(2026, 9, 15, 22)));
    const c = dailyScenario(new Date(Date.UTC(2026, 9, 16, 3)));
    expect(a).toEqual(b);
    expect(c.number).toBe(a.number + 1);
    expect([a.vehicleId, a.roundId, a.distance, a.yaw].join()).not.toBe([c.vehicleId, c.roundId, c.distance, c.yaw].join());
    expect(() => vehicleById(a.vehicleId)).not.toThrow();
    expect(() => roundById(a.roundId)).not.toThrow();
  });

  it('runs as a three-shot challenge with a fixed angle and has a computable answer', () => {
    const s = dailyScenario(new Date(Date.UTC(2026, 9, 15)));
    const c = dailyChallenge(s);
    expect(c.maxShots).toBe(3);
    expect(c.fixedAngle).toEqual({ yaw: s.yaw, pitch: s.pitch });
    const answer = dailyAnswer(s);
    expect(answer).not.toBeNull();
    // Firing at the answer from the scenario's bearing should at least hit the tank.
    const v = vehicleById(s.vehicleId);
    const dir = arrivalDir(s.yaw, s.pitch);
    const shot = simulateShot(v, roundById(s.roundId), { vehicleId: v.id, roundId: s.roundId, distance: s.distance, origin: madd(answer!, dir, -6), dir, seed: 1, turretYaw: 0 }, initialState(v));
    expect(shot.impacts.length).toBeGreaterThan(0);
    expect(evaluateChallenge(c, v, shot.stateAfter, [shot]).status).not.toBe('failed');
  });

  it('formats a share line', () => {
    const s = dailyScenario(new Date(Date.UTC(2026, 9, 15)));
    expect(dailyResultText(s, { date: s.date, attempts: 2, bestStars: 2, bestShots: 2, won: true })).toMatch(/^TankHit Daily #\d+: knocked out in 2 ★★☆$/);
    expect(dailyResultText(s, { date: s.date, attempts: 3, bestStars: 0, bestShots: 0, won: false })).toMatch(/no kill in 3 attempts/);
  });
});
