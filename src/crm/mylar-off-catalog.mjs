// Matières Mylar HORS CATALOGUE : coût usine reçu, aucun prix de vente calculé par le hub.
// Le prix de vente et la marge sont saisis par Lemexx dans « Tarif détaillé » → « Modifier dans le tableau »
// (prix fixés et paliers libres, document cfg_price_mylar, clé ["mylar","hors-catalogue",<réf>,<quantité>]).
// Rien n'est inventé : une donnée que l'usine n'a pas précisée reste « à confirmer », une quantité non cotée n'a pas de coût.
// Ce bloc est recopié tel quel dans public/index.html (sans les `export`) : page et moteur partagent les mêmes données.
export const MYLAR_OFF_CATALOG = [
  {
    id: 'KRAFT/BARRIER', ref: 'KR-1', name: 'Kraft + film barrière (alimentaire)',
    description: 'Papier kraft · film barrière intérieur apte au contact alimentaire, résistant aux graisses · impression personnalisée, plusieurs designs',
    typeLabel: 'À confirmer (fond plat ou doypack à zip)',
    status: 'Hors catalogue : coût usine reçu le 10/11/2026, format et délai à confirmer',
    receivedAt: '2026-11-10', source: 'Usine (WeChat, 10/11/2026), montants en RMB (CNY)', currency: 'CNY',
    // Par commande, en RMB : marchandise et fret séparés ; le fret est une estimation de l'usine (« environ »).
    tiers: [
      { q: 1000, goods: 600, freight: 1100, freightApprox: true },
      { q: 2000, goods: 1000, freight: 2000, freightApprox: true },
    ],
    unknown: {
      dimensions: 'à confirmer', type: 'fond plat ou doypack à zip, à confirmer', incoterm: 'à confirmer',
      leadDays: 'à confirmer', moq: 'à confirmer (1 000 est la plus petite quantité cotée)',
    },
    context: 'Client Voltaire Nutrition (croquettes pour chats) : sacs de 1 kg.',
  },
];
export const offCatalogMaterial = (id, list = MYLAR_OFF_CATALOG) => (list || []).find((x) => x.id === id) || null;
export const offCatalogByRef = (ref, list = MYLAR_OFF_CATALOG) => (list || []).find((x) => x.ref === ref) || null;
// Coût usine en € par pièce à une quantité cotée EXACTEMENT par l'usine (sinon null : pas d'interpolation inventée).
// Marchandise : mêmes réserves que les autres lignes Mylar (change RMB→EUR, matière, indices, sécurité change, qualité).
// Transport : le fret annoncé par l'usine remplace le calcul au poids (poids inconnu). Frais fixes : ceux du hub, par commande.
export function offCatalogCost(item, q, H, materialAdjustment = 0) {
  const t = (item.tiers || []).find((x) => x.q === q);
  if (!t || !H || !(H.fx > 0)) return null;
  const rmb = t.goods / q, freightRmb = t.freight / q;
  const usine = rmb * H.fx * (1 + (H.mat || 0)) * (1 + (materialAdjustment || 0)) * (1 + (H.secFx || 0)) * (1 + (H.qual || 0));
  const tr = freightRmb * H.fx, fx = (H.fixed || 0) / q, cout = usine + tr + fx;
  return { q, rmb, freightRmb, freightApprox: !!t.freightApprox, usine, tr, fx, cout };
}
export const offCatalogKey = (ref, q) => JSON.stringify(['mylar', 'hors-catalogue', String(ref), Number(q)]);
