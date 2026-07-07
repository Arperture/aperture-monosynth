// Preload bridge — exposes a minimal, safe channel so the main-process menu
// (Aperture ▸ Setup…) can reach the sandboxed renderer. No Node APIs leak.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('apertureHost', {
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
});
