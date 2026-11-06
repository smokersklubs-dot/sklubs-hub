// Catalogue enrichi pour le CRM (6 novembre 2026) : tout ce que le hub sait, sans coût ni tarif de transport au kilo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentSnapshots } from '../src/crm/current-snapshots.mjs';
import { catalogEntries, priceSnapshot, quoteSnapshot } from '../src/crm/public-pricing.mjs';
import { crmCatalogEntries, MYLAR_QUANTITIES } from '../src/crm/crm-catalog.mjs';
import { crmApiRoute, resetCrmRateLimits, RATE_MAX } from '../src/crm/crm-api.mjs';

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
  assert.equal(mylar.materials.find((m) => m.id === 'MOPP/AL/PE').name, 'Aluminium');
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

test('bloc interne : transport au kilo, poids, frais fixes, marges minimales ; aucun taux RMB ni prix usine brut', async () => {
  const p = await published(), entries = crmCatalogEntries(p, manifest), mylar = entries.find((e) => e.id === 'mylar'), stk = entries.find((e) => e.id === 'stk'), pen = entries.find((e) => e.id === 'pen');
  assert.deepEqual(mylar.internal.transport.modes.find((m) => m.id === 'air').rates, [{ fromKg: 0, eurPerKg: 13.9 }, { fromKg: 25, eurPerKg: 12.5 }, { fromKg: 100, eurPerKg: 11 }, { fromKg: 250, eurPerKg: 10 }, { fromKg: 500, eurPerKg: 9 }]);
  assert.deepEqual(mylar.internal.marginFloor, { small: 0.45, large: 0.35, largeFrom: 2000 });
  assert.equal(mylar.internal.fixedCostPerOrderHT, 30);
  assert.equal(stk.internal.transport.weight.gsm, 200);
  assert.equal(pen.internal.transport.weight.unitWeightKg, 0.01575);
  assert.equal(pen.internal.marginFloor, null, 'pas de plancher de marge dans le moteur des produits génériques');
  assert.deepEqual(mylar.thicknesses, [0.1, 0.12, 0.14]);
  assert.ok(mylar.materials.every((m) => m.description && m.thicknesses.length));
  const crm = JSON.stringify(entries);
  for (const key of ['rmb', 'mk', 'fx', 'secFx', 'usine', 'cost0', 'mats', 'idx', 'mkt']) assert.equal(crm.includes('"' + key + '"'), false, 'aucun paramètre usine : ' + key);
  const pub = JSON.stringify(catalogEntries(p));
  for (const key of ['internal', 'modes', 'thickness', 'factor', 'fixedFee', 'quantityRange', 'image', 'eurPerKg']) assert.equal(pub.includes('"' + key + '"'), false, 'route publique sans champ CRM : ' + key);
});

