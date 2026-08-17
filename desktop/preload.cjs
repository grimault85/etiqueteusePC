const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronBT', {
  present: true,

  onDevices: (handler) => {
    const listener = (_evt, devices) => handler(devices);
    ipcRenderer.on('bt:devices', listener);
    return () => ipcRenderer.removeListener('bt:devices', listener);
  },

  // Signale que l'imprimante mémorisée a été reprise automatiquement.
  onAuto: (handler) => {
    const listener = (_evt, info) => handler(info);
    ipcRenderer.on('bt:auto', listener);
    return () => ipcRenderer.removeListener('bt:auto', listener);
  },

  select: (deviceId, deviceName) => ipcRenderer.invoke('bt:select', deviceId, deviceName),
  oublier: () => ipcRenderer.invoke('bt:oublier'),
  memorisee: () => ipcRenderer.invoke('bt:memorisee'),
});
