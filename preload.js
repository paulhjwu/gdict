const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getWordAudio:  (translit, text)                      => ipcRenderer.invoke('get-word-audio', translit, text),
  shortenVerse:  (bookCode, chapter, verse, word)      => ipcRenderer.invoke('shorten-verse', bookCode, chapter, verse, word),
});
