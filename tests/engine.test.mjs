// Moteur partagé (prix en cours du hub) et API CRM, sur documents en mémoire : `node --test tests/`
import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSnapshots } from '../src/crm/current-snapshots.mjs';
import { priceSnapshot, catalogEntries } from '../src/crm/public-pricing.mjs';
import { createPriceRules } from '../src/crm/price-rules.mjs';
import { crmApiRoute, resetCrmRateLimits } from '../src/crm/crm-api.mjs';
import { validDoc } from '../src/docs.js';

const rules = createPriceRules();
const K = (q) => rules.key('pen', { v: 'std', q });
const TOKEN = 'jeton-de-test-'.repeat(4);

function env(docs = {}) {
  const store = Object.fromEntries(Object.entries(docs).map(([name, data], i) => [name, JSON.stringify({ data, version: 1000 + i })]));
  return { CRM_API_TOKEN: TOKEN, DATA: { async get(name) { return store[name] ?? null; }, async put() { throw new Error('écriture interdite'); } } };
}
const penDoc = (tiers, rulesMap) => ({ schema: 1, scope: 'default', rules: rulesMap, history: [], ...(tiers ? { tiers } : {}) });

test('Stylos sans document : formule native, 0,280 € à 1000', async () => {
  const { products } = await currentSnapshots(env(), ['pen']);
  const d = priceSnapshot(products.pen.snapshot, { v: 'std', q: 1000 });
  assert.equal(d.quote.unitHT, 0.28);
  assert.equal(d.internal.manualRule, false);
  assert.deepEqual(products.pen.snapshot.tiers, []);
});

test('Stylos avec un palier fixé à 750 : exact à 750, 600 et 900 inchangés (un seul palier), interpolé entre deux paliers', async () => {
  const bare = (await currentSnapshots(env(), ['pen'])).products.pen.snapshot;
  const nativeAt = (q) => priceSnapshot(bare, { v: 'std', q }).quote.unitHT;
  const docs = { cfg_price_pen: penDoc([{ key: K(750), q: 750 }], { [K(750)]: 0.4 }) };
  const { products } = await currentSnapshots(env(docs), ['pen']);
  const s = products.pen.snapshot;
  assert.deepEqual(s.tiers, [{ key: K(750), q: 750 }]);
  const at = (q) => priceSnapshot(s, { v: 'std', q });
  assert.equal(at(750).quote.unitHT, 0.4);
  assert.equal(at(750).internal.manualRule, true);
  assert.equal(at(750).internal.interpolatedRule, false);
  // Un seul palier : seule sa quantité exacte change, 600 et 1000 restent sur la formule.
  assert.equal(at(600).quote.unitHT, nativeAt(600));
  assert.equal(at(900).quote.unitHT, nativeAt(900));
  assert.equal(at(1000).quote.unitHT, 0.28);
  assert.equal(at(600).internal.interpolatedRule, false);
  assert.equal(at(600).internal.manualRule, false);
  assert.equal(at(1000).internal.manualRule, false);
  // Avec un second palier à 1000 égal à la formule, 900 est interpolé entre 750 (0,40) et 1000 (0,28) ; 1200 reste sur la formule.
  const two = { cfg_price_pen: penDoc([{ key: K(750), q: 750 }], { [K(750)]: 0.4, [K(1000)]: 0.28 }) };
  const s2 = (await currentSnapshots(env(two), ['pen'])).products.pen.snapshot;
  const d900 = priceSnapshot(s2, { v: 'std', q: 900 });
  assert.ok(d900.quote.unitHT > 0.28 && d900.quote.unitHT < 0.4, `900 entre les deux paliers : ${d900.quote.unitHT}`);
  assert.equal(d900.internal.interpolatedRule, true);
  assert.equal(d900.internal.manualRule, true);
  assert.equal(priceSnapshot(s2, { v: 'std', q: 1000 }).quote.unitHT, 0.28);
  assert.equal(priceSnapshot(s2, { v: 'std', q: 1200 }).quote.unitHT, nativeAt(1200));
  assert.equal(priceSnapshot(s2, { v: 'std', q: 1200 }).internal.manualRule, false);
  // La variante d'un autre produit n'est pas touchée.
  const cap = (await currentSnapshots(env(two), ['cap'])).products.cap.snapshot;
  assert.equal(priceSnapshot(cap, { v: 'std', q: 750 }).internal.manualRule, false);
});

test('document ancien (sans paliers) lu sans erreur ; document invalide rend le produit indisponible', async () => {
  const old = { cfg_price_pen: penDoc(undefined, { [K(1000)]: 0.3 }) };
  const ok = await currentSnapshots(env(old), ['pen']);
  assert.deepEqual(ok.unreadable, []);
  assert.equal(priceSnapshot(ok.products.pen.snapshot, { v: 'std', q: 1000 }).quote.unitHT, 0.3);
  const bad = { cfg_price_pen: penDoc([{ key: K(750), q: 700 }], {}) };
  const ko = await currentSnapshots(env(bad), ['pen']);
  assert.deepEqual(ko.unreadable, ['pen']);
  assert.equal(ko.products.pen, undefined);
});

