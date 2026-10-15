import type { Vehicle } from '../../sim/types';
import { IS3 } from './is3';
import { M1_ABRAMS } from './m1_abrams';
import { T34_85 } from './t34_85';
import { T72B } from './t72b';

export const VEHICLES: Vehicle[] = [T34_85, IS3, T72B, M1_ABRAMS];

export const vehicleById = (id: string): Vehicle => {
  const v = VEHICLES.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown vehicle ${id}`);
  return v;
};
