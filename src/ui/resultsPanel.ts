import { roundById } from '../data/rounds';
import { STATION_LOSS, woundLevel } from '../sim/state';
import { fmt, h } from './dom';
import { stat, verdictClass } from './widgets';
import type { App } from '../app';

export function renderRight(app: App) {
  const shot = app.shots[app.current];
  if (app.mode === 'compare') {
    app.right.classList.add('hidden');
    if (shot) app.renderCompare();
    return;
  }
  if (!shot) {
    app.right.classList.add('hidden');
    return;
  }
  app.right.classList.remove('hidden');
  const s = shot.summary;
  const v = app.vehicle;
  const sev = verdictClass(s.verdict);
  const crewRows = v.crew.map((c) => {
    const lvl = woundLevel(v, shot.stateAfter, c.id);
    const zones = [...new Set(shot.crewHits.filter((x) => x.crewId === c.id).map((x) => x.zone))];
    return h('div', { class: `crewrow ${lvl.split(' ')[0].toLowerCase()}` },
      h('span', {}, c.name, zones.length ? h('small', {}, ` ${zones.join(', ')}`) : null),
      h('span', {}, lvl === 'Incapacitated' ? `${lvl} · ${STATION_LOSS[c.role]}` : lvl));
  });
  app.right.replaceChildren(
    h('div', { class: 'row' }, h('h2', {}, `Shot ${app.current + 1}`), h('button', { class: 'share', onclick: () => app.shareCurrent() }, 'Share link')),
    h('div', { class: `verdict ${sev}` }, s.verdict),
    h('div', { class: 'stats' },
      stat('Round', roundById(shot.input.roundId).name),
      stat('Distance', `${shot.input.distance} m`),
      stat('Penetrated', s.penetrated ? 'Yes' : 'No'),
      stat('Impact angle', `${fmt(s.angleDeg)}°`),
      stat('Pen at target', `${fmt(s.penAtTargetMm)} mm`),
      stat('Armor defeated', `${fmt(s.armorDefeatedMm)} mm`),
      stat('Residual pen', `${fmt(s.residualMm)} mm`),
      stat('Spall fragments', `${s.spallCount}`),
      stat('Cook-off', s.cookOff === 'none' ? 'No' : s.cookOff),
    ),
    h('h3', {}, 'Crew'),
    ...crewRows,
    h('h3', {}, 'Modules hit'),
    s.modulesDamaged.length
      ? h('div', { class: 'modlist' }, ...s.modulesDamaged.map((id) => {
          const m = v.modules.find((x) => x.id === id)!;
          const dead = shot.stateAfter.moduleHp[id] <= 0;
          return h('span', { class: `mod ${dead ? 'dead' : ''}` }, m.name);
        }))
      : h('div', { class: 'muted' }, 'None'),
  );
}
