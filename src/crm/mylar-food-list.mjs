// Liste d'ACHAT « Mylar alimentaire (spécial) » — usine Hongbang Packaging. Liste séparée des prix Mylar existants
// (autre usine, autre devise, autres quantités) : elle ne passe par aucune formule du hub et ne produit aucun prix de vente.
// Coûts usine en USD par sachet, tels que reçus ; marge « à valider ». La page affiche aussi l'équivalent en euros avec le
// taux USD → EUR relevé automatiquement (BCE, comme le yuan) ; sans taux relevé, aucun euro n'est affiché ni inventé.
// Tailles en cm (largeur × hauteur + soufflet).
// Ce bloc est recopié tel quel dans public/index.html (sans les `export`).
export const MYLAR_FOOD_LIST = {
  id: 'mylar-alimentaire-hongbang', name: 'Mylar alimentaire (spécial)', label: 'alimentaire',
  supplier: 'Hongbang Packaging (depuis 1999)', source: 'Hongbang Packaging — fiche tarifaire reçue le 10/11/2026', receivedAt: '2026-11-10',
  priceNote: 'Prix basés sur les prix matière actuels, légèrement variables.',
  transcription: 'Chiffres transcrits depuis une capture d’écran de téléphone : à relire avec le fichier original de l’usine avant toute mise en vente.',
  currency: 'USD', material: 'MOPP/VMPET/PE', tiers: [500, 1000, 2000, 3000, 5000, 8000, 10000],
  models: [
    { id: 'flat-bottom', name: 'Fond plat avec zip et encoches', decimals: 2, rows: [
      { size: '9×13+6', w: 9, h: 13, g: 6, th: 100, p: [1.41, 0.76, 0.43, 0.31, 0.21, 0.16, 0.15] },
      { size: '10×15+6', w: 10, h: 15, g: 6, th: 100, p: [1.44, 0.77, 0.44, 0.32, 0.22, 0.17, 0.16] },
      { size: '11×18+6', w: 11, h: 18, g: 6, th: 100, p: [1.49, 0.83, 0.52, 0.38, 0.29, 0.23, 0.21] },
      { size: '12×17+8', w: 12, h: 17, g: 8, th: 100, p: [1.53, 0.86, 0.54, 0.4, 0.31, 0.25, 0.23] },
      { size: '12×20+8', w: 12, h: 20, g: 8, th: 120, p: [1.58, 0.89, 0.57, 0.42, 0.33, 0.27, 0.25] },
      { size: '13×18+8', w: 13, h: 18, g: 8, th: 120, p: [1.57, 0.88, 0.56, 0.41, 0.33, 0.27, 0.25] },
      { size: '14×20+8', w: 14, h: 20, g: 8, th: 120, p: [1.61, 0.92, 0.59, 0.44, 0.35, 0.28, 0.27] },
      { size: '15×22+8', w: 15, h: 22, g: 8, th: 120, p: [1.62, 0.93, 0.61, 0.46, 0.37, 0.3, 0.28] },
      { size: '16×24+8', w: 16, h: 24, g: 8, th: 120, p: [1.66, 0.97, 0.62, 0.49, 0.38, 0.33, 0.31] },
      { size: '18×26+8', w: 18, h: 26, g: 8, th: 120, p: [1.69, 0.99, 0.64, 0.5, 0.4, 0.35, 0.33] },
      { size: '20×30+10', w: 20, h: 30, g: 10, th: 140, p: [2.27, 1.33, 0.91, 0.7, 0.56, 0.5, 0.47] },
      { size: '22×32+10', w: 22, h: 32, g: 10, th: 140, p: [2.29, 1.41, 0.97, 0.75, 0.61, 0.55, 0.53] },
      { size: '24×37+10', w: 24, h: 37, g: 10, th: 140, p: [2.67, 1.75, 1.32, 1.06, 0.83, 0.77, 0.76] },
      { size: '23×38+12', w: 23, h: 38, g: 12, th: 140, p: [2.77, 1.86, 1.42, 1.14, 0.88, 0.85, 0.83] },
    ] },
    { id: 'stand-up', name: 'Debout (stand up) avec zip et encoches', decimals: 3, rows: [
      { size: '9×13+6', w: 9, h: 13, g: 6, th: 100, p: [0.108, 0.286, 0.176, 0.119, 0.093, 0.079, 0.073] },
      { size: '10×15+6', w: 10, h: 15, g: 6, th: 100, p: [0.112, 0.365, 0.233, 0.201, 0.157, 0.135, 0.118] },
      { size: '12×20+8', w: 12, h: 20, g: 8, th: 120, p: [0.118, 0.369, 0.266, 0.213, 0.173, 0.149, 0.138] },
      { size: '14×20+8', w: 14, h: 20, g: 8, th: 120, p: [0.126, 0.392, 0.286, 0.23, 0.195, 0.166, 0.155] },
      { size: '15×22+8', w: 15, h: 22, g: 8, th: 120, p: [0.128, 0.414, 0.305, 0.253, 0.213, 0.178, 0.176] },
      { size: '16×24+8', w: 16, h: 24, g: 8, th: 140, p: [0.191, 0.601, 0.419, 0.337, 0.279, 0.226, 0.218] },
      { size: '18×26+8', w: 18, h: 26, g: 8, th: 140, p: [0.203, 0.638, 0.457, 0.372, 0.289, 0.257, 0.252] },
      { size: '20×30+10', w: 20, h: 30, g: 10, th: 140, p: [0.216, 0.702, 0.518, 0.407, 0.347, 0.313, 0.312] },
    ] },
  ],
  // Valeurs douteuses : importées telles quelles, marquées « à vérifier », inutilisables pour un prix de vente tant que
  // Lemexx ne les a pas confirmées. Sans `size` : toute la colonne du modèle.
  toVerify: [
    { model: 'stand-up', q: 500, why: 'Colonne 500 plus basse que la colonne 1 000 : impossible, probable erreur de l’usine (virgule ou chiffre manquant). À redemander.' },
    { model: 'stand-up', size: '9×13+6', q: 1000, why: 'Saut anormal 0,286 → 0,365 entre 9×13+6 et 10×15+6 à 1 000 pièces.' },
    { model: 'stand-up', size: '10×15+6', q: 1000, why: 'Saut anormal 0,286 → 0,365 entre 9×13+6 et 10×15+6 à 1 000 pièces.' },
    { model: 'stand-up', size: '15×22+8', q: 10000, why: '0,176 à 10 000 presque égal au prix à 8 000 (0,178).' },
  ],
};
/** Motif « à vérifier » d'une cellule, ou null si la valeur n'est pas signalée. */
export const foodToVerify = (model, size, q, list = MYLAR_FOOD_LIST) => (list.toVerify.find((x) => x.model === model && x.q === q && (!x.size || x.size === size)) || {}).why || null;
/** Coût usine USD d'une cellule : { usd, toVerify } ; null si la taille ou la quantité n'est pas sur la fiche. */
export function foodCost(model, size, q, list = MYLAR_FOOD_LIST) {
  const m = list.models.find((x) => x.id === model), r = m && m.rows.find((x) => x.size === size), i = list.tiers.indexOf(q);
  return r && i >= 0 ? { usd: r.p[i], toVerify: foodToVerify(model, size, q, list) } : null;
}
