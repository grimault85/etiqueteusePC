# Journal des modifications

## 2.8.1
- Publication automatique des Releases à partir d'un tag `v*`, avec les
  binaires Windows et macOS attachés
- Le workflow tolère une Release déjà existante : il y ajoute les binaires
  au lieu d'échouer
- Guide de déploiement en PowerShell (`DEPLOIEMENT.md`)

## 2.7.1
- **Correction** : « Tester la communication » ne faisait rien. Ce bouton et
  « Mon imprimante n'apparaît pas » étaient restés dans le HTML alors que
  leur code avait disparu lors du passage au pilote — aucun gestionnaire
  n'y était rattaché.
- « Tester la communication » interroge maintenant l'imprimante sans
  consommer d'étiquette : modèle, résolution, batterie, papier. Utile pour
  distinguer « pas connectée » de « connectée mais muette ».
- « Mon imprimante n'apparaît pas » retiré : le sélecteur non filtré
  n'existe plus depuis le passage au pilote.
- Vérification systématique : plus aucun élément interactif sans code, ni
  aucune référence du code vers un élément absent.

## 2.7.0
- Reprise de connexion sans rouvrir le sélecteur d'appareil, sur les deux
  versions. `getDevices()` liste les imprimantes déjà autorisées ;
  `requestDevice` est neutralisé le temps de l'appel, puis restauré.
  Le pilote n'est pas modifié.
- Le bouton Imprimer reconnecte tout seul : plus besoin de passer par
  Réglages après un redémarrage.
- Au démarrage, l'imprimante connue est affichée comme « hors ligne »
  plutôt que « non connectée »

## 2.6.1
- **Correction (version bureau)** : écran blanc définitif au clic sur
  « Connecter l'imprimante ». Le flag `WebBluetoothNewPermissionsBackend`
  exige des gestionnaires de permission qui n'étaient pas fournis, et le
  processus de rendu mourait à l'ouverture du sélecteur. Vérifié :
  `navigator.bluetooth` reste disponible sans ce flag.
- Gestionnaires de permission Bluetooth ajoutés, restreints au nécessaire
- Rechargement automatique après un plantage du rendu (3 tentatives), puis
  message explicite — au lieu d'une fenêtre blanche muette
- Navigation hors application bloquée : un fichier glissé dans la fenêtre
  remplaçait la page
- **Correction** : une erreur de « geste utilisateur » s'affichait comme un
  problème de HTTPS

## 2.6.0
- Liste des produits regroupée par catégorie, sections repliables et mémorisées
- Recherche dans la liste des produits, insensible aux accents
- Compteurs par catégorie et compteur global
- Pendant une recherche, toutes les sections s'ouvrent : sinon un résultat
  situé dans une section repliée resterait invisible

## 2.5.0
- **Correction** : une DLC antérieure à la date de production, ou déjà
  dépassée, s'imprimait sans aucun avertissement. Alerte visible et
  confirmation obligatoire avant impression.

## 2.4.2
- **Correction** : le champ de saisie manuelle restait affiché en permanence.
  La règle `label { display: block }` écrasait l'attribut `hidden` du
  navigateur.
- Messages d'erreur traduits en français, avec une consigne concrète
  plutôt qu'un constat technique

## 2.4.1
- **Correction** : impossible de sélectionner un emoji ou une couleur. Les
  grilles étaient enfermées dans un `<label>`, qui redirige tout clic vers
  le champ associé.
- Suppression du défilement sur grand écran : dates côte à côte et
  espacements resserrés

## 2.4.0
- Mode hors ligne (service worker)
- Rappel de sauvegarde au-delà de 60 impressions ou 21 jours
- **Correction** : après l'import d'un catalogue, la liste restait sur
  « saisie manuelle » — DLC vide et bouton grisé, l'application semblait
  cassée juste après un import réussi.

## 2.3.1
- **Correction** : les suppressions échouaient en silence dans les iframes
  sandboxées. `window.confirm()` y est bloqué et ne renvoie rien ;
  remplacé par une boîte de dialogue interne.

## 2.3.0
- Aperçu repliable, replié par défaut sur mobile
- Gestion des catégories déplacée dans Réglages

## 2.2.0
- Mise en page deux colonnes au-delà de 900 px
- Historique des impressions avec réimpression
- Reconnexion sans fenêtre de choix (version bureau)
- Recherche de produit et mémoire des prénoms

## 2.1.0
- Catégories avec emoji et couleur, modifiables

## 2.0.0
- Passage au pilote niimbot-web-bluetooth, validé sur B1 Pro.
  L'implémentation maison du protocole ne fonctionnait pas.
