import { h } from './dom';

/** Plain-language explanations attached as tooltips wherever these terms appear. */
export const GLOSSARY: Record<string, string> = {
  'LOS (equiv.)': 'Line-of-sight thickness: how much armour the round must beat along its path, converted to plain steel (RHA). Sloped plates count for more; composite counts differently against KE and HEAT.',
  Plate: 'Physical thickness of the plate that was struck, in millimetres.',
  Angle: 'Angle between the shot and the plate normal. 0° is a square hit; above ~70° most rounds ricochet.',
  'Your pen': 'How much RHA this round can defeat at the set range. Kinetic rounds lose penetration with distance; HEAT does not.',
  Penetration: 'Millimetres of plain steel (RHA) the round can defeat at this range.',
  'Pen at target': 'Penetration available when the round arrived.',
  'Armor defeated': 'Total RHA-equivalent armour the round went through.',
  'Residual pen': 'Penetration left after the armour – what the round had to spend inside the vehicle.',
  'Spall fragments': 'Pieces of armour and penetrator thrown into the crew compartment after a penetration. Spall, not the hole, is what kills crews.',
  'Cook-off': 'Stowed ammunition catching fire or detonating after being hit.',
  'Impact angle': 'Angle between the shot and the first plate struck.',
  'Turret traverse [Q/E]': 'Rotates the turret so you can test the side and rear of the turret from the front.',
  Distance: 'Range to the target. Kinetic penetration and velocity fall with range; the gunner\'s sight uses it to lay the gun.',
  'Round type': 'APFSDS: long rod, best pure penetration. AP/APHE: full-calibre shot, APHE bursts inside. HEAT: shaped-charge jet, ignores range but hates ERA and spacing. HESH: squashes on and scabs the inside face of thin plates. HE: blast and fragments.',
  Target: 'The vehicle being shot at. Each tank is a data file with real plate thicknesses and layouts.',
};

const KEY = 'tankhit.tutorialDone';

const STEPS: { title: string; body: string }[] = [
  { title: 'Welcome to TankHit', body: 'An armour-penetration sandbox: pick a tank and a round, aim, fire, and watch an X-ray replay of what the shot does inside.' },
  { title: 'Aim', body: 'Hover the hull to inspect the armour under the cursor: plate thickness, impact angle, effective (LOS) thickness and your round\'s penetration, plus the knock-out chance. Click to lock the aim; Esc clears it.' },
  { title: 'Angles', body: 'By default the shot travels along your camera\'s line of sight – orbit to change the angle. Untick "Respect camera angle" to dial yaw and pitch directly. Q/E or the slider traverses the turret.' },
  { title: 'Fire and replay', body: 'Space fires. The replay plays in slow motion: scrub the timeline, change speed, ride the shot path with W/S, switch shots with A/D. V toggles the auto camera.' },
  { title: 'Reading the results', body: 'Green ring = penetration, red = stopped, orange = ricochet. Spall is drawn as yellow streaks; gel dummies show wound channels and turn dark when a crewman is out. Ammo glows before it burns or detonates.' },
  { title: 'Views', body: 'One control picks the view: Painted, Cut (C – the painted tank sliced open with solid cross-sections; press again to cut facing the camera), X-ray (X), Cutaway (Shift+C – X-ray with the cut), Armour map (H) and Kill map (K). Pressing the active view\'s key returns to Painted.' },
  { title: 'The sight', body: 'G drops you into a gunner\'s sight with real shell drop, time of flight and dispersion.' },
  { title: 'Modes', body: 'Sandbox is free fire. Challenges are puzzles with star ratings that unlock more puzzles. Compare Rounds fires several rounds at the same point side by side. Share link reproduces any shot for a friend.' },
];

export class Tutorial {
  readonly el = h('div', { class: 'tutorial hidden' });
  private step = 0;

  constructor() {
    this.render();
  }

  /** Show on first run unless the player has dismissed it before. */
  maybeShow() {
    let done = false;
    try {
      done = localStorage.getItem(KEY) === '1';
    } catch {
      /* no storage */
    }
    if (!done) this.show();
  }

  show() {
    this.step = 0;
    this.render();
    this.el.classList.remove('hidden');
  }

  private dismiss() {
    this.el.classList.add('hidden');
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* no storage */
    }
  }

  private render() {
    const s = STEPS[this.step];
    const last = this.step === STEPS.length - 1;
    this.el.replaceChildren(
      h('div', { class: 'tutcard' },
        h('div', { class: 'tutstep' }, `${this.step + 1} / ${STEPS.length}`),
        h('h3', {}, s.title),
        h('p', {}, s.body),
        h('div', { class: 'tutbtns' },
          h('button', { onclick: () => this.dismiss() }, 'Skip'),
          this.step > 0 ? h('button', { onclick: () => { this.step--; this.render(); } }, 'Back') : '',
          h('button', { class: 'primary', onclick: () => { if (last) this.dismiss(); else { this.step++; this.render(); } } }, last ? 'Start' : 'Next'),
        ),
      ),
    );
  }
}
