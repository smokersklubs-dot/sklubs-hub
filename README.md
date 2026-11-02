# sklubs-hub : Pilotage des prix SKLUBS (version VPS)

Phase A2 : page de pilotage (`public/index.html`) servie par un petit serveur Node,
et magasin de documents `/api/doc/<nom>` stocké dans le schéma Postgres `hub`
(table `hub.docs`, même base que le CRM SKLUBS OS).

## Variables d'environnement (fichiers env, jamais dans le dépôt)

- `HUB_ACCESS_PASSWORD` : mot de passe d'accès (10 caractères minimum)
- `HUB_DB_HOST`, `HUB_DB_PORT`, `HUB_DB_NAME`, `HUB_DB_SCHEMA` (défaut `hub`)
- `HUB_DB_USER`, `HUB_DB_PASSWORD` : rôle `hub_app` (droits sur le schéma `hub` uniquement)
- `PORT` (défaut 8080)

## Routes

- `/` et `/chart.js` : page et script (accès protégé par mot de passe)
- `GET /api/doc/<nom>` : `{ data, version }`
- `PUT /api/doc/<nom>` : même origine, `X-SK: 1`, JSON, `X-Base-Version` pour détecter les conflits (409)
- `/health` : contrôle de vie, sans mot de passe

## Tests

Tests locaux sur une base Postgres jetable (schéma `hub`, table `docs`) :
lecture, écriture, conflit de version, validation des formats, origine, taille (413),
verrouillage après 8 échecs, et chargement de la page sans erreur CSP.
