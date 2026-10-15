import { FAMILIES, ROUNDS } from '../data/rounds';
import { VEHICLES } from '../data/vehicles';
import { muted } from '../render/audio';
import { killProbability } from '../sim/killmap';
import { penetrationAt } from '../sim/penetration';
import { v3 } from '../sim/vec';
import { fmt, h, select } from './dom';
import { GLOSSARY } from './tutorial';
import { label, stat } from './widgets';
import type { App } from '../app';

export function renderLeft(app: App) {
  app.layGun();
  const r = app.round;
  const fam = r.family;
  const allowed = app.challenge ? ROUNDS.filter((x) => app.challenge!.rounds.includes(x.id)) : ROUNDS;
  const families = FAMILIES.filter((f) => allowed.some((x) => x.family === f));
  const roundsOfFam = allowed.filter((x) => x.family === fam);
  const pen = penetrationAt(r, app.distance);
  const dist = h('input', { type: 'range', min: 0, max: 3000, step: 50, value: app.distance, disabled: !!app.challenge });
  const distVal = h('span', { class: 'val' }, `${app.distance} m`);
  const penVal = h('span', { class: 'val' }, `${fmt(pen)} mm`);
  dist.addEventListener('input', () => {
    app.distance = Number(dist.value);
    distVal.textContent = `${app.distance} m`;
    penVal.textContent = `${fmt(penetrationAt(app.round, app.distance))} mm`;
    app.layGun();
    app.updatePreview();
  });
  const angleCtl = h('div', { class: app.respectCamera ? 'hidden' : 'angles' });
  if (!app.respectCamera) {
    const locked = !!app.challenge?.fixedAngle;
    const yaw = h('input', { type: 'range', min: -180, max: 180, step: 1, value: app.yaw, disabled: locked });
    const pitch = h('input', { type: 'range', min: -20, max: 70, step: 1, value: app.pitch, disabled: locked });
    const yv = h('span', { class: 'val' }, `${app.yaw}°`);
    const pv = h('span', { class: 'val' }, `${app.pitch}°`);
    yaw.addEventListener('input', () => { app.yaw = Number(yaw.value); yv.textContent = `${app.yaw}°`; app.updatePreview(); });
    pitch.addEventListener('input', () => { app.pitch = Number(pitch.value); pv.textContent = `${app.pitch}°`; app.updatePreview(); });
    angleCtl.append(h('label', {}, 'Yaw (0 = frontal)'), h('div', { class: 'row' }, yaw, yv), h('label', {}, 'Pitch (down)'), h('div', { class: 'row' }, pitch, pv));
  }
  const tur = h('input', { type: 'range', min: -180, max: 180, step: 1, value: app.turretYaw, 'data-turret': true });
  const turVal = h('span', { class: 'val' }, `${app.turretYaw}°`);
  tur.disabled = !!app.challenge;
  tur.addEventListener('input', () => app.setTurretYaw(Number(tur.value)));
  const cam = h('input', { type: 'checkbox', disabled: !!app.challenge?.fixedAngle });
  cam.checked = app.respectCamera;
  cam.addEventListener('change', () => {
    app.respectCamera = cam.checked;
    app.renderLeft();
    app.updatePreview();
  });

  const target = select(VEHICLES.map((v) => ({ value: v.id, label: `[${v.br}] ${v.name}` })), app.vehicleId, (id) => {
    app.loadVehicle(id);
    app.clearAim();
    app.renderLeft();
  });
  target.disabled = !!app.challenge;
  const compareList = app.mode === 'compare'
    ? h('div', { class: 'cmplist' },
        h('label', {}, `Rounds to compare (${app.compareIds.length}/4)`),
        ...ROUNDS.map((x) => {
          const cb = h('input', { type: 'checkbox' });
          cb.checked = app.compareIds.includes(x.id);
          cb.disabled = !cb.checked && app.compareIds.length >= 4;
          cb.addEventListener('change', () => {
            app.compareIds = cb.checked ? [...app.compareIds, x.id] : app.compareIds.filter((id) => id !== x.id);
            app.renderLeft();
          });
          return h('label', { class: 'check small' }, cb, ` ${x.name}`, h('span', { class: 'muted' }, ` ${x.family}`));
        }))
    : null;

  app.left.replaceChildren(
    h('h2', {}, app.mode === 'compare' ? 'Compare Rounds' : app.challenge ? 'Challenge' : 'Protection Analysis'),
    app.challengeBox() ?? '',
    label('Target'),
    target,
    h('div', { class: 'desc' }, app.vehicle.description),
    label('Round type'),
    select(families.map((f) => ({ value: f, label: f })), fam, (f) => {
      app.roundId = allowed.find((x) => x.family === f)!.id;
      app.renderLeft();
      app.updatePreview();
    }),
    h('label', {}, 'Shell'),
    select(roundsOfFam.map((x) => ({ value: x.id, label: `${x.name} — ${x.gun}` })), app.roundId, (id) => {
      app.roundId = id;
      app.renderLeft();
      app.updatePreview();
    }),
    h('div', { class: 'desc' }, r.description),
    h('div', { class: 'stats' },
      stat('Calibre', `${r.caliber} mm`),
      stat('Velocity', `${r.velocity} m/s`),
      stat('Mass', `${r.mass} kg`),
      stat('Filler', r.filler ? `${r.filler} kg` : '—'),
    ),
    label('Distance'),
    h('div', { class: 'row' }, dist, distVal),
    label('Turret traverse [Q/E]'),
    h('div', { class: 'row' }, tur, turVal),
    h('div', { class: 'row big tip', title: GLOSSARY.Penetration }, h('span', {}, 'Penetration'), penVal),
    h('label', { class: 'check' }, cam, ' Respect camera angle'),
    angleCtl,
    app.aimBox,
    compareList ?? '',
    h('div', { class: 'buttons' },
      h('button', { class: 'fire', onclick: () => app.fire() }, app.mode === 'compare' ? 'COMPARE  [Space]' : 'FIRE  [Space]'),
      h('button', { onclick: () => app.clearAim() }, 'Clear aim [Esc]'),
      h('button', { onclick: () => app.resetDamage() }, 'Repair vehicle'),
    ),
    h('div', { class: 'buttons' },
      h('button', { class: app.xray ? 'on' : '', onclick: () => app.toggleXray() }, 'X-ray [X]'),
      h('button', { class: app.section !== 'off' ? 'on' : '', onclick: () => app.cycleSection() }, `Section: ${app.section} [C]`),
      h('button', { class: app.heat ? 'on' : '', onclick: () => app.toggleHeat() }, 'Armor map [H]'),
      h('button', { class: app.killMap ? 'on' : '', onclick: () => app.toggleKillMap() }, 'Kill map [K]'),
      h('button', { class: app.gunner.active ? 'on' : '', onclick: () => app.toggleGunner() }, "Gunner's sight [G]"),
      h('button', { class: app.autoCam ? 'on' : '', onclick: () => app.toggleAutoCam() }, 'Auto camera [V]'),
      h('button', { class: muted ? '' : 'on', onclick: () => app.toggleMute() }, muted ? 'Sound off [M]' : 'Sound on [M]'),
    ),
    h('div', { class: 'hint' }, 'Drag to orbit · click armor to lock aim · Space to fire'),
  );
  app.renderAimBox();
}

