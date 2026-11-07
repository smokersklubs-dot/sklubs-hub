// Grille Mylar publique en LECTURE SEULE pour le configurateur bags.sklubs.fr.
// Ne sort que des prix de vente HT par format et par palier de quantité : jamais de coût, de marge ni de paramètre usine.
// Accès navigateur autorisé uniquement depuis les origines listées (par défaut https://bags.sklubs.fr).
import { currentSnapshots } from './crm/current-snapshots.mjs';
import { priceSnapshot, readOnlyDocument } from './crm/public-pricing.mjs';
import { supplementsTable, applySupplements, publicSupplements } from './crm/mylar-supplements.mjs';
// Suppléments Mylar en vigueur : défauts (ancienne grille) remplacés par le document enregistré cfg_mylar_supplements.
export async function currentSupplements(env) { try { return supplementsTable((await readOnlyDocument(env, 'cfg_mylar_supplements'))?.data || null); } catch { return supplementsTable(null); } }

const ORIGINS = (process.env.HUB_PUBLIC_ORIGINS || 'https://bags.sklubs.fr').split(',').map(s => s.trim()).filter(Boolean);
const QUANTITIES = [200, 300, 500, 1000, 2000, 3000, 5000];
const TTL = 60000, RATE_MAX = 120, RATE_WINDOW = 60000;
let cache = null;
const hits = new Map();

function limited(ip, now) {
  const e = hits.get(ip);
  if (!e || now - e.start >= RATE_WINDOW) { hits.set(ip, { start: now, count: 1 }); if (hits.size > 5000) hits.delete(hits.keys().next().value); return false; }
  return ++e.count > RATE_MAX;
}

async function build(env) {
  const { products, documentVersion } = await currentSnapshots(env, ['mylar']);
  const snap = products.mylar?.snapshot;
  if (!snap) throw new Error('tarif illisible');
  const seen = new Map();
  for (const r of snap.rows) if (!seen.has(r.ref)) seen.set(r.ref, r);
  const formats = [];
  for (const r of seen.values()) {
    const prices = {};
    for (const q of QUANTITIES) {
      try { prices[q] = priceSnapshot(snap, { t: r.t, m: r.m, L: r.L, H: r.H, G: r.G || 0, q }).quote.unitHT; } catch { prices[q] = null; }
    }
    formats.push({ ref: r.ref, type: r.t, material: r.m, thickness: r.th ?? null, L: r.L, H: r.H, G: r.G || 0, unitHT: prices });
  }
  return { currency: 'EUR', vat: snap.shared.vat, quantities: QUANTITIES, formats, supplements: publicSupplements(await currentSupplements(env)), version: documentVersion, generatedAt: new Date().toISOString() };
}

