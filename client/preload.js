const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hermesDesktop', {
  command: (type, payload = {}) => ipcRenderer.invoke('runtime:command', { type, payload }),
  pickWorkspace: () => ipcRenderer.invoke('workspace:pick'),
  onEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('runtime:event', listener);
    return () => ipcRenderer.removeListener('runtime:event', listener);
  },
  onStderr: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('runtime:stderr', listener);
    return () => ipcRenderer.removeListener('runtime:stderr', listener);
  },
});
