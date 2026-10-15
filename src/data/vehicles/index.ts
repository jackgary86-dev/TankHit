import type { Vehicle } from '../../sim/types';
import { IS3 } from './is3';
import { LEOPARD_2A4 } from './leopard2a4';
import { M4A3 } from './m4a3';
import { TIGER_I } from './tiger1';
import { M1_ABRAMS } from './m1_abrams';
import { T34_85 } from './t34_85';
import { T72B } from './t72b';

export const VEHICLES: Vehicle[] = [M4A3, T34_85, TIGER_I, IS3, T72B, M1_ABRAMS, LEOPARD_2A4];

export const vehicleById = (id: string): Vehicle => {
  const v = VEHICLES.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown vehicle ${id}`);
  return v;
};
