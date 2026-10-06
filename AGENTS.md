# PropertyTwin

Ce dépôt contient deux projets : l’application iOS (`PropertyTwin/`, Xcode) et le SaaS (`website/`, Node.js).

## Travail web

- Les tâches SaaS concernent `website/`. Ne modifier l’app iOS que si la demande l’autorise explicitement.
- Lire `website/SAAS_REQUIREMENTS.md` pour le cahier des charges complet, puis `website/SAAS_SCOPE.md` et les sources concernées. Les documents de vérification historiques ne prouvent pas l’achèvement actuel.
- Conserver les données réelles et les fonctions existantes. Aucun jeu de démonstration en production.
- RoomPlan : consultation du scan réel uniquement ; toutes les transformations IA s’effectuent sur les photos 2D.
- Les providers non configurés doivent rester explicitement indisponibles. Ne pas simuler une génération réelle ni inventer des coûts ou des métriques.
- Les secrets, bases locales et données clients restent hors Git. Utiliser les variables d’environnement et les fichiers `.example`.
- Les sources frontend sont dans `website/public/`. `app.js` et `style.css` sont générés par `npm run build` ; modifier les sources et régénérer les bundles.

## Installation et vérification

Depuis la racine : `bash scripts/cloud-setup.sh`.

Depuis `website/` :

```sh
npm run build
npm run lint
npm test
```

Les tests HTTP utilisent des ports locaux et des données temporaires. Ils ne doivent ni utiliser une base de production ni appeler un fournisseur payant.

`npm run test:postgres` nécessite PostgreSQL local et une configuration adaptée ; `npm run verify:visual` nécessite Chrome. Xcode et les tests iOS nécessitent macOS.

`npm run dev:shared` est le parcours du Mac local pour la base commune app/web ; ne pas l’utiliser tel quel dans un environnement Cloud Linux. Voir `CLOUD.md`.
