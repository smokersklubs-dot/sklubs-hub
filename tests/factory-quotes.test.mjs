// Coûts d'usine reçus (fiche Cricket du 10/11/2026) : information seule, aucun prix de vente ni réglage modifié.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FACTORY_QUOTES, FACTORY_QUOTE_SOURCE, FACTORY_QUOTE_CURRENCY, factoryQuotesFor, factoryQuotesOffHub, SALE_QUOTES, saleQuoteFor, quoteComparison } from '../src/crm/factory-quotes.mjs';
import { crmCatalogEntries } from '../src/crm/crm-catalog.mjs';
import { catalogEntries } from '../src/crm/public-pricing.mjs';
import { PRODUCT_IDS } from '../src/crm/campaigns.mjs';
import { currentSnapshots } from '../src/crm/current-snapshots.mjs';
import { priceSnapshot } from '../src/crm/public-pricing.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('chaque ligne est cohérente : total = unitaire × quantité, produit du hub connu ou hors hub, une ligne par produit', () => {
  assert.equal(FACTORY_QUOTE_SOURCE, 'Shenzhen Creative Star — fiche Cricket, 10/11/2026');
  assert.equal(FACTORY_QUOTE_CURRENCY.confirmed, true, 'yuans : « 元 » sur la fiche d’origine');
  for (const x of FACTORY_QUOTES) {
    assert.ok(Math.abs(x.unit * x.q - x.total) < 1e-6, `ligne ${x.line} : ${x.unit} × ${x.q} = ${x.total}`);
    assert.ok(x.product === null || PRODUCT_IDS.includes(x.product), 'produit du hub : ' + x.product);
    assert.ok(Number.isInteger(x.q) && x.q > 0 && x.sample > 0 && x.designs > 0 && x.spec && x.sampleDays && x.productionDays);
  }
  assert.equal(new Set(FACTORY_QUOTES.map((x) => x.line)).size, FACTORY_QUOTES.length);
  assert.equal(new Set(FACTORY_QUOTES.filter((x) => x.product).map((x) => x.product)).size, FACTORY_QUOTES.filter((x) => x.product).length);
  assert.equal(factoryQuotesFor('mylar').length + factoryQuotesFor('stk').length + factoryQuotesFor('tshirt').length, 0, 'Mylar, stickers et T-shirts ne sont pas sur la fiche');
  assert.ok(factoryQuotesOffHub().every((x) => x.product === null));
});

test('la page porte la même copie des données que le module', () => {
  const block = read('../src/crm/factory-quotes.mjs').replace(/^export (const|function) /gm, '$1 ').trimEnd();
  assert.ok(read('../public/index.html').includes(block));
});

test('aucun prix ni réglage ne dépend des coûts usine reçus : moteur et catalogue ne lisent pas ce module', async () => {
  for (const f of ['pricing-engine.mjs', 'public-pricing.mjs', 'current-pricing.mjs', 'current-snapshots.mjs', 'price-rules.mjs', 'crm-api.mjs']) assert.equal(read('../src/crm/' + f).includes('factory-quotes'), false, f);
  // Prix par défaut du hub aux quantités de référence et aux quantités cotées : inchangés (valeurs relevées sur main a3a9d25).
  const env = { CRM_API_TOKEN: 'x'.repeat(40), DATA: { async get() { return null; }, async put() { throw new Error('lecture seule'); } } };
  const { products } = await currentSnapshots(env, PRODUCT_IDS);
  const at = (id, q) => priceSnapshot(products[id].snapshot, { v: 'std', q }).quote.unitHT;
  const expected = { badge: [1200, 0.15], pin: [200, 0.75], bottle: [200, 4.3], pen: [1000, 0.28], lanyard: [140, 1], patch: [500, 1], tshirt: [750, 6.3], cap: [175, 4.5], beanie: [100, 4], bucket: [100, 5.5], sock: [200, 2.38], tote: [500, 1.4] };
  for (const [id, [q, price]] of Object.entries(expected)) assert.equal(at(id, q), price, id);
});

