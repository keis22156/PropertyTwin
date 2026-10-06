# Générations photo : tâches et limites

Le dashboard et l’Experience soumettent une tâche, puis suivent son état. La fermeture/recharge de la page n’interrompt pas son exécution serveur. Le résultat reste associé au bien, à la pièce, à la photo et à la session d’origine ; le retour d’une tâche ne change pas la pièce actuellement consultée.

## API

| Méthode | Route | Résultat |
| --- | --- | --- |
| POST | `/api/agent/generate` | Auth agent, `{slug,room,photo,action,prompt,async:true,idempotencyKey}` → HTTP 202 `{job}` |
| GET | `/api/agent/jobs?id=ID` | Auth agent ; tâches agent de l’agence active, filtrées par ID si présent |
| POST | `/api/generate?slug=SLUG` | Cookie visiteur, `{room,photo,action,prompt,async:true,idempotencyKey}` → HTTP 202 `{job}` |
| GET | `/api/jobs?slug=SLUG&id=ID` | Cookie visiteur ; uniquement ses tâches et `aiAllowance` |
| POST | `/api/identify?slug=SLUG` | `{name,email?,phone?,marketingConsent?}` ; un moyen de contact obligatoire, retourne `lead` et `aiAllowance` |

`GET /api/open` n’existe pas : l’ouverture reste un POST. Sa réponse contient maintenant les tâches de la session et son quota. Les anciens appels de génération sans `async:true` attendent le résultat et conservent leur réponse HTTP 201. Ils utilisent la même file et les mêmes limites ; une clé d’idempotence explicite reste recommandée. La connexion mobile au SaaS est décrite dans POSTGRES.md.

La clé est un identifiant aléatoire de 16 à 128 caractères (`A–Z`, `a–z`, chiffres, `_`, `-`). L’agence, le bien et l’auteur définissent son périmètre. Réutiliser la même clé avec les mêmes paramètres retrouve le même résultat ou échec, sans deuxième appel fournisseur ni deuxième débit. Changer les paramètres avec cette clé renvoie 409. Après un échec terminal, une nouvelle tentative explicite utilise une nouvelle clé. Le navigateur conserve la clé d’une réponse réseau perdue pour reprendre le même envoi.

Un job public contient `id`, `slug`, `room`, `original`, `label`, `status`, les dates, `creditsReserved`, `creditsCharged`, `creditsRefunded`, le budget actuel du bien et éventuellement `result` ou `message`. Il ne révèle ni la clé de reprise, ni l’ID utilisateur, ni les tokens de session, ni le masque de sélection. Le serveur conserve aussi agence, utilisateur/session, fournisseur, modèle, coût réel et durée. Modèle/coût restent `null` tant que le backend connecté ne les fournit pas ; aucun coût n’est estimé comme réel.

## Réservation et reprise

États : `queued` → `processing` → `completed` / `failed`. Chaque aperçu coûte actuellement **1 crédit**, quelle que soit l’action. Le rendu HD agent ajoute une nouvelle variante pour **2 crédits supplémentaires**, avec contrôle des dimensions et reprise : voir [HD.md](HD.md). Les tarifs par outil restent à construire. La retouche photo classique reste gratuite. Le budget par bien est partagé par les aperçus agent et acheteur ; le pool mensuel agence est une prochaine étape.

La réservation et le job sont sauvegardés ensemble avant tout appel fournisseur. Deux requêtes simultanées ne peuvent réserver le même dernier crédit. Deux appels fournisseur maximum s’exécutent simultanément dans ce processus. Une session a une seule génération active et un délai de 30 secondes entre les réussites. L’échec rembourse une seule fois et libère immédiatement la session. Rejouer la clé d’une tâche échouée ne redébite pas.

Au redémarrage, les jobs `queued` reprennent. En mode JSON, un job `processing` est marqué échoué et remboursé. En PostgreSQL, les autres workers respectent sa lease de trois minutes ; seuls les jobs expirés sont échoués et remboursés : son éventuelle facturation externe est inconnue, donc aucun second appel automatique n’est fait. La clé du job est transmise au backend d’images dans l’en-tête `Idempotency-Key` ; son respect dépend du backend. Le remboursement de crédits internes ne prétend pas annuler une facture fournisseur.

Le store atomique JSON convient à **un serveur unique avec disque persistant**. Le mode PostgreSQL fournit réservation transactionnelle, unicité des clés, claim d’un job sous verrou, attente fournisseur hors transaction et suivi entre serveurs. Voir [POSTGRES.md](POSTGRES.md). Chaque processus autorise deux appels simultanés ; la limite globale et le pool mensuel agence restent à ajouter. Les médias sur disque nécessitent encore un disque partagé entre serveurs. Le mode privé Supabase Storage et la migration sont décrits dans STORAGE.md ; le provider lit alors la source depuis Storage hors transaction.

## Acheteurs

Une session anonyme dispose de deux transformations réussies. Une session ayant un nom et un email/téléphone déclaré dispose de cinq au total, toujours plafonnées par le budget restant du bien. Les tâches en cours réservent une place ; les échecs ne consomment pas le quota. Les anciennes variantes de la session comptent aussi. Supprimer le cookie crée une nouvelle session ; le budget global du bien limite néanmoins la consommation. Aucun fingerprinting n’est ajouté et l’identité déclarée n’est pas vérifiée par email.

« Sauvegarder mon projet » crée/met à jour un lead de type `project` sans demander de visite ni déclarer d’intérêt. Répéter l’envoi ne duplique pas ce lead. Le consentement marketing est facultatif, distinct et faux par défaut. Les variantes restent attachées au cookie : ce formulaire ne fournit pas encore un lien de récupération sur un autre appareil ou un email de confirmation.

## Provider

`image-provider.mjs` expose l’interface `edit(input,{directory,jobId})`. L’adaptateur HTTP existant utilise `AI_ENDPOINT` et `AI_TOKEN`, transmet l’original local en base64 (ou une URL HTTPS), et demande de préserver l’architecture. Il accepte une image binaire, base64 ou URL HTTPS validée. Aucun résultat de démonstration n’est produit hors des tests. Les adaptateurs directs OpenAI/Gemini/Flux, le routage par outil, les profils, les switches global/acheteur et le secours après rejet connu sont implémentés ; configuration et limites dans [AI_ROUTING.md](AI_ROUTING.md). Les clés réelles et la collecte de coûts facturés restent à connecter.

La gomme agent transmet un PNG de sélection et l’original orienté au profil choisi. Le backend HTTP exige `AI_SUPPORTS_MASK=1` ; OpenAI et Flux Fill ont leur conversion/contrat de masque natif. Elle coûte un crédit comme les autres aperçus. Validation, limites, convention noir/blanc et reprise sont détaillées dans [MAGIC_ERASER.md](MAGIC_ERASER.md). Les sessions visiteur exigent un cookie opaque valide et ne peuvent jamais être associées à une session agent.
