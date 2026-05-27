const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getWordAudio: (translit, text) => ipcRenderer.invoke('get-word-audio', translit, text),
});
