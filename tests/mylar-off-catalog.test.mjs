// Matière Mylar hors catalogue « Kraft + film barrière (alimentaire) » : aucun prix inventé, prix Mylar existants intacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentSnapshots } from '../src/crm/current-snapshots.mjs';
import { priceSnapshot, catalogEntries } from '../src/crm/public-pricing.mjs';
import { crmCatalogEntries } from '../src/crm/crm-catalog.mjs';
import { createPriceRules } from '../src/crm/price-rules.mjs';
import { crmApiRoute, resetCrmRateLimits } from '../src/crm/crm-api.mjs';
import { MYLAR_OFF_CATALOG, offCatalogCost, offCatalogKey } from '../src/crm/mylar-off-catalog.mjs';
import { validDoc } from '../src/docs.js';

const rules = createPriceRules();
const TOKEN = 'jeton-de-test-'.repeat(4);
const hyp = JSON.parse(readFileSync(new URL('./fixtures-cfg_hyp-vps-20261110.json', import.meta.url), 'utf8'));
const baseline = JSON.parse(readFileSync(new URL('./fixtures-mylar-baseline.json', import.meta.url), 'utf8'));
const K1000 = offCatalogKey('KR-1', 1000);

function env(docs = {}) {
  const store = { cfg_hyp: JSON.stringify({ data: hyp, version: 1793613352784 }), ...Object.fromEntries(Object.entries(docs).map(([n, d], i) => [n, JSON.stringify({ data: d, version: 2000 + i })])) };
  return { CRM_API_TOKEN: TOKEN, DATA: { async get(n) { return store[n] ?? null; }, async put() { throw new Error('lecture seule'); } } };
}
const priceDoc = (rulesMap, tiers = []) => ({ schema: 1, scope: 'default', rules: rulesMap, history: [], tiers });
const mylar = async (docs) => (await currentSnapshots(env(docs), ['mylar'])).products.mylar.snapshot;

