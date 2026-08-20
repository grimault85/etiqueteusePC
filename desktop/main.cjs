const { app, BrowserWindow, ipcMain, protocol, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Electron n'expose pas navigator.bluetooth par défaut : sans ce flag, l'API
// est tout simplement absente et l'app ne peut pas voir l'imprimante.
//
// WebBluetoothNewPermissionsBackend a été retiré : il exige des gestionnaires
// de permission dédiés, sans lesquels le processus de rendu meurt à l'ouverture
// du sélecteur — la fenêtre devient blanche définitivement. Vérifié : l'API
// reste disponible sans lui.
app.commandLine.appendSwitch('enable-features', 'WebBluetooth');

const RACINE = path.join(__dirname, 'app');

// ---------------------------------------------------------------------------
// Pourquoi un protocole « app:// » plutôt qu'un serveur local ou file:// ?
//
// Deux contraintes se cumulent :
//
// 1. Le Web Bluetooth n'existe que dans un « contexte sécurisé ». En file://
//    navigator.bluetooth est absent : l'application ne verrait jamais
//    l'imprimante.
//
// 2. Le stockage local est cloisonné par origine, PORT COMPRIS. Un serveur
//    local sur port aléatoire changeait donc d'origine à chaque lancement, et
//    les produits enregistrés devenaient introuvables au démarrage suivant.
//    Un port fixe n'est pas fiable non plus : s'il est occupé, l'origine
//    change et les données sont de nouveau perdues.
//
// Un protocole déclaré « secure » et « standard » satisfait les deux : le
// contexte est sécurisé et l'origine (app://local) ne varie jamais.
// ---------------------------------------------------------------------------

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    standard: true,        // donne une véritable origine, indispensable au stockage
    secure: true,          // contexte sécurisé : autorise le Web Bluetooth
    supportFetchAPI: true,
    stream: true,
  },
}]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function servirFichiers() {
  protocol.handle('app', async (requete) => {
    const url = new URL(requete.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';

    // Empêche de sortir du dossier app/ via ../
    const cible = path.normalize(path.join(RACINE, rel));
    if (!cible.startsWith(RACINE)) {
      return new Response('Interdit', { status: 403 });
    }

    try {
      const contenu = await fs.promises.readFile(cible);
      return new Response(contenu, {
        headers: { 'Content-Type': TYPES[path.extname(cible).toLowerCase()] || 'application/octet-stream' },
      });
    } catch (err) {
      return new Response('Introuvable', { status: 404 });
    }
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
const fichierFenetre = () => path.join(app.getPath('userData'), 'fenetre.json');

/**
 * Dimensions d'ouverture.
 *
 * Une taille fixe déborde des petits écrans : la fenêtre est alors rognée et
 * une barre de défilement apparaît dès l'ouverture. On part donc de l'espace
 * réellement disponible, et on restaure la taille choisie par l'utilisateur
 * lors de la session précédente.
 */
function dimensionsFenetre() {
  const dispo = screen.getPrimaryDisplay().workAreaSize;

  // 1100x900 au maximum, sans jamais dépasser l'écran.
  const defaut = {
    width: Math.min(1100, Math.max(420, dispo.width - 80)),
    height: Math.min(900, Math.max(600, dispo.height - 60)),
  };

  try {
    const enregistre = JSON.parse(fs.readFileSync(fichierFenetre(), 'utf8'));
    // Un écran débranché depuis peut rendre la position invalide : on ne
    // restaure que si la fenêtre tient dans l'espace actuel.
    if (enregistre.width <= dispo.width && enregistre.height <= dispo.height) {
      return { ...defaut, ...enregistre };
    }
  } catch (e) { /* première ouverture */ }

  return defaut;
}

function memoriserFenetre(win) {
  if (win.isDestroyed() || win.isMinimized()) return;
  const b = win.getNormalBounds();
  try {
    fs.writeFileSync(fichierFenetre(), JSON.stringify({
      width: b.width, height: b.height, x: b.x, y: b.y,
    }), 'utf8');
  } catch (e) { /* non bloquant */ }
}

function lireDerniereImprimante() {
  try { return JSON.parse(fs.readFileSync(fichierPrefs(), 'utf8')).deviceId || null; }
  catch (e) { return null; }
}

function memoriserImprimante(deviceId, deviceName) {
  try { fs.writeFileSync(fichierPrefs(), JSON.stringify({ deviceId, deviceName }), 'utf8'); }
  catch (e) { /* non bloquant : on retombe simplement sur le choix manuel */ }
}

function createWindow() {
  let relances = 0;

  const dims = dimensionsFenetre();

  const win = new BrowserWindow({
    width: dims.width,
    height: dims.height,
    x: dims.x,
    y: dims.y,
    minWidth: 420,
    minHeight: 560,
    show: false,          // évite un affichage blanc le temps du chargement
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
    if (!url.startsWith('app://')) evt.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Affichage seulement quand la page est prête : sinon on voit brièvement
  // une fenêtre vide.
  win.once('ready-to-show', () => win.show());

  let sauvegardeDifferee;
  const planifierSauvegarde = () => {
    clearTimeout(sauvegardeDifferee);
    sauvegardeDifferee = setTimeout(() => memoriserFenetre(win), 400);
  };
  win.on('resize', planifierSauvegarde);
  win.on('move', planifierSauvegarde);
  win.on('close', () => memoriserFenetre(win));

  win.repondreBluetooth = repondre;

  configurerMiseAJour(win);

  win.loadURL('app://local/index.html');
  return win;
}

app.whenReady().then(() => {
  servirFichiers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
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
  try { fs.unlinkSync(fichierPrefs()); } catch (e) {}
  return true;
});

ipcMain.handle('bt:memorisee', () => {
  try { return JSON.parse(fs.readFileSync(fichierPrefs(), 'utf8')); }
  catch (e) { return null; }
});
