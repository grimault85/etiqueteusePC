// Rendu de l'étiquette sur un canvas, puis conversion en bitmap monochrome
// pour envoi à l'imprimante Niimbot B1 Pro.
//
// Imprimante cible : Niimbot B1 Pro — 300 dpi (11.81 dots/mm), tête de 50 mm.
// Format d'étiquette : 50 x 30 mm.

export const PRINTER = { label: 'Niimbot B1 Pro', dotsPerMm: 11.81, maxWidthMm: 50 };
export const LABEL_MM = { width: 50, height: 30 };

/**
 * Dimensions de l'étiquette en points.
 * La largeur est arrondie au multiple de 8 inférieur : le protocole l'exige,
 * et arrondir vers le bas évite de dépasser la largeur de la tête d'impression.
 */
export function labelDots() {
  const rawWidth = LABEL_MM.width * PRINTER.dotsPerMm;
  return {
    width: Math.floor(rawWidth / 8) * 8,
    height: Math.round(LABEL_MM.height * PRINTER.dotsPerMm),
    dotsPerMm: PRINTER.dotsPerMm,
  };
}

function formatDateFR(input) {
  if (!input) return '—';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d)) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Découpe un texte pour qu'il tienne dans une largeur donnée, sur n lignes max.
 * Réduit la taille de police si nécessaire, puis tronque en dernier recours.
 */
function fitText(ctx, text, maxWidth, maxLines, startSize, minSize, fontWeight = 'bold') {
  let size = startSize;

  while (size >= minSize) {
    ctx.font = `${fontWeight} ${size}px Arial, sans-serif`;
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines) {
      return { lines, size };
    }
    size -= 2;
  }

  // Taille minimale atteinte : on tronque
  ctx.font = `${fontWeight} ${minSize}px Arial, sans-serif`;
  const lines = wrapText(ctx, text, maxWidth).slice(0, maxLines);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxWidth) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = last + '…';
  }
  return { lines, size: minSize };
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

const JOURS = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];

function jourSemaine(input) {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d)) return '';
  return JOURS[d.getDay()];
}

