// Accès protégé par mot de passe (Basic), comme l'ancien Worker.
// Verrouillage après 8 échecs par IP pendant 15 minutes (mémoire du processus).
import crypto from 'node:crypto';
import { sha256 } from './docs.js';

const MAX_FAILS = 8;
const LOCK_MS = 15 * 60 * 1000;
const fails = new Map(); // ip -> { n, last }

export function clientIp(req) {
  // Caddy ajoute l'IP réelle en dernier dans X-Forwarded-For
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (req.socket.remoteAddress || 'inconnue');
}

function locked(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() - f.last > LOCK_MS) { fails.delete(ip); return false; }
  return f.n >= MAX_FAILS;
}

// Renvoie 'ok' | 'missing' | 'locked' | 'refused'
export function checkAuth(req) {
  const password = process.env.HUB_ACCESS_PASSWORD || '';
  if (password.length < 10) return 'missing';
  const ip = clientIp(req);
  if (locked(ip)) return 'locked';
  const h = req.headers.authorization || '';
  let ok = false;
  if (h.startsWith('Basic ')) {
    const dec = Buffer.from(h.slice(6), 'base64').toString('utf8');
    const pass = dec.slice(dec.indexOf(':') + 1);
    ok = crypto.timingSafeEqual(sha256(pass), sha256(password));
  }
  if (ok) { fails.delete(ip); return 'ok'; }
  if (h) {
    const f = fails.get(ip) || { n: 0, last: 0 };
    fails.set(ip, { n: f.n + 1, last: Date.now() });
  }
  return 'refused';
}
