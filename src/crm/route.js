// Pont Node → modules du worker Cloudflare (repris tels quels) : API CRM serveur à serveur (lecture seule).
// Les modules attendent env.DATA.get(nom) (KV) : on le simule avec la table hub.docs de PostgreSQL.
import { crmApiRoute } from './crm-api.mjs';
import { getDoc } from '../docs.js';

export function crmEnv(pool, schema) {
  return {
    CRM_API_TOKEN: process.env.CRM_API_TOKEN,
    DATA: {
      async get(name) {
        // Cours matières (cron du worker) : pas encore repris, les valeurs initiales intégrées servent de base.
        if (name === 'mat_series') return null;
        const d = await getDoc(pool, schema, name);
        return d && d.version ? JSON.stringify(d) : null;
      },
    },
  };
}

export async function handleCrm(req, res, url, body, env) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = body;
  const r = await crmApiRoute(new Request('http://hub.internal' + req.url, init), env, url);
  if (!r) return false;
  const out = {};
  r.headers.forEach((v, k) => { out[k] = v; });
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
  return true;
}
