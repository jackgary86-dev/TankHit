import { aliveCrew } from '../sim/state';
import type { ShotResult, Vehicle, VehicleState } from '../sim/types';

export type ChallengeStatus = 'active' | 'won' | 'failed';

export interface Challenge {
  id: string;
  name: string;
  brief: string;
  vehicleId: string;
  rounds: string[];
  distance: number;
  maxShots: number;
  /** Shots allowed for 3 and 2 stars; anything up to maxShots earns 1. */
  stars: [number, number];
  won: (v: Vehicle, s: VehicleState, shots: ShotResult[]) => boolean;
  failed?: (v: Vehicle, s: VehicleState, shots: ShotResult[]) => string | null;
}

const knockedOut = (v: Vehicle, s: VehicleState) => s.destroyed || aliveCrew(v, s).length < 2;

export const CHALLENGES: Challenge[] = [
  {
    id: 'first-blood',
    name: 'First Blood',
    brief: 'Knock out the T-34-85 with a 75 mm M72 AP shot. It only penetrates ~80 mm – find the flat plates.',
    vehicleId: 't34-85',
    rounds: ['m72'],
    distance: 300,
    maxShots: 6,
    stars: [2, 4],
    won: knockedOut,
  },
  {
    id: 'pike-nose',
    name: 'Pike Nose',
    brief: 'Knock out the IS-3 with 85 mm BR-365K. The front will not budge – work the angles.',
    vehicleId: 'is3',
    rounds: ['br365k'],
    distance: 200,
    maxShots: 5,
    stars: [2, 3],
    won: knockedOut,
  },
  {
    id: 'hesh-hammer',
    name: 'Hammer, not Nail',
    brief: 'Incapacitate two T-34-85 crew with L35 HESH – no penetrations, only scabbing.',
    vehicleId: 't34-85',
    rounds: ['l35'],
    distance: 500,
    maxShots: 4,
    stars: [2, 3],
    won: (v, s) => v.crew.filter((c) => s.crew[c.id].incapacitated).length >= 2,
  },
  {
    id: 'carousel',
    name: 'Jack in the Box',
    brief: 'Find the T-72B carousel autoloader and cook it off.',
    vehicleId: 't72b',
    rounds: ['m833', 'm456a2'],
    distance: 1000,
    maxShots: 3,
    stars: [1, 2],
    won: (_v, _s, shots) => shots.some((x) => x.summary.cookOff === 'detonation'),
  },
  {
    id: 'two-shots',
    name: 'Two Shots',
    brief: 'Knock out the T-72B using at most two shots. ERA and composite cover the front.',
    vehicleId: 't72b',
    rounds: ['m829a1', 'm830'],
    distance: 1500,
    maxShots: 2,
    stars: [1, 2],
    won: knockedOut,
  },
  {
    id: 'surgical',
    name: 'Surgical',
    brief: 'Penetrate the Abrams turret and incapacitate a turret crewman – without setting off the ammo bustle.',
    vehicleId: 'm1',
    rounds: ['3bm42', '3bk14m'],
    distance: 800,
    maxShots: 3,
    stars: [1, 2],
    won: (v, s, shots) =>
      shots.some((x) => x.summary.penetrated && v.plates.find((p) => p.id === x.summary.firstPlate)?.group === 'turret') &&
      v.crew.some((c) => c.group === 'turret' && s.crew[c.id].incapacitated) &&
      !shots.some((x) => x.summary.cookOff === 'blowout'),
    failed: (_v, _s, shots) => (shots.some((x) => x.summary.cookOff === 'blowout') ? 'The bustle vented – the crew is safe and you are spotted.' : null),
  },
];

export interface ChallengeResult {
  status: ChallengeStatus;
  stars: number;
  reason?: string;
}

export function evaluateChallenge(c: Challenge, v: Vehicle, s: VehicleState, shots: ShotResult[]): ChallengeResult {
  if (c.won(v, s, shots)) {
    const n = shots.length;
    return { status: 'won', stars: n <= c.stars[0] ? 3 : n <= c.stars[1] ? 2 : 1 };
  }
  const reason = c.failed?.(v, s, shots);
  if (reason) return { status: 'failed', stars: 0, reason };
  if (shots.length >= c.maxShots) return { status: 'failed', stars: 0, reason: 'Out of ammunition.' };
  return { status: 'active', stars: 0 };
}

const KEY = 'tankhit.stars';
export function loadStars(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function saveStars(id: string, stars: number) {
  try {
    const all = loadStars();
    if ((all[id] ?? 0) < stars) {
      all[id] = stars;
      localStorage.setItem(KEY, JSON.stringify(all));
    }
  } catch {
    /* storage unavailable – progress just isn't remembered */
  }
}
