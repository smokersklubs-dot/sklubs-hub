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

## Prix fixés et paliers personnalisés

Document `cfg_price_<produit>` (schéma 1) : `rules` (clé `[produit, variante ou format, quantité]` → prix HT),
`tiers` (paliers ajoutés dans le tableau : `[{ key, q }]`, facultatif, 2000 au plus, sans doublon) et `history` (12 entrées,
avec les paliers ajoutés ou retirés). Validation partagée par la page, le serveur (`src/docs.js`) et le moteur
(`src/crm/price-rules.mjs`). Prix servi : prix fixé exact ; sinon formule native × coefficient (prix fixé / formule)
interpolé en log(quantité) entre les paliers fixés voisins de la même série ; hors des paliers fixés (sous le plus petit,
au-dessus du plus grand) ou sans palier, formule native inchangée. Jamais sous le plancher de marge. `/api/crm/v1/catalog` liste `customTiers`
(quantité, prix HT, configuration pour `/price`) ; `/price` avec `includeInternal` expose `manualRule` et `interpolatedRule`.

## Matières Mylar hors catalogue

`src/crm/mylar-off-catalog.mjs` (copié tel quel dans la page) : matières cotées par l'usine sans formule ni format, par exemple
« Kraft + film barrière (alimentaire) » (coût usine reçu le 10/11/2026 : marchandise et fret par palier, en RMB). Le hub n'en
calcule aucun prix de vente : « Prix de vente à saisir », marge « à valider », statut « Hors catalogue… ». Lemexx fixe le prix
dans « Tarif détaillé » → « Modifier dans le tableau » (clé `["mylar","hors-catalogue",<réf>,<quantité>]`, paliers libres).
`/api/crm/v1/catalog` : la matière figure dans `materials` (`offCatalog: true`, statut, quantités cotées) et dans `offCatalog` ;
les coûts en € par pièce sont dans `internal.offCatalog` (CRM privé). `/price` avec `m` = cette matière : prix fixé exact
(`manualRule`) ou 422 « Prix de vente à saisir… ». Les routes publiques des sites ne la servent pas.
Dans la page, ces sacs ont leur propre case « Sacs Kraft » sur l'accueil (photo `public/img/mylar/kraft_barrier_01.jpg`) et leur
propre tarif, à part de la liste Mylar (265 lignes inchangées) ; le catalogue CRM donne `group` et `image` pour la matière.
## Coûts usine reçus

`src/crm/factory-quotes.mjs` (copié dans la page) : devis fournisseur par produit, en RMB, à titre d'information (fiche Cricket
de Shenzhen Creative Star, 10/11/2026, 12 lignes, 36 078 RMB). Aucun prix de vente n'en est calculé, aucun réglage (`cost0`,
formules, marges) n'est modifié, la marge reste « à valider ». La page affiche un encadré « Coût usine reçu » dans le produit
et la ligne à la quantité cotée dans « Tarif détaillé » ; un produit absent du hub est « Hors hub · tarif à saisir ».
Le moteur de prix ne lit pas ce module.

Depuis le 10/11/2026 (demande de Lemexx), le même module porte aussi le devis de VENTE Cricket (« Quotation update 10.12 », EXW,
10 058 €) : la page affiche achat et vente côte à côte avec un écart indicatif (achat converti au taux yuan du hub, sans
transport ni frais), et `/api/crm/v1/catalog` les donne dans `internal.quotes` (bloc privé du CRM, jamais sur les routes publiques).

## Liste d'achat « Mylar alimentaire (spécial) »

`src/crm/mylar-food-list.mjs` (copié dans la page) : coûts usine en USD de Hongbang Packaging (fiche reçue le 10/11/2026), fond plat
et debout avec zip et encoches, 7 paliers de 500 à 10 000. Liste séparée des prix Mylar existants, étiquette « alimentaire »,
ouverte depuis « Tarif détaillé » des sachets Mylar. Aucun prix de vente, marge « à valider ». Équivalent en euros indicatif
avec le taux USD → EUR relevé automatiquement (`exchangeUsd` dans les marchés, BCE via Frankfurter, comme le yuan). Les valeurs douteuses (`toVerify`) sont affichées « à vérifier ». Le moteur et le
catalogue CRM ne lisent pas ce module.

## Tests

`npm test` : règles de prix (palier exact, intermédiaire, hors bornes, plancher, document ancien, validation refusée),
moteur et API CRM sur documents en mémoire (14 produits, 401 sans jeton, 403 avec Origin).
`node tests/dev-server.mjs 4199` : page réelle et API CRM sur documents en mémoire, sans base ni mot de passe (recette locale).

Tests antérieurs sur une base Postgres jetable (schéma `hub`, table `docs`) :
lecture, écriture, conflit de version, validation des formats, origine, taille (413),
verrouillage après 8 échecs, et chargement de la page sans erreur CSP.
