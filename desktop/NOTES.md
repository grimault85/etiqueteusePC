# Étiqueteuse Production — La Carte (bureau)

**v2.6.0 — Niimbot B1 Pro**

Application de bureau (Electron) pour imprimer les étiquettes de production/DLC sur Niimbot B1 Pro, en Bluetooth. Fonctionne **entièrement hors ligne**.

Format : 50 × 30 mm (584 × 354 points à 300 dpi).

## Compiler l'exécutable

### Via GitHub Actions (recommandé)

Pousser le projet sur GitHub : le workflow `.github/workflows/build.yml` compile automatiquement le `.exe` Windows et le `.dmg` macOS. Les fichiers sont dans l'onglet *Actions* → dernier run → *Artifacts*.

### En local (nécessite Windows pour le .exe)

```bash
npm install
npm run dist:win     # → release/Etiqueteuse-La-Carte-2.0.0.exe
```

Pour lancer sans compiler : `npm start`

## Nouveautés v2.2

**Aperçu repliable** — masqué par défaut sur petit écran (il repoussait tout le formulaire), ouvert par défaut au-delà de 900 px où la colonne serait vide de toute façon. Le choix est mémorisé une fois fait.

**Gestion des catégories dans Réglages** — c'est de la configuration qu'on fait une fois ; elle n'encombre plus l'écran Produits, utilisé quotidiennement.

**Mise en page deux colonnes** — au-delà de 900 px de large, la saisie passe à gauche et l'aperçu à droite, en position fixe. En dessous, l'affichage reste en une colonne.

**Historique** — les 200 dernières impressions, groupées par jour, avec un bouton *Réimprimer* qui recharge l'étiquette dans l'écran d'impression **sans lancer l'impression** : les dates sont à revérifier avant de relancer.

⚠️ C'est un journal local sur la machine, à titre d'aide-mémoire. Ce n'est pas un registre de traçabilité réglementaire et cela ne remplace rien de ce que votre plan de maîtrise sanitaire exige.

**Reconnexion sans fenêtre de choix** — l'imprimante appairée est mémorisée ; à la reconnexion, elle est reprise automatiquement sans réafficher la liste. Un bouton *Oublier cette imprimante* permet de repartir de zéro.

La reconnexion totalement automatique au démarrage n'est pas possible : le navigateur exige un geste de l'utilisateur avant d'accéder au Bluetooth. Il reste donc un clic.

**Recherche de produit** — insensible aux accents (« pave » trouve « Pavé de thon »).

**Mémoire des prénoms** — les prénoms utilisés sont proposés en autocomplétion, et le dernier est pré-rempli au démarrage.

## Liste des produits

Les produits sont regroupés par catégorie, avec un compteur par section et un compteur global. Chaque section se replie d'un clic sur son en-tête, et l'état est mémorisé d'une session à l'autre. Un bouton bascule entre *Tout replier* et *Tout déplier*.

Une recherche filtre la liste, insensible aux accents. Pendant une recherche, **toutes les sections s'ouvrent automatiquement** — sinon un résultat situé dans une section repliée resterait invisible. L'état de repli est restauré quand la recherche est effacée.

## Contrôle de la DLC

Une DLC antérieure à la date de production, ou déjà dépassée, affiche une alerte sous le champ et demande une confirmation avant impression. Ces cas viennent presque toujours d'une faute de frappe, et l'étiquette partirait en service sans que personne ne le remarque.

L'impression n'est pas bloquée : un cas légitime reste possible, et c'est au cuisinier de trancher.

## Messages d'erreur

Le pilote d'impression et le navigateur renvoient des messages techniques en anglais. `traduireErreur()` les reformule en français avec une consigne concrète (rallumer l'imprimante, vérifier le rouleau…). Un message non reconnu est affiché tel quel plutôt que masqué.

## Sauvegarde des données

Produits, catégories et historique sont stockés dans le navigateur (ou dans les données de l'app pour la version bureau). Effacer les données du navigateur les supprime définitivement.

*Réglages → Exporter* produit un fichier JSON daté contenant tout. La date de la dernière sauvegarde est affichée, et un rappel apparaît au-delà de 60 impressions ou de 21 jours sans export.

Le mode hors ligne (service worker) ne concerne que la version web : l'application de bureau est déjà locale.

## Confirmations

Les suppressions passent par une boîte de dialogue interne, pas par `window.confirm()`. Ce dernier est bloqué dans les iframes sandboxées (aperçus, intégrations) : il ne renvoie rien et la suppression échoue en silence, sans message.

## Catégories

Les produits se rangent en catégories (emoji + couleur), modifiables dans l'onglet *Produits*. Cinq sont créées au premier lancement — Poisson, Viande, Cuisiné, Légumes, Pâtisserie — et peuvent être renommées, supprimées ou complétées.

La catégorie sert uniquement à retrouver un produit vite : des pastilles filtrent la liste et les produits sont regroupés dans le menu déroulant. **Rien n'est imprimé sur l'étiquette.**

Supprimer une catégorie ne supprime pas ses produits : ils repassent en « sans catégorie ».

## Deux points techniques non évidents

Ces deux réglages sont indispensables ; sans eux l'app se lance mais ne voit jamais l'imprimante.

**1. L'app est servie depuis `127.0.0.1`, pas via `file://`**

Le Web Bluetooth n'existe que dans un « contexte sécurisé » : HTTPS ou localhost. Une page en `file://` n'en est pas un et `navigator.bluetooth` y est absent. `main.cjs` démarre donc un petit serveur HTTP local sur un port attribué par le système. Rien ne sort de la machine — aucun accès Internet n'est requis.

**2. Le flag `WebBluetooth` doit être activé**

Electron n'expose pas l'API Bluetooth par défaut :

```js
app.commandLine.appendSwitch('enable-features', 'WebBluetooth,WebBluetoothNewPermissionsBackend');
```

Vérifié : sans cette ligne, `typeof navigator.bluetooth === 'undefined'`.

**3. Le sélecteur d'appareil est maison**

Electron n'affiche pas le sélecteur Bluetooth du système. Sans interception de `select-bluetooth-device`, `requestDevice()` ne répond jamais. Le process principal renvoie la liste au renderer, qui affiche sa propre fenêtre de choix.

## À la première ouverture sous Windows

L'app n'est pas signée : SmartScreen affichera « éditeur inconnu ». Cliquer sur *Informations complémentaires* → *Exécuter quand même*.

## Structure

| Fichier | Rôle |
|---|---|
| `main.cjs` | Process principal : serveur local, fenêtre, sélecteur Bluetooth |
| `preload.cjs` | Passerelle sécurisée vers le sélecteur |
| `app/index.html` | Interface |
| `app/app.js` | Logique applicative |
| `app/render.js` | Dessin de l'étiquette |
| `app/niimbot.js` | Pilote Niimbot (MIT — voir `app/LICENSE-niimbot`) |

## Crédits

Pilote d'impression : [niimbot-web-bluetooth](https://github.com/iscarelli/niimbot-web-bluetooth) de Dimitri Carelli, licence MIT. Validé sur Niimbot B1 Pro réelle.
