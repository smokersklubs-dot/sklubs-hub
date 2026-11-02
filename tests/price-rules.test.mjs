// Règles de prix fixés et paliers personnalisés : `node --test tests/`
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPriceRules } from '../src/crm/price-rules.mjs';

const rules = createPriceRules();
const K = (q) => rules.key('pen', { v: 'std', q });
// Formule native fictive : 0,28 € à 1000 pièces, élasticité 0,18 (comme les stylos), floor nul.
const native = (q) => Math.round(0.28 * Math.pow(q / 1000, -0.18) * 1000) / 1000;
const result = (q) => ({ q, price: native(q), ttc: native(q) * 1.2, total: native(q) * q, floor: 0, known: false });

test('palier exact : le prix fixé est appliqué tel quel', () => {
  const out = rules.resolve('pen', { [K(750)]: 0.3 }, K(750), result(750), native, 0.2);
  assert.equal(out.price, 0.3);
  assert.equal(out.manual, true);
  assert.equal(out.interpolated, undefined);
  assert.equal(out.basePrice, native(750));
});

test('palier intermédiaire : coefficient interpolé en log(quantité) entre les voisins fixés', () => {
  const fixed = { [K(500)]: native(500) * 1.2, [K(1000)]: native(1000) * 1.0 };
  const out = rules.resolve('pen', fixed, K(750), result(750), native, 0.2);
  const r = (Math.log(750) - Math.log(500)) / (Math.log(1000) - Math.log(500));
  const expected = Math.round(native(750) * (1.2 + (1.0 - 1.2) * r) * 1000) / 1000;
  assert.equal(out.price, expected);
  assert.equal(out.manual, true);
  assert.equal(out.interpolated, true);
  assert.ok(out.price > native(750) && out.price < native(750) * 1.2);
});

test('hors bornes : coefficient du palier fixé le plus proche', () => {
  const fixed = { [K(500)]: native(500) * 1.1, [K(1000)]: native(1000) * 0.9 };
  const below = rules.resolve('pen', fixed, K(100), result(100), native, 0.2);
  const above = rules.resolve('pen', fixed, K(5000), result(5000), native, 0.2);
  assert.equal(below.price, Math.round(native(100) * 1.1 * 1000) / 1000);
  assert.equal(above.price, Math.round(native(5000) * 0.9 * 1000) / 1000);
});

test('aucun palier de la même série : formule native inchangée', () => {
  const other = { [rules.key('pen', { v: 'xl', q: 500 })]: 9 };
  const out = rules.resolve('pen', other, K(500), result(500), native, 0.2);
  assert.equal(out.price, native(500));
  assert.equal(out.manual, undefined);
  const none = rules.resolve('pen', {}, K(500), result(500), native, 0.2);
  assert.equal(none.price, native(500));
});

test('jamais sous le plancher de marge existant', () => {
  const low = { ...result(750), floor: 0.5 };
  const out = rules.resolve('pen', { [K(750)]: 0.3 }, K(750), low, native, 0.2);
  assert.equal(out.price, 0.5);
  const interpolated = rules.resolve('pen', { [K(500)]: 0.1, [K(1000)]: 0.1 }, K(750), low, native, 0.2);
  assert.equal(interpolated.price, 0.5);
});

test('séries : stickers et Mylar isolent la quantité au bon rang', () => {
  const stk = rules.key('stk', { sh: 'rond', w: 50, h: 50, q: 750, mat: 'vin', fin: 'mat', cond: 'unit' });
  assert.deepEqual(rules.split('stk', stk), { series: JSON.stringify(['stk', 'rond', 50, 50, null, 'vin', 'mat', 'unit']), q: 750 });
  const mylar = rules.key('mylar', { t: 'Doypack à zip', th: 0.1, L: 100, H: 150, G: 25, q: 750 });
  assert.equal(rules.split('mylar', mylar).q, 750);
  assert.equal(rules.withQuantity('mylar', mylar, 900), rules.key('mylar', { t: 'Doypack à zip', th: 0.1, L: 100, H: 150, G: 25, q: 900 }));
  assert.equal(rules.split('pen', '["pen","std",1.5]'), null);
});

