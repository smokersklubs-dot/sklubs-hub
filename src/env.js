// Charge un fichier d'environnement (KEY=valeur) monté sur le serveur, pour que les
// identifiants de la base ne passent ni par le dépôt ni par l'interface de Coolify.
// Les variables déjà définies dans l'environnement restent prioritaires.
import { existsSync, readFileSync } from 'node:fs';

const file = process.env.HUB_ENV_FILE || '/run/secrets/hub.env';
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
