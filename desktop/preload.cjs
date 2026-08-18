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

// --- Mises à jour ---
contextBridge.exposeInMainWorld('electronMAJ', {
  present: true,

  // Canal restreint : le renderer ne peut écouter que ces événements.
  surEvenement: (canal, handler) => {
    const autorises = ['maj:disponible', 'maj:progression', 'maj:prete', 'maj:erreur'];
    if (!autorises.includes(canal)) return () => {};
    const listener = (_evt, donnees) => handler(donnees);
    ipcRenderer.on(canal, listener);
    return () => ipcRenderer.removeListener(canal, listener);
  },

  version: () => ipcRenderer.invoke('maj:version'),
  verifier: () => ipcRenderer.invoke('maj:verifier'),
  telecharger: () => ipcRenderer.invoke('maj:telecharger'),
  installer: () => ipcRenderer.invoke('maj:installer'),
});