export function renderAimBox(app: App) {
  const p = app.preview;
  if (!p) {
    app.aimBox.replaceChildren(h('div', { class: 'muted' }, 'Hover the hull to inspect armor'));
    return;
  }
  const a = app.aim ?? app.hover;
  let kill = '';
  if (a) {
    const d = v3(a.dir.x, a.dir.y, a.dir.z);
    const { p: kp, pen } = killProbability(app.vehicle, app.vstate, app.round, { vehicleId: app.vehicleId, roundId: app.roundId, distance: app.distance, origin: app.shotOrigin(a), dir: d, turretYaw: app.turretYaw }, 16);
    kill = `${Math.round(kp * 100)}% knock-out · ${Math.round(pen * 100)}% pen`;
  }
  const chip = h('span', { class: `chip ${p.rating}` }, kill || (p.rating === 'good' ? 'Likely penetration' : p.rating === 'marginal' ? 'Marginal' : p.ricochet > 0.5 ? 'Ricochet likely' : 'Unlikely'));
  app.aimBox.replaceChildren(
    h('div', { class: 'aimtitle' }, p.plate.name, app.aim ? h('span', { class: 'lock' }, 'LOCKED') : null),
    h('div', { class: 'stats' },
      stat('Plate', `${fmt(p.plate.mm)} mm`),
      stat('Angle', `${fmt(p.angleDeg)}°`),
      stat('LOS (equiv.)', `${fmt(p.losMm)} mm`),
      stat('Your pen', `${fmt(p.penMm)} mm`),
    ),
    chip,
  );
}
