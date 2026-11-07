// Propositions de tarif de l'agent du CRM (7 novembre 2026) : le CRM propose, seul Lemexx accepte dans le hub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crmApiRoute, resetCrmRateLimits } from '../src/crm/crm-api.mjs';
import { memoryProposalStore, MAX_PENDING } from '../src/crm/price-proposals.mjs';
import { proposalsAdminRoute } from '../src/proposals.js';
import { validDoc } from '../src/docs.js';

const TOKEN = 'jeton-de-test-'.repeat(4);
function hub() {
  const docs = new Map(), store = memoryProposalStore();
  const env = { CRM_API_TOKEN: TOKEN, PROPOSALS: store, DATA: { async get(name) { const d = docs.get(name); return d ? JSON.stringify(d) : null; }, async put() { throw new Error('écriture interdite'); } } };
  const crm = async (method, route, body) => {
    resetCrmRateLimits();
    const r = await crmApiRoute(new Request('http://hub.internal/api/crm/v1/' + route, { method, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env, new URL('http://hub.internal/api/crm/v1/' + route));
    return { status: r.status, body: await r.json() };
  };
  const admin = async (method, path, body, headers = { 'x-sk': '1', 'content-type': 'application/json', origin: 'http://hub.test', host: 'hub.test' }) => {
    let status = 0, out = null;
    const res = { writeHead() {}, end() {} };
    const sendJson = (_res, s, obj) => { status = s; out = obj; };
    const handled = await proposalsAdminRoute({ method, headers }, res, new URL('http://hub.test' + path), { store, env, sendJson, body: body ? JSON.stringify(body) : '', who: 'test',
      readDoc: async (name) => docs.get(name) || { data: null, version: 0 },
      writeDoc: async (name, data, base) => { assert.ok(validDoc(name, data), 'document valide pour le hub'); const cur = docs.get(name)?.version || 0; if (String(cur) !== base) return { conflit: true, version: cur }; const version = cur + 1; docs.set(name, { data, version }); return { conflit: false, version }; } });
    return { handled, status, body: out };
  };
  const price = async (productId, quantity, configuration = { v: 'std' }) => (await crm('POST', 'price', { productId, site: 'fr', quantity, configuration })).body.unitHT;
  return { docs, store, crm, admin, price };
}
const proposal = (extra = {}) => ({ productId: 'pen', configuration: { v: 'std' }, quantity: 500, unitHT: 0.95, reason: 'Prix demandé par Lemexx dans le pilote', author: { id: 'u1', name: 'Lemexx' }, ...extra });

test('déposer une proposition ne change aucun tarif ; l’accepter dans le hub l’applique avec historique', async () => {
  const h = hub(), before = await h.price('pen', 500);
  const sent = await h.crm('POST', 'price-proposals', proposal());
  assert.equal(sent.status, 201);
  assert.equal(sent.body.proposal.status, 'pending');
  assert.equal(sent.body.proposal.currentUnitHT, before);
  assert.equal(sent.body.proposal.proposedUnitHT, 0.95);
  assert.ok(!('floorUnitHT' in sent.body.proposal) && !('key' in sent.body.proposal), 'aucun plancher ni clé interne vers le CRM');
  assert.equal(await h.price('pen', 500), before, 'tarif inchangé tant que Lemexx n’a pas accepté');
  assert.equal(h.docs.size, 0);

  const list = await h.admin('GET', '/api/proposals');
  assert.equal(list.body.items[0].liveUnitHT, before);
  const ok = await h.admin('POST', '/api/proposals/decide', { id: sent.body.proposal.id, decision: 'accept' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.proposal.status, 'accepted');
  assert.equal(await h.price('pen', 500), 0.95);
  assert.equal(ok.body.proposal.appliedUnitHT, 0.95);
  const doc = h.docs.get('cfg_price_pen').data;
  assert.equal(Object.values(doc.rules)[0], 0.95);
  assert.match(doc.history.at(-1).label, /^Proposition de l’agent acceptée : /);
  assert.deepEqual(doc.tiers, [], '500 est un palier standard : aucun palier ajouté');
  const again = await h.admin('POST', '/api/proposals/decide', { id: sent.body.proposal.id, decision: 'accept' });
  assert.equal(again.status, 409, 'une proposition ne s’applique qu’une fois');
  const followed = await h.crm('GET', 'price-proposals');
  assert.equal(followed.body.items[0].status, 'accepted');
});

test('quantité hors des paliers : palier personnalisé ajouté ; refus et retrait ne touchent à rien', async () => {
  const h = hub();
  const odd = (await h.crm('POST', 'price-proposals', proposal({ quantity: 750, unitHT: 0.9 }))).body.proposal;
  await h.admin('POST', '/api/proposals/decide', { id: odd.id, decision: 'accept' });
  assert.deepEqual(h.docs.get('cfg_price_pen').data.tiers.map((t) => t.q), [750]);
  const version = h.docs.get('cfg_price_pen').version;
  const refused = (await h.crm('POST', 'price-proposals', proposal({ quantity: 1000, unitHT: 0.5 }))).body.proposal;
  assert.equal((await h.admin('POST', '/api/proposals/decide', { id: refused.id, decision: 'reject' })).body.proposal.status, 'rejected');
  const withdrawn = (await h.crm('POST', 'price-proposals', proposal({ quantity: 2000, unitHT: 0.4 }))).body.proposal;
  assert.equal((await h.crm('POST', 'price-proposals/' + withdrawn.id + '/withdraw', {})).body.proposal.status, 'withdrawn');
  assert.equal((await h.admin('POST', '/api/proposals/decide', { id: withdrawn.id, decision: 'accept' })).status, 409);
  assert.equal(h.docs.get('cfg_price_pen').version, version, 'ni le refus ni le retrait n’écrivent de tarif');
});

test('Mylar : format de la grille par sa référence ; taille estimée et prix invalide refusés ; même palier remplacé', async () => {
  const h = hub();
  const k1 = await h.crm('POST', 'price-proposals', proposal({ productId: 'mylar', configuration: { ref: 'K1#' }, quantity: 500, unitHT: 0.52 }));
  assert.equal(k1.status, 201);
  assert.match(k1.body.proposal.label, /^K1# · Doypack à zip · 100 × 150 \+ 25 mm · 100 µm$/);
  const k1b = await h.crm('POST', 'price-proposals', proposal({ productId: 'mylar', configuration: { ref: 'K1#' }, quantity: 500, unitHT: 0.55 }));
  const pending = (await h.store.list()).filter((p) => p.status === 'pending');
  assert.deepEqual(pending.map((p) => p.id), [k1b.body.proposal.id], 'la dernière proposition sur un palier remplace la précédente');
  const estimated = await h.crm('POST', 'price-proposals', proposal({ productId: 'mylar', configuration: { t: 'Doypack à zip', m: 'MOPP/VMPET/PE', L: 111, H: 163, G: 30 }, quantity: 500, unitHT: 0.6 }));
  assert.equal(estimated.status, 422);
  assert.match(estimated.body.error, /hors de la grille/);
  assert.equal((await h.crm('POST', 'price-proposals', proposal({ unitHT: 0 }))).status, 422, 'un prix nul n’est jamais proposé');
  assert.equal((await h.crm('POST', 'price-proposals', proposal({ reason: '' }))).status, 422, 'une raison est exigée');
  assert.equal((await h.crm('POST', 'price-proposals', proposal({ configuration: { v: 'std', rate: 3 } }))).status, 422, 'le tarif au kilo reste réservé au hub');
  const accepted = await h.admin('POST', '/api/proposals/decide', { id: k1b.body.proposal.id, decision: 'accept' });
  assert.equal(accepted.status, 200);
  assert.ok(accepted.body.proposal.appliedUnitHT >= 0.55, 'le prix plancher du moteur reste appliqué');
  assert.equal(await h.price('mylar', 500, { t: 'Doypack à zip', m: 'MOPP/VMPET/PE', L: 100, H: 150, G: 25 }), accepted.body.proposal.appliedUnitHT);
});

test('garde de la page du hub : en-tête et origine exigés ; navigateur refusé sur l’API CRM ; file limitée', async () => {
  const h = hub();
  const p = (await h.crm('POST', 'price-proposals', proposal())).body.proposal;
  assert.equal((await h.admin('POST', '/api/proposals/decide', { id: p.id, decision: 'accept' }, { 'content-type': 'application/json', origin: 'http://hub.test', host: 'hub.test' })).status, 403);
  assert.equal((await h.admin('POST', '/api/proposals/decide', { id: p.id, decision: 'accept' }, { 'x-sk': '1', 'content-type': 'application/json', origin: 'https://ailleurs.test', host: 'hub.test' })).status, 403);
  assert.equal(h.docs.size, 0);
  resetCrmRateLimits();
  const r = await crmApiRoute(new Request('http://hub.internal/api/crm/v1/price-proposals', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', Origin: 'https://site.test' }, body: JSON.stringify(proposal()) }), { CRM_API_TOKEN: TOKEN, PROPOSALS: h.store, DATA: { async get() { return null; } } }, new URL('http://hub.internal/api/crm/v1/price-proposals'));
  assert.equal(r.status, 403);
  for (let q = 1; q < MAX_PENDING; q++) await h.store.mutate((list) => ({ items: [{ ...list[0], id: 'x' + q, key: 'k' + q }, ...list], result: null }));
  assert.equal((await h.crm('POST', 'price-proposals', proposal({ quantity: 3000 }))).status, 429);
});
