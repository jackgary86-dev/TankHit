import { roundById } from '../data/rounds';
import { VEHICLES, vehicleById } from '../data/vehicles';
import { advance, canAngle, canFire, enemyFire, GUN_ROUND, newDuel, playerFired, type Difficulty } from '../modes/duel';
import { narrate } from '../sim/narrative';
import { woundLevel } from '../sim/state';
import type { ShotResult } from '../sim/types';
import { h, select } from './dom';
import type { App } from '../app';

/** Setup overlay: enemy, range, difficulty. */
export function showDuelPicker(app: App) {
  let enemyId = app.vehicleId === app.myVehicleId ? VEHICLES.find((v) => v.id !== app.myVehicleId)!.id : app.vehicleId;
  let range = 800;
  let difficulty: Difficulty = 'normal';
  const start = () => {
    app.overlay.classList.add('hidden');
    startDuel(app, enemyId, range, difficulty);
  };
  app.overlay.classList.remove('hidden');
  app.overlay.replaceChildren(
    h('div', { class: 'picker' },
      h('h2', {}, 'Duel'),
      h('div', { class: 'muted' }, 'Turns alternate. Both tanks keep their damage: lose your gunner and you cannot shoot, lose the enemy driver and it cannot angle. Shots scatter and ranges are estimates.'),
      h('label', {}, 'Your tank'),
      select(VEHICLES.map((v) => ({ value: v.id, label: `[${v.br}] ${v.name} – fires ${roundById(GUN_ROUND[v.id]).name}` })), app.myVehicleId, (id) => app.setMyVehicle(id)),
      h('label', {}, 'Enemy'),
      select(VEHICLES.map((v) => ({ value: v.id, label: `[${v.br}] ${v.name} – fires ${roundById(GUN_ROUND[v.id]).name}` })), enemyId, (id) => (enemyId = id)),
      h('label', {}, 'Range'),
      select([300, 500, 800, 1200, 1800].map((r) => ({ value: String(r), label: `${r} m` })), String(range), (r) => (range = Number(r))),
      h('label', {}, 'Enemy gunner'),
      select([['easy', 'Easy – rough aim, loose dispersion'], ['normal', 'Normal'], ['hard', 'Hard – picks your weakest spot']].map(([v, l]) => ({ value: v, label: l })), difficulty, (d) => (difficulty = d as Difficulty)),
      h('div', { class: 'tutbtns' },
        h('button', { onclick: () => app.setMode('sandbox') }, 'Back'),
        h('button', { class: 'primary', onclick: start }, 'Start duel'),
      ),
    ),
  );
}

export function startDuel(app: App, enemyId: string, range: number, difficulty: Difficulty) {
  app.duel = newDuel(app.myVehicleId, enemyId, range, difficulty, (Math.random() * 2 ** 31) | 0);
  app.distance = range;
  app.respectCamera = false;
  app.yaw = -app.duel.enemyHullYaw; // the enemy angles its hull: my line of fire meets it off-axis
  app.pitch = 1;
  showSide(app, 'enemy');
  app.renderLeft();
  renderDuelPanel(app);
}

/** Display one side's tank with its persistent damage and shot history. */
function showSide(app: App, side: 'enemy' | 'me') {
  const d = app.duel!;
  const id = side === 'enemy' ? d.enemyId : d.myId;
  const state = side === 'enemy' ? d.enemyState : d.myState;
  const shots = side === 'enemy' ? d.myShots : d.enemyShots;
  app.duelShowing = side;
  app.loadVehicleWithState(id, state, shots);
  app.roundId = side === 'enemy' ? app.roundId : GUN_ROUND[d.enemyId];
  app.setTurretYaw(0);
  app.clearAim();
}

/** Called by fire() after my shot resolved against the enemy. */
export function afterPlayerShot(app: App, shot: ShotResult) {
  const d = app.duel!;
  playerFired(d, shot);
  advance(d);
  renderDuelPanel(app);
}

/** The enemy's turn: swap to my tank, resolve its shot, replay it. */
export function enemyTurn(app: App) {
  const d = app.duel!;
  if (d.side !== 'enemy' || d.outcome !== 'active') return;
  showSide(app, 'me');
  const shot = enemyFire(d);
  if (shot) {
    app.vstate = d.myState;
    app.shots = d.enemyShots;
    app.decals.addFromShot(shot);
    app.spent.addFromShot(shot, app.shots.length - 1);
    app.showShot(app.shots.length - 1, true);
  }
  advance(d);
  renderDuelPanel(app);
}

