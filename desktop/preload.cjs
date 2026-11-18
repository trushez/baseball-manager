// The only door between the game page and the computer: saves as files, the log, the player's folders, and the
// close button. The game finds it as window.bmDesktop (save.js, ui/errors.js, ui/app-guards.js); in a browser
// it is simply not there and the game keeps its saves in the browser instead.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bmDesktop', {
  platform: process.platform,
  saves: {
    list: () => ipcRenderer.invoke('saves:list'),
    read: (file) => ipcRenderer.invoke('saves:read', file),
    write: (file, bytes) => ipcRenderer.invoke('saves:write', file, bytes),
    remove: (file) => ipcRenderer.invoke('saves:remove', file),
  },
  log: (line) => ipcRenderer.send('log', String(line)),
  openSavesFolder: () => ipcRenderer.invoke('open:saves'),
  openLogFolder: () => ipcRenderer.invoke('open:logs'),
  openDataFolder: () => ipcRenderer.invoke('open:packs'),
  toggleFullscreen: () => ipcRenderer.send('app:fullscreen'),
  onCloseRequest: (fn) => ipcRenderer.on('app:close-request', () => fn()),
  confirmClose: () => ipcRenderer.send('app:confirm-close'),
});
