// Prix Mylar public d'une configuration pour bags.sklubs.fr (6 novembre 2026) : moteur du CRM, prix en cours, aucun coût.
import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSnapshots } from '../src/crm/current-snapshots.mjs';
import { priceSnapshot } from '../src/crm/public-pricing.mjs';
import { mylarQuote } from '../src/public-mylar.js';

const env = { DATA: { async get() { return null; }, async put() { throw new Error('écriture interdite'); } } };
const snap = async () => (await currentSnapshots(env, ['mylar'])).products.mylar.snapshot;

test('format exact : même prix que le CRM, livraison DDP comprise et délai du mode', async () => {
  const s = await snap(), r0 = s.rows[0];
  const r = mylarQuote(s, { type: r0.t, material: r0.m, L: r0.L, H: r0.H, G: r0.G || 0, q: '1000', mode: 'sea' });
  assert.equal(r.ok, true);
  const crm = priceSnapshot(s, { t: r0.t, m: r0.m, L: r0.L, H: r0.H, G: r0.G || 0, q: 1000, mode: 'sea' }).quote;
  assert.equal(r.body.unitHT, crm.unitHT); assert.equal(r.body.totalHT, crm.totalHT); assert.equal(r.body.totalTTC, crm.totalTTC);
  assert.equal(r.body.estimated, false);
  assert.deepEqual(r.body.delivery, { mode: 'sea', name: 'Bateau DDP', days: 40, included: true, terms: 'DDP' });
  assert.equal(r.body.format.thickness, r0.th);
});

test('taille du configurateur (100 g : 100 × 150 + 35) : estimation du hub, jamais de coût', async () => {
  const s = await snap();
  const r = mylarQuote(s, { type: 'Doypack à zip', material: 'MOPP/VMPET/PE', L: '100', H: '150', G: '35', q: '500' });
  assert.equal(r.ok, true); assert.equal(r.body.estimated, true); assert.ok(r.body.unitHT > 0);
  const json = JSON.stringify(r.body);
  for (const k of ['cost', 'cout', 'marg', 'usine', 'rmb', 'eurPerKg', 'ratePerKg', 'internal']) assert.equal(json.includes(k), false, 'aucune donnée interne : ' + k);
});

test('refus clairs : minimum, maximum, matière ou type inconnus, taille hors plage, mode inconnu', async () => {
  const s = await snap(), base = { type: 'Doypack à zip', material: 'MOPP/VMPET/PE', L: '100', H: '150', G: '25' };
  assert.equal(mylarQuote(s, { ...base, q: '150' }).code, 'BELOW_MINIMUM');
  assert.equal(mylarQuote(s, { ...base, q: '6000' }).code, 'ABOVE_MAXIMUM');
  assert.equal(mylarQuote(s, { ...base, material: 'KRAFT', q: '500' }).code, 'UNKNOWN_MATERIAL');
  assert.equal(mylarQuote(s, { ...base, type: 'Boîte', q: '500' }).code, 'UNKNOWN_TYPE');
  assert.equal(mylarQuote(s, { ...base, L: '1500', H: '1500', q: '500' }).code, 'OUT_OF_RANGE');
  assert.equal(mylarQuote(s, { ...base, q: '500', mode: 'fusee' }).code, 'UNKNOWN_MODE');
  assert.equal(mylarQuote(s, { ...base, L: 'abc', q: '500' }).code, 'INVALID_DIMENSIONS');
});
