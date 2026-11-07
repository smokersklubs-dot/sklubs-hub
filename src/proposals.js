// Propositions de tarif de l'agent : file PostgreSQL (hub.kv, clé price_proposals) et routes de la page du hub
// (derrière le mot de passe ou la session ouverte depuis le CRM). Seule l'acceptation par Lemexx écrit un tarif.
import { STORE_KEY, acceptedDocument } from './crm/price-proposals.mjs';
import { currentSnapshots } from './crm/current-snapshots.mjs';
import { priceSnapshot } from './crm/public-pricing.mjs';

/** File gardée dans hub.kv, modifiée sous verrou de ligne : deux dépôts simultanés ne s'écrasent pas. */
export function makeProposalStore(pool, schema) {
  const read = (v) => (v && Array.isArray(v.items) ? v.items : []);
  return {
    async list() {
      const r = await pool.query(`SELECT v FROM ${schema}.kv WHERE k = $1`, [STORE_KEY]);
      return read(r.rows[0]?.v);
    },
    async mutate(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO ${schema}.kv (k, v, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (k) DO NOTHING`, [STORE_KEY, JSON.stringify({ items: [] })]);
        const r = await client.query(`SELECT v FROM ${schema}.kv WHERE k = $1 FOR UPDATE`, [STORE_KEY]);
        const out = await fn(read(r.rows[0]?.v));
        await client.query(`UPDATE ${schema}.kv SET v = $2::jsonb, updated_at = now() WHERE k = $1`, [STORE_KEY, JSON.stringify({ items: out.items })]);
        await client.query('COMMIT');
        return out.result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

// Prix actuel d'une proposition en attente (le tarif a pu changer depuis le dépôt).
function livePrice(snapshot, p) {
  try { return priceSnapshot(snapshot, p.configuration).quote.unitHT; } catch { return null; }
}

/**
 * Routes de la page du hub :
 *  GET  /api/proposals          → propositions (en attente d'abord) avec le prix actuel ;
 *  POST /api/proposals/decide   → { id, decision: 'accept' | 'reject' } ; même garde anti-CSRF que l'enregistrement d'un tarif.
 * ctx : { store, env, readDoc(name), writeDoc(name, data, baseVersion), sendJson, body, who }
 */
export async function proposalsAdminRoute(req, res, url, ctx) {
  const { store, env, sendJson } = ctx;
  if (url.pathname === '/api/proposals' && req.method === 'GET') {
    const items = await store.list();
    const pending = items.filter((p) => p.status === 'pending');
    const current = pending.length ? await currentSnapshots(env, [...new Set(pending.map((p) => p.productId))]) : { products: {} };
    const view = items.slice(0, 60).map((p) => ({ ...p, liveUnitHT: p.status === 'pending' && current.products[p.productId] ? livePrice(current.products[p.productId].snapshot, p) : null }));
    view.sort((a, b) => (a.status === 'pending') === (b.status === 'pending') ? 0 : a.status === 'pending' ? -1 : 1);
    sendJson(res, 200, { items: view });
    return true;
  }
  if (url.pathname !== '/api/proposals/decide') return false;
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'méthode' }); return true; }
  const proto = req.headers['x-forwarded-proto'] || 'http';
  if (ctx.checkOrigin !== false && (!req.headers.origin || req.headers.origin !== `${proto}://${req.headers.host}`)) { sendJson(res, 403, { error: 'origine refusée' }); return true; }
  if (req.headers['x-sk'] !== '1') { sendJson(res, 403, { error: 'en-tête manquant' }); return true; }
  if (!(req.headers['content-type'] || '').startsWith('application/json')) { sendJson(res, 415, { error: 'type' }); return true; }
  let input;
  try { input = JSON.parse(ctx.body || ''); } catch { sendJson(res, 400, { error: 'json invalide' }); return true; }
  if (!input || typeof input.id !== 'string' || !['accept', 'reject'].includes(input.decision)) { sendJson(res, 422, { error: 'id et decision (accept ou reject) attendus' }); return true; }
  const items = await store.list();
  const p = items.find((x) => x.id === input.id);
  if (!p) { sendJson(res, 404, { error: 'Proposition introuvable.' }); return true; }
  if (p.status !== 'pending') { sendJson(res, 409, { error: 'Cette proposition a déjà été traitée.' }); return true; }
  const now = new Date();
  const mark = (fields) => store.mutate((list) => {
    const i = list.findIndex((x) => x.id === p.id);
    if (i < 0 || list[i].status !== 'pending') throw Object.assign(new Error('Cette proposition a déjà été traitée.'), { status: 409 });
    list[i] = { ...list[i], ...fields, decidedAt: now.toISOString(), decidedBy: ctx.who || 'hub' };
    return { items: list, result: list[i] };
  });
  try {
    if (input.decision === 'reject') { sendJson(res, 200, { proposal: await mark({ status: 'rejected' }) }); return true; }
    // Acceptation : document de prix fixés relu, modifié comme dans le tableau du hub, enregistré avec contrôle de version.
    const name = 'cfg_price_' + p.productId;
    const doc = await ctx.readDoc(name);
    const next = acceptedDocument(doc.data, p, now);
    const saved = await ctx.writeDoc(name, next, String(doc.version || 0));
    if (saved.conflit) { sendJson(res, 409, { error: 'Le tarif vient d’être modifié ailleurs : rechargez et réessayez.' }); return true; }
    const current = await currentSnapshots(env, [p.productId]);
    const applied = current.products[p.productId] ? livePrice(current.products[p.productId].snapshot, p) : null;
    sendJson(res, 200, { proposal: await mark({ status: 'accepted', appliedUnitHT: applied, documentVersion: saved.version }) });
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.status ? err.message : 'erreur serveur' });
  }
  return true;
}
