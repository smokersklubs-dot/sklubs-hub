// Relevé de référence des prix Mylar (tous les formats du tarif usine × toutes les quantités, plus quelques formats
// intermédiaires), calculés par le moteur avec le document cfg_hyp du VPS du 10/11/2026. Sert au test
// « prix Mylar identiques au centime avant et après ». Usage : node tests/capture-mylar-baseline.mjs > tests/fixtures-mylar-baseline.json
import { readFileSync } from 'node:fs';
import { currentSnapshots } from '../src/crm/current-snapshots.mjs';
import { priceSnapshot } from '../src/crm/public-pricing.mjs';

const hyp = JSON.parse(readFileSync(new URL('./fixtures-cfg_hyp-vps-20261110.json', import.meta.url), 'utf8'));
const store = { cfg_hyp: JSON.stringify({ data: hyp, version: 1793613352784 }) };
const env = { CRM_API_TOKEN: 'x'.repeat(40), DATA: { async get(n) { return store[n] ?? null; }, async put() { throw new Error('lecture seule'); } } };
const { products } = await currentSnapshots(env, ['mylar']);
const s = products.mylar.snapshot;
const formats = [...new Map(s.rows.map((r) => [r.ref + '|' + r.m, { t: r.t, m: r.m, L: r.L, H: r.H, G: r.G || 0 }])).values()];
const out = [];
for (const f of formats) for (const q of [200, 300, 500, 750, 1000, 1500, 2000, 3000, 4000, 5000]) {
  try { const d = priceSnapshot(s, { ...f, q }); out.push({ ...f, q, unitHT: d.quote.unitHT, estimated: d.quote.estimated }); }
  catch (e) { out.push({ ...f, q, error: e.message }); }
}
// Formats intermédiaires (interpolation par surface) pour chaque type et matière connus.
for (const [t, m] of new Set(formats.map((f) => f.t + '\u0000' + f.m))) {
  const [type, mat] = [t, m];
  for (const q of [500, 1000, 2000]) {
    const cfg = { t: type, m: mat, L: 150, H: 220, G: 40, q };
    try { const d = priceSnapshot(s, cfg); out.push({ ...cfg, unitHT: d.quote.unitHT, estimated: d.quote.estimated }); }
    catch (e) { out.push({ ...cfg, error: e.message }); }
  }
}
process.stdout.write(JSON.stringify(out));