/** Rectangle à coins arrondis (roundRect n'est pas garanti sur toutes les plateformes). */
function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/** Icône calendrier dans un cercle, dessinée en blanc (pour fond noir). */
function drawCalendarIcon(ctx, cx, cy, radius, stroke) {
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.lineWidth = stroke;

  // Cercle extérieur
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Corps du calendrier
  const w = radius * 1.05;
  const h = radius * 0.95;
  const x = cx - w / 2;
  const y = cy - h / 2 + radius * 0.06;
  roundRectPath(ctx, x, y, w, h, stroke * 1.2);
  ctx.stroke();

  // Barre de titre pleine
  const headerH = h * 0.26;
  ctx.beginPath();
  ctx.rect(x + stroke / 2, y + stroke / 2, w - stroke, headerH);
  ctx.fill();

  // Deux anneaux au-dessus
  const ringH = radius * 0.2;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.24, y - ringH);
  ctx.lineTo(cx - w * 0.24, y + ringH * 0.2);
  ctx.moveTo(cx + w * 0.24, y - ringH);
  ctx.lineTo(cx + w * 0.24, y + ringH * 0.2);
  ctx.stroke();

  // Points de la grille (2 rangées x 3 colonnes)
  const dot = Math.max(1, stroke * 0.85);
  const gridTop = y + headerH + h * 0.22;
  const gridLeft = x + w * 0.24;
  const stepX = w * 0.26;
  const stepY = h * 0.26;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      if (row === 1 && col === 2) continue; // grille légèrement incomplète, comme un vrai calendrier
      ctx.beginPath();
      ctx.arc(gridLeft + col * stepX, gridTop + row * stepY, dot, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Dessine l'étiquette sur un canvas.
 * @returns {HTMLCanvasElement}
 */
export function renderLabelCanvas({ produit, dateProd, dlc, cuisinier }) {
  const { width, height, dotsPerMm } = labelDots();
  const mm = (v) => v * dotsPerMm;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';

  const pad = Math.round(mm(1.6));
  const inner = width - pad * 2;
  const centerX = width / 2;

  // ================= Bloc DLC (ancré en bas, dimensionné en premier) =========
  const dlcBoxH = Math.round(mm(12.0));
  const dlcBoxY = height - pad - dlcBoxH;

  // ================= Nom du produit (centré, casse d'origine) ===============
  let y = pad;
  const produitTxt = String(produit || 'Produit').trim() || 'Produit';
  const { lines, size } = fitText(
    ctx,
    produitTxt,
    inner,
    2,
    Math.round(mm(4.4)),
    Math.round(mm(2.4))
  );

  ctx.font = `bold ${size}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  const lineGap = Math.round(mm(0.25));
  for (const line of lines) {
    ctx.fillText(line, centerX, y);
    y += size + lineGap;
  }
  y += Math.round(mm(0.5));

  // ================= Ligne PROD | PAR =======================================
  const prodTxt = `PROD : ${formatDateFR(dateProd)}`;
  const parTxt = `PAR : ${String(cuisinier || '—').toUpperCase()}`;

  // Réduit la police puis l'écart jusqu'à ce que la ligne tienne dans la largeur
  let metaSize = Math.round(mm(2.4));
  let gap = Math.round(mm(3.2));
  let prodW, parW, totalW;

  const measure = () => {
    ctx.font = `${metaSize}px Arial, sans-serif`;
    prodW = ctx.measureText(prodTxt).width;
    parW = ctx.measureText(parTxt).width;
    totalW = prodW + gap * 2 + parW;
  };

  measure();
  while (totalW > inner && metaSize > mm(1.5)) {
    if (gap > mm(1.2)) gap -= Math.max(1, Math.round(mm(0.2)));
    else metaSize -= 1;
    measure();
  }

  ctx.font = `${metaSize}px Arial, sans-serif`;
  ctx.textAlign = 'left';
  const metaStart = Math.max(pad, centerX - totalW / 2);
  ctx.fillText(prodTxt, metaStart, y);
  ctx.fillText(parTxt, metaStart + prodW + gap * 2, y);

  // Séparateur vertical
  const sepX = metaStart + prodW + gap;
  const sepW = Math.max(2, Math.round(mm(0.22)));
  ctx.fillRect(sepX, y - Math.round(mm(0.2)), sepW, metaSize + Math.round(mm(0.5)));

  y += metaSize + Math.round(mm(1.1));

  // ================= Trait de séparation ====================================
  // Positionné à mi-chemin entre le bas du bloc d'en-tête et le haut du bloc DLC,
  // pour éviter un vide visuel quand le nom du produit tient sur une seule ligne.
  const ruleH = Math.max(2, Math.round(mm(0.28)));
  const zoneTop = y;
  const zoneBottom = dlcBoxY - ruleH;
  const ruleY = Math.round(Math.min(zoneBottom, zoneTop + (zoneBottom - zoneTop) * 0.45));
  ctx.fillRect(pad, ruleY, inner, ruleH);

  // ================= Bloc DLC inversé =======================================
  ctx.fillStyle = '#000';
  roundRectPath(ctx, pad, dlcBoxY, inner, dlcBoxH, Math.round(mm(1.6)));
  ctx.fill();

  // Icône calendrier à gauche
  const iconRadius = Math.round(mm(3.4));
  const iconCx = pad + Math.round(mm(1.5)) + iconRadius;
  const iconCy = dlcBoxY + dlcBoxH / 2;
  drawCalendarIcon(ctx, iconCx, iconCy, iconRadius, Math.max(2, Math.round(mm(0.3))));

  // Séparateur pointillé vertical
  const dashX = iconCx + iconRadius + Math.round(mm(1.6));
  const dashW = Math.max(2, Math.round(mm(0.22)));
  const dashTop = dlcBoxY + Math.round(mm(1.4));
  const dashBottom = dlcBoxY + dlcBoxH - Math.round(mm(1.4));
  const dashLen = Math.round(mm(0.8));
  const dashGap = Math.round(mm(0.55));
  ctx.fillStyle = '#fff';
  for (let dy = dashTop; dy < dashBottom; dy += dashLen + dashGap) {
    ctx.fillRect(dashX, dy, dashW, Math.min(dashLen, dashBottom - dy));
  }

  // Texte DLC : jour de la semaine puis date en gros
  const textX = dashX + dashW + Math.round(mm(1.8));
  const textAvail = width - pad - Math.round(mm(1.2)) - textX;

  const jour = jourSemaine(dlc);
  const dateTxt = formatDateFR(dlc);

  let jourSize = Math.round(mm(2.7));
  ctx.font = `bold ${jourSize}px Arial, sans-serif`;
  const jourTxt = jour ? `DLC : ${jour}` : 'DLC';
  while (jourSize > mm(1.6) && ctx.measureText(jourTxt).width > textAvail) {
    jourSize -= 2;
    ctx.font = `bold ${jourSize}px Arial, sans-serif`;
  }

  let dateSize = Math.round(mm(4.6));
  ctx.font = `bold ${dateSize}px Arial, sans-serif`;
  while (dateSize > mm(2.6) && ctx.measureText(dateTxt).width > textAvail) {
    dateSize -= 2;
    ctx.font = `bold ${dateSize}px Arial, sans-serif`;
  }

  const blocH = jourSize + Math.round(mm(0.35)) + dateSize;
  let textY = dlcBoxY + (dlcBoxH - blocH) / 2;

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${jourSize}px Arial, sans-serif`;
  ctx.fillText(jourTxt, textX, textY);
  textY += jourSize + Math.round(mm(0.35));
  ctx.font = `bold ${dateSize}px Arial, sans-serif`;
  ctx.fillText(dateTxt, textX, textY);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#000';

  return canvas;
}

/**
 * Convertit un canvas en tableau de pixels monochromes (0 = blanc, 1 = noir).
 * Seuil de binarisation à 50% de luminance.
 * @returns {{ pixels: Uint8Array, width: number, height: number }}
 */
export function canvasToMonochrome(canvas) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, width, height).data;
  const pixels = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const r = imgData[i * 4];
    const g = imgData[i * 4 + 1];
    const b = imgData[i * 4 + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    pixels[i] = luminance < 128 ? 1 : 0;
  }

  return { pixels, width, height };
}

export function computeDLC(dateProdInput, dureeJours) {
  const d = typeof dateProdInput === 'string' ? new Date(dateProdInput) : dateProdInput;
  if (isNaN(d) || dureeJours === undefined || dureeJours === null) return null;
  const result = new Date(d);
  result.setDate(result.getDate() + Number(dureeJours));
  return result;
}

export function toInputDate(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d)) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
