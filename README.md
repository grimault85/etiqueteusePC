# Étiqueteuse Production — La Carte

Étiquettes de production et DLC pour cuisine, imprimées sur **Niimbot B1 Pro** en Bluetooth.

Format : 50 × 30 mm (584 × 354 points à 300 dpi).

## Deux versions, un seul code

| Version | Usage | Fichiers |
|---|---|---|
| **Web (PWA)** | Android + ordinateur, via Chrome | `index.html` + `sw.js` à la racine |
| **Bureau** | Windows / macOS, hors ligne | `desktop/` |

Les deux partagent le même moteur de rendu et le même pilote d'impression.

## Mise en ligne (version web)

`index.html` et `sw.js` sont à la racine : *Settings → Pages → Deploy from a branch → main → / (root)*.

Le Web Bluetooth exige **HTTPS**, d'où l'hébergement obligatoire. Ouvrir ensuite l'URL dans **Chrome sur Android** → ⋮ → *Installer l'application*.

⚠️ iOS n'est pas supporté : Safari ne gère pas le Web Bluetooth, et tous les navigateurs iOS en dépendent.

## Développement

Les sources vivent dans `src/`. La racine contient le **fichier unique généré** — ne pas l'éditer à la main.

```bash
python3 src/build.py        # régénère index.html et sw.js à la racine
```

## Version bureau

Mode d'emploi complet et notes techniques : **[`desktop/README.md`](desktop/README.md)**.

```bash
cd desktop
npm install
npm start                   # lancement
npm run dist:win            # → release/Etiqueteuse-La-Carte-x.y.z.exe
```

Le workflow `.github/workflows/build-desktop.yml` compile Windows et macOS à chaque tag `v*`.

## Licence

Pilote d'impression : [niimbot-web-bluetooth](https://github.com/iscarelli/niimbot-web-bluetooth), licence MIT — voir `src/LICENSE-niimbot`.
