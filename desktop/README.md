# Étiqueteuse Production — La Carte

**Version bureau — Windows et macOS**

Application pour imprimer les étiquettes de production et de DLC sur imprimante **Niimbot B1 Pro**, en Bluetooth.

Étiquettes 50 × 30 mm. Fonctionne **entièrement hors ligne** : aucune connexion internet n'est nécessaire.

---

## Installation

1. Lancer `Etiqueteuse-La-Carte-x.y.z.exe`
2. Windows affiche « éditeur inconnu » : cliquer sur **Informations complémentaires** → **Exécuter quand même**
3. Choisir le dossier d'installation

L'application n'est pas signée par un certificat payant, d'où l'avertissement. Il est normal et sans danger ici.

Pour mettre à jour : désinstaller l'ancienne version, puis installer la nouvelle. Les produits et l'historique sont conservés.

---

## Première utilisation

**1. Connecter l'imprimante**

Allumer la Niimbot, puis *Réglages* → **Connecter l'imprimante**, et la choisir dans la liste.

Elle est mémorisée : les fois suivantes, la liste ne réapparaît plus.

**2. Créer les produits**

Onglet *Produits* : nom, durée de conservation en jours, catégorie.

Plus rapide : *Réglages* → **Importer des produits**, avec le fichier `produits-lacarte.json` fourni.

⚠️ Les durées de conservation du fichier d'exemple sont indicatives. Elles doivent être validées contre le plan de maîtrise sanitaire de l'établissement.

**3. Imprimer**

Onglet *Imprimer* : choisir le produit, vérifier les dates, saisir le prénom, imprimer.

---

## Au quotidien

- La **DLC se calcule seule** à partir de la date de production et de la durée du produit. Elle reste modifiable ; une DLC forcée est signalée par une étiquette « forcée ».
- Le **jour de la semaine** apparaît sur l'étiquette, plus rapide à lire en service qu'une date seule.
- Le **prénom** du dernier utilisateur est pré-rempli, et les prénoms déjà saisis sont proposés.
- Pour **plusieurs exemplaires identiques**, utiliser le compteur : l'image n'est envoyée qu'une fois et l'imprimante la répète, c'est bien plus rapide.
- Après un redémarrage, **cliquer directement sur Imprimer** : la connexion se rétablit au passage, sans passer par les Réglages.
- Une **recherche** filtre les produits, sans se soucier des accents : « pave » trouve « Pavé de thon ».

### Contrôle des dates

Une DLC antérieure à la date de production, ou déjà dépassée, affiche une alerte rouge et demande une confirmation avant impression. Ces cas viennent presque toujours d'une faute de frappe, et l'étiquette partirait en service sans que personne ne le remarque.

L'impression n'est pas bloquée pour autant : le dernier mot revient au cuisinier.

### Historique

L'onglet *Historique* conserve les 200 dernières impressions, groupées par jour. Le bouton **Réimprimer** recharge l'étiquette dans l'écran d'impression **sans lancer l'impression** : les dates sont à revérifier avant de relancer.

⚠️ C'est un aide-mémoire local, pas un registre de traçabilité réglementaire. Il ne remplace rien de ce qu'exige le plan de maîtrise sanitaire.

### Sauvegarde

Produits, catégories et historique ne sont stockés **que sur cet ordinateur**. *Réglages* → **Exporter mes produits** génère un fichier de sauvegarde daté.

Un rappel s'affiche au-delà de 60 impressions ou de 21 jours sans sauvegarde. Le même fichier permet aussi de recopier la configuration sur un autre poste ou sur un téléphone.

---

## En cas de problème

**L'imprimante n'apparaît pas dans la liste**
Vérifier qu'elle est allumée, chargée et à moins de quelques mètres. Vérifier aussi que le Bluetooth du poste est activé.

**Rien ne s'imprime alors que l'app dit « connectée »**
*Réglages* → **Tester la communication** : ce test interroge l'imprimante sans consommer d'étiquette et indique batterie et papier. Il distingue une imprimante absente d'une imprimante qui ne répond plus.

**L'impression est trop pâle ou baveuse**
Ajuster la **densité** dans les Réglages : monter si c'est pâle, descendre si le texte bave. La valeur 3 convient à la plupart des rouleaux.

**Le nom du produit est coupé**
La taille du texte s'adapte automatiquement, puis tronque au-delà de deux lignes. Raccourcir le nom du produit dans la fiche.

**La fenêtre reste blanche**
L'application se recharge d'elle-même jusqu'à trois fois, puis affiche un message. Fermer et rouvrir. Si cela persiste, vérifier que le Bluetooth du poste est activé.

**Les étiquettes s'effacent avec le temps**
La B1 Pro imprime en thermique direct : l'impression pâlit avec la chaleur, l'humidité et le temps. Pour des étiquettes qui doivent rester lisibles longtemps en chambre froide, un modèle à transfert thermique est plus adapté.

---

## Notes techniques

Trois points non évidents, à connaître avant de modifier `main.cjs` :

**L'application est servie depuis `127.0.0.1`, pas via `file://`.**
Le Bluetooth n'existe que dans un « contexte sécurisé » : HTTPS ou localhost. En `file://`, `navigator.bluetooth` est absent et l'application ne voit jamais l'imprimante. Un petit serveur HTTP local est donc démarré au lancement. Rien ne sort de la machine.

**Le flag `WebBluetooth` doit être activé explicitement.**
Electron n'expose pas l'API par défaut. En revanche, `WebBluetoothNewPermissionsBackend` doit rester **désactivé** : il exige des gestionnaires de permission particuliers, faute de quoi le processus de rendu meurt à l'ouverture du sélecteur — fenêtre blanche définitive.

**Le sélecteur d'appareil est fourni par l'application.**
Electron n'affiche pas celui du système : sans interception de `select-bluetooth-device`, `requestDevice()` ne répond jamais. C'est aussi ce qui permet de reprendre l'imprimante mémorisée sans réafficher la liste.

### Compiler

Une commande par ligne (PowerShell ne reconnaît pas l'enchaînement `&&`) :

```
npm install
npm start           # lancer sans compiler
npm run dist:win    # → release/Etiqueteuse-La-Carte-x.y.z.exe
npm run dist:mac    # → release/*.dmg
```

Compiler le `.exe` depuis Linux nécessite Wine (`wine` et `wine32`). Le plus simple reste le workflow GitHub Actions à la racine du dépôt, qui compile sur de vraies machines Windows et macOS et pose correctement l'icône.

### Structure

| Fichier | Rôle |
|---|---|
| `main.cjs` | Serveur local, fenêtre, sélecteur Bluetooth, mémorisation de l'imprimante |
| `preload.cjs` | Passerelle sécurisée entre l'interface et le processus principal |
| `app/index.html` | Interface |
| `app/app.js` | Logique applicative |
| `app/render.js` | Dessin de l'étiquette sur canvas |
| `app/niimbot.js` | Pilote d'impression (MIT — voir `app/LICENSE-niimbot`) |

Les fichiers de `app/` sont partagés avec la version web : toute correction du rendu ou de la logique doit être répercutée des deux côtés.

### Crédits

Pilote d'impression : [niimbot-web-bluetooth](https://github.com/iscarelli/niimbot-web-bluetooth) de Dimitri Carelli, licence MIT. Validé sur Niimbot B1 Pro.
