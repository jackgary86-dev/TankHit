import { roundById } from '../data/rounds';
import { sfx } from '../render/audio';
import type { ShotResult } from '../sim/types';
import { h } from './dom';
import { verdictClass } from './widgets';
import type { App } from '../app';

export function togglePlay(app: App) {
  const shot = app.shots[app.current];
  if (!shot) return;
  if (!app.playing && app.replayT >= shot.duration - 1e-3) app.replayT = 0;
  app.playing = !app.playing;
  app.syncTimeline();
}

export function stepShot(app: App, d: number) {
  if (!app.shots.length) return;
  const i = Math.max(0, Math.min(app.shots.length - 1, app.current + d));
  if (i !== app.current) app.showShot(i, true);
}

/** Play sound cues for replay events crossed between the previous and current replay time. */
export function playSounds(_app: App, shot: ShotResult, from: number, to: number) {
  const crossed = (t: number) => t > from && t <= to;
  if (from <= 0 && to > 0) sfx.fire();
  for (const imp of shot.impacts) {
    if (!crossed(imp.t)) continue;
    const k = Math.min(1, ((imp.penMm ?? 100) / 500) * 0.7 + 0.3);
    if (imp.kind === 'pen') sfx.pen(k);
    else if (imp.kind === 'nonpen') sfx.nonpen(k);
    else if (imp.kind === 'ricochet') sfx.ricochet(k);
    else if (imp.kind === 'shatter') sfx.nonpen(k);
    else sfx.blast();
  }
  for (const e of shot.bigEvents) {
    if (!crossed(e.t)) continue;
    if (e.kind === 'detonation') sfx.detonation();
    else if (e.kind === 'blowout') sfx.whoosh();
    else if (e.kind === 'fire') sfx.crackle();
  }
}

export function renderTimeline(app: App) {
  const shot = app.shots[app.current];
  app.timeline.classList.toggle('hidden', !shot);
  if (!shot) return;
  app.tlPlay = h('button', { class: 'play', onclick: () => app.togglePlay() }, '>');
  app.tlRange = h('input', { type: 'range', min: 0, max: shot.duration.toFixed(3), step: 0.005, value: app.replayT });
  app.tlRange.addEventListener('input', () => {
    app.playing = false;
    app.replayT = Number(app.tlRange.value);
    app.syncTimeline();
  });
  app.tlTime = h('span', { class: 'time' });
  const speeds = [0.1, 0.25, 1].map((sp) =>
    h('button', { class: `speed ${app.speed === sp ? 'on' : ''}`, onclick: () => { app.speed = sp; app.renderTimeline(); } }, `${sp}x`),
  );
  // Event ticks along the scrubber.
  const ticks = h('div', { class: 'ticks' });
  const mark = (t: number, cls: string) => ticks.append(h('i', { class: cls, style: `left:${(100 * t) / shot.duration}%` }));
  for (const imp of shot.impacts) mark(imp.t, imp.kind);
  for (const e of shot.bigEvents) mark(e.t, e.kind);
  const track = h('div', { class: 'track' }, app.tlRange, ticks);
  app.timeline.replaceChildren(app.tlPlay, track, app.tlTime, ...speeds,
    h('span', { class: 'keys' }, 'P play/pause  ·  A/D switch shot  ·  W/S ride shot path (Shift = faster)  ·  R reset camera'));
  app.syncTimeline();
}

export function syncTimeline(app: App) {
  const shot = app.shots[app.current];
  if (!shot || !app.tlRange) return;
  app.tlRange.value = String(app.replayT);
  app.tlTime.textContent = `${app.replayT.toFixed(2)} / ${shot.duration.toFixed(2)} s`;
  app.tlPlay.textContent = app.playing ? '||' : '>';
}

export function renderLog(app: App) {
  app.log.classList.toggle('hidden', !app.shots.length);
  app.log.replaceChildren(
    h('span', { class: 'title' }, 'Hits'),
    ...app.shots.map((s, i) =>
      h('button', { class: `entry ${i === app.current ? 'on' : ''} ${verdictClass(s.summary.verdict)}`, onclick: () => app.showShot(i, true) },
        h('b', {}, `#${i + 1}`), ` ${roundById(s.input.roundId).name} · ${s.summary.verdict}`),
    ),
  );
  app.log.scrollLeft = app.log.scrollWidth;
}
