// Serveur de recette local, SANS base ni mot de passe : documents en mémoire, page réelle, API CRM réelle.
// Usage : node tests/dev-server.mjs [port]   (défaut 4199, jeton CRM de test affiché au démarrage : recette uniquement)
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { allowedName, validDoc, MAX_BODY } from '../src/docs.js';
import { handleCrm, crmImages } from '../src/crm/route.js';

const PORT = Number(process.argv[2] || 4199);
const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const indexHtml = readFileSync(path.join(PUBLIC, 'index.html'));
const chartJs = readFileSync(path.join(PUBLIC, 'chart.js'));
const TOKEN = 'jeton-de-recette-locale-sans-valeur-' + 'x'.repeat(12);
const docs = new Map(); // name -> { data, version }

const env = { CRM_API_TOKEN: TOKEN, ...crmImages, DATA: { async get(name) { const d = docs.get(name); return d ? JSON.stringify(d) : null; }, async put() { throw new Error('écriture interdite'); } } };
const json = (res, status, obj) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((resolve, reject) => { const c = []; let n = 0; req.on('data', (x) => { n += x.length; if (n > MAX_BODY) reject(Object.assign(new Error('trop gros'), { status: 413 })); else c.push(x); }); req.on('end', () => resolve(Buffer.concat(c).toString('utf8'))); req.on('error', reject); });

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/crm/v1/')) {
      let txt = ''; if (req.method === 'POST') txt = await body(req);
      if (await handleCrm(req, res, url, txt, env)) return;
    }
    const doc = url.pathname.match(/^\/api\/doc\/([a-z0-9_]+)$/);
    if (doc) {
      const name = doc[1]; if (!allowedName(name)) return json(res, 404, { error: 'inconnu' });
      if (req.method === 'GET') return json(res, 200, docs.get(name) || { data: null, version: 0 });
      if (req.method === 'PUT') {
        if (req.headers['x-sk'] !== '1') return json(res, 403, { error: 'en-tête manquant' });
        let data; try { data = JSON.parse(await body(req)); } catch (e) { return json(res, e.status || 400, { error: 'json invalide' }); }
        if (!validDoc(name, data)) return json(res, 422, { error: 'format invalide' });
        const cur = docs.get(name)?.version || 0, base = req.headers['x-base-version'];
        if (base !== undefined && base !== '' && String(cur) !== base) return json(res, 409, { error: 'conflit', version: cur });
        const version = Math.max(Date.now(), cur + 1); docs.set(name, { data, version }); return json(res, 200, { ok: true, version });
      }
      return json(res, 405, { error: 'méthode' });
    }
    if (url.pathname === '/' || url.pathname === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(indexHtml); }
    if (url.pathname === '/chart.js') { res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' }); return res.end(chartJs); }
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    return json(res, 404, { error: 'introuvable' });
  } catch (err) { console.error(err); if (!res.headersSent) json(res, 500, { error: 'erreur serveur' }); }
}).listen(PORT, '127.0.0.1', () => console.log(`recette locale sur http://127.0.0.1:${PORT} · jeton CRM de test : ${TOKEN}`));
