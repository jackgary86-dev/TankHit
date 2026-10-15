import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { VEHICLES, vehicleById } from '../src/data/vehicles';
import { advance, aiAimPoint, arrivalDir, canFire, enemyFire, GUN_ROUND, newDuel, playerFired } from '../src/modes/duel';
import { simulateShot } from '../src/sim/shot';
import { v3 } from '../src/sim/vec';

describe('duel', () => {
  it('every vehicle has a gun round', () => {
    for (const v of VEHICLES) expect(() => roundById(GUN_ROUND[v.id])).not.toThrow();
  });

  it('arrival direction respects the hull angle', () => {
    const d0 = arrivalDir(0);
    expect(d0.x).toBeCloseTo(-1, 2);
    const d30 = arrivalDir(30);
    expect(d30.x).toBeLessThan(-0.85);
    expect(Math.abs(d30.z)).toBeGreaterThan(0.45);
  });

  it('the AI finds a point on my tank and prefers lethal spots', () => {
    const d = newDuel('t34-85', 'tiger1', 500, 'hard', 1);
    const aim = aiAimPoint(d, roundById(GUN_ROUND.tiger1), 5);
    expect(aim).not.toBeNull();
    // Hard AI aiming at a T-34 from the front at 500 m with 88 mm should pick somewhere that goes through.
    const me = vehicleById('t34-85');
    const shot = simulateShot(me, roundById('pzgr39'), { vehicleId: me.id, roundId: 'pzgr39', distance: 500, origin: v3(aim!.x + 6, aim!.y, aim!.z), dir: arrivalDir(0), seed: 1 }, d.myState);
    expect(shot.summary.penetrated).toBe(true);
  });

  it('plays a full duel to a conclusion with persistent damage and turn order', () => {
    const d = newDuel('t34-85', 'tiger1', 500, 'normal', 3);
    const enemy = vehicleById('tiger1');
    let guard = 0;
    while (d.outcome === 'active' && guard++ < 20) {
      if (d.side === 'player') {
        // Player: side shot into the Tiger's sponson.
        const shot = simulateShot(enemy, roundById('br365k'), { vehicleId: enemy.id, roundId: 'br365k', distance: d.range, origin: v3(-0.5, 1.12, 6), dir: v3(0, 0, -1), seed: 100 + d.turn, turretYaw: 0 }, d.enemyState);
        playerFired(d, shot);
      } else {
        enemyFire(d);
      }
      advance(d);
    }
    expect(d.outcome).not.toBe('active');
    expect(d.log.length).toBeGreaterThanOrEqual(1);
    expect(d.myShots.length + d.enemyShots.length).toBe(d.log.filter((e) => !/holds fire/.test(e.text)).length);
  });

  it('a knocked-out or gunner-less side cannot fire', () => {
    const d = newDuel('t34-85', 'tiger1', 500, 'normal', 3);
    expect(canFire(d, 'player').ok).toBe(true);
    d.myState.crew.gunner.incapacitated = true;
    expect(canFire(d, 'player').ok).toBe(false);
    expect(canFire(d, 'player').reason).toMatch(/gunner/);
    d.enemyState.destroyed = true;
    expect(canFire(d, 'enemy').ok).toBe(false);
    advance(d);
    expect(d.outcome).toBe('won');
  });
});
