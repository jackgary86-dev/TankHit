// Campaign progression: challenges unlock as stars accumulate. Sandbox and Compare are never gated.
import { CHALLENGES, loadStars, type Challenge } from './challenges';

/** Total stars needed to unlock each challenge, in list order. */
export const REQUIRES: Record<string, number> = {
  'first-blood': 0,
  'pike-nose': 0,
  'hesh-hammer': 0,
  carousel: 3,
  'two-shots': 3,
  surgical: 6,
  'mobility-kill': 6,
  'belly-shot': 9,
  'cold-kill': 9,
  overpressure: 12,
  'flank-the-abrams': 15,
};

export const MAX_STARS = CHALLENGES.length * 3;

export const totalStars = (stars: Record<string, number> = loadStars()) => Object.values(stars).reduce((a, b) => a + b, 0);

export const isUnlocked = (c: Challenge, stars: Record<string, number> = loadStars()) => totalStars(stars) >= (REQUIRES[c.id] ?? 0);

/** Next locked challenge and how many more stars it needs, or null when everything is open. */
export function nextUnlock(stars: Record<string, number> = loadStars()): { challenge: Challenge; needed: number } | null {
  const total = totalStars(stars);
  const locked = CHALLENGES.filter((c) => (REQUIRES[c.id] ?? 0) > total).sort((a, b) => REQUIRES[a.id] - REQUIRES[b.id]);
  return locked.length ? { challenge: locked[0], needed: REQUIRES[locked[0].id] - total } : null;
}
