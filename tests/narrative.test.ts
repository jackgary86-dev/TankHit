import { describe, expect, it } from 'vitest';
import { roundById } from '../src/data/rounds';
import { vehicleById } from '../src/data/vehicles';
import { narrate } from '../src/sim/narrative';
import { simulateShot } from '../src/sim/shot';
import { initialState } from '../src/sim/state';
import { norm, v3, type Vec3 } from '../src/sim/vec';

const shoot = (vid: string, rid: string, origin: Vec3, dir: Vec3, seed = 1, distance = 500) => {
  const v = vehicleById(vid);
  const r = roundById(rid);
  const shot = simulateShot(v, r, { vehicleId: vid, roundId: rid, distance, origin, dir: norm(dir), seed }, initialState(v));
  return { shot, text: narrate(shot, v, r).text, chapters: narrate(shot, v, r).chapters };
};

describe('shot narrative', () => {
  it('describes a penetration with crew and module consequences', () => {
    const { shot, text, chapters } = shoot('t34-85', 'pzgr39', v3(0.6, 1.55, 6), v3(0, 0, -1), 11);
    expect(shot.summary.penetrated).toBe(true);
    expect(text).toMatch(/^Penetrated the turret side/);
    expect(text).toMatch(/Result: /);
    expect(chapters[0].kind).toBe('impact');
    expect(chapters[chapters.length - 1].kind).toBe('end');
    for (let i = 1; i < chapters.length; i++) expect(chapters[i].t).toBeGreaterThanOrEqual(chapters[i - 1].t);
  });

  it('describes a stop with the numbers that decided it', () => {
    const { text } = shoot('is3', 'm72', v3(10, 1.1, 0.0), v3(-1, 0, 0), 1, 500);
    expect(text).toMatch(/^Stopped by the/);
    expect(text).toMatch(/\d+ mm effective against \d+ mm/);
  });

  it('describes a ricochet and a miss', () => {
    const r = shoot('t34-85', 'br365k', v3(6, 0.9, 1.4), v3(-0.997, 0, -0.08), 3, 100);
    expect(r.text).toMatch(/^Ricocheted off/);
    const m = shoot('t34-85', 'br365k', v3(0.6, 4.5, 6), v3(0, 0, -1));
    expect(m.text).toMatch(/^Missed/);
  });

  it('tells the cook-off chain when it happens', () => {
    const shots = Array.from({ length: 30 }, (_, i) => shoot('t34-85', 'm82', v3(0.2, 0.58, 6), v3(0, 0, -1), i + 1, 100));
    const det = shots.find((x) => x.shot.summary.cookOff === 'detonation')!;
    expect(det.text).toMatch(/caught fire/);
    expect(det.text).toMatch(/detonated – catastrophic/);
    expect(det.chapters.some((c) => c.kind === 'big')).toBe(true);
  });

  it('mentions ERA when a brick fires', () => {
    const { shot, text } = shoot('t72b', 'm456a2', v3(10, 1.5, 0.3), v3(-1, -0.05, 0));
    expect(shot.impacts[0].kind).toBe('era');
    expect(text).toMatch(/reactive armour brick/);
  });
});
