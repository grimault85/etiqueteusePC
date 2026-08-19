const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');

// Electron n'expose pas navigator.bluetooth par défaut : sans ce flag, l'API
// est tout simplement absente et l'app ne peut pas voir l'imprimante.
//
// WebBluetoothNewPermissionsBackend a été retiré : il exige des gestionnaires
// de permission dédiés, sans lesquels le processus de rendu meurt à l'ouverture
// du sélecteur — la fenêtre devient blanche définitivement. Vérifié : l'API
// reste disponible sans lui.
app.commandLine.appendSwitch('enable-features', 'WebBluetooth');

// ---------------------------------------------------------------------------
// Pourquoi un serveur local plutôt que loadFile() ?
//
// Le Web Bluetooth n'est exposé que dans un « contexte sécurisé » : HTTPS ou
// localhost. Une page chargée en file:// n'en est pas un, et navigator.bluetooth
// y est tout simplement absent — l'app se charge mais ne peut pas imprimer.
// On sert donc les fichiers sur 127.0.0.1, sur un port choisi par le système.
// Rien ne sort de la machine : aucune connexion Internet n'est nécessaire.
// ---------------------------------------------------------------------------

const RACINE = path.join(__dirname, 'app');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function demarrerServeur() {
  return new Promise((resolve, reject) => {
    const serveur = http.createServer((req, res) => {
      let rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/') rel = '/index.html';

      // Empêche de sortir du dossier app/ via ../
      const cible = path.normalize(path.join(RACINE, rel));
      if (!cible.startsWith(RACINE)) {
        res.writeHead(403).end('Interdit');
        return;
      }

      fs.readFile(cible, (err, data) => {
        if (err) {
          res.writeHead(404).end('Introuvable');
          return;
        }
        res.writeHead(200, {
          'Content-Type': TYPES[path.extname(cible).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-store',
        });
        res.end(data);
      });
    });

    serveur.on('error', reject);
    // Port 0 = le systeme en attribue un libre ; 127.0.0.1 = jamais expose au reseau
    serveur.listen(0, '127.0.0.1', () => resolve(serveur.address().port));
  });
}

// ---------------------------------------------------------------------------
// Mises à jour automatiques
//
// La source est la page des Releases du dépôt (voir "publish" dans
// package.json). electron-updater compare la version publiée à celle de
// l'application et télécharge la différence.
//
// Rien n'est installé sans accord : en plein service, une application qui
// redémarre toute seule ferait perdre la saisie en cours.
// ---------------------------------------------------------------------------
function configurerMiseAJour(win) {
  autoUpdater.autoDownload = false;          // on demande d'abord
  autoUpdater.autoInstallOnAppQuit = false;  // et on n'installe pas en douce

  const envoyer = (canal, donnees) => {
    if (!win.isDestroyed()) win.webContents.send(canal, donnees);
  };

  autoUpdater.on('update-available', (info) => {
    envoyer('maj:disponible', { version: info.version, notes: info.releaseNotes || '' });
  });

  autoUpdater.on('download-progress', (p) => {
    envoyer('maj:progression', { pourcent: Math.round(p.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    envoyer('maj:prete', { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    // Une vérification qui échoue ne doit jamais gêner l'usage : pas de
    // réseau en cuisine est un cas normal, pas une erreur à signaler.
    envoyer('maj:erreur', { message: String((err && err.message) || err) });
  });

  ipcMain.removeHandler('maj:version');
  ipcMain.handle('maj:version', () => app.getVersion());

  ipcMain.removeHandler('maj:verifier');
  ipcMain.handle('maj:verifier', async () => {
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, version: r && r.updateInfo ? r.updateInfo.version : null };
    } catch (err) {
      return { ok: false, erreur: String((err && err.message) || err) };
    }
  });

  ipcMain.removeHandler('maj:telecharger');
  ipcMain.handle('maj:telecharger', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { ok: false, erreur: String((err && err.message) || err) };
    }
  });

  ipcMain.removeHandler('maj:installer');
  ipcMain.handle('maj:installer', () => {
    // true, true : ferme l'app, installe, puis la relance.
    autoUpdater.quitAndInstall(true, true);
    return true;
  });

  // En développement, electron-updater n'a pas de version installée à
  // comparer : on s'abstient.
  if (app.isPackaged) {
    const verifier = () =>
      autoUpdater.checkForUpdates().catch(() => { /* hors ligne : sans conséquence */ });

    // Au démarrage, une fois la fenêtre prête.
    setTimeout(verifier, 4000);

    // Puis toutes les six heures : en cuisine l'application reste ouverte
    // toute la journée, une vérification unique au lancement laisserait
    // passer les versions publiées en cours de service.
    const intervalle = setInterval(verifier, 6 * 60 * 60 * 1000);
    win.on('closed', () => clearInterval(intervalle));
  }
}

// ---------------------------------------------------------------------------
// Selecteur Bluetooth : Electron n'affiche pas celui du systeme. Sans
// intercepter 'select-bluetooth-device', requestDevice() ne repond jamais.
// ---------------------------------------------------------------------------
let bluetoothCallback = null;

// Mémorise la dernière imprimante appairée pour la resélectionner sans
// réafficher la fenêtre de choix. Stocké dans le dossier utilisateur de l'app.
const fichierPrefs = () => path.join(app.getPath('userData'), 'imprimante.json');

function lireDerniereImprimante() {
  try { return JSON.parse(fs.readFileSync(fichierPrefs(), 'utf8')).deviceId || null; }
  catch (e) { return null; }
}

function memoriserImprimante(deviceId, deviceName) {
  try { fs.writeFileSync(fichierPrefs(), JSON.stringify({ deviceId, deviceName }), 'utf8'); }
  catch (e) { /* non bloquant : on retombe simplement sur le choix manuel */ }
}

function createWindow(port) {
  let relances = 0;

  const win = new BrowserWindow({
    width: 980,
    height: 820,
    minWidth: 420,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#faf8f4',
    icon: path.join(RACINE, 'icons', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Répond à une demande de sélection, une seule fois.
  //
  // Electron déclenche cet événement plusieurs fois pendant la découverte, et
  // chaque déclenchement fournit sa propre fonction de réponse. Rappeler une
  // réponse déjà utilisée fait tomber le processus principal : l'application
  // se fermait quand on cliquait sur « Annuler » après une reprise
  // automatique.
  const repondre = (deviceId) => {
    const reponse = bluetoothCallback;
    bluetoothCallback = null;
    if (!reponse) return false;
    try {
      reponse(deviceId || '');
    } catch (err) {
      // Réponse devenue invalide : sans conséquence, la demande a déjà abouti.
    }
    return true;
  };

  win.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();

    // Une nouvelle demande remplace la précédente : l'ancienne réponse ne
    // doit plus être utilisée.
    bluetoothCallback = callback;

    // Si l'imprimante déjà appairée est dans la liste, on la reprend sans
    // afficher la fenêtre de choix.
    const memorise = lireDerniereImprimante();
    if (memorise) {
      const connue = deviceList.find((d) => d.deviceId === memorise);
      if (connue) {
        // Fermer la fenêtre de choix : sans cela elle restait affichée en
        // « recherche en cours » alors que l'impression était déjà partie.
        win.webContents.send('bt:fermer');
        win.webContents.send('bt:auto', { deviceName: connue.deviceName || '' });
        repondre(connue.deviceId);
        return;
      }
    }

    win.webContents.send('bt:devices', deviceList.map((d) => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName || '(sans nom)',
    })));
  });

  // Sert aussi à fermer la fenêtre si la demande s'achève autrement.
  win.webContents.on('did-navigate', () => { bluetoothCallback = null; });

  // --- Autorisations Bluetooth ---
  // Par défaut Electron refuse certaines demandes ; on autorise explicitement
  // le Bluetooth, la page étant locale et servie par l'application elle-même.
  const ses = win.webContents.session;

  // N'autorise que ce dont l'application a besoin, plutôt que tout accepter.
  const PERMISSIONS_AUTORISEES = ['bluetooth'];
  ses.setPermissionCheckHandler((_wc, permission) =>
    PERMISSIONS_AUTORISEES.includes(permission));
  ses.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(PERMISSIONS_AUTORISEES.includes(permission)));
  ses.setDevicePermissionHandler((details) => details.deviceType === 'bluetooth');
  if (ses.setBluetoothPairingHandler) {
    ses.setBluetoothPairingHandler((details, callback) => {
      // Les imprimantes Niimbot ne demandent pas de code d'appairage.
      callback({ confirmed: true });
    });
  }

  // --- Récupération après plantage ---
  // Sans cela, un processus de rendu qui meurt laisse une fenêtre blanche
  // définitivement, sans aucune indication pour l'utilisateur.
  win.webContents.on('render-process-gone', (_evt, details) => {
    if (relances < 3) {
      relances++;
      win.reload();
    } else {
      const { dialog } = require('electron');
      dialog.showErrorBox('Application interrompue',
        "L'affichage s'est interrompu à plusieurs reprises (" + details.reason + ").\n\n"
        + "Ferme puis rouvre l'application. Si le problème persiste, "
        + "vérifie que le Bluetooth du poste est activé.");
    }
  });

  // Empêche toute navigation hors de l'application : un fichier glissé dans
  // la fenêtre remplacerait la page et donnerait un écran blanc.
  win.webContents.on('will-navigate', (evt, url) => {
    if (!url.startsWith('http://127.0.0.1:' + port)) evt.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.repondreBluetooth = repondre;

  configurerMiseAJour(win);

  win.loadURL('http://127.0.0.1:' + port + '/index.html');
  return win;
}

app.whenReady().then(async () => {
  let port;
  try {
    port = await demarrerServeur();
  } catch (err) {
    const { dialog } = require('electron');
    dialog.showErrorBox('Demarrage impossible',
      "Le serveur local n'a pas pu demarrer : " + err.message);
    app.quit();
    return;
  }

  createWindow(port);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('bt:select', (evt, deviceId, deviceName) => {
  if (deviceId) memoriserImprimante(deviceId, deviceName || '');

  // Passe par la fonction de la fenêtre concernée : elle protège contre le
  // rappel d'une réponse déjà consommée.
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (win && win.repondreBluetooth) return win.repondreBluetooth(deviceId);
  return false;
});

// Permet à l'app d'oublier l'imprimante (bouton dans les réglages).
ipcMain.handle('bt:oublier', () => {
  try { fs.unlinkSync(fichierPrefs()); } catch (e) { }
  return true;
});

ipcMain.handle('bt:memorisee', () => {
  try { return JSON.parse(fs.readFileSync(fichierPrefs(), 'utf8')); }
  catch (e) { return null; }
});
