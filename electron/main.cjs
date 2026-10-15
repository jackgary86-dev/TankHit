// Electron shell: serves the Vite build from disk in a native window and remembers the window bounds.
const { app, BrowserWindow, shell } = require('electron');
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

function createWindow() {
  const saved = loadBounds();
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
    webPreferences: { contextIsolation: true, sandbox: true },
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
        const ok = !!result.verdict && result.cells > 0 && result.storage === '1' && result.webgl;
        app.exit(ok ? 0 : 1);
      } catch (err) {
        console.log('SMOKE error', String(err));
        app.exit(1);
      }
    });
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