/** Back to aiming at the enemy for my next turn. */
export function playerTurn(app: App) {
  const d = app.duel!;
  if (d.side !== 'player' || d.outcome !== 'active') return;
  app.roundId = GUN_ROUND[d.myId];
  showSide(app, 'enemy');
  app.yaw = -d.enemyHullYaw;
  app.renderLeft();
  renderDuelPanel(app);
}

export function renderDuelPanel(app: App) {
  const d = app.duel;
  const panel = app.duelPanel;
  panel.classList.toggle('hidden', !d);
  if (!d) return;
  const me = vehicleById(d.myId);
  const enemy = vehicleById(d.enemyId);
  const crewRow = (v: typeof me, s: typeof d.myState) =>
    h('div', { class: 'duelcrew' }, ...v.crew.map((c) => {
      const lvl = woundLevel(v, s, c.id);
      return h('span', { class: `crewchip ${lvl.split(' ')[0].toLowerCase()}`, title: `${c.name}: ${lvl}` }, c.role[0].toUpperCase());
    }));
  const fireCheck = canFire(d, 'player');
  let action: HTMLElement;
  if (d.outcome !== 'active') {
    action = h('div', { class: `cstatus ${d.outcome === 'won' ? 'won' : 'failed'}` }, d.outcome === 'won' ? `You won in ${d.turn} turn${d.turn === 1 ? '' : 's'}.` : `Knocked out on turn ${d.turn}.`);
  } else if (d.side === 'player') {
    action = app.duelShowing === 'enemy'
      ? (fireCheck.ok ? h('div', { class: 'cstatus' }, 'Your turn – aim at the enemy and fire.') : h('div', { class: 'cstatus failed' }, `You cannot fire: ${fireCheck.reason}.`, h('button', { onclick: () => { d.log.push({ turn: d.turn, side: 'player', text: `You hold fire: ${fireCheck.reason}.` }); advance(d); renderDuelPanel(app); } }, 'Pass')))
      : h('button', { class: 'primary', onclick: () => playerTurn(app) }, 'Your turn – back to the enemy');
  } else {
    action = h('button', { class: 'primary', onclick: () => enemyTurn(app) }, app.duelShowing === 'me' ? 'Enemy fires' : "Enemy's turn – switch to your tank");
  }
  const angle = h('input', { type: 'range', min: -45, max: 45, step: 5, value: d.myHullYaw, disabled: !canAngle(d, 'player') || d.outcome !== 'active' });
  const angleVal = h('span', { class: 'val' }, `${d.myHullYaw}°`);
  angle.addEventListener('input', () => { d.myHullYaw = Number(angle.value); angleVal.textContent = `${d.myHullYaw}°`; });
  const last = (side: 'player' | 'enemy') => {
    const s = side === 'player' ? d.myShots[d.myShots.length - 1] : d.enemyShots[d.enemyShots.length - 1];
    if (!s) return null;
    const v = side === 'player' ? enemy : me;
    return narrate(s, v, roundById(s.input.roundId)).text;
  };
  panel.replaceChildren(
    h('div', { class: 'row' }, h('h2', {}, `Duel · turn ${d.turn}`), h('span', { class: 'muted' }, d.side === 'player' ? 'you' : 'enemy')),
    h('div', { class: 'duelside' }, h('b', {}, `You · ${me.name}`), crewRow(me, d.myState)),
    h('div', { class: 'duelside' }, h('b', {}, `Enemy · ${enemy.name}`), crewRow(enemy, d.enemyState), h('span', { class: 'muted' }, ` hull ${d.enemyHullYaw}°`)),
    h('label', {}, 'Your hull angle' + (canAngle(d, 'player') ? '' : ' (driver out)')),
    h('div', { class: 'row' }, angle, angleVal),
    action,
    h('h3', {}, 'Log'),
    h('div', { class: 'duellog' }, ...d.log.slice(-8).map((e) => h('div', { class: e.side }, `T${e.turn} ${e.text}`))),
    last(d.side === 'player' ? 'enemy' : 'player') ? h('p', { class: 'story' }, last(d.side === 'player' ? 'enemy' : 'player')!) : '',
    h('div', { class: 'buttons' },
      h('button', { onclick: () => app.showDuelPicker() }, 'New duel'),
      h('button', { onclick: () => app.setMode('sandbox') }, 'Quit'),
    ),
  );
}
