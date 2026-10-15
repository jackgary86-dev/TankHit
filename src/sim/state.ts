import type { CrewState, CrewZoneId, Vehicle, VehicleState } from './types';

export function initialState(v: Vehicle): VehicleState {
  const moduleHp: Record<string, number> = {};
  for (const m of v.modules) moduleHp[m.id] = m.hp;
  const crew: Record<string, CrewState> = {};
  for (const c of v.crew) {
    const zoneHp = {} as Record<CrewZoneId, number>;
    for (const z of c.zones) zoneHp[z.zone] ??= z.hp;
    crew[c.id] = { zoneHp, incapacitated: false };
  }
  return { moduleHp, ammoGone: {}, crew, eraSpent: {}, destroyed: false, onFire: false };
}

export const cloneState = (s: VehicleState): VehicleState => structuredClone(s);

export type WoundLevel = 'Unhurt' | 'Lightly wounded' | 'Severely wounded' | 'Incapacitated';

/** Aggregate wound level of a crew member from zone HP. */
export function woundLevel(v: Vehicle, s: VehicleState, crewId: string): WoundLevel {
  const c = v.crew.find((x) => x.id === crewId)!;
  const st = s.crew[crewId];
  if (st.incapacitated) return 'Incapacitated';
  let max = 0;
  let cur = 0;
  const seen = new Set<string>();
  for (const z of c.zones) {
    if (seen.has(z.zone)) continue;
    seen.add(z.zone);
    max += z.hp;
    cur += Math.max(0, st.zoneHp[z.zone]);
  }
  const lost = 1 - cur / max;
  if (lost <= 0.001) return 'Unhurt';
  if (lost < 0.3) return 'Lightly wounded';
  return 'Severely wounded';
}

/** Crew members still able to work. */
export const aliveCrew = (v: Vehicle, s: VehicleState) => v.crew.filter((c) => !s.crew[c.id].incapacitated);
