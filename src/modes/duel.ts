// Duel: you and an AI tank take turns; both sides' damage persists. Pure logic – the app drives display.
import { roundById } from '../data/rounds';
import { vehicleById } from '../data/vehicles';
import { dispersionMils, estimatedRangeError, gaussian } from '../sim/ballistics';
import { collectHits, frameOf, simulateShot } from '../sim/shot';
import { isEffective, killProbability, planGrid } from '../sim/killmap';
import { aliveCrew, initialState } from '../sim/state';
import type { Round, ShotResult, Vehicle, VehicleState } from '../sim/types';
import { madd, makeRng, norm, v3, type Vec3 } from '../sim/vec';

export type Difficulty = 'easy' | 'normal' | 'hard';
export type Side = 'player' | 'enemy';
export type DuelOutcome = 'active' | 'won' | 'lost';

/** The main-gun round each vehicle fires back with. */
export const GUN_ROUND: Record<string, string> = {
  't34-85': 'br365k',
  is3: 'br471',
  t72b: '3bm42',
  m1: 'm829a1',
  m4a3: 'm82',
  tiger1: 'pzgr39',
  leo2a4: 'dm53',
};

export interface DuelEvent {
  turn: number;
  side: Side;
  text: string;
}

export interface Duel {
  myId: string;
  enemyId: string;
  range: number;
  difficulty: Difficulty;
  seed: number;
  turn: number;
  side: Side;
  outcome: DuelOutcome;
  myState: VehicleState;
  enemyState: VehicleState;
  myShots: ShotResult[]; // shots I fired (at the enemy)
  enemyShots: ShotResult[]; // shots the enemy fired (at me)
  /** Hull angle each side holds against the other's line of fire (degrees, positive = right side toward them). */
  myHullYaw: number;
  enemyHullYaw: number;
  /** Loader losses: skip every other turn. */
  mySkip: boolean;
  enemySkip: boolean;
  log: DuelEvent[];
}

export function newDuel(myId: string, enemyId: string, range: number, difficulty: Difficulty, seed: number): Duel {
  const enemy = vehicleById(enemyId);
  return {
    myId, enemyId, range, difficulty, seed,
    turn: 1, side: 'player', outcome: 'active',
    myState: initialState(vehicleById(myId)), enemyState: initialState(enemy),
    myShots: [], enemyShots: [],
    myHullYaw: 0,
    // Tanks with a composite front keep it square; plain steel gets more from angling.
    enemyHullYaw: enemy.plates.some((p) => p.id.startsWith('h-ufp') && p.layers && p.layers.length > 1) ? 0 : 30,
    mySkip: false, enemySkip: false,
    log: [],
  };
}

export const knockedOut = (v: Vehicle, s: VehicleState) => s.destroyed || !!s.abandoned || aliveCrew(v, s).length < 2;
const crewOut = (v: Vehicle, s: VehicleState, role: string) => v.crew.some((c) => c.role === role && s.crew[c.id].incapacitated);

/** Whether a side can fire this turn, and why not. */
export function canFire(d: Duel, side: Side): { ok: boolean; reason?: string } {
  const v = vehicleById(side === 'player' ? d.myId : d.enemyId);
  const s = side === 'player' ? d.myState : d.enemyState;
  if (knockedOut(v, s)) return { ok: false, reason: 'knocked out' };
  if (crewOut(v, s, 'gunner') && !s.gunnerReplaced) return { ok: false, reason: 'gunner is out – the gun cannot be laid' };
  if (v.modules.some((m) => m.type === 'breech' && s.moduleHp[m.id] <= 0)) return { ok: false, reason: 'breech is wrecked' };
  if (side === 'player' ? d.mySkip : d.enemySkip) return { ok: false, reason: 'loader is out – still reloading' };
  return { ok: true };
}

export const canAngle = (d: Duel, side: Side) => !crewOut(vehicleById(side === 'player' ? d.myId : d.enemyId), side === 'player' ? d.myState : d.enemyState, 'driver');

/** Line of fire arriving at a tank that holds `hullYaw` degrees against the shooter (tank faces +X). */
export function arrivalDir(hullYaw: number, descentDeg = 0.6): Vec3 {
  const y = (hullYaw * Math.PI) / 180;
  const p = (descentDeg * Math.PI) / 180;
  return norm(v3(-Math.cos(y) * Math.cos(p), -Math.sin(p), -Math.sin(y) * Math.cos(p)));
}

