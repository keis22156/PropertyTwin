# API web v1

Le SaaS utilise Supabase Auth lorsque `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont définis. Un client fournit son access token Supabase dans `Authorization: Bearer …`. Le serveur vérifie `/auth/v1/user`, puis l’appartenance à l’agence par une requête utilisant ce même jeton et les politiques RLS. Il ne fait pas confiance à un `agencyId` fourni dans le corps. Un navigateur utilise un cookie chiffré HttpOnly et doit fournir une origine identique pour les mutations. En développement sans Supabase, le jeton `ADMIN_TOKEN` donne accès à l’espace local existant.

Les identifiants de bien de cette version sont leurs slugs stables. JSON et erreurs sont renvoyés avec `Cache-Control: no-store` ; aucun secret serveur n’est renvoyé par `/api/auth/config`.

| Méthode | Route | Corps / réponse |
| --- | --- | --- |
| GET | `/api/v1/properties` | Liste des biens de l’agence active |
| POST | `/api/v1/properties` | Champs du bien ; crée un brouillon, retourne `{slug,url}` |
| GET | `/api/v1/properties/:slug` | `{property}` ; inclut les structures privées pour un agent autorisé |
| PATCH | `/api/v1/properties/:slug` | `{patch,baseline}` ; chaque champ modifié doit avoir une référence, `null` si absent ; retourne `{property}` |
| POST | `/api/v1/properties/:slug/floorplan` | `{floorplan,baseline:{floorplan:valeurPrécédente}}` ; un plan importé ou HTTPS avec zones normalisées |
| GET | `/api/v1/properties/:slug/roomplan` | `{roomplan}` ; géométrie de consultation, identifiants de capture remplacés |
| POST | `/api/v1/properties/:slug/media/upload-url` | `{type,size,idempotencyKey}` ; retourne le PUT signé, l’uploadId et son échéance |
| POST | `/api/v1/properties/:slug/media/complete` | `{uploadId}` ; valide puis enregistre les URLs stables du média |
| POST | `/api/v1/properties/:slug/roomplan` | `{roomplan,baseline:ancienRoomplanOuNull}` ; conserve les structures validées |
| POST | `/api/v1/properties/:slug/experience/publish` | `{}` ; vérifie au moins une photo et retourne `{property,url}` |

Les APIs `/api/agent/*` restent compatibles avec le dashboard et la synchronisation iOS existants. Les imports binaires passent encore par `POST /api/agent/upload` avec `{type,base64}`. Les imports signés et le bucket privé Supabase Storage sont disponibles avec `MEDIA_STORAGE=supabase` ; voir [STORAGE.md](STORAGE.md). Avec `DATABASE_URL`, les entités sont stockées dans PostgreSQL par agence avec transactions et RLS. Sans cette variable, le store JSON reste isolé dans `data/agencies/:agencyUUID`, pour un processus unique. Les médias utilisent le disque ou Supabase Storage selon leur registre et la configuration. Voir [POSTGRES.md](POSTGRES.md).

Les retouches gratuites passent par `POST /api/agent/photo-edit` avec `{slug,room,photo,...réglages}` et retournent une nouvelle URL sans remplacer l’original ni consommer de crédit. Le dossier doit ensuite être enregistré pour ajouter cette version à sa pièce. Les réglages, limites et codes d’erreur sont documentés dans [PHOTO_STUDIO.md](PHOTO_STUDIO.md).

Le rôle Viewer ne peut effectuer aucune mutation de ces routes. Agent peut gérer les dossiers, médias, transformations et contacts ; Owner/Admin peuvent aussi modifier l’identité commune. La gestion d’équipe/invitations reste à implémenter. Une requête sans appartenance, visant une autre agence, avec un fichier local d’une autre agence, ou basée sur une version périmée est refusée.

## Contrat RoomPlan

Le contrat réutilise le `RoomGeometry` exporté par l’app existante. Fournir un JSON `{version:1,rooms:[{room,geometry,reliableDimensions?}]}`. `room` référence une pièce existante du bien. Chaque `geometry` contient `roomIdentifier`, `walls`, `doors`, `windows`, `openings`, `floors`, `objects`, `sections`.

Une surface contient `{id,kind,width,height,depth,transform:{values:[16 nombres]},confidence,polygonCorners:[[x,y],…],parentIdentifier?,isOpen?}`. Les matrices sont affines, en ordre colonne, dans les unités métriques du scan. Les polygones sont dans le plan local de la surface. Les objets contiennent `{id,category,dimensions:[largeur,hauteur,profondeur],transform,confidence}`. Les surfaces enfants conservent leur parent pour représenter les ouvertures du mur. Le serveur ne transforme pas un USDZ arbitraire en scan et ne calcule pas des dimensions prétendument fiables.

`reliableDimensions` peut fournir `area`, `width`, `length`, `height`, uniquement lorsqu’elles ont été qualifiées par la source. Sans ce champ, aucune mesure n’est ajoutée au panneau de la pièce. Les mesures brutes restent dans la géométrie et servent au rendu. Les scans base64 du client iOS historique sont décodés lorsque leur JSON respecte ce schéma ; les données incompatibles restent conservées sans être rendues.

Les captures de pièces indépendantes sont affichées séparément : leurs coordonnées locales ne permettent pas de supposer un assemblage commun. Les structures sont en consultation, jamais en édition ou décoration 3D. La personnalisation IA utilise les photos originales.

Le mini-site reçoit seulement `hasRoomplan` à l’ouverture. Après le clic « Explorer le RoomPlan », `GET /api/roomplan?slug=…` fournit la structure à sa session visiteur. Le mode Private exige d’abord ses coordonnées, comme pour les autres APIs. La géométrie est ensuite accessible au visiteur autorisé ; les identifiants internes de capture sont remplacés. Les fichiers médias actuellement partagés restent accessibles par leur URL opaque, sans contrôle nominatif.

## Connexion Supabase

Appliquer `supabase/migrations/202610050001_agencies.sql`, puis `202610050002_saas_data.sql` pour la base commune, dans le projet choisi, puis configurer les variables de `.env.example` dans l’environnement serveur. Configurer le Site URL et autoriser `PUBLIC_SITE_URL/auth/callback` dans les URLs de redirection Supabase. Les écrans sont `/auth/signup`, `/auth/login`, `/auth/magic`, `/auth/recover` et `/auth/callback`, avec création de l’agence au premier accès. Google n’est pas raccordé.

En production, le serveur refuse de démarrer sans Supabase, un `PUBLIC_SITE_URL` HTTPS et un `AUTH_COOKIE_SECRET` durable de 32 octets hexadécimaux. Les politiques et fonctions SQL suivent les [recommandations Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Le SQL doit encore être exécuté et testé sur un projet réel ; les tests HTTP simulent les réponses Supabase Auth ; `npm run test:postgres` exécute aussi les migrations et politiques RLS sur un vrai PostgreSQL temporaire.

## Générations photo

Les APIs agent/acheteur de génération acceptent maintenant un mode asynchrone avec clé d’idempotence. Le suivi et l’identification des projets sont documentés dans [AI_JOBS.md](AI_JOBS.md). La gomme manuelle est disponible uniquement via `/api/agent/generate` avec l’action `Supprimer un objet` et un masque PNG ; voir [MAGIC_ERASER.md](MAGIC_ERASER.md). Ces mutations respectent l’agence active/le rôle ou la session visiteur, et restent distinctes de RoomPlan.

Le routage des fournisseurs est configuré via `GET/PUT /api/admin/ai-routing`, avec une autorisation plateforme séparée des rôles d’agence. Le navigateur agent/acheteur ne choisit pas directement le modèle et ne transmet aucune clé fournisseur. Contrat, révisions et snapshots des tâches dans [AI_ROUTING.md](AI_ROUTING.md).

## Sessions iPhone

`POST /api/mobile/login` reçoit `{email,password}` et renvoie `{access_token,refresh_token,expires_in}` sans cookie. `POST /api/mobile/refresh` reçoit `{refresh_token}` et renouvelle cette paire. `GET /api/mobile/me` vérifie le Bearer et expose l’utilisateur/appartenances ; `POST /api/mobile/logout` révoque la session Bearer. Ces routes sont réservées aux opérations natives ; les tokens du navigateur restent dans son cookie chiffré. L’app conserve ses credentials dans le Trousseau iOS.

Les appels natifs vers `/api/agent/*` et `/api/v1/*` fournissent `X-PropertyTwin-Agency`. Le serveur vérifie la membership au lieu d’accepter une agence arbitraire. SwiftData sert au cache hors ligne ; le flux `/sync-feed` et les mutations `/sync` lisent et écrivent les mêmes lignes que le dashboard.

## Connexion locale app / web sans comptes

`npm run dev:shared` configure une base PostgreSQL dédiée et une clé agent, sans Supabase Auth. `GET /api/agent/connection`, authentifié par clé, retourne `{database,shared,accounts}`. `POST /api/agent/pair`, authentifié, crée `{code,expiresAt,origins}`. Le code aléatoire expire en cinq minutes ; `POST /api/mobile/pair` avec `{code}` le consomme une fois et renvoie la clé qui reste au Trousseau iOS. Ce endpoint limite les tentatives par adresse et n’est disponible ni en production ni en mode Supabase. La clé n’est pas intégrée au lien ou aux assets publics. L’iPhone confirme l’origine avant la synchronisation. Le serveur charge `.env` au lancement direct ; les imports du serveur par les tests restent indépendants de ce fichier.
