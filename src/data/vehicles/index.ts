import type { Vehicle } from '../../sim/types';
import { T34_85 } from './t34_85';

export const VEHICLES: Vehicle[] = [T34_85];

export const vehicleById = (id: string): Vehicle => {
  const v = VEHICLES.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown vehicle ${id}`);
  return v;
};
