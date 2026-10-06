# Base commune app / SaaS

## Développement local sans comptes

```bash
cd website
npm run dev:shared
```

La base PostgreSQL permanente est dans `website/data/postgres`, les médias restent dans `website/data/media`. L’app et le dashboard passent par le même serveur API ; SwiftData sert de copie hors ligne sur l’iPhone. Aucun identifiant SQL n’est embarqué dans l’app. Le serveur charge `.env` au démarrage et écoute sur `0.0.0.0:3000` pour permettre l’accès depuis le même Wi-Fi. Le port SQL 54329 reste limité à `127.0.0.1`, avec un mot de passe aléatoire.

Les données actuelles sont importées une fois, avec sauvegarde du JSON et conservation séparée des activités sans dossier associé. `npm run db:shared` initialise/démarre seulement la base. Relancer ces commandes ne réimporte pas la sauvegarde et ne remet pas les biens à zéro. Les secrets et adresses sont dans `data/connection.txt`, privé et ignoré par Git. Ne pas supprimer `.env` ou `data/postgres` pour relancer le site.

Rebuild Xcode Debug, puis dans le dashboard ouvrir « Connecter l’iPhone ». Un lien aléatoire à usage unique expire en cinq minutes. Il transporte un code de connexion et l’origine du serveur ; l’app récupère la clé et la conserve au Trousseau après vérification. L’app confirme le serveur avant de partager ses dossiers. Une autre origine/agence déjà liée est refusée. La connexion HTTP est limitée aux adresses privées/locales en Debug ; HTTPS reste requis en Release. L’exception ATS locale suit la [documentation Apple](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking).

Ce mode est pour les tests sur le même réseau, Mac allumé. Pour synchroniser à distance, configurer le serveur HTTPS hébergé et sa base. Il ne faut pas publier cette configuration locale telle quelle. Le mode partagé sans comptes est explicitement refusé en production et ne peut pas être combiné avec Supabase Auth.

`standalone-schema.sql` crée uniquement les tables PostgreSQL nécessaires, sans simuler Supabase Auth. Utiliser ce schéma seulement pour une base neuve de développement. `db:shared` applique aussi `platform-ai-schema.sql`, une migration additive pour le routage global ; elle conserve les biens existants.

## Serveur HTTPS avec Supabase

Le serveur peut utiliser PostgreSQL lorsque `DATABASE_URL` est configuré. L’app iPhone et le dashboard passent par **ce même serveur**, avec les mêmes identités Supabase et la même agence. SwiftData reste une copie locale pour le mode hors ligne ; il ne s’agit pas d’une connexion SQL embarquée dans l’iPhone. Aucun mot de passe PostgreSQL/service-role n’est transmis à l’app.

## Configuration

