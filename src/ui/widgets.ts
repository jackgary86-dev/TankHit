import { h } from './dom';
import { GLOSSARY } from './tutorial';

export function verdictClass(v: string) {
  return v.startsWith('Catastrophic') || v === 'Knocked out' ? 'bad' : v === 'Disabled' || v === 'Crew injured' ? 'warn' : v.startsWith('Non') || v === 'Ricochet' ? 'muted' : 'ok';
}

export const starText = (n: number) =>
  h('span', { class: 'starset' }, ...[0, 1, 2].map((i) => h('i', { class: i < n ? 'full' : '' }, i < n ? '★' : '☆')));

export function stat(k: string, v: string) {
  const tip = GLOSSARY[k];
  return h('div', { class: `stat ${tip ? 'tip' : ''}`, title: tip }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
}

/** Section label with a glossary tooltip when one exists. */
export function label(text: string, cls = '') {
  const tip = GLOSSARY[text];
  return h('label', { class: `${cls} ${tip ? 'tip' : ''}`.trim(), title: tip }, text);
}
