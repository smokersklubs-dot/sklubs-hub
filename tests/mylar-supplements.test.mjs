// Suppléments Mylar repris de l'ancienne grille du configurateur (7 novembre 2026) : le hub reste la seule référence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { currentSnapshots } from '../src/crm/current-snapshots.mjs';
import { supplementsTable, applySupplements, publicSupplements, DEFAULT_SUPPLEMENTS } from '../src/crm/mylar-supplements.mjs';
import { mylarQuote } from '../src/public-mylar.js';

const env = { DATA: { async get() { return null; }, async put() { throw new Error('écriture interdite'); } } };
const snap = async () => (await currentSnapshots(env, ['mylar'])).products.mylar.snapshot;
const base = { type: 'Doypack à zip', material: 'MOPP/VMPET/PE', L: '100', H: '150', G: '25', q: '1000' };

test('valeurs de l’ancienne grille : finitions, effets, options, impression, visuels, clichés', () => {
  const t = supplementsTable(null);
  assert.equal(t.finishes.glossy.perUnit, 0.05); assert.equal(t.finishes['soft-touch'].perUnit, 0.08); assert.equal(t.finishes.holographic.perUnit, 0.10);
  assert.equal(t.effects['spot-uv'].perUnit, 0.12); assert.equal(t.effects.foil.perUnit, 0.15);
  assert.equal(t.options['zip-child-safe'].perUnit, 0.10); assert.equal(t.options.valve.perUnit, 0.06); assert.equal(t.options.window.perUnit, 0.10);
  assert.equal(t.options['hole-euro'].perUnit, 0.02); assert.equal(t.options['tear-notch'].perUnit, 0.01);
  assert.equal(t.cliches['new-4'].perOrder, 150); assert.equal(t.cliches['new-8'].perOrder, 250); assert.equal(t.cliches.reprint.perOrder, 0);
  assert.equal(t.options['hole-round'], undefined, 'absent de l’ancienne grille : sur devis');
});

test('prix = format du hub + suppléments par sachet + clichés par commande ; TVA sur le tout', async () => {
  const s = await snap(), plain = mylarQuote(s, { ...base, finish: 'mat', options: 'zip-standard', cliches: 'reprint' });
  assert.equal(plain.ok, true); assert.equal(plain.body.unitHT, plain.body.baseUnitHT); assert.equal(plain.body.fixedFeesHT, 0);
  const rich = mylarQuote(s, { ...base, finish: 'glossy', effects: 'spot-uv,foil', options: 'zip-standard,valve', print: 'recto-verso', visuals: '2v', cliches: 'new-4' });
  assert.equal(rich.ok, true);
  const extra = 0.05 + 0.12 + 0.15 + 0.06 + 0.03 + 0.05;
  assert.equal(rich.body.unitHT, Math.round((plain.body.baseUnitHT + extra) * 1000) / 1000);
  assert.equal(rich.body.fixedFeesHT, 150);
  assert.equal(rich.body.totalHT, Math.round((rich.body.unitHT * 1000 + 150) * 100) / 100);
  assert.equal(rich.body.totalTTC, Math.round(rich.body.totalHT * 1.2 * 100) / 100);
  assert.ok(rich.body.supplements.some(l => l.id === 'foil' && l.perUnitHT === 0.15));
});

test('choix sans prix : sur devis, jamais de prix inventé ; un document enregistré remplace la grille', async () => {
  const s = await snap();
  assert.equal(mylarQuote(s, { ...base, options: 'hole-round' }).code, 'UNPRICED_OPTION');
  assert.equal(mylarQuote(s, { ...base, finish: 'velours' }).code, 'UNPRICED_OPTION');
  const t = supplementsTable({ finishes: { glossy: { perUnit: 0.07 } }, options: { 'hole-round': { n: 'Trou rond', perUnit: 0.02 }, valve: { removed: true } } });
  assert.equal(t.finishes.glossy.perUnit, 0.07); assert.equal(t.options['hole-round'].perUnit, 0.02); assert.equal(t.options.valve, undefined);
  assert.equal(applySupplements(t, { options: ['valve'] }).ok, false);
  assert.equal(DEFAULT_SUPPLEMENTS.finishes.glossy.perUnit, 0.05, 'les défauts ne sont pas modifiés');
  const pub = JSON.stringify(publicSupplements(supplementsTable(null)));
  for (const k of ['cost', 'cout', 'marg', 'usine', 'rmb']) assert.equal(pub.includes(k), false);
});
