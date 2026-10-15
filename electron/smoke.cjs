// Launches the desktop app in self-test mode and exits with its status (see TANKHIT_SMOKE in main.cjs).
const { spawnSync } = require('node:child_process');
const electron = require('electron');

const r = spawnSync(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, TANKHIT_SMOKE: '1', ELECTRON_ENABLE_LOGGING: '1' },
  timeout: 120000,
});
process.exit(r.status ?? 1);
