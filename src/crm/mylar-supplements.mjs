// Suppléments Mylar (finitions, effets, options, impression, visuels, clichés) — hub = seule référence de prix.
// Valeurs reprises de l'ancienne grille du configurateur bags.sklubs.fr à la demande de Lemexx (7 novembre 2026,
// « utilise mon ancienne grille de prix pour récupérer les prix qui manquent »), en € HT par sachet, ajoutés au prix
// du format ; clichés en € HT par commande. Un choix absent de cette table n'a pas de prix : « sur devis ».
// Un document enregistré `cfg_mylar_supplements` (même forme) remplace ces valeurs, élément par élément.
export const DEFAULT_SUPPLEMENTS = {
  source: 'Ancienne grille du configurateur bags.sklubs.fr (reprise le 7 novembre 2026)',
  finishes: { mat: { n: 'Mat', perUnit: 0, included: true }, glossy: { n: 'Brillant', perUnit: 0.05 }, 'soft-touch': { n: 'Soft Touch', perUnit: 0.08 }, holographic: { n: 'Holographique', perUnit: 0.10 } },
  effects: { 'spot-uv': { n: 'Spot UV', perUnit: 0.12 }, foil: { n: 'Dorure', perUnit: 0.15 } },
  options: {
    'zip-standard': { n: 'Zip refermable', perUnit: 0, included: true },
    'zip-child-safe': { n: 'Zip sécurité enfant', perUnit: 0.10 },
    'tear-notch': { n: 'Encoche d’ouverture', perUnit: 0.01 },
    valve: { n: 'Valve de dégazage', perUnit: 0.06 },
    window: { n: 'Fenêtre transparente', perUnit: 0.10 },
    'hole-euro': { n: 'Trou européen', perUnit: 0.02 },
  },
  print: { simple: { n: 'Impression 1 face', perUnit: 0, included: true }, 'recto-verso': { n: 'Recto-verso', perUnit: 0.03 }, interior: { n: 'Impression intérieure', perUnit: 0.07 }, 'full-wrap': { n: 'Impression 360°', perUnit: 0.12 } },
  visuals: { '1v': { n: '1 visuel', perUnit: 0, included: true }, '2v': { n: '2 visuels', perUnit: 0.05 }, '3v': { n: '3 visuels', perUnit: 0.10 }, '4v': { n: '4 visuels', perUnit: 0.15 }, '5v': { n: '5 visuels', perUnit: 0.20 }, '6v': { n: '6 visuels et plus', perUnit: 0.25 } },
  cliches: { 'new-4': { n: 'Clichés · 1 à 4 couleurs', perOrder: 150 }, 'new-8': { n: 'Clichés · 5 à 8 couleurs', perOrder: 250 }, reprint: { n: 'Réimpression (clichés existants)', perOrder: 0, included: true } },
};
const GROUPS = ['finishes', 'effects', 'options', 'print', 'visuals', 'cliches'];
const num = v => (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100000 ? Number(v) : null);

/** Table en vigueur : défauts de l'ancienne grille, remplacés élément par élément par le document enregistré. */
export function supplementsTable(saved) {
  const out = { source: DEFAULT_SUPPLEMENTS.source };
  for (const g of GROUPS) {
    out[g] = { ...DEFAULT_SUPPLEMENTS[g] };
    const s = saved && typeof saved === 'object' ? saved[g] : null;
    if (s && typeof s === 'object') for (const [id, v] of Object.entries(s)) {
      if (!/^[a-z0-9-]{1,30}$/.test(id) || !v || typeof v !== 'object') continue;
      if (v.removed === true) { delete out[g][id]; continue; }
      const perUnit = num(v.perUnit), perOrder = num(v.perOrder);
      out[g][id] = { n: String(v.n || out[g][id]?.n || id).slice(0, 60), ...(perUnit !== null ? { perUnit } : {}), ...(perOrder !== null ? { perOrder } : {}), ...(v.included === true ? { included: true } : {}) };
    }
  }
  return out;
}

/**
 * Applique les choix au prix du format. Renvoie { ok, lines, perUnit, perOrder } ou { ok:false, code, message }
 * si un choix n'a pas de prix (sur devis). `choice` : { finish, effects[], options[], print, visuals, cliches }.
 */
export function applySupplements(table, choice = {}) {
  const lines = [];
  const pick = (group, id) => {
    if (id === undefined || id === null || id === '') return true;
    const v = table[group]?.[id];
    if (!v) return false;
    lines.push({ group, id, label: v.n, ...(v.perUnit !== undefined ? { perUnitHT: v.perUnit } : {}), ...(v.perOrder !== undefined ? { perOrderHT: v.perOrder } : {}), included: !!v.included });
    return true;
  };
  const list = x => (Array.isArray(x) ? x : String(x || '').split(',')).map(s => String(s).trim()).filter(Boolean);
  const checks = [['finishes', choice.finish], ...list(choice.effects).map(id => ['effects', id]), ...list(choice.options).map(id => ['options', id]), ['print', choice.print], ['visuals', choice.visuals], ['cliches', choice.cliches]];
  for (const [g, id] of checks) if (!pick(g, id)) return { ok: false, code: 'UNPRICED_OPTION', message: 'Un choix n’a pas encore de prix : sur devis.', group: g, id };
  const perUnit = Math.round(lines.reduce((s, l) => s + (l.perUnitHT || 0), 0) * 1000) / 1000;
  const perOrder = Math.round(lines.reduce((s, l) => s + (l.perOrderHT || 0), 0) * 100) / 100;
  return { ok: true, lines, perUnit, perOrder };
}

/** Liste publique (sans aucun coût : ce sont des prix de vente HT) pour les configurateurs et le CRM. */
export function publicSupplements(table) {
  return Object.fromEntries(GROUPS.map(g => [g, Object.entries(table[g] || {}).map(([id, v]) => ({ id, name: v.n, ...(v.perUnit !== undefined ? { perUnitHT: v.perUnit } : {}), ...(v.perOrder !== undefined ? { perOrderHT: v.perOrder } : {}), included: !!v.included }))]));
}
