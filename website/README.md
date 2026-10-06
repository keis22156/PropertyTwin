# PropertyTwin Studio et Experience

L’app iOS et le SaaS peuvent utiliser un espace PostgreSQL commun sans comptes en développement. Les parcours et limites historiques sont conservés ci-dessous.

Avec Supabase configuré, `/agent` propose la connexion professionnelle, inscription, lien email, récupération du mot de passe et création d’agence. Sans Supabase en développement, la clé locale reste disponible. Configuration : [API_V1.md](API_V1.md) et [.env.example](.env.example). Le démarrage du serveur charge `website/.env` automatiquement. Les variables exportées dans le terminal restent prioritaires.

Le backend utilise une base PostgreSQL commune lorsque `DATABASE_URL` est défini ; les migrations et la connexion iPhone au même serveur sont décrites dans [POSTGRES.md](POSTGRES.md). Supabase gère l’identité et l’appartenance en mode SaaS. `npm run dev:shared` configure à la place un espace local partagé sans comptes. Sans cette variable, le store JSON reste un mode local. Le mode Supabase Storage privé et les imports signés sont disponibles ; voir [STORAGE.md](STORAGE.md). Les médias historiques restent sur disque jusqu’à leur migration. Aucun projet Supabase réel ni provider IA réel n’est connecté ici. Le serveur de production refuse une configuration d’authentification incomplète. La plateforme SaaS complète n’est pas déclarée livrée.

Dans « Plans & 3D », importer un JSON RoomGeometry via « Importer les structures RoomPlan », puis « Explorer le RoomPlan ». Le viewer charge au clic et affiche les matrices, surfaces, ouvertures et objets reçus. Il propose rotation, déplacement, zoom, vue dessus, recentrage, plein écran, sélection d’élément et retour aux photos de la pièce. Les captures indépendantes restent séparées. Aucune dimension n’est inventée ou qualifiée automatiquement. Le mini-site accède à cette même consultation après ouverture de sa session.

`npm run build`, `npm run lint` et `npm test` vérifient le code web. Contrôle Chrome ciblé : `VISUAL_CASES=agent-roomplan-desktop,agent-roomplan-mobile,buyer-experience-desktop,buyer-experience-mobile npm run verify:visual`. Ce contrôle utilise une structure technique explicitement séparée des biens de production.

Projet web indépendant de l’app iOS. Node.js 20.19+, 22.13+ ou 24+, avec QR code et viewer 3D servis localement. Installer avec `npm ci`.

## Démarrage local

Depuis `website`, lancer `npm run dev:shared`, puis ouvrir http://localhost:3000/agent.
Si le terminal est déjà dans `website`, lancer uniquement `npm run dev:shared`. Si le dashboard PropertyTwin de cette même base occupe déjà le port, la commande le reconnaît et affiche son URL sans lancer un deuxième serveur. Un autre serveur/configuration sur ce port est signalé clairement.

Cette commande initialise PostgreSQL local (port 54329, accès SQL uniquement sur le Mac), importe une fois les données JSON, démarre la base si nécessaire puis le serveur sur le réseau local. Elle conserve `data/store.json` et `data/store.before-postgres.json`. Les anciennes activités dont le bien n’existe plus restent dans `data/legacy-unlinked-records.json`. Les prochains démarrages reprennent la même base, sans réimporter ni écraser ses modifications.

La clé du dashboard et les adresses iPhone se trouvent dans `data/connection.txt` (privé, ignoré par Git). Rebuild l’app avec Xcode en Debug. Sur l’iPhone connecté au même Wi-Fi, ouvrir le dashboard dans Safari, se connecter avec cette clé, toucher « Connecter l’iPhone », puis le lien correspondant à l’adresse du Mac. L’app présente le serveur et demande de connecter/synchroniser. Le lien expire après cinq minutes et fonctionne une seule fois. Alternative : Profil → App & site web → connexion par clé, avec l’adresse HTTP locale et la même clé. Autoriser le réseau local dans iOS.

