// Pont Node → modules du worker Cloudflare (repris tels quels) : API CRM serveur à serveur (lecture seule).
// env.DATA (KV Cloudflare) est simulé par PostgreSQL (voir ../kv.js).
import { crmApiRoute } from './crm-api.mjs';
import { makeKv } from '../kv.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_IMG = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'img');
let manifest = null;
try { manifest = JSON.parse(readFileSync(path.join(PUBLIC_IMG, 'manifest.json'), 'utf8')); } catch { manifest = null; }
// Lecture d'une photo du hub (dossier et nom déjà validés par la route) ; null si absente.
const readImage = async (dir, name) => { try { return readFileSync(path.join(PUBLIC_IMG, dir, name + '.jpg')); } catch { return null; } };

export function crmEnv(pool, schema) {
  return { CRM_API_TOKEN: process.env.CRM_API_TOKEN, DATA: makeKv(pool, schema), IMAGE_MANIFEST: manifest, IMAGE: readImage };
}

// Convertit la requête Node en Request standard, appelle le module, renvoie la réponse. Faux si la route est inconnue.
export async function bridge(req, res, base, body, handler) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const init = { method: req.method, headers };
  if (req.method !== 'GET' && req.method !== 'HEAD') init.body = body;
  const request = new Request(base + req.url, init);
  const r = await handler(request, new URL(request.url));
  if (!r) return false;
  const out = {};
  r.headers.forEach((v, k) => { out[k] = v; });
  res.writeHead(r.status, out);
  res.end(Buffer.from(await r.arrayBuffer()));
  return true;
}

export const handleCrm = (req, res, url, body, env) =>
  bridge(req, res, 'http://hub.internal', body, (request, u) => crmApiRoute(request, env, u));
