// Application Étiqueteuse — La Carte
// L'impression est déléguée à niimbot-web-bluetooth (MIT), pilote validé
// sur Niimbot B1 Pro. Voir LICENSE-niimbot.

import { renderLabelCanvas, computeDLC, toInputDate } from './render.js';

// --- Paramètres imprimante (issus de registry.json de la bibliothèque) ---
const MODEL = {
  label: 'Niimbot B1 Pro',
  name_prefixes: ['B1'],
  task: 'v4',
  dpi: 300,
  density: 3,
  label_type: 1,
  speed: 1,
};
const SIZE = { w_px: 584, h_px: 354 }; // T50x30 à 300 dpi

const $ = (id) => document.getElementById(id);
const KEY_PROD = 'lacarte.produits';
const KEY_CFG = 'lacarte.config';
const KEY_CAT = 'lacarte.categories';
const KEY_HIST = 'lacarte.historique';
const KEY_COOKS = 'lacarte.cuisiniers';
const KEY_SAUVE = 'lacarte.sauvegarde';

function montrerErreur(msg) {
  const el = $('fatalError');
  if (!el) return;
  el.style.display = 'block';
  el.textContent =
    "Une erreur empêche l'application de fonctionner correctement. "
    + "Recharge la page ; si le problème persiste, signale ce message : " + msg;
}
window.addEventListener('error', (e) => montrerErreur(e.message || 'cause inconnue'));
window.addEventListener('unhandledrejection', (e) =>
  montrerErreur((e.reason && e.reason.message) || 'traitement interrompu'));

// --- Stockage tolérant (certains navigateurs bloquent localStorage) ---
let stockagePersistant = true;
const memoire = {};

function lire(cle, defaut) {
  try {
    const v = localStorage.getItem(cle);
    return v === null ? defaut : JSON.parse(v);
  } catch (e) {
    stockagePersistant = false;
    try { return memoire[cle] !== undefined ? JSON.parse(memoire[cle]) : defaut; }
    catch (_) { return defaut; }
  }
}

function ecrire(cle, valeur) {
  const json = JSON.stringify(valeur);
  memoire[cle] = json;
  try { localStorage.setItem(cle, json); }
  catch (e) { stockagePersistant = false; }
}

// --- État ---
// Catégories par défaut à la première ouverture — toutes modifiables ensuite.
const CATEGORIES_DEFAUT = [
  { id: 'c1', nom: 'Poisson',   emoji: '🐟', couleur: '#3d6b8f' },
  { id: 'c2', nom: 'Viande',    emoji: '🥩', couleur: '#a34a3c' },
  { id: 'c3', nom: 'Cuisiné',   emoji: '🍲', couleur: '#b08d3f' },
  { id: 'c4', nom: 'Légumes',   emoji: '🥕', couleur: '#4f7a45' },
  { id: 'c5', nom: 'Pâtisserie', emoji: '🍰', couleur: '#8a5a7a' },
];

let categories = lire(KEY_CAT, null);
if (!Array.isArray(categories) || !categories.length) {
  categories = CATEGORIES_DEFAUT.slice();
}
let produits = lire(KEY_PROD, []);
let filtreCat = null;   // null = toutes
let recherche = '';            // recherche de l'écran d'impression
let rechercheProd = '';        // recherche de la liste des produits
// Sections repliées, mémorisées d'une session à l'autre.
let replies = new Set(lire('lacarte.replies', []));
let historique = lire(KEY_HIST, []);
let cuisiniers = lire(KEY_COOKS, []);   // prénoms déjà utilisés
// Suivi des sauvegardes : les données vivent dans le stockage du navigateur,
// que l'utilisateur peut effacer sans s'en rendre compte.
let sauvegarde = lire(KEY_SAUVE, { derniere: null, impressionsDepuis: 0 });
let editProdId = null;
let config = Object.assign({ density: 3, apercuOuvert: null }, lire(KEY_CFG, {}));
let dlcForcee = false;
let quantite = 1;
let connecte = false;

const saveProduits = () => ecrire(KEY_PROD, produits);
const saveCategories = () => ecrire(KEY_CAT, categories);
const saveHistorique = () => ecrire(KEY_HIST, historique);
const saveCuisiniers = () => ecrire(KEY_COOKS, cuisiniers);
const saveSauvegarde = () => ecrire(KEY_SAUVE, sauvegarde);
const saveReplies = () => ecrire('lacarte.replies', [...replies]);
const saveConfig = () => ecrire(KEY_CFG, config);

const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

/**
 * Confirmation maison plutôt que window.confirm().
 * confirm() est bloqué dans les iframes sandboxées (aperçus, intégrations) :
 * il ne renvoie rien et la suppression n'a jamais lieu, sans le moindre message.
 * @returns {Promise<boolean>}
 */
function demanderConfirmation(texte, libelleAction) {
  return new Promise((resolve) => {
    const boite = $('confirmBox');
    const action = libelleAction || 'Supprimer';
    $('confirmTexte').textContent = texte;
    $('confirmOui').textContent = action;
    // Rouge pour les suppressions, neutre pour les autres actions.
    $('confirmOui').style.background = /supprim|vider/i.test(action) ? '#b3402d' : '';
    boite.style.display = 'flex';

    const fermer = (reponse) => {
      boite.style.display = 'none';
      $('confirmOui').removeEventListener('click', oui);
      $('confirmNon').removeEventListener('click', non);
      boite.removeEventListener('click', fond);
      resolve(reponse);
    };
    const oui = () => fermer(true);
    const non = () => fermer(false);
    const fond = (e) => { if (e.target === boite) fermer(false); };

    $('confirmOui').addEventListener('click', oui);
    $('confirmNon').addEventListener('click', non);
    boite.addEventListener('click', fond);
  });
}