/** The AI's aim: sample my silhouette, score each cell by knock-out probability, add difficulty noise. */
export function aiAimPoint(d: Duel, round: Round, seed: number): Vec3 | null {
  const me = vehicleById(d.myId);
  const dir = arrivalDir(d.myHullYaw);
  const cell = d.difficulty === 'hard' ? 0.3 : 0.4;
  const g = planGrid(me, dir, 0, cell);
  const f = frameOf(me, 0);
  const seeds = d.difficulty === 'hard' ? 3 : 2;
  let best: { p: number; point: Vec3 } | null = null;
  const rng = makeRng(seed);
  for (let j = 0; j < g.rows; j++) {
    for (let i = 0; i < g.cols; i++) {
      const origin = madd(madd(g.origin, g.u, i * g.cell), g.w, j * g.cell);
      const first = collectHits(me, d.myState, origin, g.dir, { modules: false, crew: false }, f).find((h) => h.kind === 'plate');
      if (!first) continue;
      const point = madd(origin, g.dir, first.t);
      const { p } = killProbability(me, d.myState, round, { vehicleId: me.id, roundId: round.id, distance: d.range, origin, dir: g.dir, turretYaw: 0 }, seeds, seed + i * 31 + j * 7);
      const score = p + rng() * (d.difficulty === 'easy' ? 0.5 : d.difficulty === 'normal' ? 0.25 : 0.1);
      if (!best || score > best.p) best = { p: score, point };
    }
  }
  return best?.point ?? null;
}

/** Resolve the enemy's shot at me; returns the shot (also appended) or null if it could not fire. */
export function enemyFire(d: Duel): ShotResult | null {
  const check = canFire(d, 'enemy');
  const round = roundById(GUN_ROUND[d.enemyId] ?? 'br365k');
  const me = vehicleById(d.myId);
  if (!check.ok) {
    d.log.push({ turn: d.turn, side: 'enemy', text: `The ${vehicleById(d.enemyId).name} holds fire: ${check.reason}.` });
    d.enemySkip = false;
    return null;
  }
  const seed = (d.seed * 7919 + d.turn * 104729 + 17) >>> 0;
  const aim = aiAimPoint(d, round, seed);
  if (!aim) return null;
  const dir = arrivalDir(d.myHullYaw);
  // Dispersion and range error, same models as the player's shots.
  const rng = makeRng(seed ^ 0x5bd1e995);
  // The commander on the gun is a worse shot than the gunner was.
  const sigma = dispersionMils(round) / 1000 * (d.difficulty === 'easy' ? 1.8 : d.difficulty === 'normal' ? 1.2 : 1) * (d.enemyState.gunnerReplaced ? 1.6 : 1);
  const mx = gaussian(rng(), rng()) * sigma;
  const my = gaussian(rng(), rng()) * sigma;
  const right = norm(v3(dir.z, 0, -dir.x));
  const up = v3(0, 1, 0);
  const point = madd(madd(aim, right, Math.tan(mx) * d.range), up, Math.tan(my) * d.range);
  const distance = Math.round(d.range * (1 + estimatedRangeError(seed)));
  const shot = simulateShot(me, round, { vehicleId: me.id, roundId: round.id, distance, origin: madd(point, dir, -6), dir, seed, turretYaw: 0 }, d.myState);
  d.myState = shot.stateAfter;
  d.enemyShots.push(shot);
  d.log.push({ turn: d.turn, side: 'enemy', text: `${vehicleById(d.enemyId).name} fires ${round.name}: ${shot.summary.verdict}.` });
  if (crewOut(me, d.myState, 'loader')) d.mySkip = !d.mySkip;
  return shot;
}

/** Record my shot (already simulated by the app against d.enemyState) and advance. */
export function playerFired(d: Duel, shot: ShotResult) {
  d.enemyState = shot.stateAfter;
  if (d.myShots[d.myShots.length - 1] !== shot) d.myShots.push(shot); // the app may share this array
  d.log.push({ turn: d.turn, side: 'player', text: `You fire ${roundById(shot.input.roundId).name}: ${shot.summary.verdict}.` });
  const enemy = vehicleById(d.enemyId);
  if (crewOut(enemy, d.enemyState, 'loader')) d.enemySkip = !d.enemySkip;
}

/** Check for an end and swap sides; returns the new side. */
export function advance(d: Duel): Side {
  const me = vehicleById(d.myId);
  const enemy = vehicleById(d.enemyId);
  if (knockedOut(enemy, d.enemyState)) d.outcome = 'won';
  else if (knockedOut(me, d.myState)) d.outcome = 'lost';
  if (d.outcome !== 'active') return d.side;
  if (d.side === 'player') d.side = 'enemy';
  else {
    d.side = 'player';
    d.turn++;
  }
  return d.side;
}

export const effective = isEffective;
