import { roundById } from '../data/rounds';
import { simulateShot } from '../sim/shot';
import { initialState } from '../sim/state';
import type { ShotResult, Vehicle } from '../sim/types';
import type { Vec3 } from '../sim/vec';

/** Fire each round at the same point on a fresh vehicle with the same seed. */
export function compareRounds(v: Vehicle, roundIds: string[], origin: Vec3, dir: Vec3, distance: number, seed: number, turretYaw = 0): ShotResult[] {
  return roundIds.map((id) =>
    simulateShot(v, roundById(id), { vehicleId: v.id, roundId: id, distance, origin, dir, seed, turretYaw }, initialState(v)),
  );
}
