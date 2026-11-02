# sklubs-hub

Hub de prix SKLUBS (« Pilotage des prix »), version VPS.

- Base : schéma `hub` dans la base Supabase du CRM (conteneur `sklubs-os-supabase-db`).
- Identifiants : fichier d'environnement sur le VPS, jamais dans ce dépôt.
- Phase A (en cours) : squelette, lecture de la table `hub.product_prices`.
- Phases suivantes : page de pilotage, API du CRM, veille de marché, connecteurs.
