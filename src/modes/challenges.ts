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
  /** Lock the firing angle (manual yaw/pitch) instead of shooting along the camera. */
  fixedAngle?: { yaw: number; pitch: number };
  /** Turret traverse the target is holding. */
  turretYaw?: number;
  won: (v: Vehicle, s: VehicleState, shots: ShotResult[]) => boolean;
  failed?: (v: Vehicle, s: VehicleState, shots: ShotResult[]) => string | null;
}

// ---------------------------------------------------------------- objective helpers

export const knockedOut = (v: Vehicle, s: VehicleState) => s.destroyed || !!s.abandoned || aliveCrew(v, s).length < 2;
export const incapacitated = (v: Vehicle, s: VehicleState) => v.crew.filter((c) => s.crew[c.id].incapacitated).length;
export const disabledOrWorse = (v: Vehicle, s: VehicleState, shots: ShotResult[]) =>
  knockedOut(v, s) || shots.some((x) => x.summary.verdict === 'Disabled');
const moduleDead = (v: Vehicle, s: VehicleState, type: string) => v.modules.some((m) => m.type === type && s.moduleHp[m.id] <= 0);
const plateGroupOf = (v: Vehicle, plateId?: string) => v.plates.find((p) => p.id === plateId)?.group;

/** Fail as soon as a shot strikes anything other than the named plates first. */
const onlyVia = (allowed: string[], label: string) => (v: Vehicle, _s: VehicleState, shots: ShotResult[]) => {
  const bad = shots.find((x) => x.summary.firstPlate && !allowed.includes(x.summary.firstPlate));
  return bad ? `Hit ${v.plates.find((p) => p.id === bad.summary.firstPlate)?.name ?? 'armour'} – only the ${label} counts.` : null;
};
const noCookoff = (_v: Vehicle, _s: VehicleState, shots: ShotResult[]) =>
  shots.some((x) => x.summary.cookOff !== 'none') ? 'The ammunition went up – that was not the plan.' : null;
const noCasualties = (v: Vehicle, s: VehicleState) => (incapacitated(v, s) > 0 ? 'A crewman is down – the brief was no casualties.' : null);

export const CHALLENGES: Challenge[] = [
  {
    id: 'first-blood',
    name: 'First Blood',
    brief: 'Disable the T-34-85 head-on with 75 mm M72 AP from 1500 m. It only penetrates ~64 mm here – the glacis shrugs it off, so find the hatch or the MG mount.',
    vehicleId: 't34-85',
    rounds: ['m72'],
    distance: 1500,
    maxShots: 6,
    stars: [2, 4],
    fixedAngle: { yaw: 0, pitch: 2 },
    won: disabledOrWorse,
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
    won: (v, s) => incapacitated(v, s) >= 2,
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
      shots.some((x) => x.summary.penetrated && plateGroupOf(v, x.summary.firstPlate) === 'turret') &&
      v.crew.some((c) => c.group === 'turret' && s.crew[c.id].incapacitated) &&
      !shots.some((x) => x.summary.cookOff === 'blowout'),
    failed: (_v, _s, shots) => (shots.some((x) => x.summary.cookOff === 'blowout') ? 'The bustle vented – the crew is safe and you are spotted.' : null),
  },
  {
    id: 'mobility-kill',
    name: 'Mobility Kill',
    brief: 'Wreck the T-34-85 engine with 90 mm M82 APC without hurting a single crewman. Think about where the spall goes.',
    vehicleId: 't34-85',
    rounds: ['m82'],
    distance: 500,
    maxShots: 3,
    stars: [1, 2],
    won: (v, s) => moduleDead(v, s, 'engine') && incapacitated(v, s) === 0,
    failed: noCasualties,
  },
  {
    id: 'belly-shot',
    name: 'Belly Shot',
    brief: 'The T-72B glacis is under ERA, but the lower front plate is bare 80 mm steel. Knock it out head-on through the lower plate only.',
    vehicleId: 't72b',
    rounds: ['m833'],
    distance: 1000,
    maxShots: 3,
    stars: [1, 2],
    fixedAngle: { yaw: 0, pitch: 3 },
    won: knockedOut,
    failed: onlyVia(['h-lfp'], 'lower front plate'),
  },
  {
    id: 'cold-kill',
    name: 'Cold Kill',
    brief: 'Knock out the T-72B with 3BM42 without touching the ammunition. One cook-off and the exercise is over.',
    vehicleId: 't72b',
    rounds: ['3bm42'],
    distance: 800,
    maxShots: 3,
    stars: [1, 2],
    won: knockedOut,
    failed: noCookoff,
  },
  {
    id: 'overpressure',
    name: 'Overpressure',
    brief: 'Only 122 mm OF-471 HE in the rack. Take down two T-34-85 crew with blast – thin roofs and flat plates are your friends.',
    vehicleId: 't34-85',
    rounds: ['of471'],
    distance: 300,
    maxShots: 4,
    stars: [1, 3],
    won: (v, s) => incapacitated(v, s) >= 2,
  },
  {
    id: 'flank-the-abrams',
    name: 'Flank the Abrams',
    brief: 'The Abrams has its turret turned 30° to its left. Use 120 mm L31 HESH on the thin hull plates to incapacitate a crewman.',
    vehicleId: 'm1',
    rounds: ['l31'],
    distance: 600,
    maxShots: 3,
    stars: [1, 2],
    turretYaw: -30,
    won: (v, s) => incapacitated(v, s) >= 1,
  },
];

export interface ChallengeResult {
  status: ChallengeStatus;
  stars: number;
  reason?: string;
}

export function evaluateChallenge(c: Challenge, v: Vehicle, s: VehicleState, shots: ShotResult[]): ChallengeResult {
  const reason = c.failed?.(v, s, shots);
  if (reason) return { status: 'failed', stars: 0, reason };
  if (c.won(v, s, shots)) {
    const n = shots.length;
    return { status: 'won', stars: n <= c.stars[0] ? 3 : n <= c.stars[1] ? 2 : 1 };
  }
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