Pour un serveur HTTPS déjà configuré, `npm start` et `npm run dev` restent disponibles. `dev:shared` refuse de remplacer un `.env` appartenant à un autre serveur.
Le chemin `/p/appartement-victor-hugo-demo` est disponible uniquement avec `ENABLE_DEMO=1` en développement. En production, aucune démonstration n’est servie. `/agent` donne accès à la publication et à l’activité, après saisie du jeton défini dans la variable d’environnement `ADMIN_TOKEN`. Ce secret doit être généré aléatoirement et conservé côté serveur. Le navigateur conserve le jeton dans sessionStorage pour la session de l’onglet ; il n’est pas intégré aux fichiers publics.

`npm test` exécute aussi des tests DOM du formulaire agent et du studio (édition, photo source, variante, intérêt). Ces tests ne remplacent pas la revue visuelle. Il vérifie les routes de publication, les QR codes, les accès privés, le retour entre plusieurs biens, les contacts et l’archivage. Un endpoint simulé vérifie aussi le contrat de génération, le débit des crédits, le rate limit et l’isolation des variantes. Ce test ne prouve pas une génération réelle. Les liens personnalisés destinés à des clients différents créent des sessions distinctes même sur le même navigateur, afin de ne pas réattribuer les variantes. Les imports sont limités aux champs publiables et rejettent les médias et zones invalides. Les données locales sont dans `data/store.json` (ignoré par Git). Ce stockage JSON convient à un processus local unique. Le mode PostgreSQL fournit les transactions entre plusieurs serveurs ; les nouveaux médias peuvent utiliser Supabase Storage ; les médias historiques sur disque restent à migrer.

## Médias et données

Dans l’onglet Photos, « Organiser la photo » permet de réordonner, dupliquer, retirer une photo ou la déplacer dans une autre pièce. La duplication ajoute une référence au même original ; retirer la photo du dossier ne supprime pas son fichier. Annuler/Rétablir couvre les 50 dernières opérations sur les photos et la couverture, y compris les imports et l’ajout d’une version retouchée, jusqu’à l’enregistrement du dossier. L’historique se réinitialise à l’enregistrement, à la réouverture ou lors de l’ajout/retrait d’une pièce. Les noms des pièces et les autres champs restent conservés pendant ces annulations. Ces opérations ne consomment aucun crédit IA ; cliquer « Enregistrer » les rend disponibles à l’app via la synchronisation commune.

« Retoucher » ouvre le Photo Studio : recadrage manuel, rotation/redressement, exposition, contraste, hautes lumières/ombres, balance des blancs, saturation et netteté. L’aperçu est local, avec Original, comparaison et Annuler/Rétablir ; l’amélioration automatique propose des corrections annulables. L’export conserve la source et n’utilise aucun crédit IA. Fonctionnement et limites : [PHOTO_STUDIO.md](PHOTO_STUDIO.md).

Le formulaire agent enregistre des brouillons et permet de modifier puis publier le même bien avec une URL stable. Il publie les caractéristiques, le branding et les pièces avec leurs photos. L’import avancé JSON permet aussi de fournir les exports du plan et de la 3D. Les photos peuvent être importées depuis l’ordinateur (JPEG, PNG ou WebP, 8 Mo maximum par image), ou référencées par des URLs HTTPS. Les imports sont stockés dans `data/media` sous des noms aléatoires. Leurs URLs sont accessibles aux personnes disposant du lien ; la protection Private du mini-site ne transforme pas les fichiers partagés en médias à accès nominatif. Champs facultatifs : `floorplan: {image: "https://…"}`, `model3d: "https://…/model.usdz"` ou `model3d: {src: "https://…/model.glb", iosSrc: "https://…/model.usdz"}`, `dpe`, `information`, `features`. Les dimensions par pièce doivent être renseignées dans `reliableDimensions` uniquement lorsqu’elles proviennent d’un scan fiable. Aucun plan ni dimension de démonstration n’est fabriqué. `floorplan.zones` peut recevoir `{room, x, y, width, height}` en pourcentages de l’image du plan ; les coordonnées doivent provenir de votre export, elles ne sont pas estimées par le site. Le studio propose toutes les photos de la pièce comme sources.

Le mode par défaut est Unlisted. Private demande nom/email, sauf lien client sécurisé ; ce formulaire identifie un prospect sans vérifier son adresse email. Les pages restent noindex par défaut. Un bien Public avec `indexable: true` et l’état Published autorise l’indexation.

