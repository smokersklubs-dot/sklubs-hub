// Accès sans mot de passe depuis le CRM SKLUBS OS (bouton « Modifier les tarifs dans le hub »).
// Le CRM signe un passe de 60 s avec une clé dérivée du jeton serveur déjà partagé (CRM_API_TOKEN ici, HUB_API_TOKEN au CRM) ;
// le hub le vérifie une seule fois (nonce), puis ouvre sa propre session par cookie signé (12 h). Le mot de passe Basic reste valable.
import crypto from 'node:crypto';

const SESSION_SECONDS = 12 * 60 * 60;
const COOKIE = 'hub_session';
const used = new Map(); // nonce -> expiration (ms)

function key(label) {
  const shared = process.env.CRM_API_TOKEN || '';
  if (shared.length < 32) return null;
  const base = crypto.createHmac('sha256', shared).update('sklubs-hub-sso-v1').digest();
  return label === 'ticket' ? base : crypto.createHmac('sha256', base).update(label).digest();
}

function sign(k, payload) {
  return crypto.createHmac('sha256', k).update(payload).digest();
}

function check(k, token) {
  if (!k || typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(k, payload), given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
}

/** Passe émis par le CRM : signature, version, expiration, rôle, usage unique. */
export function consumeTicket(ticket, now = Date.now()) {
  const data = check(key('ticket'), ticket);
  if (!data || data.v !== 1 || typeof data.exp !== 'number' || data.exp * 1000 < now) return null;
  if (!['owner', 'manager'].includes(data.role) || typeof data.nonce !== 'string') return null;
  for (const [n, exp] of used) if (exp < now) used.delete(n);
  if (used.has(data.nonce)) return null;
  used.set(data.nonce, data.exp * 1000);
  return data;
}

/** En-tête Set-Cookie de la session du hub, signée avec une clé distincte de celle des passes. */
export function sessionCookie(who, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ sub: who.sub, name: who.name, exp: Math.floor(now / 1000) + SESSION_SECONDS })).toString('base64url');
  const value = payload + '.' + sign(key('session'), payload).toString('base64url');
  return `${COOKIE}=${value}; Max-Age=${SESSION_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

/** Session du hub valide ? */
export function hasSession(req, now = Date.now()) {
  const raw = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  if (!raw) return false;
  const data = check(key('session'), raw.slice(COOKIE.length + 1));
  return Boolean(data && typeof data.exp === 'number' && data.exp * 1000 >= now);
}
