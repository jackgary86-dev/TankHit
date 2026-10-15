// Web Worker: computes the kill-probability map row by row so the page stays responsive.
import { roundById } from '../data/rounds';
import { vehicleById } from '../data/vehicles';
import { killRow, planGrid, type KillCell, type KillGrid } from './killmap';
import type { VehicleState } from './types';
import type { Vec3 } from './vec';

export interface KillMapRequest {
  id: number;
  vehicleId: string;
  roundId: string;
  distance: number;
  yawDeg: number;
  state: VehicleState;
  dir: Vec3;
  cell: number;
  seeds: number;
}

export type KillMapMessage =
  | { id: number; kind: 'grid'; grid: KillGrid }
  | { id: number; kind: 'row'; j: number; cells: KillCell[] }
  | { id: number; kind: 'done' };

let current = 0;

self.onmessage = (e: MessageEvent<KillMapRequest>) => {
  const req = e.data;
  current = req.id;
  const v = vehicleById(req.vehicleId);
  const r = roundById(req.roundId);
  const grid = planGrid(v, req.dir, req.yawDeg, req.cell);
  const post = (m: KillMapMessage) => (self as unknown as Worker).postMessage(m);
  post({ id: req.id, kind: 'grid', grid });
  let j = 0;
  const step = () => {
    if (current !== req.id) return; // superseded
    const cells = killRow(v, req.state, r, grid, j, req.distance, req.yawDeg, req.seeds);
    post({ id: req.id, kind: 'row', j, cells });
    j++;
    if (j < grid.rows) setTimeout(step, 0);
    else post({ id: req.id, kind: 'done' });
  };
  step();
};
