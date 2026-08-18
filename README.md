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

```
python3 src/build.py        # régénère index.html et sw.js à la racine
```

Sous Windows, remplacer `python3` par `python`.

## Version bureau

Mode d'emploi complet et notes techniques : **[`desktop/README.md`](desktop/README.md)**.

```
cd desktop
npm install
npm start                   # lancement
npm run dist:win            # → release/Etiqueteuse-La-Carte-x.y.z.exe
```

### Publier une nouvelle version

Instructions détaillées, en PowerShell : **[`DEPLOIEMENT.md`](DEPLOIEMENT.md)**.

⚠️ Une fois pour toutes : *Settings → Actions → General → Workflow permissions*
→ **Read and write permissions**. Sans ce réglage, la compilation réussit mais
la Release ne peut pas être créée.

Une commande par ligne — l'enchaînement avec `&&` n'est pas reconnu par
PowerShell (celui livré avec Windows) :

```
# 1. Mettre à jour le numéro de version
#    desktop/package.json → "version": "2.8.0"

git add -A
git commit -m "Version 2.8.0"
git push

# 2. Poser le tag : c'est lui qui déclenche la publication
git tag v2.8.0
git push origin v2.8.0
```

GitHub compile alors Windows et macOS, puis crée une **Release** avec les
deux fichiers attachés. Compter 5 à 10 minutes ; l'avancement est visible
dans l'onglet *Actions*.

La Release donne un lien de téléchargement **public et permanent**, sans
compte GitHub requis :
`https://github.com/<compte>/<dépôt>/releases/latest`

C'est ce lien à transmettre. Les *Artifacts* de l'onglet Actions, eux,
exigent un compte et expirent au bout de 90 jours.

### Publier sans tag

Onglet *Releases* → *Draft a new release* → déposer le `.exe` à la main.
Utile pour une version compilée localement.

## Licence

Pilote d'impression : [niimbot-web-bluetooth](https://github.com/iscarelli/niimbot-web-bluetooth), licence MIT — voir `src/LICENSE-niimbot`.
