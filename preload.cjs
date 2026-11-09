// Preload script for Electron renderer process
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
  quit: () => ipcRenderer.send('app:quit'),
  minimize: () => ipcRenderer.send('app:minimize'),
  maximize: () => ipcRenderer.send('app:maximize'),
  reload: () => ipcRenderer.send('app:reload'),
  toggleDevTools: () => ipcRenderer.send('app:toggle-devtools'),
  print: (options) => ipcRenderer.invoke('app:print', options)
});