test('catalogue : paliers personnalisés listés avec quantité, prix HT et configuration', async () => {
  const docs = { cfg_price_pen: penDoc([{ key: K(750), q: 750 }, { key: K(600), q: 600 }], { [K(750)]: 0.4 }) };
  const { products } = await currentSnapshots(env(docs), ['pen', 'stk', 'mylar']);
  const entries = catalogEntries(Object.fromEntries(Object.values(products).map((e) => [e.snapshot.product, e.snapshot])));
  const pen = entries.find((e) => e.id === 'pen');
  assert.deepEqual(pen.customTiers.map((t) => t.quantity), [750, 600]);
  assert.deepEqual(pen.customTiers[0], { quantity: 750, unitHT: 0.4, fixed: true, configuration: { v: 'std', q: 750 } });
  assert.equal(pen.customTiers[1].fixed, false);
  assert.equal(pen.customTiers[1].unitHT, priceSnapshot(products.pen.snapshot, { v: 'std', q: 600 }).quote.unitHT, 'palier sans prix : formule native (hors des paliers fixés)');
  for (const e of entries) assert.ok(Array.isArray(e.customTiers));
  for (const key of ['cout', 'cost', 'marge', 'usine']) assert.equal(JSON.stringify(entries).includes('"' + key + '"'), false, 'aucun coût dans le catalogue');
});

test('Mylar et stickers : clé → configuration pour /price, prix fixé exact', async () => {
  const mylarKey = rules.key('mylar', { t: 'Doypack à zip', th: 0.1, L: 100, H: 150, G: 25, q: 750 });
  const stkKey = rules.key('stk', { sh: 'rond', w: 50, h: 50, q: 750, mat: 'vin', fin: 'mat', cond: 'unit' });
  const docs = {
    cfg_price_mylar: { schema: 1, scope: 'default', rules: { [mylarKey]: 0.9 }, history: [], tiers: [{ key: mylarKey, q: 750 }] },
    cfg_price_stk: { schema: 1, scope: 'default', rules: { [stkKey]: 0.5 }, history: [], tiers: [{ key: stkKey, q: 750 }] },
  };
  const { products, unreadable } = await currentSnapshots(env(docs), ['mylar', 'stk']);
  assert.deepEqual(unreadable, []);
  const entries = catalogEntries(Object.fromEntries(Object.values(products).map((e) => [e.snapshot.product, e.snapshot])));
  const mylar = entries.find((e) => e.id === 'mylar').customTiers[0];
  assert.equal(mylar.quantity, 750);
  assert.equal(mylar.configuration.m, 'MOPP/VMPET/PE');
  const quoted = priceSnapshot(products.mylar.snapshot, mylar.configuration);
  assert.equal(quoted.quote.unitHT, Math.max(0.9, quoted.internal.basePriceHT > 0 ? quoted.quote.unitHT : 0.9));
  assert.equal(quoted.internal.manualRule, true);
  const stk = entries.find((e) => e.id === 'stk').customTiers[0];
  assert.deepEqual(stk.configuration, { sh: 'rond', w: 50, h: 50, q: 750, mat: 'vin', fin: 'mat', cond: 'unit' });
  assert.equal(priceSnapshot(products.stk.snapshot, stk.configuration).internal.manualRule, true);
});

test('validation serveur (docs.js) : paliers acceptés, incohérences refusées, anciens documents acceptés', () => {
  assert.equal(validDoc('cfg_price_pen', penDoc([{ key: K(750), q: 750 }], { [K(750)]: 0.3 })), true);
  assert.equal(validDoc('cfg_price_pen', penDoc(undefined, { [K(1000)]: 0.28 })), true);
  assert.equal(validDoc('cfg_price_pen', penDoc([{ key: K(750), q: 751 }], {})), false);
  assert.equal(validDoc('cfg_price_pen', penDoc([{ key: K(750), q: 750 }, { key: K(750), q: 750 }], {})), false);
  assert.equal(validDoc('cfg_price_pen', penDoc([{ key: rules.key('cap', { v: 'std', q: 750 }), q: 750 }], {})), false);
  assert.equal(validDoc('cfg_price_pen', { schema: 2, scope: 'default', rules: {}, history: [] }), false);
});

test('API CRM : 401 sans jeton, 403 avec Origin, catalogue de 14 produits, /price avec palier', async () => {
  resetCrmRateLimits();
  const docs = { cfg_price_pen: penDoc([{ key: K(750), q: 750 }], { [K(750)]: 0.4 }) };
  const e = env(docs);
  const call = (path, init = {}) => crmApiRoute(new Request('http://hub.internal' + path, init), e, new URL('http://hub.internal' + path));
  assert.equal((await call('/api/crm/v1/catalog?site=fr')).status, 401);
  assert.equal((await call('/api/crm/v1/catalog?site=fr', { headers: { Authorization: 'Bearer ' + TOKEN, Origin: 'https://evil.example' } })).status, 403);
  const auth = { Authorization: 'Bearer ' + TOKEN };
  const catalog = await (await call('/api/crm/v1/catalog?site=fr', { headers: auth })).json();
  assert.equal(catalog.products.length, 14);
  assert.deepEqual(catalog.products.find((p) => p.id === 'pen').customTiers.map((t) => [t.quantity, t.unitHT]), [[750, 0.4]]);
  const price = async (quantity) => (await call('/api/crm/v1/price', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: 'pen', site: 'fr', quantity, configuration: { v: 'std' }, includeInternal: true }) })).json();
  assert.equal((await price(750)).unitHT, 0.4);
  assert.equal((await price(750)).internal.manualRule, true);
  assert.equal((await price(600)).internal.manualRule, false, 'hors des paliers fixés : formule native');
  assert.equal((await price(1000)).unitHT, 0.28, 'hors des paliers fixés : formule native');
});