export async function publicMylarRoute(req, res, url, env, sendJson) {
  if (url.pathname !== '/api/public/mylar-grid') return false;
  const origin = req.headers.origin;
  const cors = origin && ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '600' }); res.end(); return true; }
  if (req.method !== 'GET') { sendJson(res, 405, { error: 'méthode' }, cors); return true; }
  if (origin && !ORIGINS.includes(origin)) { sendJson(res, 403, { error: 'origine refusée' }, cors); return true; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || 'inconnue';
  const now = Date.now();
  if (limited(ip, now)) { sendJson(res, 429, { error: 'trop de requêtes' }, { ...cors, 'Retry-After': '60' }); return true; }
  try {
    if (!cache || now - cache.at > TTL) cache = { at: now, data: await build(env) };
    sendJson(res, 200, cache.data, { ...cors, 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    console.warn('public-mylar', String(e).slice(0, 200));
    sendJson(res, 503, { error: 'grille indisponible' }, cors);
  }
  return true;
}

// Prix Mylar public pour UNE configuration (taille libre, quantité libre, mode de transport), avec les prix EN COURS
// du hub et le même moteur que le CRM. Pour le configurateur bags.sklubs.fr et pour les recalculs côté serveur
// (fonction sklubs_evaluate, WordPress) : un appel sans en-tête Origin est accepté, un navigateur seulement depuis ORIGINS.
// Liste blanche de sortie : prix de vente HT/TTC, délai, statut d'estimation ; jamais de coût, de marge ni de tarif au kilo.
// Hors de la plage des formats chiffrés (surface), aucun prix : pas d'extrapolation (décision de Lemexx du 2/11).
export const MYLAR_MIN = 200, MYLAR_MAX = 5000;
const NUM = { L: [20, 2000], H: [20, 2000], G: [0, 1000] };
export function mylarQuote(snap, params, table = supplementsTable(null)) {
  const fail = (code, message) => ({ ok: false, status: 422, code, message });
  const type = String(params.type || ''), material = String(params.material || ''), mode = String(params.mode || snap.hyp?.mode || 'air');
  const rows = (snap.rows || []).filter(r => r.t === type);
  if (!rows.length) return fail('UNKNOWN_TYPE', 'Type de sachet non chiffré par le hub.');
  const same = rows.filter(r => r.m === material);
  if (!same.length) return fail('UNKNOWN_MATERIAL', 'Matière non chiffrée par le hub pour ce type de sachet.');
  const v = {};
  for (const [k, [lo, hi]] of Object.entries(NUM)) {
    const raw = params[k] ?? (k === 'G' ? 0 : null), n = raw === null || raw === '' ? NaN : Number(raw);
    if (!Number.isFinite(n) || n < lo || n > hi) return fail('INVALID_DIMENSIONS', 'Dimensions invalides.');
    v[k] = n;
  }
  const q = Number(params.q);
  if (!Number.isInteger(q) || q < 1) return fail('INVALID_QUANTITY', 'Quantité invalide.');
  if (q < MYLAR_MIN) return fail('BELOW_MINIMUM', `Minimum ${MYLAR_MIN} pièces.`);
  if (q > MYLAR_MAX) return fail('ABOVE_MAXIMUM', `Au-delà de ${MYLAR_MAX} pièces : devis usine.`);
  if (!Object.hasOwn(snap.hyp.modes || {}, mode)) return fail('UNKNOWN_MODE', 'Mode de transport inconnu.');
  const area = f => f.L * (f.H + (f.G || 0) / 2), a = area(v), areas = same.map(area);
  if (a < Math.min(...areas) * 0.98 || a > Math.max(...areas) * 1.02) return fail('OUT_OF_RANGE', 'Taille hors des formats chiffrés par le hub : devis usine.');
  let d;
  try { d = priceSnapshot(snap, { t: type, m: material, L: v.L, H: v.H, G: v.G, q, mode }); } catch { return fail('NOT_PRICEABLE', 'Prix non calculable pour cette configuration.'); }
  // Suppléments (finitions, effets, options, impression, visuels : € HT par sachet ; clichés : € HT par commande).
  const supp = applySupplements(table, { finish: params.finish, effects: params.effects, options: params.options, print: params.print, visuals: params.visuals, cliches: params.cliches });
  if (!supp.ok) return { ...fail(supp.code, supp.message), group: supp.group, id: supp.id };
  const vatRate = d.quote.vat, unitHT = Math.round((d.quote.unitHT + supp.perUnit) * 1000) / 1000;
  const totalHT = Math.round((unitHT * q + supp.perOrder) * 100) / 100, totalTTC = Math.round(totalHT * (1 + vatRate) * 100) / 100;
  const m = snap.hyp.modes[mode], days = x => (Number.isFinite(Number(x)) ? Number(x) : null);
  return { ok: true, status: 200, body: {
    currency: 'EUR', quantity: q, baseUnitHT: d.quote.unitHT, unitHT, fixedFeesHT: supp.perOrder, totalHT, vat: vatRate,
    vatAmount: Math.round((totalTTC - totalHT) * 100) / 100, totalTTC, estimated: d.quote.estimated, supplements: supp.lines,
    format: { type, material, L: v.L, H: v.H, G: v.G, thickness: Number(d.configuration.th) || null },
    delivery: { mode, name: String(m.n || mode), days: days(m.d), included: true, terms: 'DDP' },
    modes: Object.entries(snap.hyp.modes).map(([id, x]) => ({ id, name: String(x.n || id), days: days(x.d) })),
    quantityRange: { min: MYLAR_MIN, max: MYLAR_MAX }, version: snap.approvedAt || null } };
}

export async function publicMylarQuoteRoute(req, res, url, env, sendJson) {
  if (url.pathname !== '/api/public/mylar-quote') return false;
  const origin = req.headers.origin;
  const cors = origin && ORIGINS.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : { Vary: 'Origin' };
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '600' }); res.end(); return true; }
  if (req.method !== 'GET') { sendJson(res, 405, { error: 'méthode' }, cors); return true; }
  if (origin && !ORIGINS.includes(origin)) { sendJson(res, 403, { error: 'origine refusée' }, cors); return true; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || 'inconnue';
  if (limited(ip, Date.now())) { sendJson(res, 429, { error: 'trop de requêtes' }, { ...cors, 'Retry-After': '60' }); return true; }
  try {
    const { products } = await currentSnapshots(env, ['mylar']);
    const snap = products.mylar?.snapshot; if (!snap) throw new Error('tarif illisible');
    const p = Object.fromEntries(['type', 'material', 'L', 'H', 'G', 'q', 'mode', 'finish', 'effects', 'options', 'print', 'visuals', 'cliches'].map(k => [k, url.searchParams.get(k)]));
    const r = mylarQuote(snap, p, await currentSupplements(env));
    if (!r.ok) sendJson(res, r.status, { code: r.code, error: r.message }, { ...cors, 'Cache-Control': 'no-store' });
    else sendJson(res, 200, r.body, { ...cors, 'Cache-Control': 'no-store' });
  } catch (e) {
    console.warn('public-mylar-quote', String(e).slice(0, 200));
    sendJson(res, 503, { error: 'prix indisponible' }, cors);
  }
  return true;
}
