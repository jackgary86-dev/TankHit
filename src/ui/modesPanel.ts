import { roundById } from '../data/rounds';
import { vehicleById } from '../data/vehicles';
import { CHALLENGES, loadStars, type Challenge } from '../modes/challenges';
import { compareRounds } from '../modes/compare';
import { isUnlocked, MAX_STARS, nextUnlock, REQUIRES, totalStars } from '../modes/progression';
import { initialState } from '../sim/state';
import type { ShotResult } from '../sim/types';
import { v3 } from '../sim/vec';
import { fmt, h } from './dom';
import { starText, verdictClass } from './widgets';
import type { App, Mode } from '../app';

export function setMode(app: App, m: Mode) {
  app.mode = m;
  app.challenge = null;
  app.duel = null;
  app.renderDuelPanel();
  app.overlay.classList.add('hidden');
  if (m === 'challenges') app.showChallengePicker();
  if (m === 'duel') app.showDuelPicker();
  if (m === 'daily') app.showDailyPicker();
  app.resetDamage();
  app.renderTopbar();
  app.renderLeft();
}

export function renderTopbar(app: App) {
  const tab = (m: Mode, label: string) => h('button', { class: app.mode === m ? 'on' : '', onclick: () => app.setMode(m) }, label);
  app.topbar.replaceChildren(
    h('span', { class: 'logo' }, 'TANK', h('b', {}, 'HIT')),
    tab('sandbox', 'Sandbox'),
    tab('challenges', 'Challenges'),
    tab('compare', 'Compare Rounds'),
    tab('duel', 'Duel'),
    tab('daily', 'Daily'),
    h('button', { class: 'help', title: 'Mods: drop-in vehicles and rounds', onclick: () => app.showModsPanel() }, 'Mods'),
    h('button', { class: 'help', title: 'Show the walkthrough', onclick: () => app.tutorial.show() }, '?'),
  );
}

export function showChallengePicker(app: App) {
  const stars = loadStars();
  const total = totalStars(stars);
  const next = nextUnlock(stars);
  app.overlay.classList.remove('hidden');
  app.overlay.replaceChildren(
    h('div', { class: 'picker' },
      h('div', { class: 'row' }, h('h2', {}, 'Challenges'), h('span', { class: 'total' }, `★ ${total} / ${MAX_STARS}`)),
      h('div', { class: 'muted' }, next
        ? `Fewer shots earn more stars. ${next.needed} more star${next.needed === 1 ? '' : 's'} unlock${next.needed === 1 ? 's' : ''} “${next.challenge.name}”.`
        : 'Fewer shots earn more stars. Everything is unlocked – well done.'),
      ...CHALLENGES.map((c) => {
        const open = isUnlocked(c, stars);
        return h('button', { class: `challenge ${open ? '' : 'locked'}`, disabled: !open, onclick: () => open && app.startChallenge(c) },
          h('div', { class: 'cname' }, c.name, open ? h('span', { class: 'stars' }, starText(stars[c.id] ?? 0)) : h('span', { class: 'lock' }, `★ ${REQUIRES[c.id]} to unlock`)),
          h('div', { class: 'cbrief' }, open ? c.brief : 'Locked.'),
          h('div', { class: 'cmeta' }, `${vehicleById(c.vehicleId).name} · ${c.rounds.map((r) => roundById(r).name).join(' / ')} · ${c.distance} m · ${c.maxShots} shots`),
        );
      }),
      h('button', { class: 'close', onclick: () => app.setMode('sandbox') }, 'Back to sandbox'),
    ),
  );
}

export function startChallenge(app: App, c: Challenge) {
  app.overlay.classList.add('hidden');
  app.challenge = c;
  app.roundId = c.rounds[0];
  app.distance = c.distance;
  if (c.fixedAngle) {
    app.respectCamera = false;
    app.yaw = c.fixedAngle.yaw;
    app.pitch = c.fixedAngle.pitch;
  }
  app.loadVehicle(c.vehicleId);
  app.setTurretYaw(c.turretYaw ?? 0);
  app.clearAim();
  app.renderLeft();
}

export function challengeBox(app: App): HTMLElement | null {
  const c = app.challenge;
  if (!c) return null;
  const res = app.challengeResult ?? { status: 'active', stars: 0 };
  const status =
    res.status === 'won' ? h('div', { class: 'cstatus won' }, 'Complete! ', starText(res.stars)) :
    res.status === 'failed' ? h('div', { class: 'cstatus failed' }, `Failed – ${res.reason ?? ''}`) :
    h('div', { class: 'cstatus' }, `Shots ${app.shots.length} / ${c.maxShots}`);
  return h('div', { class: 'challengebox' },
    h('div', { class: 'cname' }, c.name),
    h('div', { class: 'cbrief' }, c.brief),
    status,
    h('div', { class: 'buttons' },
      h('button', { onclick: () => app.startChallenge(c) }, 'Retry'),
      h('button', { onclick: () => (app.mode === 'daily' ? app.showDailyPicker() : app.showChallengePicker()) }, app.mode === 'daily' ? 'Daily' : 'All challenges'),
    ),
  );
}

export function runCompare(app: App) {
  const a = app.aim ?? app.hover;
  if (!a || !app.compareIds.length) return;
  const seed = (Math.random() * 2 ** 31) | 0;
  app.vstate = initialState(app.vehicle);
  app.shots = compareRounds(app.vehicle, app.compareIds, app.shotOrigin(a), v3(a.dir.x, a.dir.y, a.dir.z), app.distance, seed, app.turretYaw);
  app.showShot(0, true);
  app.renderCompare();
}

export function renderCompare(app: App) {
  const shots = app.shots;
  app.comparePanel.classList.toggle('hidden', !shots.length || app.mode !== 'compare');
  app.right.classList.add('hidden');
  if (!shots.length) return;
  const row = (label: string, f: (s: ShotResult) => string | HTMLElement) =>
    h('tr', {}, h('th', {}, label), ...shots.map((s) => h('td', {}, f(s))));
  const v = app.vehicle;
  app.comparePanel.replaceChildren(
    h('h2', {}, 'Compare Rounds'),
    h('div', { class: 'muted' }, `Same point, same seed, fresh ${v.name} for every round. Click a column to replay it.`),
    h('table', { class: 'cmp' },
      h('tr', {}, h('th', {}), ...shots.map((s, i) => h('th', { class: `col ${i === app.current ? 'on' : ''}`, onclick: () => { app.showShot(i, true); app.renderCompare(); } }, roundById(s.input.roundId).name))),
      row('Family', (s) => roundById(s.input.roundId).family),
      row('Pen @ range', (s) => `${fmt(s.summary.penAtTargetMm)} mm`),
      row('LOS', (s) => `${fmt(s.summary.losMm)} mm`),
      row('Penetrated', (s) => (s.summary.penetrated ? 'Yes' : 'No')),
      row('Residual', (s) => `${fmt(s.summary.residualMm)} mm`),
      row('Spall', (s) => `${s.summary.spallCount}`),
      row('Crew hit', (s) => `${s.summary.crewHit.length}`),
      row('Crew out', (s) => `${s.summary.crewIncapacitated.length}`),
      row('Modules', (s) => `${s.summary.modulesDamaged.length}`),
      row('Cook-off', (s) => (s.summary.cookOff === 'none' ? '—' : s.summary.cookOff)),
      row('Result', (s) => h('span', { class: verdictClass(s.summary.verdict) }, s.summary.verdict)),
    ),
  );
}
