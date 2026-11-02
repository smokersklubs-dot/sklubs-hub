// Veille des marchés : routes protégées par le mot de passe + actualisation quotidienne (05:20 UTC, comme le worker).
import { commerceRoutes, refreshWatchMarkets, refreshWatchPages } from './commerce-worker.mjs';
import { refreshMat } from './mat.js';

const json = (data, status = 200) => Response.json(data, { status });

export async function marketRoute(request, url, env) {
  if (url.pathname === '/api/mat' && request.method === 'GET') {
    const raw = await env.DATA.get('mat_series');
    return json(raw ? JSON.parse(raw) : { updated: null, series: {} });
  }
  if (url.pathname === '/api/matrefresh' && request.method === 'POST') {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== url.origin || request.headers.get('X-SK') !== '1') return json({ error: 'refusé' }, 403);
    const last = parseInt((await env.DATA.get('mat_lastrefresh')) || '0', 10);
    if (Date.now() - last < 60000) return json({ error: 'trop vite, patientez une minute' }, 429);
    await env.DATA.put('mat_lastrefresh', String(Date.now()));
    return json({ ok: true, series: await refreshMat(env) });
  }
  return commerceRoutes(request, env, url);
}

export async function dailyRefresh(env) {
  const r = {};
  for (const [name, fn] of [['matieres', refreshMat], ['marches', refreshWatchMarkets], ['pages', refreshWatchPages]]) {
    try { await fn(env); r[name] = 'ok'; } catch (e) { r[name] = 'erreur'; console.warn('veille', name, String(e).slice(0, 120)); }
  }
  console.log('veille quotidienne', JSON.stringify(r));
}

// Planificateur simple : une exécution par jour à 05:20 UTC (une seule instance du hub).
export function scheduleDaily(env) {
  const next = () => { const d = new Date(); d.setUTCHours(5, 20, 0, 0); if (d <= new Date()) d.setUTCDate(d.getUTCDate() + 1); return d - Date.now(); };
  const arm = () => setTimeout(async () => { await dailyRefresh(env).catch(() => {}); arm(); }, next()).unref();
  arm();
}
