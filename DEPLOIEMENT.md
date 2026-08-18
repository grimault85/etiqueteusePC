# Déploiement — instructions PowerShell

Toutes les commandes se lancent depuis **PowerShell**, dans le dossier du dépôt.

> PowerShell 5.1, celui livré avec Windows, ne reconnaît pas l'enchaînement `&&`.
> Les commandes sont donc données **une par ligne**.

---

## Une seule fois : autoriser la publication

Sans ce réglage, la compilation réussit mais la Release ne peut pas être créée.

Sur GitHub → **Settings** → **Actions** → **General** → section *Workflow permissions* →
cocher **Read and write permissions** → **Save**.

---

## Mettre à jour le dépôt

Se placer dans le dossier du dépôt :

```
cd C:\chemin\vers\etiqueteusePC
```

Vérifier l'état, puis envoyer :

```
git status
git add -A
git commit -m "Publication automatique des versions"
git push
```

Si `git push` refuse en signalant que la branche distante a avancé :

```
git pull --rebase
git push
```

---

## Publier une nouvelle version

**1. Mettre à jour le numéro de version**

Ouvrir `desktop\package.json` et modifier la ligne :

```json
"version": "2.8.1",
```

**2. Enregistrer et envoyer**

```
git add -A
git commit -m "Version 2.8.1"
git push
```

**3. Poser le tag — c'est lui qui déclenche tout**

```
git tag v2.8.1
git push origin v2.8.1
```

Le numéro du tag doit correspondre à celui de `package.json`, précédé d'un `v`.

**4. Suivre la compilation**

Onglet **Actions** du dépôt. Compter 5 à 10 minutes.

Une fois terminé, la Release apparaît dans l'onglet **Releases** avec le `.exe`
et le `.dmg` attachés.

---

## Lien à diffuser

```
https://github.com/grimault85/etiqueteusePC/releases/latest
```

Ce lien pointe toujours vers la dernière version : inutile de le changer à chaque
publication. Aucun compte GitHub n'est requis pour télécharger.

---

## En cas de problème

**Le workflow n'apparaît pas dans Actions**
Le fichier `.github\workflows\build-desktop.yml` n'est pas sur GitHub. Vérifier :

```
git ls-files .github
```

Si la commande ne renvoie rien, le dossier n'a pas été envoyé — il est masqué par
défaut dans l'explorateur Windows. Utiliser `git add -A` depuis le dossier du dépôt
plutôt que le glisser-déposer dans le navigateur.

**Le job « publication » échoue avec une erreur de permissions**
Le réglage *Read and write permissions* n'est pas activé (voir plus haut).

**La Release est créée mais sans le `.exe`**
Le job « compilation » a échoué. Ouvrir le détail dans Actions pour voir l'étape
en cause.

**Je me suis trompé de tag**

```
git tag -d v2.8.1
git push origin --delete v2.8.1
```

Puis reposer le tag correctement. Si une Release a déjà été créée sur ce tag, la
supprimer aussi depuis l'onglet Releases.

**La compilation macOS échoue**
Sans conséquence : elle est configurée pour ne pas bloquer la version Windows,
qui sera publiée normalement.
