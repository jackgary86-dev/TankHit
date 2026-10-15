// Daily shot: one scenario per calendar day, the same for everyone, three attempts, shareable result.
import { ROUNDS } from '../data/rounds';
import { VEHICLES, vehicleById } from '../data/vehicles';
import { aiAimPoint, arrivalDir, newDuel } from './duel';
import { makeRng, type Vec3 } from '../sim/vec';
import { knockedOut, type Challenge } from './challenges';
import { roundById } from '../data/rounds';
import { penetrationAt } from '../sim/penetration';

export interface DailyScenario {
  /** Days since the epoch below; shown as "Daily #N". */
  number: number;
  date: string; // YYYY-MM-DD (UTC)
  vehicleId: string;
  roundId: string;
  distance: number;
  /** Bearing of the shooter relative to the target's nose, and shot pitch. */
  yaw: number;
  pitch: number;
  turretYaw: number;
  seed: number;
}

const EPOCH_UTC = Date.UTC(2026, 0, 1);
export const dateKey = (d: Date) => d.toISOString().slice(0, 10);

/** Deterministic scenario for a UTC date. Picks a round that can plausibly beat the target somewhere. */
export function dailyScenario(date = new Date()): DailyScenario {
  const day = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - EPOCH_UTC) / 86400000);
  const seed = (day * 2654435761) >>> 0;
  const rng = makeRng(seed);
  const vehicle = VEHICLES[Math.floor(rng() * VEHICLES.length)];
  const distances = [300, 500, 800, 1000, 1500];
  const distance = distances[Math.floor(rng() * distances.length)];
  // Candidate rounds: those whose penetration at this range beats at least the thinnest hull plate's LOS at 60°.
  const weakest = Math.min(...vehicle.plates.filter((p) => p.kind === 'plate').map((p) => p.mm));
  const candidates = ROUNDS.filter((r) => r.family !== 'HE' && (r.family === 'HESH' || penetrationAt(r, distance) > weakest * 2));
  const round = candidates[Math.floor(rng() * candidates.length)] ?? ROUNDS[0];
  const yaw = Math.round((rng() * 2 - 1) * 60 / 5) * 5; // -60..60 in 5-degree steps
  const pitch = [0, 2, 5, 8][Math.floor(rng() * 4)];
  const turretYaw = Math.round((rng() * 2 - 1) * 45 / 5) * 5;
  return { number: day, date: dateKey(date), vehicleId: vehicle.id, roundId: round.id, distance, yaw, pitch, turretYaw, seed };
}

/** The daily as a challenge object the existing challenge machinery can run. */
export function dailyChallenge(s: DailyScenario): Challenge {
  const v = vehicleById(s.vehicleId);
  const r = roundById(s.roundId);
  return {
    id: `daily-${s.date}`,
    name: `Daily #${s.number}`,
    brief: `${v.name} at ${s.distance} m, ${r.name}, bearing ${s.yaw}°, turret at ${s.turretYaw}°. Three shots: knock it out.`,
    vehicleId: s.vehicleId,
    rounds: [s.roundId],
    distance: s.distance,
    maxShots: 3,
    stars: [1, 2],
    fixedAngle: { yaw: s.yaw, pitch: s.pitch },
    turretYaw: s.turretYaw,
    won: knockedOut,
  };
}

/** The scenario's best aim point (hard AI, no noise), used as "yesterday's answer". */
export function dailyAnswer(s: DailyScenario): Vec3 | null {
  const d = newDuel(s.vehicleId, s.vehicleId, s.distance, 'hard', s.seed);
  d.myHullYaw = s.yaw;
  // The duel's aimer samples 'my' tank from arrivalDir(myHullYaw); reuse it against the daily target.
  const dir = arrivalDir(s.yaw, s.pitch);
  void dir;
  return aiAimPoint(d, roundById(s.roundId), s.seed);
}

export interface DailyRecord {
  date: string;
  attempts: number;
  bestStars: number;
  bestShots: number;
  won: boolean;
}

const KEY = 'tankhit.daily';
export function loadDaily(date: string): DailyRecord {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, DailyRecord>;
    return all[date] ?? { date, attempts: 0, bestStars: 0, bestShots: 0, won: false };
  } catch {
    return { date, attempts: 0, bestStars: 0, bestShots: 0, won: false };
  }
}
export function saveDaily(rec: DailyRecord) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, DailyRecord>;
    all[rec.date] = rec;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* no storage */
  }
}

export const MAX_ATTEMPTS = 3;

/** Share text, e.g. "TankHit Daily #123: knocked out in 2 ★★☆". */
export function dailyResultText(s: DailyScenario, rec: DailyRecord): string {
  const stars = '★'.repeat(rec.bestStars) + '☆'.repeat(3 - rec.bestStars);
  return rec.won ? `TankHit Daily #${s.number}: knocked out in ${rec.bestShots} ${stars}` : `TankHit Daily #${s.number}: no kill in ${rec.attempts} attempt${rec.attempts === 1 ? '' : 's'}`;
}