test('prix détaillé (CRM privé) : transport au kilo cohérent, plancher, marge minimale ; le devis public ne change pas', async () => {
  const p = await published();
  const d = priceSnapshot(p.mylar, { t: p.mylar.rows[0].t, m: p.mylar.rows[0].m, L: p.mylar.rows[0].L, H: p.mylar.rows[0].H, G: p.mylar.rows[0].G || 0, q: 1000, mode: 'sea' });
  const t = d.internal.transport;
  assert.equal(t.mode, 'sea'); assert.equal(t.ratePerKg, 5.2); assert.equal(t.days, 40);
  assert.ok(Math.abs(t.totalKg - t.unitWeightKg * 1000) < 1e-9);
  assert.ok(Math.abs(t.unitHT - t.unitWeightKg * t.ratePerKg) < 1e-9);
  assert.ok(Math.abs(d.internal.factoryUnitHT + d.internal.fixedUnitHT + t.unitHT - d.internal.unitCostHT) < 1e-9, 'usine + frais fixes + transport = coût de revient');
  assert.equal(d.internal.marginFloorRate, 0.45);
  assert.ok(d.internal.floorUnitHT <= d.quote.unitHT + 1e-9);
  const air = priceSnapshot(p.mylar, { ...d.configuration, mode: 'air', q: 1000 }).internal.transport;
  assert.ok(air.ratePerKg > t.ratePerKg, 'avion plus cher au kilo que bateau');
  const pen = priceSnapshot(p.pen, { v: 'std', q: 1000, mode: 'air' }).internal;
  assert.equal(pen.transport.unitWeightKg, 0.01575); assert.equal(pen.transport.includedInCost, true); assert.equal(pen.marginFloorRate, null);
  const stk = priceSnapshot(p.stk, { sh: 'rond', w: 50, h: 50, mat: Object.keys(p.stk.hyp.pm)[0], fin: Object.keys(p.stk.hyp.fin)[0], cond: Object.keys(p.stk.hyp.cond)[0], q: 500 }).internal;
  assert.ok(stk.transport.ratePerKg > 0); assert.equal(typeof stk.optionFeesUnitHT, 'number');
  assert.deepEqual(Object.keys(quoteSnapshot(p.pen, { v: 'std', q: 1000 })).sort(), ['currency', 'estimated', 'product', 'promotion', 'quantity', 'regularUnitHT', 'scope', 'totalHT', 'totalTTC', 'unitHT', 'vat', 'version'].sort(), 'devis public : liste blanche inchangée');
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

test('130 µm proposé ; sans prix usine à cette épaisseur, il reste à chiffrer', async () => {
  const mylar = crmCatalogEntries(await published(), manifest).find((e) => e.id === 'mylar');
  assert.deepEqual(mylar.thicknessOffer, [{ value: 0.1, priced: true }, { value: 0.12, priced: true }, { value: 0.13, priced: false }, { value: 0.14, priced: true }]);
});

test('produits génériques : transport compté dans le coût par défaut ; un ancien « non » enregistré ne compte plus, un choix fait exprès oui', async () => {
  const saved = (h) => ({ DATA: { async get(name) { return name === 'cfg_g_pen' ? JSON.stringify({ data: { h, vei: [] }, version: 5 }) : null; }, async put() { throw new Error('écriture interdite'); } } });
  const pen = async (h) => (await currentSnapshots(h === null ? env() : saved(h), ['pen'])).products.pen.snapshot;
  assert.equal((await pen(null)).hyp.incTr, true, 'valeur par défaut');
  assert.equal((await pen({ incTr: false, cost0: 1 })).hyp.incTr, true, 'ancien enregistrement : ancien défaut ignoré');
  assert.equal((await pen({ incTr: false, incTrChoice: true, cost0: 1 })).hyp.incTr, false, 'choix fait exprès : gardé');
  const p = await pen({ cost0: 1 }), d = priceSnapshot(p, { v: 'std', q: 1000, mode: 'air' });
  assert.equal(d.internal.transport.includedInCost, true);
  assert.ok(Math.abs(d.internal.factoryUnitHT + d.internal.fixedUnitHT + d.internal.transport.unitHT - d.internal.unitCostHT) < 1e-9, 'usine + frais fixes + transport = coût de revient');
  const pub = quoteSnapshot(p, { v: 'std', q: 1000, mode: 'air' }), before = quoteSnapshot(await pen({ cost0: 1, incTr: false, incTrChoice: true }), { v: 'std', q: 1000, mode: 'air' });
  assert.equal(pub.unitHT, before.unitHT, 'le prix de vente ne change pas : seul le coût de revient compte le transport');
});

test('limite du CRM authentifié : un commercial qui clique vite n’est pas bloqué ; au-delà de la limite, 429', async () => {
  resetCrmRateLimits();
  const e = env(), now = Date.now(), auth = { Authorization: 'Bearer ' + TOKEN };
  const call = () => crmApiRoute(new Request('http://hub.internal/api/crm/v1/catalog?site=fr', { headers: auth }), e, new URL('http://hub.internal/api/crm/v1/catalog?site=fr'), now);
  assert.equal(RATE_MAX, 600);
  for (let i = 0; i < 120; i++) assert.equal((await call()).status, 200, 'appel ' + (i + 1));
  for (let i = 120; i < RATE_MAX; i++) await call();
  assert.equal((await call()).status, 429);
  resetCrmRateLimits();
});