test('document ancien (sans paliers) : toujours valide', () => {
  const old = { schema: 1, scope: 'default', rules: { [K(1000)]: 0.28 }, history: [{ at: '2026-11-01T00:00:00.000Z', label: 'x', changes: [{ key: K(1000), before: null, after: 0.28 }] }] };
  assert.equal(rules.validDocument('pen', old), true);
});

test('validation refusée : doublon, quantité incohérente, clé étrangère, prix hors limites', () => {
  const base = { schema: 1, scope: 'default', rules: {}, history: [] };
  assert.equal(rules.validDocument('pen', { ...base, tiers: [{ key: K(750), q: 750 }] }), true);
  assert.equal(rules.validDocument('pen', { ...base, tiers: [{ key: K(750), q: 750 }, { key: K(750), q: 750 }] }), false, 'doublon');
  assert.equal(rules.validDocument('pen', { ...base, tiers: [{ key: K(750), q: 700 }] }), false, 'quantité différente de la clé');
  assert.equal(rules.validDocument('pen', { ...base, tiers: [{ key: K(0), q: 0 }] }), false, 'quantité nulle');
  assert.equal(rules.validDocument('pen', { ...base, tiers: [{ key: K(10000001), q: 10000001 }] }), false, 'au-delà de 10 000 000');
  assert.equal(rules.validDocument('pen', { ...base, tiers: [{ key: rules.key('cap', { v: 'std', q: 5 }), q: 5 }] }), false, 'autre produit');
  assert.equal(rules.validDocument('pen', { ...base, tiers: 'x' }), false, 'liste attendue');
  assert.equal(rules.validDocument('pen', { ...base, rules: { [K(750)]: 0 } }), false, 'prix nul');
  assert.equal(rules.validDocument('pen', { ...base, rules: { [K(750)]: 100001 } }), false, 'prix trop grand');
  assert.equal(rules.validDocument('pen', { ...base, tiers: Array.from({ length: 2001 }, (_, i) => ({ key: K(i + 1), q: i + 1 })) }), false, 'plus de 2000 paliers');
});

test('change : paliers ajoutés et retirés tracés dans l’historique, retour en arrière possible', () => {
  const doc = rules.empty();
  const next = rules.change(doc, { [K(750)]: 0.3 }, 'ajout', new Date('2026-11-02T10:00:00Z'), [{ key: K(750), q: 750 }], 'pen');
  assert.deepEqual(next.tiers, [{ key: K(750), q: 750 }]);
  assert.equal(next.rules[K(750)], 0.3);
  assert.deepEqual(next.history.at(-1).tiers, { added: [{ key: K(750), q: 750 }], removed: [] });
  assert.equal(rules.validDocument('pen', next), true);
  const removed = rules.change(next, { [K(750)]: null }, 'retrait', new Date('2026-11-02T11:00:00Z'), [], 'pen');
  assert.deepEqual(removed.tiers, []);
  assert.equal(removed.rules[K(750)], undefined);
  assert.deepEqual(removed.history.at(-1).tiers, { added: [], removed: [{ key: K(750), q: 750 }] });
  assert.equal(removed.history.length, 2);
  // Aucun changement : document identique, pas d'entrée d'historique.
  const same = rules.change(removed, {}, 'rien', new Date(), [], 'pen');
  assert.equal(same.history.length, 2);
  // Tri par série puis quantité.
  const sorted = rules.change(doc, {}, 'tri', new Date(), [{ key: K(900), q: 900 }, { key: K(300), q: 300 }], 'pen');
  assert.deepEqual(sorted.tiers.map((t) => t.q), [300, 900]);
});
