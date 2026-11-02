// Hub de prix SKLUBS - version VPS (phase A : squelette)
// Les identifiants de base sont lus dans l'environnement (fichier env_file),
// jamais écrits dans le code.
import http from 'node:http';
import pg from 'pg';

const PORT = Number(process.env.PORT || 8080);
const SCHEMA = process.env.HUB_DB_SCHEMA || 'hub';

const pool = new pg.Pool({
  host: process.env.HUB_DB_HOST || 'sklubs-os-supabase-db',
  port: Number(process.env.HUB_DB_PORT || 5432),
  user: process.env.HUB_DB_USER,
  password: process.env.HUB_DB_PASSWORD,
  database: process.env.HUB_DB_NAME || 'postgres',
  max: 5,
});

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/health') {
      const r = await pool.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.product_prices`);
      return json(res, 200, { ok: true, produits: r.rows[0].n });
    }
    return json(res, 404, { error: 'introuvable' });
  } catch (err) {
    console.error('erreur', err.code || err.message);
    return json(res, 500, { error: 'erreur serveur' });
  }
});

server.listen(PORT, () => console.log(`hub à l'écoute sur ${PORT}`));
