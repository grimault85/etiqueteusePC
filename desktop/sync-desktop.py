#!/usr/bin/env python3
"""
Synchronise la version bureau à partir des sources web.

Les fichiers index.html et app.js sont communs aux deux versions. La version
bureau y ajoute deux choses qu'Electron impose :

  1. une fenêtre de choix Bluetooth (Electron n'affiche pas celle du système) ;
  2. la gestion des mises à jour (inutile sur le web, où recharger suffit).

Ce script part TOUJOURS des sources web et réapplique ces ajouts. Il est
idempotent : le relancer ne duplique rien, ce qui évite les blocs en double
introduits par des retouches successives.

Usage :  python3 sync-desktop.py
"""

import os
import shutil
import sys

# Chemins relatifs au dépôt : le script fonctionne quel que soit l'endroit
# où celui-ci est cloné.
ICI = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ICI, '..', 'src')
DESKTOP = os.path.join(ICI, 'app')

PICKER_HTML = '''<div id="btPicker" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;align-items:center;justify-content:center;padding:20px">
  <div style="background:#fff;border-radius:14px;padding:22px;width:100%;max-width:420px;max-height:70vh;overflow-y:auto">
    <h3 style="margin:0 0 6px;font-size:16px">Imprimantes détectées</h3>
    <p class="hint" style="margin:0 0 14px">Recherche en cours…</p>
    <div id="btPickerList" style="display:flex;flex-direction:column;gap:8px"></div>
    <button type="button" class="btn ghost" id="btPickerCancel" style="margin-top:16px">Annuler</button>
  </div>
</div>

'''

PICKER_JS = '''
// --- Fenêtre de choix Bluetooth (Electron) ---
// Electron n'affiche pas le sélecteur du système : sans interception,
// requestDevice() ne répond jamais. La liste vient du processus principal.
if (window.electronBT && window.electronBT.present) {
  const picker = $('btPicker');
  const liste = $('btPickerList');

  // Le processus principal ferme la fenêtre quand il a choisi seul
  // l'imprimante mémorisée : sans cela elle resterait affichée en
  // « recherche en cours » alors que l'impression est déjà partie.
  window.electronBT.onFermer(() => { picker.style.display = 'none'; });

  window.electronBT.onDevices((devices) => {
    picker.style.display = 'flex';
    liste.innerHTML = devices.length
      ? devices.map((dv) => `<button type="button" class="btn ghost" data-dev="${dv.deviceId}" data-nom="${esc(dv.deviceName)}">${esc(dv.deviceName)}</button>`).join('')
      : '<p class="hint">Aucun appareil détecté pour le moment…</p>';

    liste.querySelectorAll('[data-dev]').forEach((b) => {
      b.addEventListener('click', () => {
        picker.style.display = 'none';
        window.electronBT.select(b.dataset.dev, b.dataset.nom);
        $('btnOublier').hidden = false;
      });
    });
  });

  $('btPickerCancel').addEventListener('click', () => {
    picker.style.display = 'none';
    window.electronBT.select('');
  });
}

'''


def lire(chemin):
    with open(chemin, encoding='utf-8') as f:
        return f.read()


def ecrire(chemin, contenu):
    with open(chemin, 'w', encoding='utf-8') as f:
        f.write(contenu)


def synchroniser():
    for nom in ('index.html', 'app.js', 'render.js', 'niimbot.js'):
        shutil.copy(os.path.join(WEB, nom), os.path.join(DESKTOP, nom))

    # --- index.html : ajouter la fenêtre de choix ---
    chemin = os.path.join(DESKTOP, 'index.html')
    html = lire(chemin)
    if 'btPicker' in html:
        sys.exit('index.html contient déjà le sélecteur : source web polluée ?')
    html = html.replace('<nav>', PICKER_HTML + '<nav>', 1)
    ecrire(chemin, html)

    # --- app.js : ajouter le sélecteur, retirer le service worker ---
    chemin = os.path.join(DESKTOP, 'app.js')
    js = lire(chemin)
    if 'btPickerList' in js:
        sys.exit('app.js contient déjà le sélecteur : source web polluée ?')

    ancre = "// --- Traduction des messages d'erreur ---"
    if ancre not in js:
        sys.exit("Ancre introuvable dans app.js : " + ancre)
    js = js.replace(ancre, PICKER_JS + ancre, 1)

    # Le service worker n'a aucun sens dans une application déjà locale.
    i = js.find('// --- Mode hors ligne ---')
    if i != -1:
        js = js[:i] + "// Mode hors ligne : inutile, l'application de bureau est déjà locale.\n"

    ecrire(chemin, js)

    # --- Contrôles ---
    html = lire(os.path.join(DESKTOP, 'index.html'))
    js = lire(os.path.join(DESKTOP, 'app.js'))
    controles = [
        ('sélecteur HTML', html.count('id="btPicker"') == 1),
        ('sélecteur JS', js.count('btPickerList') >= 1),
        ('pas de doublon', js.count("--- Fenêtre de choix Bluetooth") == 1),
        ('service worker retiré', "serviceWorker.register" not in js),
        ('API mise à jour', 'electronMAJ' in js),
        ('un seul bloc de mise à jour', js.count('surEvenement') == 4),
    ]
    for nom, ok in controles:
        print(('  OK   ' if ok else '  ÉCHEC ') + nom)
    if not all(ok for _, ok in controles):
        sys.exit('Synchronisation incorrecte.')
    print('Version bureau synchronisée.')


if __name__ == '__main__':
    synchroniser()
