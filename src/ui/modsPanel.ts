import { installMod, loadStoredMods, storeMods, type ModFile, type ModResult } from '../modes/mods';
import { h } from './dom';
import type { App } from '../app';

declare global {
  interface Window {
    tankhitDesktop?: { listMods: () => Promise<ModFile[]>; modsPath: () => Promise<string> };
  }
}

/** Install everything found in browser storage and (desktop) the mods folder. */
export async function loadModsAtStartup(app: App): Promise<ModResult[]> {
  const files: ModFile[] = [...loadStoredMods()];
  if (window.tankhitDesktop) {
    try {
      files.push(...(await window.tankhitDesktop.listMods()));
    } catch {
      /* no folder */
    }
  }
  app.modResults = files.map(installMod);
  if (app.modResults.some((r) => !r.errors.length)) app.renderLeft();
  return app.modResults;
}

export function showModsPanel(app: App) {
  const stored = loadStoredMods();
  const render = async () => {
    const pathText = window.tankhitDesktop ? await window.tankhitDesktop.modsPath() : '';
    app.overlay.classList.remove('hidden');
    const input = h('input', { type: 'file', accept: '.json', multiple: true });
    input.addEventListener('change', () => addFiles(app, Array.from(input.files ?? [])).then(render));
    const drop = h('div', { class: 'dropzone' }, 'Drop vehicle or round .json files here, or ', h('label', { class: 'linklike' }, 'choose files', input));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); addFiles(app, Array.from(e.dataTransfer?.files ?? [])).then(render); });
    app.overlay.replaceChildren(
      h('div', { class: 'picker' },
        h('h2', {}, 'Mods'),
        h('div', { class: 'muted' }, 'A mod is a JSON file in the same shape as the built-in data: a vehicle (plates, modules, crew, racks, visual) or a round. Same id replaces; see mods/example-vehicle.json and mods/example-round.json in the repository.'),
        pathText ? h('div', { class: 'cmeta' }, `Desktop: files in ${pathText} load at startup.`) : '',
        drop,
        ...app.modResults.map((r) =>
          h('div', { class: `modrow ${r.errors.length ? 'bad' : 'ok'}` },
            h('b', {}, r.name), h('span', { class: 'muted' }, ` ${r.kind}${r.id ? ` · ${r.id}` : ''}`),
            r.errors.length ? h('ul', {}, ...r.errors.slice(0, 6).map((e) => h('li', {}, e))) : h('span', { class: 'okmark' }, ' loaded'),
            stored.some((f) => f.name === r.name) ? h('button', { class: 'small', onclick: () => { storeMods(loadStoredMods().filter((f) => f.name !== r.name)); location.reload(); } }, 'Remove (reloads)') : '',
          )),
        h('div', { class: 'tutbtns' }, h('button', { onclick: () => app.overlay.classList.add('hidden') }, 'Close')),
      ),
    );
  };
  void render();
}

async function addFiles(app: App, files: File[]) {
  const stored = loadStoredMods();
  for (const f of files) {
    const text = await f.text();
    const res = installMod({ name: f.name, text });
    app.modResults = [...app.modResults.filter((r) => r.name !== f.name), res];
    if (!res.errors.length) {
      const i = stored.findIndex((s) => s.name === f.name);
      if (i >= 0) stored[i] = { name: f.name, text };
      else stored.push({ name: f.name, text });
    }
  }
  storeMods(stored);
  app.renderLeft();
}
