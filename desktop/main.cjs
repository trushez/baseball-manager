// The desktop game: one window showing the game, served from the game's own files through an app:// address
// (browsers will not run the game's modules or fetch its data from a plain folder), with saves, data packs and
// the log kept as ordinary files in Documents/Baseball Manager (paths.cjs).
//
// The page talks to this side only through the small API in preload.cjs (window.bmDesktop).
const { app, BrowserWindow, protocol, ipcMain, shell, Menu, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { userPaths, inside } = require('./paths.cjs');

// the game's files: beside the app when installed, the development folder when run with npm start
const GAME = app.isPackaged ? path.join(process.resourcesPath, 'game') : path.join(__dirname, '..', 'game');
const SCHEME = 'app';

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null, P = null, quitting = false;

// ---------- the log ----------

const LOG_MAX = 2 * 1024 * 1024;
function log(line) {
  try {
    const f = path.join(P.logs, 'game.log');
    try { if (fs.statSync(f).size > LOG_MAX) fs.renameSync(f, path.join(P.logs, 'game.old.log')); } catch { /* no log yet */ }
    fs.appendFileSync(f, `${String(line).slice(0, 20000)}\n`);
  } catch { /* a log that cannot be written is not worth stopping the game for */ }
}

// ---------- serving the game ----------

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

async function serve(req) {
  const url = new URL(req.url);
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  // the data packs: the player's own folder first, then any that ship with the game
  if (rel === 'data/sets/' || rel === 'data/sets') {
    const names = new Set();
    for (const dir of [P.packs, path.join(GAME, 'data', 'sets')]) for (const f of await fsp.readdir(dir).catch(() => [])) if (/\.json$/i.test(f)) names.add(f);
    return new Response(JSON.stringify([...names].sort()), { headers: { 'content-type': 'application/json' } });
  }
  let file;
  if (rel.startsWith('data/sets/')) {
    const name = rel.slice('data/sets/'.length);
    try { file = inside(P.packs, name); } catch { return new Response('Not found', { status: 404 }); }
    if (!fs.existsSync(file)) file = path.join(GAME, 'data', 'sets', path.basename(name));
  } else {
    file = path.normalize(path.join(GAME, rel));
    if (!file.startsWith(GAME + path.sep)) return new Response('Not found', { status: 404 });
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('Not found', { status: 404 });
  const res = await net.fetch(pathToFileURL(file).toString());
  return new Response(res.body, { status: res.status, headers: { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
}

// ---------- saves ----------

const HEAD = 2048; // the first bytes of a save hold its name, club and date, enough to list it without opening it

ipcMain.handle('saves:list', async () => {
  const out = [];
  for (const f of await fsp.readdir(P.saves).catch(() => [])) {
    if (!/\.bmsave$/i.test(f)) continue;
    try {
      const fh = await fsp.open(path.join(P.saves, f), 'r');
      const buf = Buffer.alloc(HEAD);
      const { bytesRead } = await fh.read(buf, 0, HEAD, 0);
      await fh.close();
      out.push({ file: f, head: new Uint8Array(buf.subarray(0, bytesRead)) });
    } catch (e) { log(`saves:list ${f}: ${e.message}`); }
  }
  return out;
});
ipcMain.handle('saves:read', async (_e, file) => {
  try { return new Uint8Array(await fsp.readFile(inside(P.saves, file))); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
});
// written to a temporary file first and then renamed over the old one, so a crash or a full disk mid-save never
// leaves a broken save in place of a good one
ipcMain.handle('saves:write', async (_e, file, bytes) => {
  const dest = inside(P.saves, file), tmp = `${dest}.part`;
  await fsp.writeFile(tmp, Buffer.from(bytes));
  await fsp.rename(tmp, dest);
});
ipcMain.handle('saves:remove', async (_e, file) => { await fsp.rm(inside(P.saves, file), { force: true }); });

ipcMain.on('log', (_e, line) => log(line));
ipcMain.handle('open:saves', () => shell.openPath(P.saves));
ipcMain.handle('open:logs', () => shell.openPath(P.logs));
ipcMain.handle('open:packs', () => shell.openPath(P.packs));
ipcMain.on('app:confirm-close', () => { quitting = true; win?.close(); });
ipcMain.on('app:fullscreen', () => win?.setFullScreen(!win.isFullScreen()));

// ---------- the window ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1366, height: 860, minWidth: 1024, minHeight: 680, backgroundColor: '#14171b', show: false, title: 'Baseball Manager',
    // Windows and Linux show this in the title bar and the task bar; the Mac takes the icon from the app bundle
    icon: process.platform === 'darwin' ? undefined : path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  // the close button asks the game first, which may want to save
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.webContents.send('app:close-request');
  });
  // browser keys that make no sense in a game: reload (which would lose the game), back and forward, the developer tools in a release
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = input.key.toLowerCase(), mod = input.control || input.meta;
    if (k === 'f5' || (mod && k === 'r') || (input.alt && (k === 'arrowleft' || k === 'arrowright'))) e.preventDefault();
    if (app.isPackaged && (k === 'f12' || (mod && input.shift && k === 'i'))) e.preventDefault();
    if (k === 'f11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
  // links out (the Sports4Cast credit) open in the player's browser; the game never navigates away from itself
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`${SCHEME}://`)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.webContents.on('render-process-gone', (_e, d) => log(`renderer gone: ${d.reason} ${d.exitCode}`));
  win.loadURL(`${SCHEME}://game/index.html`);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  P = userPaths(app);
  log(`--- ${new Date().toISOString()} Baseball Manager ${app.getVersion()} on ${process.platform} ${process.arch}`);
  protocol.handle(SCHEME, (req) => serve(req).catch((e) => { log(`serve ${req.url}: ${e.stack || e}`); return new Response('Error', { status: 500 }); }));
  // a Mac game keeps the usual application menu (Quit, copy and paste, full screen); elsewhere there is none
  if (process.platform === 'darwin') Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { label: 'View', submenu: [{ role: 'togglefullscreen' }] }, { role: 'windowMenu' }]));
  else Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (e) => log(`main: ${e.stack || e}`));
