// Hub de prix SKLUBS (Pilotage des prix), version VPS.
// Phase A2 : page de pilotage + magasin de documents sur Postgres (schéma hub).
// Les identifiants sont lus dans l'environnement (fichiers env), jamais écrits dans le code.
import './env.js';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { allowedName, validDoc, getDoc, putDoc, MAX_BODY } from './docs.js';
import { checkAuth } from './auth.js';
import { consumeTicket, sessionCookie } from './sso.js';
import { crmEnv, handleCrm, bridge } from './crm/route.js';
import { marketRoute, scheduleDaily } from './market/routes.js';

const PORT = Number(process.env.PORT || 8080);
const SCHEMA = process.env.HUB_DB_SCHEMA || 'hub';
if (!/^[a-z_]+$/.test(SCHEMA)) throw new Error('HUB_DB_SCHEMA invalide');

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const indexHtml = readFileSync(path.join(PUBLIC, 'index.html'));
const chartJs = readFileSync(path.join(PUBLIC, 'chart.js'));

// Empreintes des scripts inline autorisés par la CSP (calculées depuis la page elle-même)
const scriptHashes = [...indexHtml.toString('utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => crypto.createHash('sha256').update(m[1], 'utf8').digest('base64'));

const SEC_HEADERS = {
  'Content-Security-Policy': `default-src 'none'; script-src 'self' ${scriptHashes.map((h) => `'sha256-${h}'`).join(' ')}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store',
};

const pool = new pg.Pool({
  host: process.env.HUB_DB_HOST || 'sklubs-os-supabase-db',
  port: Number(process.env.HUB_DB_PORT || 5432),
  user: process.env.HUB_DB_USER,
  password: process.env.HUB_DB_PASSWORD,
  database: process.env.HUB_DB_NAME || 'postgres',
  max: 5,
});

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SEC_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) =>
  send(res, status, JSON.stringify(obj), { 'content-type': 'application/json; charset=utf-8' });
const sendText = (res, status, text, extra = {}) =>
  send(res, status, text, { 'content-type': 'text/plain; charset=utf-8', ...extra });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        if (!failed) { failed = true; reject(Object.assign(new Error('trop gros'), { status: 413 })); }
        return; // on laisse finir l'envoi pour que la réponse 413 arrive
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

async function docRoute(req, res, name) {
  if (!allowedName(name)) return sendJson(res, 404, { error: 'inconnu' });

  if (req.method === 'GET') {
    return sendJson(res, 200, await getDoc(pool, SCHEMA, name));
  }

  if (req.method === 'PUT') {
    // anti-CSRF : même origine + en-tête personnalisé + type JSON
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const origin = req.headers.origin;
    if (!origin || origin !== `${proto}://${req.headers.host}`) return sendJson(res, 403, { error: 'origine refusée' });
    if (req.headers['x-sk'] !== '1') return sendJson(res, 403, { error: 'en-tête manquant' });
    if (!(req.headers['content-type'] || '').startsWith('application/json')) return sendJson(res, 415, { error: 'type' });

    let txt;
    try { txt = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: 'trop gros' }); }
    let body;
    try { body = JSON.parse(txt); } catch { return sendJson(res, 400, { error: 'json invalide' }); }
    if (!validDoc(name, body)) return sendJson(res, 422, { error: 'format invalide' });

    const base = req.headers['x-base-version'];
    const result = await putDoc(pool, SCHEMA, name, body, base === undefined ? null : base);
    if (result.conflit) return sendJson(res, 409, { error: 'conflit', version: result.version });
    return sendJson(res, 200, { ok: true, version: result.version });
  }

  return sendJson(res, 405, { error: 'méthode' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/health') {
      await pool.query('SELECT 1');
      return sendJson(res, 200, { ok: true });
    }

    // API serveur à serveur du CRM : jeton Bearer, avant le mot de passe d'administration.
    if (url.pathname.startsWith('/api/crm/v1/')) {
      let body = '';
      if (req.method === 'POST') {
        try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: 'trop gros' }); }
      }
      if (await handleCrm(req, res, url, body, crmEnv(pool, SCHEMA))) return;
    }

    // Accès depuis le CRM : passe signé de 60 s, usage unique, puis session du hub par cookie.
    if (url.pathname === '/sso' && req.method === 'GET') {
      const who = consumeTicket(url.searchParams.get('t'));
      if (!who) return sendText(res, 401, 'Lien d’accès expiré ou déjà utilisé : rouvrez le hub depuis le CRM.');
      return send(res, 303, '', { Location: '/', 'Set-Cookie': sessionCookie(who) });
    }

    const auth = checkAuth(req);
    if (auth === 'missing') return sendText(res, 503, "Accès fermé : le mot de passe (HUB_ACCESS_PASSWORD, 10 caractères minimum) n'est pas défini.");
    if (auth === 'locked') return sendText(res, 429, "Trop d'essais. Réessayez dans 15 minutes.");
    if (auth !== 'ok') {
      return sendText(res, 401, 'Accès privé : mot de passe requis.', { 'WWW-Authenticate': 'Basic realm="SKLUBS Tarif", charset="UTF-8"' });
    }

    const doc = url.pathname.match(/^\/api\/doc\/([a-z0-9_]+)$/);
    if (doc) return await docRoute(req, res, doc[1]);

    if (/^\/api\/(mat|matrefresh|research|market-live|market-refresh|watch-status|watch-check)$/.test(url.pathname)) {
      let body = '';
      if (req.method === 'POST') {
        try { body = await readBody(req); } catch (e) { return sendJson(res, e.status || 400, { error: 'trop gros' }); }
      }
      const base = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
      const env = crmEnv(pool, SCHEMA);
      if (await bridge(req, res, base, body, (request, u) => marketRoute(request, u, env))) return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'méthode' });
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return send(res, 200, req.method === 'HEAD' ? '' : indexHtml, { 'content-type': 'text/html; charset=utf-8' });
    }
    if (url.pathname === '/chart.js') {
      return send(res, 200, req.method === 'HEAD' ? '' : chartJs, { 'content-type': 'application/javascript; charset=utf-8' });
    }
    if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'inconnu' });
    return sendJson(res, 404, { error: 'introuvable' });
  } catch (err) {
    console.error('erreur', err.code || err.message);
    if (!res.headersSent) sendJson(res, 500, { error: 'erreur serveur' });
  }
});

server.listen(PORT, () => console.log(`hub à l'écoute sur ${PORT}`));

scheduleDaily(crmEnv(pool, SCHEMA));