## IA

Définir `AI_ENDPOINT` (HTTPS en production) et éventuellement `AI_TOKEN`. Pour une photo importée, le backend reçoit `image_base64` conformément au contrat iOS. Pour une URL externe, il reçoit `image_url`, `action`, `user_prompt`, `instruction`, `preserve_geometry`. Il doit récupérer la vraie photo source et renvoyer `image_url` HTTPS, `image_base64`, ou une réponse binaire image JPEG/PNG/WebP. Les signatures et la taille des réponses sont vérifiées avant enregistrement. Cette variante URL du contrat iOS doit être prise en charge par le backend ; aucun service IA n’est livré ni configuré ici. Les générations réservent un crédit, le remboursent en cas d’échec, et imposent 30 secondes entre demandes par session.

## Travail restant avant livraison complète

- Vérification réelle de la publication iOS et de la timeline sur un serveur HTTPS. Le service exporte la structure RoomPlan en plan PNG et le modèle USDZ réel lorsqu’ils existent.
- Vérification des zones sur un vrai export RoomPlan. Les QR codes sont générés localement après publication et pour les liens clients. Le viewer GLB/GLTF charge son script et le modèle uniquement au clic ; les USDZ ouvrent Quick Look selon les capacités du navigateur.
- Vérification des médias sur un bien réel. `media` associe chaque URL originale à `{thumbnail, sources: [{url, width}]}` pour les miniatures et srcset. Le plein écran précharge uniquement la photo suivante.
- Vérification visuelle desktop/mobile et parcours dans un navigateur.
- Durcissement serveur : validation exhaustive des imports/médias, limites globales, transactions durables des crédits, expiration/révocation des liens et sessions, déploiement HTTPS.
- Vérification du formulaire de branding, du partage de variante et des synthèses d’analytics dans le navigateur. Les liens de variantes partagées présentent uniquement les images et leur libellé. La timeline affiche les événements en français et se rafraîchit toutes les dix secondes.

Aucun déploiement externe n’a été effectué. La Buyer Experience iOS dispose désormais d’un bouton Publier, avec configuration du serveur HTTPS et du jeton agent dans le Trousseau. Ce parcours exporte les photos, caractéristiques, le vrai plan de structure et son USDZ. La timeline distante est disponible dans la même fenêtre de publication. Les dimensions sont masquées sur cet export tant que leur fiabilité n’est pas qualifiée.

## Accès agent local

Le dashboard est à http://localhost:3000/agent. Définissez `ADMIN_TOKEN` dans le terminal avant de lancer le serveur, puis saisissez la même valeur dans le champ Jeton agent. Exemple de génération locale sans secret codé en dur :

```bash
cd website
export ADMIN_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
printf '%s\n' "$ADMIN_TOKEN"
npm start
```

Conservez cette valeur dans un gestionnaire de mots de passe si vous souhaitez la réutiliser au prochain lancement. Un serveur démarré sans `ADMIN_TOKEN` refuse l’accès aux APIs agent.

## Développement web

`npm start` assemble les scripts/styles puis lance le serveur. `npm run dev` assemble les assets et relance automatiquement le serveur lorsque son code change. Après modification des sources frontend (`public/dashboard.js`, `public/experience.js` et leurs CSS), exécuter `npm run build` puis actualiser le navigateur. Les fichiers servis `public/app.js` et `public/style.css` sont assemblés ; modifier leurs sources plutôt que ces sorties.

## Synchronisation app / dashboard et partage client

Configurer une fois la même origine HTTPS et la clé du serveur dans Profil → App & site web → « Connecter et synchroniser » (également disponible dans Buyer Experience → Partager). Aucun compte utilisateur n’est créé : l’app et le dashboard accèdent au même espace serveur. L’app active synchronise les caractéristiques des biens et les photos toutes les 10 secondes ; un bien créé dans l’app apparaît en brouillon sur le web, même sans photo. Les dossiers créés sur le web sont importés dans l’app. Les géométries RoomPlan et leurs modèles USDZ sont transportés avec des clés de pièces stables. Le dashboard ouvert actualise son portefeuille, les contacts et les statistiques toutes les 10 secondes hors édition. Les brouillons restent inaccessibles aux clients. « Partager au client » enregistre le dossier, prépare automatiquement le mini-site puis propose son lien ; sur iOS, les options d’envoi s’ouvrent directement.