test('fiche complète : 12 lignes, total 36 078 RMB, 11 produits rattachés, poignée de téléphone hors hub', () => {
  assert.equal(FACTORY_QUOTES.length, 12);
  assert.equal(FACTORY_QUOTES.reduce((a, x) => a + x.total, 0), 36078);
  assert.deepEqual(FACTORY_QUOTES.map((x) => [x.line, x.product, x.q, x.unit, x.total]), [[1, 'badge', 1000, 4, 4000], [2, 'cap', 350, 25, 8750], [3, 'patch', 85, 10, 850], [4, null, 150, 6.2, 930], [5, 'pen', 1000, 1.2, 1200], [6, 'tote', 500, 8, 4000], [7, 'sock', 200, 6.5, 1300], [8, 'bottle', 200, 25, 5000], [9, 'pin', 200, 2, 400], [10, 'beanie', 100, 28, 2800], [11, 'bucket', 200, 32, 6400], [12, 'lanyard', 140, 3.2, 448]]);
  assert.deepEqual(factoryQuotesOffHub().map((x) => x.label), ['Poignée de téléphone']);
});

test('devis de vente Cricket « update 10.12 » : 13 lignes, 10 058 €, et le hub porte déjà ces prix de vente', async () => {
  assert.equal(SALE_QUOTES.length, 13);
  assert.equal(SALE_QUOTES.reduce((a, x) => a + x.total, 0), 10058);
  for (const x of SALE_QUOTES) assert.ok(Math.abs(x.unit * x.q - x.total) < 1, `${x.label} : ${x.unit} × ${x.q} ≈ ${x.total}`);
  const env = { CRM_API_TOKEN: 'x'.repeat(40), DATA: { async get() { return null; }, async put() { throw new Error('lecture seule'); } } };
  const { products } = await currentSnapshots(env, PRODUCT_IDS);
  for (const x of SALE_QUOTES.filter((s) => s.product !== 'stk')) assert.equal(priceSnapshot(products[x.product].snapshot, { v: 'std', q: x.q }).quote.unitHT, x.unit, 'prix de vente du hub = devis : ' + x.label);
});

test('rapprochement achat / vente : conversion brute au taux du hub, écarts signalés, rien d’inventé', () => {
  const pen = quoteComparison('pen', 0.13);
  assert.deepEqual(pen.purchase, { quantity: 1000, designs: 1, unitCny: 1.2, totalCny: 1200, unitEurIndicative: 0.156 });
  assert.equal(pen.sale.unitEur, 0.28);
  assert.equal(pen.sameQuantity, true);
  assert.ok(Math.abs(pen.gapUnitEurIndicative - 0.124) < 1e-9);
  assert.equal(pen.saleBelowPurchase, false);
  assert.equal(quoteComparison('badge', 0.13).saleBelowPurchase, true, 'badges : 4 RMB à l’achat pour 0,15 € à la vente, à vérifier');
  assert.equal(quoteComparison('patch', 0.13).saleBelowPurchase, true);
  assert.equal(quoteComparison('cap', 0.13).sameQuantity, false);
  const tshirt = quoteComparison('tshirt', 0.13);
  assert.equal(tshirt.purchase, null, 'T-shirts : pas de prix d’achat sur la fiche usine');
  assert.equal(tshirt.gapUnitEurIndicative, null);
  assert.equal(quoteComparison('pen', 0).purchase.unitEurIndicative, null, 'sans taux : pas d’euro inventé');
  assert.equal(quoteComparison('mylar', 0.13), null);
  assert.equal(saleQuoteFor('stk').unit, 0.31);
});

test('catalogue CRM : achat et vente dans le bloc interne seulement ; routes publiques sans ces données', async () => {
  const env = { CRM_API_TOKEN: 'x'.repeat(40), DATA: { async get() { return null; }, async put() { throw new Error('lecture seule'); } } };
  const { products } = await currentSnapshots(env, PRODUCT_IDS);
  const snaps = Object.fromEntries(Object.values(products).map((e) => [e.snapshot.product, e.snapshot]));
  const entries = crmCatalogEntries(snaps, null), pen = entries.find((e) => e.id === 'pen');
  assert.equal(pen.internal.quotes.purchase.unitCny, 1.2);
  assert.equal(pen.internal.quotes.sale.unitEur, 0.28);
  assert.equal(pen.internal.quotes.purchaseSource, FACTORY_QUOTE_SOURCE);
  assert.equal(entries.find((e) => e.id === 'mylar').internal.quotes, undefined);
  assert.equal(entries.find((e) => e.id === 'tshirt').internal.quotes.purchase, null);
  const pub = JSON.stringify(catalogEntries(snaps));
  assert.equal(pub.includes('unitCny') || pub.includes('quotes'), false);
});
