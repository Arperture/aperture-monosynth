// Aperture — Electron main process
// Serves the renderer over a custom app:// protocol (standard scheme) so that
// AudioWorklet module loading and fetch() work without file:// restrictions,
// and grants Web MIDI permission so a USB MIDI keyboard works out of the box.

const { app, BrowserWindow, protocol, session, net, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const APP_ROOT = path.join(__dirname, 'app');
const WIN_W = 1500;
const WIN_H = 1150;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    minWidth: 700,
    minHeight: 530,
    backgroundColor: '#12161D',
    title: 'Aperture',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAspectRatio(WIN_W / WIN_H);
  win.setMenuBarVisibility(false);

  // External links (if any) open in the default browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.loadURL('app://bundle/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.normalize(path.join(APP_ROOT, rel));
    if (!file.startsWith(APP_ROOT + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });

  // Web MIDI needs both the request handler (permission prompts) and the
  // check handler (synchronous permission queries) to say yes.
  const allowMidi = (permission) => permission === 'midi' || permission === 'midiSysex';
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(allowMidi(permission));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => allowMidi(permission));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