`POST /api/agent/sync` utilise une clé opaque stable, un patch de champs modifiés et leur état précédent. Un même dossier ne se duplique pas lors d’une nouvelle tentative. Les changements simultanés du même champ sont refusés avec 409 ; les autres champs sont conservés. Les caractéristiques sont prises dans un instantané avant les imports médias : une saisie faite pendant l’envoi reste locale et repart au cycle suivant. Si le web a également modifié un champ non envoyé, son ancienne référence est conservée pour détecter le conflit au prochain cycle. La fenêtre de partage iOS affiche le champ en conflit et permet de conserver sa version app ou dashboard. Les autres dossiers continuent à se synchroniser. Les crédits et réglages web ne sont pas remis à zéro par la synchronisation iOS. `GET /api/agent/sync-feed` fournit les dossiers au client authentifié. `POST /api/agent/prepare-share` vérifie les photos puis publie le même slug.

Ce fonctionnement nécessite un serveur commun accessible en HTTPS ; localhost sur le Mac n’est pas une adresse serveur pour l’iPhone. La synchronisation s’exécute quand l’app est ouverte ; les changements hors ligne sont envoyés lors de sa prochaine ouverture. Les propriétés propres au dashboard qui n’existent pas dans le modèle iOS restent conservées sur le serveur. Les géométries RoomPlan synchronisées sont privées et réservées aux API agent ; importer un simple plan web ne reconstitue pas un scan LiDAR. Les contacts, offres, mesures de mobilier, variantes de pièces scannées, événements, interactions et coordonnées agence/présentateur partagent aussi leurs données via `/sync-lead`, `/sync-record` et `/records`. L’onglet « Données app » permet leur édition web. Les coordonnées du présentateur sont des métadonnées, pas des comptes de connexion. Les paramètres web sans équivalent iOS restent conservés sur le serveur. Les archives de capture brutes, frames de photogrammétrie et checkpoints Gaussian Splat ne sont pas encore transférés ; les suppressions individuelles de fiches commerciales restent à raccorder. Les biens ont une corbeille réversible synchronisée ; leurs données restent conservées. Une validation réelle sur iPhone connecté au serveur HTTPS reste à faire.

## Corbeille commune app / web

Dans l’app, maintenir un bien dans le portfolio puis choisir « Mettre à la corbeille ». L’icône corbeille à côté de la recherche permet sa restauration. Sur le dashboard, l’éditeur du bien propose la même action et la navigation contient « Corbeille ». L’app ouverte relaie les retraits/restaurations au cycle suivant.

`POST /api/agent/removal` accepte `{slug, removed, baseline}`. Le serveur conserve un marqueur `deletedAt`, masque le bien dans le portfolio et rend ses liens clients indisponibles. Les photos, scans, offres et contacts restent stockés pour restauration. `sync-feed` transmet aussi les marqueurs aux appareils ; une reprise `/sync` sur un dossier retiré renvoie 410 au lieu de le recréer. Les demandes répétées sont idempotentes. Une suppression basée sur une version périmée renvoie 409, et une génération IA en cours interdit le retrait. Une restauration conserve le slug, les médias et l’état de publication précédent.

La corbeille n’efface pas définitivement les données. Sur iOS, le retrait reste local hors ligne et reprend quand la connexion revient ; l’état affiché dans Profil → App & site web signale les erreurs.

Vérification visuelle du dashboard : `npm run verify:visual` génère des captures et mesures JSON dans `verification/screenshots/` pour le portfolio, la corbeille, l’identité, les contacts, la fiche prospect, sa timeline et les statistiques mobiles. Un parcours sur les APIs crée un contact de test ; les formulaires de la fiche agent vérifient ensuite l’enregistrement d’un statut et d’une note. L’activité et sa durée sont des données de test. Le serveur et le profil navigateur sont temporaires ; les données courantes restent indépendantes. Le binaire Chrome macOS est utilisé par défaut ; variable `CHROME_BINARY` pour un autre emplacement.

## Identité d’agence partagée

