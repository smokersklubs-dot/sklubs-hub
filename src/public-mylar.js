// Grille Mylar publique en LECTURE SEULE pour le configurateur bags.sklubs.fr.
// Ne sort que des prix de vente HT par format et par palier de quantité : jamais de coût, de marge ni de paramètre usine.
// Accès navigateur autorisé uniquement depuis les origines listées (par défaut https://bags.sklubs.fr).
import { currentSnapshots } from './crm/current-snapshots.mjs';
import { priceSnapshot } from './crm/public-pricing.mjs';

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
  return { currency: 'EUR', vat: snap.shared.vat, quantities: QUANTITIES, formats, version: documentVersion, generatedAt: new Date().toISOString() };
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
