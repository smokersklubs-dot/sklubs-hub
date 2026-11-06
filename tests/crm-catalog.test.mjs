// Catalogue enrichi pour le CRM (6 novembre 2026) : tout ce que le hub sait, sans coût ni tarif de transport au kilo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentSnapshots } from '../src/crm/current-snapshots.mjs';
import { catalogEntries } from '../src/crm/public-pricing.mjs';
import { crmCatalogEntries, MYLAR_QUANTITIES } from '../src/crm/crm-catalog.mjs';
import { crmApiRoute, resetCrmRateLimits } from '../src/crm/crm-api.mjs';

const TOKEN = 'jeton-de-test-'.repeat(4);
const manifest = JSON.parse(readFileSync(new URL('../public/img/manifest.json', import.meta.url), 'utf8'));
const env = (extra = {}) => ({ CRM_API_TOKEN: TOKEN, DATA: { async get() { return null; }, async put() { throw new Error('écriture interdite'); } }, ...extra });
const published = async () => { const { products } = await currentSnapshots(env(), ['mylar', 'stk', 'pen', 'cap']); return Object.fromEntries(Object.values(products).map((e) => [e.snapshot.product, e.snapshot])); };

test('Mylar : modes de transport avec délais, quantités, épaisseur, photos, matières et types', async () => {
  const entries = crmCatalogEntries(await published(), manifest), mylar = entries.find((e) => e.id === 'mylar');
  assert.deepEqual(mylar.modes.map((m) => [m.id, m.name, m.days]), [['air', 'Avion DDP', 7], ['train', 'Train DDP', 20], ['truck', 'Camion DDP', 25], ['sea', 'Bateau DDP', 40]]);
  assert.equal(mylar.modes.find((m) => m.default).id, 'air');
  assert.equal(mylar.vatRate, 0.2);
  assert.deepEqual(mylar.quantities, MYLAR_QUANTITIES);
  assert.deepEqual(mylar.quantityRange, { min: 200, max: 5000 });
  assert.ok(mylar.formats.length > 10);
  for (const f of mylar.formats) { assert.ok(f.thickness > 0, 'épaisseur de ' + f.ref); assert.match(f.image, /^mylar\/[a-z0-9_]+\.jpg$/); }
  assert.deepEqual(mylar.materials.find((m) => m.id === 'MOPP/AL/PE'), { id: 'MOPP/AL/PE', name: 'Aluminium' });
  assert.ok(mylar.types.every((t) => t.formats > 0 && /^mylar\//.test(t.image)));
  assert.deepEqual(mylar.options, [], 'le hub ne modélise pas de finition Mylar séparée');
  assert.match(mylar.image, /^mylar\//);
});

test('stickers et produits génériques : options avec coefficient et frais fixes, minimum, photos', async () => {
  const entries = crmCatalogEntries(await published(), manifest), stk = entries.find((e) => e.id === 'stk'), pen = entries.find((e) => e.id === 'pen');
  assert.ok(stk.finishes.some((f) => f.factor > 1), 'une finition majorée existe (ex. laminé)');
  for (const f of [...stk.finishes, ...stk.packaging]) { assert.equal(typeof f.factor, 'number'); assert.equal(typeof f.fixedFee, 'number'); }
  assert.equal(stk.quantityRange.min, stk.minimum);
  assert.equal(stk.quantities[0], stk.minimum);
  assert.equal(stk.image, 'produits/sticker_set.jpg');
  assert.equal(pen.image, 'produits/pen.jpg');
  assert.deepEqual(pen.quantities, [100, 250, 500, 1000, 2500, 5000, 10000]);
  assert.ok(pen.modes.length >= 3);
});

test('aucun coût, aucune marge, aucun tarif au kilo ; le catalogue public reste inchangé', async () => {
  const p = await published(), crm = JSON.stringify(crmCatalogEntries(p, manifest));
  for (const key of ['cout', 'cost', 'marge', 'usine', 'rmb', '"t":[[', 'cc']) assert.equal(crm.includes('"' + key + '"') || crm.includes(key === '"t":[[' ? key : '\u0000'), false, 'aucune donnée interne : ' + key);
  const pub = JSON.stringify(catalogEntries(p));
  for (const key of ['modes', 'thickness', 'factor', 'fixedFee', 'quantityRange', 'image']) assert.equal(pub.includes('"' + key + '"'), false, 'route publique sans champ CRM : ' + key);
});

test('API CRM : catalogue enrichi et photos réservées au jeton', async () => {
  resetCrmRateLimits();
  const images = { 'produits/pen': Buffer.from([0xff, 0xd8, 0xff]) };
  const e = env({ IMAGE_MANIFEST: manifest, IMAGE: async (dir, name) => images[dir + '/' + name] ?? null });
  const call = (path, init = {}) => crmApiRoute(new Request('http://hub.internal' + path, init), e, new URL('http://hub.internal' + path));
  const auth = { Authorization: 'Bearer ' + TOKEN };
  const catalog = await (await call('/api/crm/v1/catalog?site=fr', { headers: auth })).json();
  assert.equal(catalog.products.find((p) => p.id === 'mylar').modes.length, 4);
  assert.equal((await call('/api/crm/v1/image/produits/pen.jpg')).status, 401, 'photo refusée sans jeton');
  const ok = await call('/api/crm/v1/image/produits/pen.jpg', { headers: auth });
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('Content-Type'), 'image/jpeg'); assert.equal((await ok.arrayBuffer()).byteLength, 3);
  assert.equal((await call('/api/crm/v1/image/produits/absent.jpg', { headers: auth })).status, 404);
  assert.equal((await call('/api/crm/v1/image/../secret.jpg', { headers: auth })).status, 404, 'aucun chemin hors des dossiers de photos');
  // /price accepte le mode de transport publié.
  const price = await (await call('/api/crm/v1/price', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: 'pen', site: 'fr', quantity: 1000, configuration: { v: 'std', mode: 'sea' } }) })).json();
  assert.ok(price.unitHT > 0);
});