Dans le dashboard : navigation « Identité de l’agence ». Dans l’app : Profil → App & site web → Coordonnées et identité de l’agence. Nom, logo, couleur, adresse, site, emails, téléphones et portrait sont stockés sur le serveur commun sans compte utilisateur. Les coordonnées de l’agence servent de contact par défaut si l’interlocuteur n’a pas d’email ou de téléphone spécifique. Les images peuvent être importées depuis le dashboard ; l’app peut modifier leurs URLs.

`GET /api/agent/workspace` et `POST /api/agent/sync-workspace` sont protégés par la même clé serveur. Le POST reçoit les seuls champs modifiés et leur état précédent ; fusion des champs distincts, refus 409 sur un champ modifié des deux côtés. L’app conserve les changements saisis pendant une requête en vol et détecte les chevauchements au cycle suivant. La page de paramètres de chaque interface permet de choisir sa valeur ou celle du serveur. Les anciens paramètres du navigateur sont repris lorsque l’espace serveur est encore vide.

Les nouveaux biens utilisent l’identité commune (`brandingMode: workspace`) et suivent ses mises à jour. L’éditeur peut choisir une présentation personnalisée (`custom`) : les modifications de l’identité commune ne remplacent alors pas ce branding. Les anciens biens conservent leur présentation existante ; leur rattachement à l’identité commune se fait explicitement dans l’éditeur. La corbeille garde le branding du retrait et adopte l’identité commune actuelle à la restauration d’un bien lié. Les métadonnées agence/profil archivées dans « Données app » restent des données synchronisées, indépendantes de cette identité de présentation.

## Éditions simultanées dans l’éditeur web

L’éditeur conserve l’état reçu à son ouverture et le transmet comme `baseline` à `/api/agent/update`. Le serveur compare les champs publiables normalisés, applique uniquement les modifications et préserve les champs changés ailleurs, notamment le prix et les crédits IA. Un même champ modifié des deux côtés renvoie 409. Le panneau de conflit permet de garder la saisie web ou la valeur synchronisée, sans perdre les autres saisies ; le choix relance l’enregistrement ou le partage demandé. Pendant l’envoi, l’éditeur bloque les nouvelles interactions pour éviter de perdre une saisie en cours. Les anciens appels `/update` sans baseline conservent leur comportement de remplacement : les autres clients doivent utiliser `/sync` ou transmettre une baseline pour bénéficier de la fusion.

## Reprise après une connexion interrompue

Les requêtes agent sont limitées à 120 secondes, ou 180 secondes pour une génération IA. Le délai couvre la requête et la lecture de sa réponse. En cas d’expiration, l’éditeur rend la main, garde ses champs et affiche « Enregistrement à reprendre ». Une expiration ne prouve pas que le serveur n’a rien enregistré.

Un nouveau bien web utilise désormais une clé opaque stable pour sa création via `/api/agent/sync`. Lors d’une reprise dans le même éditeur, il recherche cette clé dans les biens du serveur avant de créer ; si le dossier existe déjà, la suite utilise `/update` avec l’instantané du dernier envoi. Cela conserve les saisies faites après l’échec et la détection des conflits. La clé de création et l’instantané restent en mémoire dans l’onglet ; ils ne constituent pas un compte utilisateur ni une sauvegarde hors ligne persistante. Les anciens endpoints `/draft` et `/publish` restent disponibles pour les clients existants.

## Import et retouche des photos

Le dashboard bloque les interactions et l’enregistrement pendant les imports de fichiers. Un lot de photos marque chaque succès comme une modification à conserver : si un fichier suivant échoue, les précédents restent dans leur pièce et peuvent être enregistrés. Les photos sont rattachées à la pièce capturée au début de l’import.

La retouche capture le dossier et les réglages au lancement, protège son dialog jusqu’au retour de la requête et ajoute une nouvelle photo sans remplacer l’original ni sa sélection de couverture. Les appels bénéficient du délai de reprise réseau décrit ci-dessus. L’agent enregistre ensuite le dossier pour synchroniser la nouvelle photo. Ces opérations sont des retouches déterministes, indépendantes de la génération IA.

## Génération IA pendant la navigation