test('prix Mylar existants identiques au centime avant et après (536 relevés de référence du 10/11/2026)', async () => {
  const s = await mylar();
  let compared = 0;
  for (const b of baseline) {
    const cfg = { t: b.t, m: b.m, L: b.L, H: b.H, G: b.G, q: b.q };
    if (b.error) { assert.throws(() => priceSnapshot(s, cfg), new RegExp(b.error.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); continue; }
    const d = priceSnapshot(s, cfg);
    assert.equal(d.quote.unitHT, b.unitHT, `${b.t} ${b.m} ${b.L}×${b.H}+${b.G} × ${b.q}`);
    assert.equal(d.quote.estimated, b.estimated);
    compared++;
  }
  assert.ok(compared >= 490, 'relevés comparés : ' + compared);
  // Les matières existantes sont intactes dans le tarif usine : 265 lignes, 2 matières, mêmes libellés.
  assert.equal(s.rows.length, 265);
  assert.deepEqual([...new Set(s.rows.map((r) => r.m))].sort(), ['MOPP/AL/PE', 'MOPP/VMPET/PE']);
});

test('données usine du 10/11/2026 reprises sans invention : paliers 1 000 et 2 000, inconnues « à confirmer »', () => {
  const item = MYLAR_OFF_CATALOG.find((x) => x.id === 'KRAFT/BARRIER');
  assert.equal(item.name, 'Kraft + film barrière (alimentaire)');
  assert.deepEqual(item.tiers, [{ q: 1000, goods: 600, freight: 1100, freightApprox: true }, { q: 2000, goods: 1000, freight: 2000, freightApprox: true }]);
  assert.equal(item.status, 'Hors catalogue : coût usine reçu le 10/11/2026, format et délai à confirmer');
  for (const k of ['dimensions', 'type', 'incoterm', 'leadDays', 'moq']) assert.match(item.unknown[k], /à confirmer/);
  const c = offCatalogCost(item, 1000, hyp, 0);
  assert.equal(c.rmb, 0.6);
  assert.equal(c.freightRmb, 1.1);
  assert.ok(c.usine > 0 && c.tr > 0 && c.cout > c.usine + c.tr, 'coût = marchandise + fret + frais fixes');
  assert.equal(offCatalogCost(item, 1500, hyp, 0), null, 'quantité non cotée : aucun coût interpolé');
});

test('catalogue CRM : la matière est proposée sans prix ni format ; coûts dans le bloc interne seulement ; routes publiques intactes', async () => {
  const s = await mylar();
  const [entry] = crmCatalogEntries({ mylar: s }, null);
  const kraft = entry.materials.find((m) => m.id === 'KRAFT/BARRIER');
  assert.ok(kraft, 'matière présente dans le choix « Matière »');
  assert.equal(kraft.offCatalog, true);
  assert.equal(kraft.salePrice, 'à saisir dans le hub');
  assert.equal(kraft.margin, 'à valider');
  assert.deepEqual(kraft.quotedQuantities, [1000, 2000]);
  assert.deepEqual(kraft.thicknesses, []);
  assert.equal(kraft.group, 'Sacs Kraft', 'case à part des sacs Mylar');
  assert.equal(kraft.image, 'mylar/kraft_barrier_01.jpg');
  assert.ok(readFileSync(new URL('../public/img/' + kraft.image, import.meta.url)).length > 10000, 'photo du sachet kraft présente dans le hub');
  assert.equal(JSON.parse(readFileSync(new URL('../public/img/manifest.json', import.meta.url), 'utf8')).materials['KRAFT/BARRIER'], kraft.image);
  assert.equal(entry.formats.some((f) => f.m === 'KRAFT/BARRIER'), false, 'aucun format inventé');
  assert.deepEqual(entry.offCatalog[0].pricedQuantities, []);
  assert.equal(entry.internal.offCatalog[0].costsHT.length, 2);
  assert.ok(entry.internal.offCatalog[0].costsHT[0].unitCostHT > 0);
  const publicText = JSON.stringify(catalogEntries({ mylar: s }));
  assert.equal(publicText.includes('KRAFT'), false, 'les sites publics ne voient pas la matière hors catalogue');
  assert.equal(JSON.stringify(entry.materials).includes('"usine"'), false);
});

test('/price : sans prix fixé → refus explicite « Prix de vente à saisir » ; avec prix fixé → ce prix, manualRule, marge calculée', async () => {
  const s = await mylar();
  assert.throws(() => priceSnapshot(s, { m: 'KRAFT/BARRIER', q: 1000 }), /Prix de vente à saisir dans le hub : « Kraft \+ film barrière \(alimentaire\) » est hors catalogue/);
  const fixed = await mylar({ cfg_price_mylar: priceDoc({ [K1000]: 1.5 }) });
  const d = priceSnapshot(fixed, { m: 'KRAFT/BARRIER', q: 1000 });
  assert.equal(d.quote.unitHT, 1.5);
  assert.equal(d.quote.totalHT, 1500);
  assert.equal(d.internal.manualRule, true);
  assert.equal(d.internal.interpolatedRule, false);
  assert.ok(d.internal.marginRate > 0 && d.internal.marginRate < 1);
  assert.equal(d.internal.offCatalog.marginStatus, 'à valider');
  assert.equal(d.internal.offCatalog.factoryQuote.quantity, 1000);
  assert.deepEqual(d.configuration, { m: 'KRAFT/BARRIER', q: 1000, offCatalog: true, ref: 'KR-1' });
  // Une autre quantité n'hérite de rien : ni interpolation, ni coefficient.
  assert.throws(() => priceSnapshot(fixed, { m: 'KRAFT/BARRIER', q: 2000 }), /Prix de vente à saisir/);
  assert.throws(() => priceSnapshot(fixed, { m: 'KRAFT/BARRIER', q: 1500 }), /Prix de vente à saisir/);
  // Les autres matières ne voient pas cette règle.
  assert.equal(priceSnapshot(fixed, { t: 'Doypack à zip', m: 'MOPP/VMPET/PE', L: 100, H: 150, G: 25, q: 1000 }).internal.manualRule, false);
  // Prix fixé à une quantité non cotée : accepté (Lemexx décide), coût inconnu donc marge inconnue.
  const free = await mylar({ cfg_price_mylar: priceDoc({ [offCatalogKey('KR-1', 1500)]: 1.4 }, [{ key: offCatalogKey('KR-1', 1500), q: 1500 }]) });
  const d2 = priceSnapshot(free, { m: 'KRAFT/BARRIER', q: 1500 });
  assert.equal(d2.quote.unitHT, 1.4);
  assert.equal(d2.internal.unitCostHT, null);
  assert.equal(d2.internal.marginRate, null);
  const [entry] = crmCatalogEntries({ mylar: free }, null);
  assert.deepEqual(entry.customTiers.map((t) => [t.quantity, t.unitHT, t.fixed]), [[1500, 1.4, true]]);
});

test('clés et documents : série hors catalogue, validation serveur, historique', () => {
  assert.equal(rules.key('mylar', { off: 'KR-1', q: 1000 }), '["mylar","hors-catalogue","KR-1",1000]');
  assert.deepEqual(rules.split('mylar', K1000), { series: '["mylar","hors-catalogue","KR-1",null]', q: 1000 });
  assert.equal(rules.withQuantity('mylar', K1000, 1200), offCatalogKey('KR-1', 1200));
  assert.equal(rules.validTier('mylar', { key: K1000, q: 1000 }), true);
  assert.equal(validDoc('cfg_price_mylar', priceDoc({ [K1000]: 1.5 }, [{ key: K1000, q: 1000 }])), true);
  assert.equal(validDoc('cfg_price_mylar', priceDoc({ [K1000]: 0 })), false);
  const next = rules.change(rules.empty(), { [K1000]: 1.5 }, 'Kraft 1000', new Date('2026-11-10T10:00:00Z'), undefined, 'mylar');
  assert.equal(next.rules[K1000], 1.5);
  assert.equal(next.history.length, 1);
});

test('API CRM : catalogue avec la matière, /price 422 sans prix, 200 avec prix fixé', async () => {
  resetCrmRateLimits();
  const e = env({ cfg_price_mylar: priceDoc({ [K1000]: 1.5 }) });
  const call = (path, init = {}) => crmApiRoute(new Request('http://hub.internal' + path, init), e, new URL('http://hub.internal' + path));
  const auth = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
  const catalog = await (await call('/api/crm/v1/catalog?site=fr', { headers: auth })).json();
  assert.equal(catalog.products.length, 14);
  assert.ok(catalog.products.find((p) => p.id === 'mylar').materials.some((m) => m.id === 'KRAFT/BARRIER' && m.offCatalog));
  const price = async (quantity) => { const r = await call('/api/crm/v1/price', { method: 'POST', headers: auth, body: JSON.stringify({ productId: 'mylar', site: 'fr', quantity, configuration: { m: 'KRAFT/BARRIER' }, includeInternal: true }) }); return { status: r.status, body: await r.json() }; };
  const ok = await price(1000);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.unitHT, 1.5);
  assert.equal(ok.body.internal.manualRule, true);
  const ko = await price(2000);
  assert.equal(ko.status, 422);
  assert.match(ko.body.error, /Prix de vente à saisir/);
});