function banner(el, type, msg, autoHide) {
  el.innerHTML = `<div class="banner ${type}">${msg}</div>`;
  if (autoHide) setTimeout(() => { el.innerHTML = ''; }, autoHide);
}

// --- Navigation ---
document.querySelectorAll('nav button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    b.classList.add('active');
    $('sc-' + b.dataset.sc).classList.add('active');
    try { window.scrollTo(0, 0); } catch (e) { /* non critique */ }
  });
});

// --- Catégories ---
const catParId = (id) => categories.find((c) => c.id === id) || null;

function etiquetteCat(c) {
  return c ? `${c.emoji} ${c.nom}` : 'Sans catégorie';
}

/** Échappe le texte destiné à innerHTML (les noms sont saisis librement). */
function esc(t) {
  return String(t).replace(/[&<>"]/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

function renderChips() {
  const utilisees = categories.filter((c) => produits.some((p) => p.catId === c.id));
  const sansCat = produits.some((p) => !catParId(p.catId));

  // Une seule catégorie utilisée : le filtre n'apporte rien, on le masque.
  if (utilisees.length < 2 && !sansCat) {
    $('chips').innerHTML = '';
    return;
  }

  let html = `<button class="chip ${filtreCat === null ? 'active' : ''}"
    data-cat="" ${filtreCat === null ? 'style="background:#1c1c1c"' : ''}>Tous</button>`;

  html += utilisees.map((c) => {
    const actif = filtreCat === c.id;
    return `<button class="chip ${actif ? 'active' : ''}" data-cat="${c.id}"
      style="${actif ? 'background:' + c.couleur : 'border-color:' + c.couleur}">
      ${c.emoji} ${esc(c.nom)}</button>`;
  }).join('');

  if (sansCat) {
    const actif = filtreCat === '__sans__';
    html += `<button class="chip ${actif ? 'active' : ''}" data-cat="__sans__"
      ${actif ? 'style="background:#888"' : ''}>Sans catégorie</button>`;
  }

  $('chips').innerHTML = html;
  $('chips').querySelectorAll('[data-cat]').forEach((b) => {
    b.addEventListener('click', () => {
      filtreCat = b.dataset.cat === '' ? null : b.dataset.cat;
      renderChips();
      renderSelectProduits();
      draw();
    });
  });
}

function produitsFiltres() {
  let liste = produits;
  if (filtreCat === '__sans__') liste = liste.filter((p) => !catParId(p.catId));
  else if (filtreCat !== null) liste = liste.filter((p) => p.catId === filtreCat);

  const q = recherche.trim().toLowerCase();
  if (q) {
    // Insensible aux accents : « pavé » se trouve en tapant « pave ».
    const sansAccent = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const qn = sansAccent(q);
    liste = liste.filter((p) => sansAccent(p.nom).includes(qn));
  }
  return liste;
}

function renderSelectProduits() {
  const sel = $('produit');
  const prev = sel.value;
  const liste = produitsFiltres();

  // Regroupe par catégorie : plus rapide à parcourir qu'une liste à plat.
  let html = '';
  const parCat = new Map();
  liste.forEach((p) => {
    const cle = catParId(p.catId) ? p.catId : '__sans__';
    if (!parCat.has(cle)) parCat.set(cle, []);
    parCat.get(cle).push(p);
  });

  categories.forEach((c) => {
    const items = parCat.get(c.id);
    if (!items) return;
    html += `<optgroup label="${esc(c.emoji + ' ' + c.nom)}">` +
      items.map((p) => `<option value="${p.id}">${esc(p.nom)} — ${p.dureeJours} j</option>`).join('') +
      '</optgroup>';
  });

  const orphelins = parCat.get('__sans__');
  if (orphelins) {
    html += '<optgroup label="Sans catégorie">' +
      orphelins.map((p) => `<option value="${p.id}">${esc(p.nom)} — ${p.dureeJours} j</option>`).join('') +
      '</optgroup>';
  }

  html += '<option value="__manuel__">✏️ Saisie manuelle</option>';
  sel.innerHTML = html;

  if (prev === '__manuel__' || liste.some((p) => p.id === prev)) sel.value = prev;
  else if (!liste.length) sel.value = '__manuel__';
}

function renderCatSelect() {
  $('pCat').innerHTML =
    categories.map((c) => `<option value="${c.id}">${esc(c.emoji + ' ' + c.nom)}</option>`).join('') +
    '<option value="">Sans catégorie</option>';
}

function renderCategories() {
  $('catList').innerHTML = categories.length
    ? categories.map((c) => {
        const nb = produits.filter((p) => p.catId === c.id).length;
        return `<div class="cat-item" style="border-left-color:${c.couleur}">
          <span style="font-size:20px">${c.emoji}</span>
          <span class="nom">${esc(c.nom)}</span>
          <span class="nb">${nb} produit${nb > 1 ? 's' : ''}</span>
          <button class="del" data-delcat="${c.id}" aria-label="Supprimer">×</button>
        </div>`;
      }).join('')
    : '<div class="empty">Aucune catégorie.</div>';

  $('catList').querySelectorAll('[data-delcat]').forEach((b) => {
    b.addEventListener('click', async () => {
      const c = catParId(b.dataset.delcat);
      const nb = produits.filter((p) => p.catId === c.id).length;
      const msg = nb
        ? `Supprimer « ${c.nom} » ?\n\n${nb} produit${nb > 1 ? 's' : ''} passeront en « sans catégorie » — ils ne seront pas supprimés.`
        : `Supprimer « ${c.nom} » ?`;
      if (!(await demanderConfirmation(msg))) return;

      categories = categories.filter((x) => x.id !== c.id);
      // Les produits sont conservés, seul le rattachement disparaît.
      produits.forEach((p) => { if (p.catId === c.id) p.catId = null; });
      if (filtreCat === c.id) filtreCat = null;
      saveCategories(); saveProduits();
      majTout();
    });
  });
}

// Palette d'emojis et de couleurs pour créer une catégorie
const EMOJIS = ['🐟','🥩','🍲','🥕','🍰','🧀','🍞','🥚','🍤','🍗','🥗','🍋','🧊','🌶️','🥫','🍯'];
const COULEURS = ['#3d6b8f','#a34a3c','#b08d3f','#4f7a45','#8a5a7a','#c1743a','#5a6b7a','#7a5a3c'];
let emojiChoisi = EMOJIS[0];
let couleurChoisie = COULEURS[0];

function renderPalettes() {
  $('emojiGrid').innerHTML = EMOJIS.map((e) =>
    `<button type="button" data-emoji="${e}" class="${e === emojiChoisi ? 'sel' : ''}">${e}</button>`).join('');
  $('emojiGrid').querySelectorAll('[data-emoji]').forEach((b) => {
    b.addEventListener('click', () => {
      emojiChoisi = b.dataset.emoji;
      $('cEmoji').value = '';
      renderPalettes();
    });
  });

  $('colorGrid').innerHTML = COULEURS.map((c) =>
    `<button type="button" data-couleur="${c}" style="background:${c}" class="${c === couleurChoisie ? 'sel' : ''}" aria-label="Couleur ${c}"></button>`).join('');
  $('colorGrid').querySelectorAll('[data-couleur]').forEach((b) => {
    b.addEventListener('click', () => {
      couleurChoisie = b.dataset.couleur;
      renderPalettes();
    });
  });
}

$('btnAddCat').addEventListener('click', () => {
  const nom = $('cNom').value.trim();
  if (!nom) return;
  const emojiLibre = $('cEmoji').value.trim();
  categories.push({
    id: 'c' + Date.now(),
    nom,
    emoji: emojiLibre || emojiChoisi,
    couleur: couleurChoisie,
  });
  saveCategories();
  $('cNom').value = ''; $('cEmoji').value = '';
  majTout();
  banner($('dataStatus'), 'success', 'Catégorie ajoutée.', 2000);
});

// --- Produits ---
/** Retire les accents pour une recherche tolérante. */
function sansAccent(t) {
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function renderProduits() {
  renderSelectProduits();
  renderCatSelect();
  renderChips();

  const q = sansAccent(rechercheProd.trim());
  const correspond = (p) => !q || sansAccent(p.nom).includes(q);
  const filtres = produits.filter(correspond);

  $('nbProduits').textContent = q
    ? `${filtres.length} sur ${produits.length}`
    : (produits.length ? `${produits.length}` : '');

  if (!produits.length) {
    $('prodList').innerHTML = '<div class="empty">Aucun produit.<br>Ajoute-en un ci-dessus.</div>';
    $('btnToutReplier').hidden = true;
    return;
  }
  if (!filtres.length) {
    $('prodList').innerHTML = `<div class="empty">Aucun produit ne correspond à « ${esc(rechercheProd)} ».</div>`;
    $('btnToutReplier').hidden = true;
    return;
  }
  $('btnToutReplier').hidden = false;

  // Regroupe par catégorie, dans l'ordre des catégories, orphelins à la fin.
  const groupes = [];
  categories.forEach((c) => {
    const items = filtres.filter((p) => p.catId === c.id);
    if (items.length) groupes.push({ cle: c.id, cat: c, items });
  });
  const orphelins = filtres.filter((p) => !catParId(p.catId));
  if (orphelins.length) {
    groupes.push({ cle: '__sans__', cat: null, items: orphelins });
  }

  const ligneProduit = (p) => {
    const c = catParId(p.catId);
    return `<div class="prod-item" style="border-left-color:${c ? c.couleur : '#e2ddd2'}">
      <div class="name">${esc(p.nom)}</div>
      <div class="days">${p.dureeJours} j</div>
      <button class="link" type="button" data-edit="${p.id}">Modifier</button>
      <button class="del" type="button" data-del="${p.id}" aria-label="Supprimer ${esc(p.nom)}">×</button>
    </div>`;
  };

  $('prodList').innerHTML = groupes.map((g) => {
    // Une recherche en cours ouvre tout : sinon les résultats resteraient cachés.
    const ouvert = !!q || !replies.has(g.cle);
    const couleur = g.cat ? g.cat.couleur : '#e2ddd2';
    const emoji = g.cat ? g.cat.emoji : '🏷️';
    const nom = g.cat ? g.cat.nom : 'Sans catégorie';
    return `<div class="cat-section">
      <button class="cat-entete" type="button" data-section="${g.cle}"
              aria-expanded="${ouvert}" style="border-left-color:${couleur}">
        <span class="fleche">▶</span>
        <span class="emo">${emoji}</span>
        <span class="nom">${esc(nom)}</span>
        <span class="nb">${g.items.length}</span>
      </button>
      <div class="cat-contenu"${ouvert ? '' : ' hidden'}>${g.items.map(ligneProduit).join('')}</div>
    </div>`;
  }).join('');

  // Le bouton bascule dans les deux sens : son libellé suit l'état réel.
  const auMoinsUnOuvert = groupes.some((g) => !replies.has(g.cle));
  $('btnToutReplier').textContent = (q || auMoinsUnOuvert) ? 'Tout replier' : 'Tout déplier';
  $('btnToutReplier').disabled = !!q;

  // Replier / déplier une section
  $('prodList').querySelectorAll('[data-section]').forEach((b) => {
    b.addEventListener('click', () => {
      if (q) return;   // pendant une recherche, tout reste ouvert
      const cle = b.dataset.section;
      if (replies.has(cle)) replies.delete(cle);
      else replies.add(cle);
      saveReplies();
      renderProduits();
    });
  });

  $('prodList').querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', async () => {
      const p = produits.find((x) => x.id === b.dataset.del);
      if (!(await demanderConfirmation(`Supprimer « ${p.nom} » ?`))) return;
      produits = produits.filter((x) => x.id !== b.dataset.del);
      saveProduits(); majTout();
    });
  });

  $('prodList').querySelectorAll('[data-edit]').forEach((b) => {
    b.addEventListener('click', () => {
      const p = produits.find((x) => x.id === b.dataset.edit);
      editProdId = p.id;
      $('pNom').value = p.nom;
      $('pDuree').value = String(p.dureeJours);
      $('pCat').value = p.catId || '';
      $('btnAddProd').textContent = 'Enregistrer';
      $('btnAnnulerEdit').hidden = false;
      if ($('pNom').scrollIntoView) $('pNom').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
}

$('rechercheProd').addEventListener('input', (e) => {
  rechercheProd = e.target.value;
  renderProduits();
});

$('btnToutReplier').addEventListener('click', () => {
  // Ne considère que les catégories qui contiennent réellement des produits.
  const presentes = categories.filter((c) => produits.some((p) => p.catId === c.id)).map((c) => c.id);
  if (produits.some((p) => !catParId(p.catId))) presentes.push('__sans__');

  const auMoinsUnOuvert = presentes.some((k) => !replies.has(k));
  if (auMoinsUnOuvert) presentes.forEach((k) => replies.add(k));
  else replies.clear();

  saveReplies();
  renderProduits();
});

function resetFormProduit() {
  editProdId = null;
  $('pNom').value = '';
  $('pDuree').value = '';
  $('btnAddProd').textContent = 'Ajouter';
  $('btnAnnulerEdit').hidden = true;
}

$('btnAnnulerEdit').addEventListener('click', resetFormProduit);

/** Rafraîchit tout ce qui dépend des produits ou des catégories. */
function majTout() {
  renderProduits();
  renderCategories();
  renderPalettes();
  draw();
}

$('btnAddProd').addEventListener('click', () => {
  const nom = $('pNom').value.trim();
  const duree = $('pDuree').value;
  if (!nom || duree === '') return;
  const catId = $('pCat').value || null;

  if (editProdId) {
    const p = produits.find((x) => x.id === editProdId);
    if (p) { p.nom = nom; p.dureeJours = Number(duree); p.catId = catId; }
    produits.sort((a, b) => a.nom.localeCompare(b.nom));
    saveProduits();
    resetFormProduit();
    majTout();
    banner($('dataStatus'), 'success', 'Produit modifié.', 2000);
    return;
  }

  const id = String(Date.now());
  produits.push({ id, nom, dureeJours: Number(duree), catId });
  produits.sort((a, b) => a.nom.localeCompare(b.nom));
  saveProduits();
  resetFormProduit();
  majTout();
  // Sélectionner le produit ajouté : sinon, après le tout premier ajout, la
  // liste reste sur « saisie manuelle » et l'écran d'impression semble inerte.
  if (filtreCat === null || filtreCat === catId) {
    $('produit').value = id;
    dlcForcee = false;
    draw();
  }
  banner($('dataStatus'), 'success', 'Produit ajouté.', 2000);
});

// --- Rendu de l'aperçu ---
const estManuel = () => $('produit').value === '__manuel__';

function nomProduit() {
  if (estManuel()) return $('produitManuel').value.trim();
  const p = produits.find((x) => x.id === $('produit').value);
  return p ? p.nom : '';
}

function currentProduit() {
  return produits.find((p) => p.id === $('produit').value);
}

function labelCanvas() {
  return renderLabelCanvas({
    produit: nomProduit(),
    dateProd: $('dateProd').value,
    dlc: $('dlc').value,
    cuisinier: $('cuisinier').value,
  });
}

/**
 * Vérifie la cohérence de la DLC.
 * Une DLC antérieure à la production ou déjà dépassée vient presque toujours
 * d'une faute de frappe. L'imprimer enverrait un produit périmé en service :
 * on alerte, sans bloquer (un cas légitime reste possible).
 * @returns {{niveau:'ok'|'alerte', message:string}}
 */
function verifierDlc() {
  const prod = $('dateProd').value;
  const dlc = $('dlc').value;
  if (!prod || !dlc) return { niveau: 'ok', message: '' };

  const dProd = new Date(prod + 'T00:00:00');
  const dDlc = new Date(dlc + 'T00:00:00');
  const auj = new Date();
  auj.setHours(0, 0, 0, 0);

  if (dDlc < dProd) {
    return { niveau: 'alerte', message: 'La DLC est antérieure à la date de production.' };
  }
  if (dDlc < auj) {
    const jours = Math.round((auj - dDlc) / 86400000);
    return {
      niveau: 'alerte',
      message: `Cette DLC est déjà dépassée (depuis ${jours} jour${jours > 1 ? 's' : ''}).`,
    };
  }
  return { niveau: 'ok', message: '' };
}

function draw() {
  const manuel = estManuel();
  $('wrapManuel').hidden = !manuel;

  const p = currentProduit();
  if (!manuel && p && !dlcForcee && $('dateProd').value) {
    $('dlc').value = toInputDate(computeDLC($('dateProd').value, p.dureeJours));
  }
  $('tagForcee').hidden = manuel || !dlcForcee;
  $('btnRecalc').hidden = manuel || !dlcForcee;

  // Inutile de redessiner un canvas masqué ; il est régénéré à l'ouverture.
  if (apercuOuvert) {
    const canvas = labelCanvas();
    const target = $('preview');
    target.width = canvas.width;
    target.height = canvas.height;
    target.getContext('2d').drawImage(canvas, 0, 0);
  }

  const controle = verifierDlc();
  $('alerteDlc').hidden = controle.niveau === 'ok';
  $('alerteDlc').textContent = controle.message;

  const pret = nomProduit() && $('dateProd').value && $('dlc').value && $('cuisinier').value.trim();
  $('btnPrint').disabled = !pret;
}

['produit', 'dateProd', 'cuisinier', 'produitManuel'].forEach((id) =>
  $(id).addEventListener('input', () => {
    if (id === 'produit') {
      dlcForcee = false;
      if (estManuel()) {
        $('dlc').value = '';
        setTimeout(() => $('produitManuel').focus(), 50);
      } else {
        $('produitManuel').value = '';
      }
    }
    draw();
  }));

$('recherche').addEventListener('input', (e) => {
  recherche = e.target.value;
  renderSelectProduits();
  draw();
});

$('dlc').addEventListener('input', () => { dlcForcee = true; draw(); });
$('btnRecalc').addEventListener('click', () => { dlcForcee = false; draw(); });

$('qMoins').addEventListener('click', () => {
  quantite = Math.max(1, quantite - 1); $('qVal').textContent = quantite;
});
$('qPlus').addEventListener('click', () => {
  quantite = Math.min(30, quantite + 1); $('qVal').textContent = quantite;
});


// --- Traduction des messages d'erreur ---
// Le pilote d'impression et le navigateur renvoient des messages en anglais,
// souvent techniques. On les reformule en français, en gardant une consigne
// actionnable plutôt qu'un simple constat.
function traduireErreur(e) {
  if (!e) return 'Erreur inconnue.';
  const msg = String(e.message || e);
  const nom = e.name || '';

  // --- Erreurs renvoyées par le navigateur ---
  if (nom === 'NotFoundError' || /user cancel|chooser/i.test(msg)) {
    return "Aucune imprimante sélectionnée. Vérifie qu'elle est allumée et à portée, puis réessaie.";
  }
  // À tester avant la règle HTTPS : ce message mentionne HTTPS mais signale
  // en réalité un navigateur qui ne gère pas le Web Bluetooth.
  if (nom === 'NotSupportedError' || /web bluetooth unavailable|not supported/i.test(msg)) {
    return "Ce navigateur ne gère pas le Bluetooth. Utilise Chrome ou Edge (Android ou ordinateur).";
  }
  if (nom === 'SecurityError' || /secure context/i.test(msg)) {
    return "Le Bluetooth exige une connexion sécurisée (HTTPS). Ouvre l'app depuis son adresse en ligne.";
  }
  if (nom === 'NetworkError' || /gatt (operation|server)|connection failed/i.test(msg)) {
    return "La liaison Bluetooth a échoué. Éteins puis rallume l'imprimante, et reconnecte-toi.";
  }
  if (nom === 'InvalidStateError') {
    return "L'imprimante est dans un état inattendu. Éteins-la, rallume-la, puis reconnecte-toi.";
  }
  if (nom === 'NotAllowedError') {
    return "Accès au Bluetooth refusé. Autorise-le dans les réglages du navigateur.";
  }

  // --- Erreurs du pilote d'impression ---
  if (/not connected/i.test(msg)) {
    return "Imprimante déconnectée. Reconnecte-la depuis l'onglet Réglages.";
  }
  if (/connected printer is/i.test(msg)) {
    // Le modèle branché ne correspond pas au profil attendu.
    const m = msg.match(/Connected printer is ([^(]+)\(/);
    const trouve = m ? m[1].trim() : 'un autre modèle';
    return `L'imprimante connectée est ${trouve}, alors que l'app est réglée pour une Niimbot B1 Pro. `
         + `Cette version ne gère que la B1 Pro.`;
  }
  if (/label size is .* dpi but/i.test(msg)) {
    return "La résolution de l'étiquette ne correspond pas à celle de l'imprimante.";
  }
  if (/failed to write to ble/i.test(msg)) {
    return "L'envoi vers l'imprimante a échoué. Rapproche l'appareil, puis réessaie.";
  }
  if (/never acknowledged|pageend/i.test(msg)) {
    return "L'imprimante n'a pas confirmé la fin d'impression. Vérifie le rouleau et le capot.";
  }
  if (/check the paper|no paper|paper out/i.test(msg)) {
    return "Problème de papier : vérifie le rouleau d'étiquettes et la fermeture du capot.";
  }
  if (/nothing printed/i.test(msg)) {
    return "Rien n'a été imprimé. Vérifie le rouleau, puis relance l'impression.";
  }
  if (/cover|lid/i.test(msg)) {
    return "Le capot de l'imprimante est ouvert. Referme-le et réessaie.";
  }
  if (/battery|power/i.test(msg)) {
    return "Batterie de l'imprimante trop faible. Branche-la et réessaie.";
  }
  if (/overheat|temperature/i.test(msg)) {
    return "L'imprimante a surchauffé. Laisse-la refroidir quelques minutes.";
  }
  if (/density must be/i.test(msg)) {
    return "Densité d'impression invalide : choisis une valeur entre 1 et 5 dans les Réglages.";
  }
  if (/timeout|timed out/i.test(msg)) {
    return "L'imprimante n'a pas répondu à temps. Vérifie qu'elle est allumée et à portée.";
  }

  // Message inconnu : on le montre tel quel plutôt que de masquer l'information.
  return 'Échec de l\'impression : ' + msg;
}

// --- Aperçu repliable ---
// Sur grand écran l'aperçu occupe une colonne libre : ouvert par défaut.
// Sur mobile il repousserait tout le formulaire : replié par défaut.
// Le choix de l'utilisateur, une fois fait, prime sur ces valeurs.
function apercuParDefaut() {
  return window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
}

let apercuOuvert = config.apercuOuvert === null || config.apercuOuvert === undefined
  ? apercuParDefaut()
  : !!config.apercuOuvert;

function majApercu() {
  $('wrapApercu').hidden = !apercuOuvert;
  $('btnApercu').textContent = apercuOuvert ? "Masquer l'aperçu" : "Voir l'aperçu";
}

$('btnApercu').addEventListener('click', () => {
  apercuOuvert = !apercuOuvert;
  config.apercuOuvert = apercuOuvert;
  saveConfig();
  majApercu();
  if (apercuOuvert) draw();   // le canvas était masqué : on le redessine
});

// --- Imprimante mémorisée (version bureau uniquement) ---
// Sous Electron, le sélecteur d'appareil est le nôtre : on peut donc reprendre
// l'imprimante déjà appairée sans réafficher la liste. Dans un navigateur, le
// sélecteur appartient au système et cette optimisation n'est pas possible.
let autoReprise = false;

if (window.electronBT && window.electronBT.present) {
  window.electronBT.onAuto(() => { autoReprise = true; });

  window.electronBT.memorisee().then((m) => {
    if (m && m.deviceId) {
      $('btnOublier').hidden = false;
      $('btnConnect').textContent = 'Reconnecter ' + (m.deviceName || "l'imprimante");
    }
  });

  $('btnOublier').addEventListener('click', async () => {
    await window.electronBT.oublier();
    $('btnOublier').hidden = true;
    $('btnConnect').textContent = "Connecter l'imprimante";
    banner($('btStatus'), 'success',
      "Imprimante oubliée — la liste réapparaîtra à la prochaine connexion.", 4000);
  });
}

// --- Connexion imprimante ---
function majEtatBt(texte, ok) {
  connecte = !!ok;
  $('btState').textContent = texte;
  $('btState').classList.toggle('ok', !!ok);
}

$('btnConnect').addEventListener('click', async () => {
  if (!window.Niimbot || !Niimbot.isSupported()) {
    banner($('btStatus'), 'error',
      "Bluetooth indisponible. Ouvre l'app dans Chrome sur Android (en HTTPS). " +
      "Firefox et Safari ne gèrent pas le Web Bluetooth.");
    return;
  }
  const btn = $('btnConnect');
  btn.disabled = true;
  btn.textContent = 'Connexion…';
  try {
    const info = await Niimbot.identify(MODEL);
    const nom = (info && (info.label || info.model)) || 'Imprimante';
    majEtatBt(nom, true);
    if (window.electronBT && window.electronBT.present) $('btnOublier').hidden = false;
    banner($('btStatus'), 'success',
      `Connectée : ${nom}${autoReprise ? ' (reprise automatique)' : ''}.`, 5000);
    autoReprise = false;
  } catch (e) {
    majEtatBt('Non connectée', false);
    banner($('btStatus'), 'error', traduireErreur(e));
  } finally {
    btn.disabled = false;
    btn.textContent = connecte ? 'Reconnecter' : "Connecter l'imprimante";
  }
});

// --- Impression ---
$('btnPrint').addEventListener('click', async () => {
  if (!nomProduit()) return;

  // Dernier garde-fou avant qu'une étiquette erronée parte en service.
  const controle = verifierDlc();
  if (controle.niveau === 'alerte') {
    const ok = await demanderConfirmation(
      controle.message + '\n\nImprimer quand même cette étiquette ?',
      'Imprimer'
    );
    if (!ok) return;
  }

  if (!window.Niimbot || !Niimbot.isSupported()) {
    banner($('printStatus'), 'error',
      "Bluetooth indisponible dans ce navigateur. Utilise Chrome sur Android.");
    return;
  }

  const btn = $('btnPrint');
  btn.disabled = true;
  btn.textContent = 'Envoi…';

  try {
    const dataUrl = labelCanvas().toDataURL('image/png');
    await Niimbot.printImage(dataUrl, {
      model: MODEL,
      size: SIZE,
      copies: quantite,
      density: config.density,
      onProgress: (s) => {
        const txt = typeof s === 'string' ? s : (s && (s.phase || s.stage)) || '';
        if (txt) btn.textContent = 'Envoi… ' + txt;
      },
    });
    majEtatBt(MODEL.label, true);

    const p = currentProduit();
    ajouterHistorique({
      horodatage: new Date().toISOString(),
      produit: nomProduit(),
      produitId: p ? p.id : null,
      catId: p ? p.catId : null,
      dateProd: $('dateProd').value,
      dlc: $('dlc').value,
      dlcAffichee: new Date($('dlc').value).toLocaleDateString('fr-FR'),
      cuisinier: $('cuisinier').value.trim(),
      quantite,
    });
    memoriserCuisinier($('cuisinier').value);

    sauvegarde.impressionsDepuis += quantite;
    saveSauvegarde();
    majEtatSauvegarde();

    banner($('printStatus'), 'success',
      `${quantite} étiquette${quantite > 1 ? 's' : ''} imprimée${quantite > 1 ? 's' : ''}.`, 4000);
  } catch (e) {
    // Le pilote envoie PrintEnd avant de rejeter : des étiquettes ont pu sortir.
    banner($('printStatus'), 'error',
      traduireErreur(e) + " Vérifie le rouleau : une partie a pu s'imprimer.");
  } finally {
    btn.textContent = 'Imprimer';
    draw();
  }
});


// --- Historique ---
const MAX_HIST = 200;

function ajouterHistorique(entree) {
  historique.unshift(entree);
  if (historique.length > MAX_HIST) historique.length = MAX_HIST;
  saveHistorique();
  renderHistorique();
}

function memoriserCuisinier(nom) {
  const n = nom.trim();
  if (!n) return;
  cuisiniers = [n, ...cuisiniers.filter((c) => c.toLowerCase() !== n.toLowerCase())].slice(0, 15);
  saveCuisiniers();
  renderCuisiniers();
}

function renderCuisiniers() {
  $('cuisiniers').innerHTML = cuisiniers.map((c) => `<option value="${esc(c)}"></option>`).join('');
}

function jourLisible(iso) {
  const d = new Date(iso);
  const auj = new Date();
  const hier = new Date(); hier.setDate(hier.getDate() - 1);
  const meme = (a, b) => a.toDateString() === b.toDateString();
  if (meme(d, auj)) return "Aujourd'hui";
  if (meme(d, hier)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function renderHistorique() {
  if (!historique.length) {
    $('histList').innerHTML = '<div class="empty">Aucune impression enregistrée.</div>';
    return;
  }

  let html = '';
  let jourCourant = null;

  historique.forEach((h, i) => {
    const j = jourLisible(h.horodatage);
    if (j !== jourCourant) {
      jourCourant = j;
      html += `<div class="hist-jour">${esc(j)}</div>`;
    }
    const c = catParId(h.catId);
    const heure = new Date(h.horodatage).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    html += `<div class="hist-item" style="border-left-color:${c ? c.couleur : '#e2ddd2'}">
      <div class="infos">
        <div class="nom">${c ? c.emoji + ' ' : ''}${esc(h.produit)}</div>
        <div class="meta">${heure} · DLC ${esc(h.dlcAffichee)} · ${esc(h.cuisinier)}${h.quantite > 1 ? ' · ×' + h.quantite : ''}</div>
      </div>
      <button class="link" data-reimp="${i}">Réimprimer</button>
    </div>`;
  });

  $('histList').innerHTML = html;

  $('histList').querySelectorAll('[data-reimp]').forEach((b) => {
    b.addEventListener('click', () => {
      const h = historique[Number(b.dataset.reimp)];
      if (!h) return;
      // Recharge l'étiquette dans l'écran d'impression sans imprimer :
      // l'utilisateur vérifie les dates avant de relancer.
      recherche = ''; $('recherche').value = '';
      filtreCat = null;
      renderChips(); renderSelectProduits();

      if (h.produitId && produits.some((p) => p.id === h.produitId)) {
        $('produit').value = h.produitId;
      } else {
        $('produit').value = '__manuel__';
        $('produitManuel').value = h.produit;
      }
      dlcForcee = true;
      $('dateProd').value = h.dateProd;
      $('dlc').value = h.dlc;
      $('cuisinier').value = h.cuisinier;
      quantite = 1; $('qVal').textContent = '1';

      document.querySelector('nav button[data-sc="impression"]').click();
      draw();
      banner($('printStatus'), 'warn',
        'Étiquette rechargée — vérifie les dates avant d\'imprimer.', 6000);
    });
  });
}

$('btnViderHisto').addEventListener('click', async () => {
  if (!historique.length) return;
  const n = historique.length;
  if (!(await demanderConfirmation(
    `Vider l'historique ?\n\n${n} entrée${n > 1 ? 's' : ''} seront effacées définitivement.`,
    'Vider'))) return;
  historique = [];
  saveHistorique();
  renderHistorique();
});

// --- Rappel de sauvegarde ---
// Produits, catégories et historique ne vivent que dans ce navigateur.
// Vider les données du navigateur les efface définitivement : on rappelle
// d'exporter régulièrement, sans être intrusif.
const SEUIL_IMPRESSIONS = 60;
const SEUIL_JOURS = 21;

function joursDepuis(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

function sauvegardeAConseiller() {
  if (!produits.length) return false;
  if (!sauvegarde.derniere) return sauvegarde.impressionsDepuis >= SEUIL_IMPRESSIONS;
  return sauvegarde.impressionsDepuis >= SEUIL_IMPRESSIONS
      || joursDepuis(sauvegarde.derniere) >= SEUIL_JOURS;
}

function majEtatSauvegarde() {
  const el = $('etatSauvegarde');
  if (!el) return;

  if (!sauvegarde.derniere) {
    el.innerHTML = '<div class="hint">Aucune sauvegarde effectuée.</div>';
  } else {
    const j = Math.floor(joursDepuis(sauvegarde.derniere));
    const quand = j === 0 ? "aujourd'hui" : j === 1 ? 'hier' : `il y a ${j} jours`;
    el.innerHTML = `<div class="hint">Dernière sauvegarde ${quand}.</div>`;
  }

  const rappel = $('rappelSauvegarde');
  if (rappel) rappel.hidden = !sauvegardeAConseiller();
}

// --- Réglages ---
$('densite').value = String(config.density);
$('densite').addEventListener('change', (e) => {
  config.density = Number(e.target.value);
  saveConfig();
});

$('btnDiag').addEventListener('click', async () => {
  const out = $('diagOut');
  out.innerHTML = '<div class="banner warn">Diagnostic en cours…</div>';
  try {
    const info = await Niimbot.identify(MODEL);
    let statut = null;
    try { statut = await Niimbot.getStatus(); } catch (_) {}
    majEtatBt((info && info.label) || 'Connectée', true);
    out.innerHTML = `<pre>${JSON.stringify({ printer: info, status: statut }, null, 2)}</pre>`;
  } catch (e) {
    banner(out, 'error', traduireErreur(e));
  }
});

// --- Import / export ---
$('btnExport').addEventListener('click', () => {
  // Format v2 : produits + catégories. L'ancien format (tableau nu) reste lisible.
  const paquet = { version: 2, categories, produits };
  const blob = new Blob([JSON.stringify(paquet, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lacarte-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);

  sauvegarde = { derniere: new Date().toISOString(), impressionsDepuis: 0 };
  saveSauvegarde();
  majEtatSauvegarde();
  banner($('dataStatus'), 'success', 'Sauvegarde enregistrée.', 3000);
});

$('btnImport').addEventListener('click', () => $('fileImport').click());
$('fileImport').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());

    // Deux formats acceptés : tableau de produits (v1) ou objet { categories, produits } (v2)
    const brutProduits = Array.isArray(data) ? data : data.produits;
    if (!Array.isArray(brutProduits)) throw new Error('Format inattendu.');

    if (data && Array.isArray(data.categories) && data.categories.length) {
      categories = data.categories
        .filter((c) => c && c.nom)
        .map((c) => ({
          id: String(c.id || 'c' + Date.now() + Math.random()),
          nom: String(c.nom),
          emoji: String(c.emoji || '🏷️'),
          couleur: String(c.couleur || '#888888'),
        }));
      saveCategories();
    }

    const idsCat = new Set(categories.map((c) => c.id));
    const valides = brutProduits
      .filter((p) => p && p.nom && p.dureeJours !== undefined)
      .map((p) => ({
        id: String(p.id || Date.now() + Math.random()),
        nom: String(p.nom),
        dureeJours: Number(p.dureeJours),
        // Un rattachement vers une catégorie absente donnerait un produit
        // invisible au filtrage : on le repasse en « sans catégorie ».
        catId: p.catId && idsCat.has(p.catId) ? p.catId : null,
      }));
    if (!valides.length) throw new Error('Aucun produit valide dans le fichier.');

    produits = valides.sort((a, b) => a.nom.localeCompare(b.nom));
    filtreCat = null;
    recherche = '';
    $('recherche').value = '';
    saveProduits();
    majTout();

    // Sans cela, la liste reste sur « saisie manuelle » (valeur d'avant
    // l'import, quand aucun produit n'existait) : DLC vide et bouton grisé,
    // l'app paraît cassée juste après un import réussi.
    if (produits.length) {
      $('produit').value = produits[0].id;
      $('produitManuel').value = '';
      dlcForcee = false;
      draw();
    }

    banner($('dataStatus'), 'success', `${valides.length} produits importés.`, 3000);
  } catch (err) {
    // JSON.parse renvoie un message système en anglais : on le remplace.
    const cause = /JSON|Unexpected|token|position/i.test(err.message)
      ? "le fichier n'est pas un JSON valide."
      : err.message;
    banner($('dataStatus'), 'error', 'Import impossible : ' + cause);
  }
  e.target.value = '';
});

// --- Init ---
try {
  $('dateProd').value = todayISO();
  saveCategories();          // fige les catégories par défaut au premier lancement
  majEtatBt('Non connectée', false);
  majApercu();
  majEtatSauvegarde();
  renderHistorique();
  renderCuisiniers();
  // Le prénom du dernier utilisateur est pré-rempli : en service, c'est
  // presque toujours la même personne qui étiquette d'affilée.
  if (cuisiniers.length) $('cuisinier').value = cuisiniers[0];
  majTout();

  if (!stockagePersistant) {
    banner($('dataStatus'), 'warn',
      "Ce navigateur bloque le stockage local : les produits ne seront pas conservés.");
  }
  if (!window.Niimbot || !Niimbot.isSupported()) {
    banner($('printStatus'), 'warn',
      "Bluetooth indisponible dans ce navigateur. Ouvre l'app dans Chrome sur Android, en HTTPS.");
  }
} catch (err) {
  montrerErreur(err.message);
}

// --- Mode hors ligne ---
// Le service worker doit être un fichier séparé (contrainte du navigateur) :
// il ne peut pas être embarqué dans la page. Si sw.js est absent, l'app
// fonctionne normalement, simplement sans cache hors ligne.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const nouveau = reg.installing;
      if (!nouveau) return;
      nouveau.addEventListener('statechange', () => {
        // Une version est prête, mais l'ancienne tourne encore : on propose
        // plutôt que de recharger d'office — un rechargement en plein service
        // ferait perdre la saisie en cours.
        if (nouveau.state === 'installed' && navigator.serviceWorker.controller) {
          const el = document.createElement('div');
          el.className = 'banner warn';
          el.style.cssText =
            'position:fixed;left:12px;right:12px;bottom:76px;z-index:150;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.15)';
          el.textContent = 'Nouvelle version disponible — appuyer pour recharger.';
          el.addEventListener('click', () => {
            nouveau.postMessage('skipWaiting');
            location.reload();
          });
          document.body.appendChild(el);
        }
      });
    });
  }).catch(() => { /* pas de sw.js : sans conséquence */ });
}