Le Studio garde une génération en cours par bien dans l’onglet. L’agent peut consulter les autres vues pendant le traitement ; le retour de la transformation reste associé au slug, à la pièce et à la photo capturés au départ. Si une autre photo est sélectionnée entre-temps, le résultat rejoint la liste de versions et ne remplace pas son aperçu. Les erreurs restent rattachées au bien concerné.

`/api/agent/generate` renvoie aussi les crédits restants du bien. Le dashboard adopte ce solde pour une valeur non modifiée et conserve une saisie de crédits en cours, qui peut alors produire un conflit explicite à l’enregistrement. Une réponse tardive de la liste de variantes ne supprime plus une transformation récemment reçue. Le suivi des générations est en mémoire ; une fermeture ou un rechargement de l’onglet ne constitue pas une reprise persistante de la requête.

### Parcours client vérifié dans Chrome

`VISUAL_CASES=buyer-experience-desktop,buyer-experience-mobile npm run verify:visual` vérifie le lien personnalisé, la galerie (geste tactile émulé sur mobile), la transformation, la sauvegarde et l’intérêt transmis à l’agence. Le serveur et le navigateur sont isolés, avec images techniques et provider IA local simulé. Les captures et rapports se trouvent dans `verification/screenshots/`. Pour tout vérifier, lancer la commande sans `VISUAL_CASES`. Ce contrôle ne remplace pas la démonstration sur téléphone avec un vrai logement et un provider IA réel.

Le bouton « Partager » d’une version utilise le partage natif lorsqu’il est disponible, puis le presse-papiers en secours. Si la copie est refusée, un dialog affiche le lien sélectionnable ; une erreur de création du lien permet de réessayer. L’annulation du partage natif ne lance pas de copie. La page partagée contient uniquement les deux images et leur description, sans les coordonnées ni l’activité du visiteur. Le contrôle Chrome client couvre le dialog de secours et l’ouverture publique de cette page.

Les demandes client (visite, rappel, question, intérêt) conservent leurs coordonnées, disponibilités et message dans le dashboard. Le niveau d’intérêt est envoyé uniquement pour une demande d’intérêt. La fiche prospect nomme explicitement le type de demande. Pendant l’envoi, une seconde soumission est bloquée ; en cas d’échec, les saisies restent disponibles pour réessayer. Le contrôle Chrome client vérifie les quatre demandes et ouvre la fiche de visite côté agence.

### Accès privé sans compte

En mode Private, le lien général demande nom/email avant d’afficher le logement. Le visiteur retrouve l’accès et ses coordonnées pendant sa session, y compris après rechargement. Une erreur réseau conserve la saisie pour réessayer. Si l’agent passe en privé un bien déjà ouvert anonymement, la même session doit d’abord être identifiée. Le compteur de durée commence à l’accès au logement. Il s’agit de coordonnées déclarées, sans vérification par email.

Contrôle Chrome isolé : `VISUAL_CASES=buyer-private-desktop,buyer-private-mobile npm run verify:visual`. Le lien personnalisé d’un client identifié permet toujours l’ouverture directe.

### Images adaptées au mobile

Les nouveaux imports PNG/JPEG/WebP et les retouches produisent automatiquement des versions WebP de 320 à 1920 px, sans agrandissement ni recadrage. Le serveur conserve l’original pour le plein écran et l’IA, et associe les sources au mini-site sans configuration supplémentaire dans l’app ou le dashboard. Le hero utilise la largeur de l’écran ; les petites miniatures utilisent un format adapté. L’orientation EXIF est corrigée sur les versions d’affichage. Les anciens uploads et les URLs HTTPS externes conservent leur comportement précédent. Le traitement ajoute du temps à l’upload et de l’espace disque pour les fichiers générés.

Les parcours Chrome acheteur écrivent les sources effectivement sélectionnées et leurs poids dans `verification/screenshots/*-images.json`. Les mesures portent sur une image technique, pas sur une photographie immobilière ou une connexion mobile réelle.

Le client peut continuer à changer de pièce ou de photo pendant une génération. Le résultat reste lié à la photo demandée et rejoint « Ma version du logement » ; il ne remplace pas une autre vue choisie entre-temps. « Revoir ma version » ouvre explicitement la pièce et sa comparaison. La galerie et le Studio restent sur la même pièce. Une génération simultanée est permise dans la page. Le contrôle Chrome retarde le provider local simulé pour vérifier ce parcours.

