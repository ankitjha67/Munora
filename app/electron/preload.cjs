const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fathom', {
  platform: 'electron',
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (json) => ipcRenderer.invoke('store:save', json),
  openDataFolder: () => ipcRenderer.invoke('data:openFolder'),
  llmFetch: (req) => ipcRenderer.invoke('llm:fetch', req),
  scanEmail: (req) => ipcRenderer.invoke('email:scan', req),
});
