# Médias privés et imports signés

Le mode `MEDIA_STORAGE=supabase` utilise le bucket privé `propertytwin-media`. Le registre des médias, leurs clés internes et les demandes d’import sont dans le PostgreSQL commun. Les nouvelles photos, leurs WebP responsive et les modèles GLB/USDZ passent par Storage ; aucune copie sur disque n’est requise pour leur consultation, retouche ou génération IA. Les anciens médias sur disque continuent de fonctionner tant que leur disque est accessible.

## Configuration

1. Dans le même projet Supabase, appliquer les migrations `202610050001_agencies.sql`, `202610050002_saas_data.sql`, `202610060003_media_registry.sql`, puis `202610060004_private_storage.sql`.
2. Configurer les variables backend `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `AUTH_COOKIE_SECRET`, `PUBLIC_SITE_URL`, `MEDIA_STORAGE=supabase` et `SUPABASE_SERVICE_ROLE_KEY` (clé JWT service_role, jamais la clé publique). Aucune clé privilégiée n’est renvoyée au navigateur ou à l’app.
3. Le serveur vérifie au démarrage que le bucket est privé et limité à 50 Mo. La migration fixe les types JPEG/PNG/WebP/GLB/USDZ et ajoute une politique RLS restrictive empêchant les accès directs anon/authenticated à ce bucket, même en présence d’une autre politique permissive. Les routes serveur vérifient d’abord le rôle et l’agence.
4. Configurer les variables via le shell/hébergeur ; `.env.example` n’est pas chargé automatiquement par `npm run dev`.

Le mode `MEDIA_STORAGE=disk` (ou variable absente) conserve le comportement local. Les médias déjà référencés comme Supabase exigent que ce mode reste activé ; le serveur ne prétend pas retrouver leur copie locale.

## Parcours d’import

`POST /api/v1/properties/:slug/media/upload-url` reçoit :

```json
{"type":"image/png","size":123456,"idempotencyKey":"identifiant-aleatoire-16-caracteres-ou-plus"}
```

La propriété doit exister dans l’agence active. Viewer ne peut pas importer. Types/tailles autorisés : JPEG, PNG, WebP jusqu’à 8 Mo ; GLB, USDZ jusqu’à 50 Mo. Une même clé, un même auteur et un même bien retrouvent le même import ; une autre taille/type avec cette clé renvoie 409. Limites : cinq imports simultanés par auteur, vingt par agence.

Réponse HTTP 201 : `uploadId`, `status`, `uploadURL`, `method: "PUT"`, `headers` et `expiresAt`. Le client envoie le **binaire** à cette URL, avec les headers fournis et sans cookie/Bearer SaaS (`credentials: "omit"`). Ne pas enregistrer cette URL temporaire dans une photo du bien. La [documentation Supabase des uploads signés](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) prévoit des tokens de deux heures ; le backend garde sa propre échéance de deux heures pour la demande. Il n’autorise aucun remplacement d’objet.

Puis `POST /api/v1/properties/:slug/media/complete` reçoit `{uploadId}`. Le backend prend la demande en charge avec une lease de trois minutes, libère la transaction, lit le fichier avec une taille bornée, vérifie taille/signature et décodage image ou conteneur GLB. Le contrôle USDZ vérifie actuellement signature ZIP et taille ; il ne valide pas la scène USD complète. L’objet temporaire reste non enregistré et ne possède aucune URL média publique. Une seconde confirmation en cours renvoie 409. Après interruption du worker, une demande peut reprendre à l’expiration de sa lease.

Le fichier validé est copié sous une autre clé opaque ; les images produisent aussi leurs WebP. Une transaction enregistre les médias et le résultat, puis le serveur renvoie `{url,media?}`. Les nouvelles URLs `/media/:identifiant` restent stables et compatibles avec la synchronisation iOS. Répéter une confirmation terminée retourne ces mêmes URLs. L’upload ne l’ajoute pas silencieusement à une pièce : le client associe ensuite `url` à la photo/au modèle et enregistre le dossier avec sa baseline habituelle.

Le dashboard utilise ce parcours pour les médias d’un bien. Il crée d’abord son brouillon si nécessaire et conserve les saisies. Les uploads d’identité (logo/portrait) et le client iOS existant utilisent encore `POST /api/agent/upload` en base64 ; leurs fichiers finissent également dans Storage. Les routes agent `/upload-url` et `/upload-complete` correspondent au contrat v1.

## Consultation et confidentialité

`/media/:identifiant` retrouve l’agence via le registre puis redirige vers une URL Storage signée pour **60 secondes**, avec `Cache-Control: no-store`. Aucun chemin interne, jeton de signature ou service_role ne doit être stocké dans une fiche publique. Les réponses métier contiennent uniquement les URLs stables. Les [buckets privés](https://supabase.com/docs/guides/storage/buckets/fundamentals) et les [liens signés de lecture](https://supabase.com/docs/guides/storage/serving/downloads) restent soumis à l’échéance de la signature.

La route stable conserve le modèle d’accès existant : une personne qui connaît l’identifiant opaque peut consulter ce média et demander une nouvelle signature. Elle n’est pas une permission nominative de BuyerSession et la visibilité Private d’une Experience ne révoque pas un média dont le lien a déjà été transmis. Les liens signés expirent ; les identifiants médias restent des liens de partage. Pour des documents exigeant une autorisation nominative, une route distincte reste à ajouter.

La retouche gratuite lit la vraie source Storage et écrit une nouvelle image ; l’original est conservé octet par octet. L’adaptateur IA lit également la source enregistrée via l’abstraction de stockage, hors verrou d’agence.

## Migration et entretien

Pour transférer les médias historiques d’une agence, utiliser le serveur connecté à son disque :

```sh
cd website
node scripts/migrate-media.mjs --agency=UUID_DE_L_AGENCE
```

L’import JSON historique refuse les références Storage et demandes temporaires provenant d’un autre store ; il est réservé aux données locales. Le script de migration des médias transfère uniquement les médias enregistrés sur disque, remplace leur backend dans PostgreSQL, conserve leurs URLs et tous les fichiers locaux. La lecture/upload se fait hors transaction et la référence se met à jour dans une courte transaction. Il reprend en ignorant les médias déjà dans Storage. Garder la sauvegarde locale jusqu’à la vérification des biens, plans et modèles sur le web/iPhone.

Configurer un job périodique (par exemple quotidien) avec :

```sh
node scripts/cleanup-uploads.mjs
```

Il supprime uniquement les clés temporaires connues après expiration de tous les tokens émis, avec une minute de marge. Les demandes terminées restent rejouables pendant sept jours après leur échéance ; leurs médias enregistrés sont conservés. Une interruption pendant la promotion peut laisser un objet non enregistré sous sa nouvelle clé : le rapprochement complet des objets orphelins reste à ajouter. Aucune suppression globale du bucket n’est exécutée.

## Preuves et limites

Les tests HTTP utilisent le vrai serveur PostgreSQL temporaire, le registre SQL et les routes auth/v1/mobile, avec une API Storage technique simulée. Ils couvrent fichier corrompu non enregistré, scope bien/auteur, deux confirmations concurrentes, reprise, original préservé, URL signée, upload iOS historique vers Storage et original IA lu sans disque. Les politiques du bucket sont exécutées sur les tables Storage de fixture avec une autre politique permissive, sous le rôle authenticated.

Le test DOM vérifie que le navigateur envoie le binaire sans transmettre sa session au Storage. Ce n’est pas une validation réseau du service Supabase réel. Bucket réel, CORS, limites du projet, installation/migration iPhone et provider IA réel restent à vérifier après connexion.
