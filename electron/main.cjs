// Electron shell: serves the Vite build from disk in a native window and remembers the window bounds.
const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const boundsFile = () => path.join(app.getPath('userData'), 'window.json');

function loadBounds() {
  try {
    return JSON.parse(fs.readFileSync(boundsFile(), 'utf8'));
  } catch {
    return { width: 1440, height: 900 };
  }
}

function saveBounds(win) {
  try {
    const b = win.isMaximized() ? { ...win.getNormalBounds(), maximized: true } : win.getBounds();
    fs.writeFileSync(boundsFile(), JSON.stringify(b));
  } catch {
    /* not fatal */
  }
}

/** Keep a remembered window inside the display it is on (monitors get unplugged, resolutions change). */
function clampBounds(b) {
  const area = screen.getDisplayMatching({ x: b.x ?? 0, y: b.y ?? 0, width: b.width, height: b.height }).workArea;
  const width = Math.max(900, Math.min(b.width, area.width));
  const height = Math.max(600, Math.min(b.height, area.height));
  const x = b.x === undefined ? undefined : Math.min(Math.max(b.x, area.x), area.x + area.width - width);
  const y = b.y === undefined ? undefined : Math.min(Math.max(b.y, area.y), area.y + area.height - height);
  return { ...b, x, y, width, height };
}

function createWindow() {
  const saved = clampBounds(loadBounds());
  const win = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: 900,
    minHeight: 600,
    title: 'TankHit',
    backgroundColor: '#15181c',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  if (saved.maximized) win.maximize();
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // Share links and external URLs open in the system browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  let timer;
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(() => saveBounds(win), 300);
  };
  win.on('resize', onChange);
  win.on('move', onChange);
  win.on('close', () => saveBounds(win));

  // TANKHIT_SMOKE=1: run an in-app self-test (used by CI and `npm run smoke`) and exit with its status.
  if (process.env.TANKHIT_SMOKE) {
    win.webContents.on('console-message', (_e, _level, msg) => console.log('[renderer]', msg));
    win.webContents.once('did-finish-load', async () => {
      try {
        const result = await win.webContents.executeJavaScript(`(async () => {
          const a = window.app;
          const T = a.ctx.camera.position.constructor;
          a.respectCamera = false;
          a.aim = { point: new T(0.6, 1.55, 1.0), dir: new T(0, 0, -1) };
          a.fire();
          localStorage.setItem('tankhit.smoke', '1');
          a.toggleKillMap();
          const t0 = Date.now();
          while (a.killOverlay.count === 0 && Date.now() - t0 < 20000) { a.gunnerPickT = 0; a.frame(performance.now()); await new Promise(r => setTimeout(r, 100)); }
          return { verdict: a.shots[0]?.summary.verdict, cells: a.killOverlay.count, storage: localStorage.getItem('tankhit.smoke'), webgl: !!a.ctx.renderer.getContext(), audio: typeof AudioContext };
        })()`);
        console.log('SMOKE', JSON.stringify(result));
        // Layout: every panel must sit inside the viewport at common window sizes, with no sideways scroll.
        const layout = {};
        for (const [w, hgt] of [[1024, 768], [1720, 810], [1366, 768]]) {
          win.setContentSize(w, hgt);
          await new Promise((r) => setTimeout(r, 250));
          layout[`${w}x${hgt}`] = await win.webContents.executeJavaScript(`(() => {
            const bad = [];
            for (const el of document.querySelectorAll('.panel:not(.hidden), .topbar, .timeline:not(.hidden)')) {
              const r = el.getBoundingClientRect();
              if (r.left < 0 || r.right > innerWidth + 0.5 || r.top < 0) bad.push(el.className + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
            }
            return { ok: bad.length === 0 && scrollX === 0, bad, scrollX, w: innerWidth };
          })()`);
        }
        console.log('LAYOUT', JSON.stringify(layout));
        const layoutOk = Object.values(layout).every((l) => l.ok);
        const ok = !!result.verdict && result.cells > 0 && result.storage === '1' && result.webgl && layoutOk;
        app.exit(ok ? 0 : 1);
      } catch (err) {
        console.log('SMOKE error', String(err));
        app.exit(1);
      }
    });
  }
}

/** Drop-in vehicle/round JSON files live in <userData>/mods. */
const modsDir = () => path.join(app.getPath('userData'), 'mods');
ipcMain.handle('mods:path', () => modsDir());
ipcMain.handle('mods:list', () => {
  try {
    fs.mkdirSync(modsDir(), { recursive: true });
    return fs
      .readdirSync(modsDir())
      .filter((f) => f.toLowerCase().endsWith('.json'))
      .map((name) => ({ name, text: fs.readFileSync(path.join(modsDir(), name), 'utf8') }));
  } catch {
    return [];
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
