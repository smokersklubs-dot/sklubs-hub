// Coûts d'usine REÇUS (devis fournisseur), par produit du hub. Information seulement : aucun prix de vente n'est calculé
// à partir de ces montants, aucun réglage de prix (cost0, formules, marges) n'est modifié. La marge reste « à valider »
// par Lemexx. Un produit absent du hub (product: null) est « Hors hub / tarif à saisir », sans configuration inventée.
// Ce bloc est recopié tel quel dans public/index.html (sans les `export`).
export const FACTORY_QUOTE_SOURCE = 'Shenzhen Creative Star — fiche Cricket, 10/11/2026';
export const FACTORY_QUOTE_CURRENCY = { code: 'CNY', confirmed: true, note: 'Yuans (RMB) : montants en « 元 » sur la fiche d’origine' };
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
  { line: 10, product: 'beanie', label: 'Bonnets', spec: 'L19 H22 revers 6, coton', designs: 2, q: 100, unit: 28, total: 2800, sample: 300, sampleApprox: false, sampleNote: null, sampleDays: '7', productionDays: '~22' },
  { line: 11, product: 'bucket', label: 'Bobs', spec: 'circ. 57, prof. 16, visière 8, coton', designs: 2, q: 200, unit: 32, total: 6400, sample: 200, sampleApprox: false, sampleNote: null, sampleDays: '7', productionDays: '~22' },
  { line: 12, product: 'lanyard', label: 'Lanyards', spec: '45×2 cm, nylon', designs: 1, q: 140, unit: 3.2, total: 448, sample: 30, sampleApprox: false, sampleNote: null, sampleDays: '3-5', productionDays: '10-15' },
];
export const factoryQuotesFor = (id) => FACTORY_QUOTES.filter((x) => x.product === id);
export const factoryQuotesOffHub = () => FACTORY_QUOTES.filter((x) => !x.product);
// Prix de VENTE déjà facturés au client Cricket (devis « Quotation update 10.12 », EXW, en euros, total 10 058 €).
// Référence de vente : le hub porte déjà ces prix à ces quantités ; rien n'est recalculé ni modifié ici.
export const SALE_QUOTE_SOURCE = 'Devis client Cricket — « Quotation update 10.12 », départ usine (EXW), en euros';
export const SALE_QUOTES = [
  { product: 'badge', label: 'Badges', spec: '5 mm', designs: 6, q: 1200, qNote: '200 par design', unit: 0.15, total: 180 },
  { product: 'tshirt', label: 'T-shirts', spec: 'S, M, L, XL, coton', designs: 3, q: 750, qNote: '250 par design', unit: 6.3, total: 4725 },
  { product: 'cap', label: 'Casquettes', spec: 'coton', designs: 1, q: 175, qNote: null, unit: 4.5, total: 787 },
  { product: 'patch', label: 'Patches', spec: 'coton', designs: 6, q: 500, qNote: '83 par design', unit: 1, total: 500 },
  { product: 'stk', label: 'Stickers', spec: '220×220 mm, PVC', designs: 27, q: 1000, qNote: null, unit: 0.31, total: 310 },
  { product: 'pen', label: 'Stylos', spec: 'plastique', designs: 1, q: 1000, qNote: null, unit: 0.28, total: 280 },
  { product: 'tote', label: 'Tote bags', spec: 'coton', designs: 1, q: 500, qNote: null, unit: 1.4, total: 700 },
  { product: 'sock', label: 'Chaussettes', spec: 'coton', designs: 2, q: 200, qNote: '100 par design', unit: 2.38, total: 476 },
  { product: 'bottle', label: 'Gourdes', spec: 'métal', designs: 1, q: 200, qNote: null, unit: 4.3, total: 860 },
  { product: 'pin', label: 'Pins', spec: 'métal', designs: 3, q: 200, qNote: '66 par design', unit: 0.75, total: 150 },
  { product: 'beanie', label: 'Bonnets', spec: 'coton', designs: 1, q: 100, qNote: null, unit: 4, total: 400 },
  { product: 'bucket', label: 'Bobs', spec: 'coton', designs: 1, q: 100, qNote: null, unit: 5.5, total: 550 },
  { product: 'lanyard', label: 'Lanyards', spec: '', designs: 1, q: 140, qNote: null, unit: 1, total: 140 },
];
export const saleQuoteFor = (id) => SALE_QUOTES.find((x) => x.product === id) || null;
// Rapprochement achat / vente d'un produit. `fx` = taux yuan → euro du hub (jamais modifié ici). L'achat en euros est une
// conversion brute du prix usine : sans transport, réserve, échantillon ni frais. L'écart n'est donné que comme repère,
// et signalé quand les quantités des deux fiches diffèrent ou quand la vente passe sous l'achat.
export function quoteComparison(id, fx) {
  const buy = factoryQuotesFor(id)[0] || null, sell = saleQuoteFor(id);
  if (!buy && !sell) return null;
  const buyEur = buy && fx > 0 ? buy.unit * fx : null, gap = buyEur != null && sell ? sell.unit - buyEur : null;
  return { purchase: buy ? { quantity: buy.q, designs: buy.designs, unitCny: buy.unit, totalCny: buy.total, unitEurIndicative: buyEur } : null,
    sale: sell ? { quantity: sell.q, designs: sell.designs, unitEur: sell.unit, totalEur: sell.total } : null,
    sameQuantity: buy && sell ? buy.q === sell.q : null, gapUnitEurIndicative: gap, gapRateIndicative: gap != null ? gap / sell.unit : null,
    saleBelowPurchase: gap != null ? gap < 0 : null };
}
