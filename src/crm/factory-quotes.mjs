// Coûts d'usine REÇUS (devis fournisseur), par produit du hub. Information seulement : aucun prix de vente n'est calculé
// à partir de ces montants, aucun réglage de prix (cost0, formules, marges) n'est modifié. La marge reste « à valider »
// par Lemexx. Un produit absent du hub (product: null) est « Hors hub / tarif à saisir », sans configuration inventée.
// Ce bloc est recopié tel quel dans public/index.html (sans les `export`).
export const FACTORY_QUOTE_SOURCE = 'Shenzhen Creative Star — fiche Cricket, 10/11/2026';
export const FACTORY_QUOTE_CURRENCY = { code: 'CNY', confirmed: false, note: 'Devise non écrite sur la fiche : RMB (CNY) à confirmer' };
// line : n° de ligne de la fiche ; q : quantité cotée (palier unique) ; unit et total en RMB ; sample : échantillon en RMB.
export const FACTORY_QUOTES = [
  { line: 1, product: 'badge', label: 'Badges', spec: '5 mm, fer-blanc', designs: 2, q: 1000, unit: 4, total: 4000, sample: 300, sampleApprox: true, sampleNote: null, sampleDays: '5-7', productionDays: '15-20' },
  { line: 2, product: 'cap', label: 'Casquettes', spec: 'H12 L18 P7,5 cm, coton', designs: 6, q: 350, unit: 25, total: 8750, sample: 600, sampleApprox: true, sampleNote: null, sampleDays: '5-7', productionDays: '15-20' },
  { line: 3, product: 'patch', label: 'Patches', spec: 'coton', designs: 6, q: 85, unit: 10, total: 850, sample: 750, sampleApprox: false, sampleNote: null, sampleDays: '7', productionDays: '~10' },
  { line: 4, product: null, label: 'Poignée de téléphone', spec: 'Ø3 cm, base Ø4 cm, plastique', designs: 6, q: 150, unit: 6.2, total: 930, sample: 50, sampleApprox: false, sampleNote: '1 design, 2 échantillons', sampleDays: '5-7', productionDays: '15' },
  { line: 5, product: 'pen', label: 'Stylos', spec: '15 cm, plastique', designs: 1, q: 1000, unit: 1.2, total: 1200, sample: 150, sampleApprox: false, sampleNote: null, sampleDays: '7', productionDays: '~10' },
  { line: 6, product: 'tote', label: 'Tote bags', spec: '35×40, anses 30, coton', designs: 1, q: 500, unit: 8, total: 4000, sample: 200, sampleApprox: true, sampleNote: null, sampleDays: '5-7', productionDays: '15-20' },
  { line: 7, product: 'sock', label: 'Chaussettes', spec: '23 cm, revers 8, coton', designs: 4, q: 200, unit: 6.5, total: 1300, sample: 150, sampleApprox: false, sampleNote: null, sampleDays: '3-5', productionDays: '10-15' },
  { line: 8, product: 'bottle', label: 'Gourdes 500 ml', spec: 'métal', designs: 4, q: 200, unit: 25, total: 5000, sample: 200, sampleApprox: false, sampleNote: null, sampleDays: '3-5', productionDays: '10-15' },
  { line: 9, product: 'pin', label: 'Pins', spec: '3×0,8 cm, 0,3 mm, métal', designs: 3, q: 200, unit: 2, total: 400, sample: 230, sampleApprox: false, sampleNote: null, sampleDays: '3-5', productionDays: '10-15' },
];
export const factoryQuotesFor = (id) => FACTORY_QUOTES.filter((x) => x.product === id);
export const factoryQuotesOffHub = () => FACTORY_QUOTES.filter((x) => !x.product);
