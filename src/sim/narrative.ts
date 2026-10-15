// Plain-language story of a shot, built from the events the simulation already recorded.
import type { ImpactEvent, Round, ShotResult, Vehicle } from './types';

export interface Chapter {
  t: number;
  label: string;
  kind: 'impact' | 'crew' | 'module' | 'ammo' | 'big' | 'end';
}

export interface Narrative {
  text: string;
  chapters: Chapter[];
}

const plateName = (v: Vehicle, id?: string) => v.plates.find((p) => p.id === id)?.name.toLowerCase() ?? 'armour';
const crewName = (v: Vehicle, id: string) => v.crew.find((c) => c.id === id)?.name.toLowerCase() ?? id;
const moduleName = (v: Vehicle, id: string) => v.modules.find((m) => m.id === id)?.name.toLowerCase() ?? id;
const rackName = (v: Vehicle, id?: string) => v.racks.find((r) => r.id === id)?.name.toLowerCase() ?? 'ammunition';
const deg = (a?: number) => `${Math.round(a ?? 0)}°`;
const mm = (x?: number) => `${Math.round(x ?? 0)} mm`;

function impactSentence(v: Vehicle, r: Round, imp: ImpactEvent, first: boolean): string {
  const plate = plateName(v, imp.plateId);
  switch (imp.kind) {
    case 'pen':
      return first ? `Penetrated the ${plate} at ${deg(imp.angleDeg)} (${mm(imp.losMm)} of armour, ${mm(imp.penMm)} available)` : `went on through the ${plate}`;
    case 'nonpen':
      return first ? `Stopped by the ${plate} at ${deg(imp.angleDeg)}: ${mm(imp.losMm)} effective against ${mm(imp.penMm)} of penetration` : `stopped in the ${plate}`;
    case 'ricochet':
      return `Ricocheted off the ${plate} at ${deg(imp.angleDeg)}`;
    case 'shatter':
      return `Shattered on the ${plate} – uncapped shot against thick plate at high velocity`;
    case 'era':
      return `Set off a reactive armour brick on the ${plate}, which stripped ${mm(imp.penMm)} of penetration from the ${r.family === 'HEAT' ? 'jet' : 'penetrator'}`;
    case 'scab':
      return `Squashed onto the ${plate} and scabbed its inside face`;
    case 'explode':
      return imp.plateId && r.family !== 'APHE' ? `Detonated on the ${plate} without getting through` : `the filler burst inside`;
  }
}

/** Narrate a shot. Deterministic and cheap; safe to call every render. */
export function narrate(shot: ShotResult, v: Vehicle, r: Round): Narrative {
  const chapters: Chapter[] = [];
  const parts: string[] = [];
  const s = shot.summary;

  if (!shot.impacts.length) {
    return { text: `Missed the ${v.name} entirely.`, chapters: [{ t: 0, label: 'Miss', kind: 'end' }] };
  }

  // Armour sequence.
  let firstPlate = true;
  for (const imp of shot.impacts) {
    const sentence = impactSentence(v, r, imp, firstPlate);
    if (imp.kind !== 'era') firstPlate = false;
    parts.push(sentence);
    chapters.push({ t: imp.t, label: { pen: 'Penetration', nonpen: 'Stopped', ricochet: 'Ricochet', shatter: 'Shatter', era: 'ERA', scab: 'Scab', explode: r.family === 'APHE' ? 'Burst' : 'Detonation' }[imp.kind], kind: 'impact' });
  }

  // Crew.
  const byCrew = new Map<string, number>();
  for (const h of shot.crewHits) if (!byCrew.has(h.crewId)) byCrew.set(h.crewId, h.t);
  const killed = s.crewIncapacitated.filter((id) => byCrew.has(id));
  const wounded = [...byCrew.keys()].filter((id) => !s.crewIncapacitated.includes(id));
  const spallWord = s.spallCount > 0 ? 'spall' : 'the round';
  if (killed.length) {
    const woundedTail = wounded.length ? ` and wounded the ${list(wounded.map((id) => crewName(v, id)))}` : '';
    parts.push(`${spallWord} put the ${list(killed.map((id) => crewName(v, id)))} out of action${woundedTail}`);
    const t = Math.min(...killed.map((id) => byCrew.get(id)!));
    chapters.push({ t, label: `${crewName(v, killed[0])} out`, kind: 'crew' });
  } else if (wounded.length) {
    parts.push(`${spallWord} wounded the ${list(wounded.map((id) => crewName(v, id)))}`);
  }

  // Modules.
  if (s.modulesDestroyed.length) {
    const named = s.modulesDestroyed.filter((id) => v.modules.find((m) => m.id === id)?.type !== 'ammo');
    if (named.length) {
      parts.push(`wrecked the ${list(named.map((id) => moduleName(v, id)))}`);
      const t = shot.moduleHits.find((h) => h.moduleId === named[0])?.t ?? 0;
      chapters.push({ t, label: `${moduleName(v, named[0])} destroyed`, kind: 'module' });
    }
  }

  // Ammunition.
  const ignite = shot.ammoEvents.find((e) => e.kind === 'ignite');
  if (ignite) {
    const m = v.modules.find((x) => x.id === ignite.moduleId);
    parts.push(`a fragment struck ${m ? `a ${m.name.toLowerCase()}` : 'a round'} in the ${rackName(v, m?.ammo?.rack)}, which caught fire`);
    chapters.push({ t: ignite.t, label: 'Ammo ignites', kind: 'ammo' });
  }
  for (const e of shot.bigEvents) {
    if (e.kind === 'detonation') {
      parts.push(`the ${rackName(v, e.rack)} detonated – catastrophic`);
      chapters.push({ t: e.t, label: 'Detonation', kind: 'big' });
    } else if (e.kind === 'blowout') {
      parts.push(`the ${rackName(v, e.rack)} vented through its blow-out panels and the crew were spared`);
      chapters.push({ t: e.t, label: 'Blow-out', kind: 'big' });
    } else if (e.kind === 'fire' && !ignite) {
      parts.push('fuel caught fire');
      chapters.push({ t: e.t, label: 'Fire', kind: 'big' });
    }
  }

  if (parts.length === 1 && s.penetrated) parts.push('but nothing of value was hit');

  const text = sentenceCase(parts.join('; ')) + `. Result: ${s.verdict}.`;
  chapters.push({ t: shot.duration, label: s.verdict, kind: 'end' });
  chapters.sort((a, b) => a.t - b.t);
  return { text, chapters };
}

function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
