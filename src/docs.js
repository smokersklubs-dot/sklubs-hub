// Magasin de documents du hub (table hub.docs), même contrat que l'ancien Worker :
// GET /api/doc/<nom> -> { data, version } ; PUT avec X-Base-Version pour éviter les écrasements.
import crypto from 'node:crypto';

export const DOCS = ['cfg_hyp', 'cfg_veille', 'cfg_gal', 'cfg_zhyp', 'cfg_zveille', 'cfg_zgal',
  'cfg_watch_manual', 'cfg_promotions', 'cfg_publications'];
export const PRODUCTS = ['mylar', 'stk', 'badge', 'pin', 'bottle', 'pen', 'lanyard', 'patch',
  'tshirt', 'cap', 'beanie', 'bucket', 'sock', 'tote'];
const PRICE_DOC = new RegExp(`^cfg_price_(${PRODUCTS.join('|')})$`);
export const MAX_BODY = 600000; // octets

export function allowedName(name) {
  return DOCS.includes(name) || /^cfg_g_[a-z0-9]{2,12}$/.test(name) || PRICE_DOC.test(name);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const validPrice = (p) => typeof p === 'number' && Number.isFinite(p) && p >= 0.001 && p <= 100000;

function validPriceDoc(product, doc) {
  if (!isObject(doc) || doc.schema !== 1 || doc.scope !== 'default') return false;
  if (!isObject(doc.rules) || Object.keys(doc.rules).length > 2000) return false;
  if (!Array.isArray(doc.history) || doc.history.length > 12) return false;
  const validKey = (k) => {
    try {
      const a = JSON.parse(k);
      return k.length <= 400 && Array.isArray(a) && a[0] === product &&
        a.every((v) => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)));
    } catch {
      return false;
    }
  };
  return Object.entries(doc.rules).every(([k, p]) => validKey(k) && validPrice(p));
}

// Validation de forme (la page revalide tout à la lecture)
export function validDoc(name, body) {
  if (!isObject(body)) return false;
  if (PRICE_DOC.test(name)) return validPriceDoc(name.slice('cfg_price_'.length), body);
  if (name === 'cfg_veille' || name === 'cfg_zveille') {
    return Array.isArray(body.list) && body.list.length <= 2000 && body.list.every(isObject);
  }
  if (/^cfg_g_/.test(name)) {
    return isObject(body.h) && Object.keys(body.h).length <= 200 &&
      Array.isArray(body.vei) && body.vei.length <= 1000 && body.vei.every(isObject);
  }
  return Object.keys(body).length <= (name === 'cfg_zgal' ? 500 : 200);
}

export async function getDoc(pool, schema, name) {
  const r = await pool.query(`SELECT data, version FROM ${schema}.docs WHERE name = $1`, [name]);
  if (!r.rows[0]) return { data: null, version: 0 };
  return { data: r.rows[0].data, version: Number(r.rows[0].version) };
}

// Écriture dans une transaction avec verrou de ligne. Renvoie { conflit, version }.
export async function putDoc(pool, schema, name, body, baseVersion) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT version FROM ${schema}.docs WHERE name = $1 FOR UPDATE`, [name]);
    const curVersion = cur.rows[0] ? Number(cur.rows[0].version) : 0;
    if (baseVersion !== null && baseVersion !== '' && String(curVersion) !== baseVersion) {
      await client.query('ROLLBACK');
      return { conflit: true, version: curVersion };
    }
    const version = Math.max(Date.now(), curVersion + 1);
    await client.query(
      `INSERT INTO ${schema}.docs (name, data, version, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (name) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = now()`,
      [name, JSON.stringify(body), version]);
    await client.query('COMMIT');
    return { conflit: false, version };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest();
