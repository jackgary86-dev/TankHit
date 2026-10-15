// Sandboxed preload: exposes only the mods folder listing to the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tankhitDesktop', {
  /** Returns [{ name, text }] for every .json in the user's mods folder. */
  listMods: () => ipcRenderer.invoke('mods:list'),
  /** Absolute path of the mods folder (shown in the Mods panel). */
  modsPath: () => ipcRenderer.invoke('mods:path'),
});
