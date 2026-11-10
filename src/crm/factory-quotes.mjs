// Coûts d'usine REÇUS (devis fournisseur), par produit du hub. Information seulement : aucun prix de vente n'est calculé
// à partir de ces montants, aucun réglage de prix (cost0, formules, marges) n'est modifié. La marge reste « à valider »
// par Lemexx. Un produit absent du hub (product: null) est « Hors hub / tarif à saisir », sans configuration inventée.
// Ce bloc est recopié tel quel dans public/index.html (sans les `export`).
export const FACTORY_QUOTE_SOURCE = 'Shenzhen Creative Star — fiche Cricket, 10/11/2026';
export const FACTORY_QUOTE_CURRENCY = { code: 'CNY', confirmed: false, note: 'Devise non écrite sur la fiche : RMB (CNY) à confirmer' };
// line : n° de ligne de la fiche ; q : quantité cotée (palier unique) ; unit et total en RMB ; sample : échantillon en RMB.
export const FACTORY_QUOTES = [
];
export const factoryQuotesFor = (id) => FACTORY_QUOTES.filter((x) => x.product === id);
export const factoryQuotesOffHub = () => FACTORY_QUOTES.filter((x) => !x.product);