La consultation du plan remonte lorsque son image chargée devient visible, sans exiger un zoom. Elle est comptée une fois par ouverture de page. Le contrôle Chrome acheteur mesure le centrage et les zones sur un plan technique, teste zoom, déplacement et recentrage, puis sélectionne une pièce et retrouve son événement dans la fiche agent. La correspondance sur un export RoomPlan réel et les gestes de téléphone restent à vérifier.

Sur le plan, glisser ou pincer fonctionne aussi sur les zones des pièces. Un simple toucher ouvre toujours la pièce ; les gestes de déplacement/zoom ne la sélectionnent pas. Le pincement garde le point visé sous les doigts et le déplacement peut continuer avec un doigt après le pincement. Les contrôles Chrome mobiles utilisent des gestes tactiles émulés ; un essai sur téléphone avec un vrai scan reste nécessaire.

### Modèles 3D importés

Dans Plans & 3D, l’agent peut importer un GLB autonome ou un USDZ, jusqu’à 50 Mo. Le serveur conserve les octets du modèle ; les contrôles GLB portent sur son conteneur et ses ressources intégrées. Les URLs HTTPS GLB/GLTF restent disponibles. Un GLTF composé de plusieurs fichiers n’est pas accepté par le sélecteur d’import : fournir une URL hébergée ou un GLB autonome.

Le client charge le viewer et le fichier au clic. Un état de chargement et un bouton de reprise gèrent les erreurs ; la reprise des GLB hébergés par PropertyTwin contourne le cache du chargement échoué. Les reprises des URLs externes/signées et Quick Look sur iPhone restent à vérifier. Les URLs externes sont conservées telles quelles.

Les contrôles Chrome utilisent un cuboïde technique et un renderer logiciel dans un profil temporaire ; les captures 3D ne sont pas celles d’un scan de logement et ne mesurent pas les performances d’un téléphone.

### Tâches IA et projet acheteur

Les générations survivent au rechargement : la page retrouve le job puis sa variante sans relancer l’opération. Une réservation persistante protège le budget, une clé empêche les doublons et un échec restitue le crédit. Les aperçus coûtent actuellement un crédit ; pas de qualité HD. Les visiteurs disposent de deux générations anonymes, puis cinq au total après coordonnées, dans la limite du budget du bien. « Sauvegarder mon projet » crée un contact sans demander automatiquement de visite. Le consentement marketing reste séparé.

Voir [AI_JOBS.md](AI_JOBS.md) pour le contrat et la politique de reprise, et [POSTGRES.md](POSTGRES.md) pour les workers PostgreSQL. Le pool mensuel agence et la limite globale de concurrence restent à implémenter.

Les uploads signés du dashboard et les médias privés sont décrits dans [STORAGE.md](STORAGE.md), avec migration des anciennes URLs et nettoyage des imports temporaires. Leur connexion à un projet Supabase réel reste nécessaire.

### Gomme dans le studio agent

Ouvrir un bien enregistré, sélectionner sa photo dans Studio IA puis « Gomme IA · sélectionner un objet ». Pinceau, effacement, historique et reset servent à dessiner le masque ; l’envoi crée une tâche persistante à un crédit sans remplacer l’original. Une erreur d’envoi conserve la sélection. Utiliser un backend HTTP compatible avec `AI_SUPPORTS_MASK=1`, ou un profil OpenAI/Flux Fill direct ; la suppression réelle nécessite les credentials et le routage correspondant. Le contrat est dans [MAGIC_ERASER.md](MAGIC_ERASER.md).

### Administration du routage IA

`/admin` configure le principal et le secours par outil, les modèles et les activations globales/acheteurs. Les adaptateurs directs OpenAI, Gemini et Flux sont disponibles avec leurs clés backend ; le backend HTTP reste le choix par défaut. La configuration utilise la même base PostgreSQL, une révision évite les écrasements et les tâches conservent leur modèle. Aucune génération n’est lancée depuis cette page. Accès, migration 005, variables et limites dans [AI_ROUTING.md](AI_ROUTING.md). Les autres écrans admin/FinOps et le rendu HD restent à construire.
