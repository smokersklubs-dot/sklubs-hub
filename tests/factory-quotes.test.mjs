// Coûts d'usine reçus (fiche Cricket du 10/11/2026) : information seule, aucun prix de vente ni réglage modifié.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FACTORY_QUOTES, FACTORY_QUOTE_SOURCE, FACTORY_QUOTE_CURRENCY, factoryQuotesFor, factoryQuotesOffHub } from '../src/crm/factory-quotes.mjs';
import { PRODUCT_IDS } from '../src/crm/campaigns.mjs';
import { currentSnapshots } from '../src/crm/current-snapshots.mjs';
import { priceSnapshot } from '../src/crm/public-pricing.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('chaque ligne est cohérente : total = unitaire × quantité, produit du hub connu ou hors hub, une ligne par produit', () => {
  assert.equal(FACTORY_QUOTE_SOURCE, 'Shenzhen Creative Star — fiche Cricket, 10/11/2026');
  assert.equal(FACTORY_QUOTE_CURRENCY.confirmed, false, 'devise à confirmer par Lemexx');
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
  for (const f of ['pricing-engine.mjs', 'public-pricing.mjs', 'current-pricing.mjs', 'current-snapshots.mjs', 'price-rules.mjs', 'crm-catalog.mjs', 'crm-api.mjs']) assert.equal(read('../src/crm/' + f).includes('factory-quotes'), false, f);
  // Prix par défaut du hub aux quantités de référence et aux quantités cotées : inchangés (valeurs relevées sur main a3a9d25).
  const env = { CRM_API_TOKEN: 'x'.repeat(40), DATA: { async get() { return null; }, async put() { throw new Error('lecture seule'); } } };
  const { products } = await currentSnapshots(env, PRODUCT_IDS);
  const at = (id, q) => priceSnapshot(products[id].snapshot, { v: 'std', q }).quote.unitHT;
  const expected = { badge: [1200, 0.15], pin: [200, 0.75], bottle: [200, 4.3], pen: [1000, 0.28], lanyard: [140, 1], patch: [500, 1], tshirt: [750, 6.3], cap: [175, 4.5], beanie: [100, 4], bucket: [100, 5.5], sock: [200, 2.38], tote: [500, 1.4] };
  for (const [id, [q, price]] of Object.entries(expected)) assert.equal(at(id, q), price, id);
});
