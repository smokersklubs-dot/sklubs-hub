// Petit « KV » (comme Cloudflare) sur PostgreSQL : table hub.kv (k text, v jsonb).
// Les documents de tarif (cfg_*) restent dans hub.docs : get() les y lit, avec leur numéro de version.
import { getDoc } from './docs.js';

export function makeKv(pool, schema) {
  return {
    async get(name) {
      if (/^cfg_/.test(name)) {
        const d = await getDoc(pool, schema, name);
        return d && d.version ? JSON.stringify(d) : null;
      }
      const r = await pool.query(`SELECT v FROM ${schema}.kv WHERE k = $1`, [name]);
      if (!r.rows[0]) return null;
      const v = r.rows[0].v;
      return typeof v === 'string' ? v : JSON.stringify(v);
    },
    async put(name, value) {
      if (/^cfg_/.test(name)) throw new Error('documents de tarif : écriture refusée ici');
      let v;
      try { v = JSON.parse(value); } catch { v = String(value); }
      await pool.query(
        `INSERT INTO ${schema}.kv (k, v, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now()`,
        [name, JSON.stringify(v)]
      );
    },
  };
}