1. Appliquer dans le même projet Supabase `supabase/migrations/202610050001_agencies.sql`, puis `202610050002_saas_data.sql` et `202610060003_media_registry.sql`. Pour Storage, appliquer aussi `202610060004_private_storage.sql`. Le routage configuré depuis `/admin` nécessite `202610060005_ai_routing.sql` ; la table reste privée aux credentials backend, voir [AI_ROUTING.md](AI_ROUTING.md).
2. Configurer `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AUTH_COOKIE_SECRET`, `PUBLIC_SITE_URL` et `DATABASE_URL` dans l’environnement du serveur. Le démarrage du serveur charge `website/.env` automatiquement.
3. Utiliser une connexion PostgreSQL directe ou un pooler compatible avec les transactions. Le driver n’utilise pas de prepared statements nommés. Garder le certificat vérifié ; `DATABASE_CA_FILE` peut fournir l’autorité de certification du projet. Retirer les options de requête telles que `sslmode` de l’URL, car le code configure lui-même TLS. Voir [Supabase : connexion PostgreSQL](https://supabase.com/docs/guides/database/connecting-to-postgres) et [node-postgres : TLS](https://node-postgres.com/features/ssl).
4. Héberger le SaaS sur une origine HTTPS accessible depuis l’iPhone. Dans Profil → App & site web, saisir cette origine puis le même email/mot de passe que sur le SaaS. Créer d’abord l’agence sur le web.

La connexion mobile utilise `/api/mobile/login`, `/refresh` et `/me`. Les access/refresh tokens restent dans le Trousseau iOS et sont renouvelés avant expiration. Les appels natifs envoient `X-PropertyTwin-Agency` ; le serveur vérifie son appartenance. Le cookie chiffré du navigateur conserve son comportement. Un téléphone déjà lié à une agence/serveur refuse un changement silencieux pour éviter d’envoyer ses dossiers ailleurs. Sur un compte ayant plusieurs agences, la première connexion mobile choisit la première appartenance ; le nom connecté est affiché dans Profil et il faut sélectionner cette même agence dans le dashboard. La gestion de plusieurs espaces locaux sur iPhone reste à ajouter.

## Données et transactions

Les biens, pièces, structures RoomPlan, sessions, liens, leads, variantes, données complémentaires et jobs ont leurs propres lignes SQL. Les attributs évolutifs restent en JSONB pour préserver le contrat existant. La ligne `private.workspaces` sérialise les transactions de chaque agence. Chaque requête lit l’état courant après `SELECT FOR UPDATE` ; les changements sont commités avant d’envoyer la réponse HTTP. Une erreur annule la transaction. Des [verrous PostgreSQL de ligne](https://www.postgresql.org/docs/current/explicit-locking.html) protègent notamment la réservation des crédits contre deux serveurs concurrents.

La prise en charge d’un job est commitée avant l’appel fournisseur, puis le verrou est libéré. Deux workers ne prennent pas la même tâche. Une lease de trois minutes protège les jobs processing des autres serveurs : une tâche dont la lease expire est échouée/remboursée une seule fois, sans relance payante automatique. Le provider est limité à deux opérations simultanées **par processus**, pas encore à une concurrence globale configurable. Les requêtes de génération synchrones historiques attendent hors transaction ; le web utilise toujours le suivi asynchrone.

RLS permet aux membres de lire les tables métiers de leur agence. Les mutations directes JWT sont refusées ; elles passent par le serveur qui vérifie rôle et appartenance. Les sessions, tokens de liens et clés de jobs sont dans le schéma private, sans accès anon/authenticated. La connexion serveur est privilégiée et doit rester uniquement sur le backend. Les tests exécutent les politiques avec le rôle authenticated et deux utilisateurs différents.

L’adaptateur remplace les lignes de l’agence dans une transaction ; cette première version privilégie la conservation des contrats et l’atomicité. Pour de gros volumes, il reste à passer aux écritures par entité et aux requêtes paginées. En mode disque, plusieurs serveurs doivent partager le même `DATA_DIR` pour leurs photos/GLB/USDZ. Le mode Supabase Storage et les uploads signés sont désormais décrits dans STORAGE.md. Les médias historiques peuvent être migrés en conservant leurs URLs ; le disque doit rester disponible pour ceux qui ne sont pas encore migrés.

## Import d’un espace existant

La bascule n’importe pas automatiquement les stores JSON, afin d’éviter d’associer des données à la mauvaise agence. Sauvegarder le dossier source, arrêter ses writers, créer une agence vide dans Supabase, puis exécuter :

```sh
cd website
node scripts/import-postgres.mjs --source=/chemin/vers/ancien-dossier-data --agency=UUID_DE_L_AGENCE
```

`DATABASE_URL` doit être défini dans le shell. Pour une agence déjà isolée en JSON, la source est `data/agencies/UUID`. Pour l’ancien espace partagé, c’est `data`. Le script refuse une cible contenant des données et les biens démo, copie les médias sans remplacer un fichier différent, puis écrit dans une transaction. Il conserve tous les fichiers sources. Une copie de média peut rester orpheline si l’import échoue ; elle ne devient pas accessible par le registre SQL avant le commit. Les slugs et clés de synchronisation sont conservés.

## Vérification locale

```sh
npm test
npm run lint
npm run test:postgres
```

`test:postgres` crée puis supprime un cluster PostgreSQL local isolé. Il ne lit pas `DATABASE_URL`. Définir `POSTGRES_BIN` vers les binaires PostgreSQL de la machine si nécessaire. Les contrôles couvrent normalisation RoomPlan, rollback, concurrence de deux serveurs, dernier crédit, claim de deux workers, leases, idempotence, RLS, import préservant les sources/refusant une cible occupée, et un parcours HTTP où l’API mobile crée un bien puis le dashboard le modifie dans les mêmes lignes SQL. Auth et IA restent des réponses techniques simulées ; ce n’est pas une preuve de connexion au projet Supabase réel.

La suite iOS `WebsiteSyncTests` vérifie aussi le renouvellement de session, l’agence liée et les échanges natifs. Lancer les tests avec la signature locale du simulateur activée pour accéder au Trousseau ; voir VERIFICATION.md. Le retrait des points colorés concerne l’affichage du scan, pas ses données.
