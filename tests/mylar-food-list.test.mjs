// Liste d'achat « Mylar alimentaire (spécial) » de Hongbang Packaging : séparée, en USD, sans prix de vente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MYLAR_FOOD_LIST as L, foodToVerify, foodCost } from '../src/crm/mylar-food-list.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const model = (id) => L.models.find((m) => m.id === id);

test('fiche Hongbang du 10/11/2026 : 2 modèles, 14 + 8 tailles, 7 paliers, USD, source et mentions', () => {
  assert.equal(L.name, 'Mylar alimentaire (spécial)');
  assert.equal(L.supplier, 'Hongbang Packaging (depuis 1999)');
  assert.equal(L.source, 'Hongbang Packaging — fiche tarifaire reçue le 10/11/2026');
  assert.match(L.priceNote, /prix matière actuels, légèrement variables/);
  assert.equal(L.currency, 'USD');
  assert.equal(L.material, 'MOPP/VMPET/PE');
  assert.deepEqual(L.tiers, [500, 1000, 2000, 3000, 5000, 8000, 10000]);
  assert.deepEqual(L.models.map((m) => [m.id, m.rows.length]), [['flat-bottom', 14], ['stand-up', 8]]);
  for (const m of L.models) for (const r of m.rows) { assert.equal(r.p.length, 7, r.size); assert.equal(r.size, `${r.w}×${r.h}+${r.g}`); assert.ok([100, 120, 140].includes(r.th)); assert.ok(r.p.every((v) => v > 0 && v < 5)); }
  assert.deepEqual(model('flat-bottom').rows[0].p, [1.41, 0.76, 0.43, 0.31, 0.21, 0.16, 0.15]);
  assert.deepEqual(model('flat-bottom').rows.at(-1), { size: '23×38+12', w: 23, h: 38, g: 12, th: 140, p: [2.77, 1.86, 1.42, 1.14, 0.88, 0.85, 0.83] });
  assert.deepEqual(model('stand-up').rows.at(-1).p, [0.216, 0.702, 0.518, 0.407, 0.347, 0.313, 0.312]);
  assert.equal(model('stand-up').rows.find((r) => r.size === '16×24+8').th, 140);
});

test('valeurs douteuses : importées mais marquées « à vérifier » (colonne 500 debout, saut à 1 000, 15×22+8 à 10 000)', () => {
  const flagged = [];
  for (const m of L.models) for (const r of m.rows) for (const q of L.tiers) if (foodToVerify(m.id, r.size, q)) flagged.push([m.id, r.size, q]);
  assert.equal(flagged.length, 11);
  assert.equal(flagged.filter(([m, , q]) => m === 'stand-up' && q === 500).length, 8, 'toute la colonne 500 du modèle debout');
  assert.ok(foodToVerify('stand-up', '9×13+6', 1000) && foodToVerify('stand-up', '10×15+6', 1000) && foodToVerify('stand-up', '15×22+8', 10000));
  assert.equal(flagged.some(([m]) => m === 'flat-bottom'), false);
  assert.deepEqual(foodCost('stand-up', '9×13+6', 500), { usd: 0.108, toVerify: foodToVerify('stand-up', '9×13+6', 500) });
  assert.deepEqual(foodCost('flat-bottom', '9×13+6', 1000), { usd: 0.76, toVerify: null });
  assert.equal(foodCost('flat-bottom', '9×13+6', 750), null, 'quantité hors fiche : aucun coût inventé');
  assert.equal(foodCost('flat-bottom', '99×99+9', 1000), null);
  // Hors valeurs signalées, le prix baisse quand la quantité monte : la transcription est cohérente.
  for (const m of L.models) for (const r of m.rows) { const ok = r.p.filter((_, i) => !foodToVerify(m.id, r.size, L.tiers[i])); for (let i = 1; i < ok.length; i++) assert.ok(ok[i] <= ok[i - 1], m.id + ' ' + r.size); }
});

test('liste séparée : le moteur de prix et le catalogue ne la lisent pas ; la page porte la même copie', () => {
  for (const f of ['pricing-engine.mjs', 'public-pricing.mjs', 'current-pricing.mjs', 'current-snapshots.mjs', 'price-rules.mjs', 'crm-catalog.mjs', 'crm-api.mjs', 'mylar-off-catalog.mjs']) assert.equal(read('../src/crm/' + f).includes('mylar-food-list'), false, f);
  const block = read('../src/crm/mylar-food-list.mjs').replace(/^export (const|function) /gm, '$1 ').trimEnd();
  assert.ok(read('../public/index.html').includes(block));
});
