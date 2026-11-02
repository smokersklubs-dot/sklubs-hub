// Cours des matières (FRED + Eurostat, sans clé), repris du worker. Stocké sous la clé KV « mat_series ».
const SERIES = [
  ['alu', 'Aluminium', '$/t', 'fred', 'PALUMUSDM', 'FMI via FRED'],
  ['zinc', 'Zinc', '$/t', 'fred', 'PZINCUSDM', 'FMI via FRED'],
  ['copper', 'Cuivre', '$/t', 'fred', 'PCOPPUSDM', 'FMI via FRED'],
  ['tin', 'Étain', '$/t', 'fred', 'PTINUSDM', 'FMI via FRED'],
  ['nickel', 'Nickel', '$/t', 'fred', 'PNICKUSDM', 'FMI via FRED'],
  ['cotton', 'Coton (indice A)', 'c$/lb', 'fred', 'PCOTTINDUSDM', 'FMI via FRED'],
  ['rubber', 'Caoutchouc', 'c$/kg', 'fred', 'PRUBBUSDM', 'FMI via FRED'],
  ['brent', 'Pétrole Brent', '$/baril', 'fred', 'POILBREUSDM', 'FMI via FRED'],
  ['polyester', 'Fibres polyester (US)', 'indice', 'fred', 'PCU3252203252207', 'BLS via FRED'],
  ['resins_us', 'Résines plastiques (US)', 'indice', 'fred', 'WPU066', 'BLS via FRED'],
  ['eu_plastic', 'Plastiques de base (UE) : PVC, PET, PP', 'indice 2021=100', 'estat', 'C2016', 'Eurostat'],
  ['eu_paper', 'Papier et carton (UE)', 'indice 2021=100', 'estat', 'C171', 'Eurostat'],
  ['eu_textile', 'Textiles (UE)', 'indice 2021=100', 'estat', 'C13', 'Eurostat'],
];
async function getFred(id) {
  const r = await fetch('https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + id + '&cosd=2023-01-01', { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('fred ' + r.status);
  const out = [];
  (await r.text()).trim().split('\n').slice(1).forEach((l) => {
    const [d, v] = l.split(','); const x = parseFloat(v);
    if (d && isFinite(x)) out.push([d.slice(0, 7), Math.round(x * 1000) / 1000]);
  });
  return out;
}
async function getEstat(n) {
  const r = await fetch('https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/sts_inpp_m?format=JSON&lang=EN&nace_r2=' + n + '&s_adj=NSA&unit=I21&indic_bt=PRC_PRR&geo=EU27_2020&sinceTimePeriod=2023-01', { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('estat ' + r.status);
  const j = await r.json(), inv = {};
  const idx = j.dimension.time.category.index;
  for (const k in idx) inv[idx[k]] = k;
  return Object.keys(j.value).map(Number).sort((a, b) => a - b).map((i) => [inv[i], j.value[i]]);
}
export async function refreshMat(env) {
  let old = {};
  try { old = JSON.parse((await env.DATA.get('mat_series')) || '{}').series || {}; } catch {}
  const series = Object.assign({}, old);
  let ok = 0;
  await Promise.all(SERIES.map(async ([k, n, u, t, id, s]) => {
    try {
      const p = t === 'fred' ? await getFred(id) : await getEstat(id);
      if (p.length > 3) { series[k] = { n, u, s, p: p.slice(-36) }; ok++; }
    } catch (e) { console.warn('matieres', k, String(e).slice(0, 120)); }
  }));
  if (ok) await env.DATA.put('mat_series', JSON.stringify({ updated: new Date().toISOString().slice(0, 10), series }));
  return ok;
}
