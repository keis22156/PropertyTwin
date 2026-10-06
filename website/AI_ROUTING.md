# Routage des images et administration

Le Studio et l’Experience utilisent l’interface d’édition de `image-provider.mjs`. Le routeur choisit un profil par opération ; les appels spécifiques OpenAI, Gemini et Flux sont dans `image-providers.mjs`. Le backend HTTP existant reste compatible et demeure le choix initial de toutes les routes. Ajouter une clé API ne modifie pas automatiquement ce choix et ne lance aucune génération.

## Configuration

Ouvrir `/admin`, puis fournir la clé de plateforme `PLATFORM_ADMIN_TOKEN`. En développement local sans Supabase uniquement, la clé agent `ADMIN_TOKEN` est acceptée lorsque la clé plateforme n’est pas définie. En SaaS/production, les propriétaires et administrateurs d’une agence n’obtiennent aucun droit sur cette configuration globale. Les credentials de plateforme sont conservés pour l’onglet dans `sessionStorage` ; « Fermer l’accès » les efface. L’authentification nominative des administrateurs de plateforme reste à construire.

Configurer les credentials sur le serveur :

| Adaptateur | Variable | Entrée / résultat |
| --- | --- | --- |
| HTTP existant | `AI_ENDPOINT`, `AI_TOKEN`, `AI_SUPPORTS_MASK` | Contrat précédent, PNG de masque blanc à modifier |
| OpenAI | `OPENAI_API_KEY` | Références d’image et masque alpha via `/v1/images/edits` ; résultat base64 |
| Gemini | `GEMINI_API_KEY` | Image + instruction via Interactions API ; résultat image dans les étapes de sortie ; sans masque |
| Flux | `BFL_API_KEY` | Édition Flux.2/Kontext ou Fill avec masque ; soumission puis suivi du résultat |

Six profils initiaux permettent de distinguer édition précise, aperçu et gomme. Leur nom, modèle et activation sont modifiables dans l’administration. L’API permet jusqu’à douze profils. La validation refuse les URLs/endpoints, clés API et types inconnus dans cette configuration : aucun credential ne se retrouve en SQL ou dans les réponses admin. La disponibilité affichée prouve seulement la présence d’une clé/endpoint et l’activation du profil, pas sa validité, son solde ou l’accès au modèle.

Routes : Home staging pour « Meubler » côté agent ; Gomme IA pour le masque agent ; Aperçu acheteur pour toutes les transformations visiteur ; Studio agent pour ses autres opérations. La route HD peut être préparée mais les endpoints de génération du produit continuent à refuser `quality: hd` : le parcours HD et son tarif restent à implémenter.

Chaque route possède un principal et un secours facultatif distinct. Un profil désactivé, non configuré ou incompatible avec le masque est sauté avant appel. Après appel, **seul le rejet HTTP 429 lors de la soumission** autorise le secours. Un refus de modération, erreur de paramètres/authentification, réponse 5xx, image invalide ou timeout ne le déclenche pas. Après acceptation d’un job Flux, un incident de suivi/téléchargement ne lance jamais une deuxième génération. Cette politique évite de lancer automatiquement une nouvelle opération dont la première facturation est inconnue.

Activer/désactiver toute l’IA, l’IA acheteur ou un profil agit avant réservation et avant chaque tentative fournisseur. Une opération déjà envoyée au fournisseur n’est pas annulée. Les switches par agence/bien et la limite de concurrence globale restent à compléter.

## Tâches et crédits

Le serveur capture dans chaque nouvelle tâche la révision, l’opération, les profils et leurs modèles, sans credential. Modifier la route ou le modèle ne redirige pas une tâche déjà acceptée ; désactiver le profil reste respecté avant son appel. Une clé idempotente retrouve le même job même après changement de configuration. Une tâche historique sans routage utilise la configuration au moment de sa reprise.

Une source importée est lue une fois pour les deux tentatives. Le masque est contrôlé contre l’original orienté avant appel. Les tentatives sont enregistrées séparément dans le job privé avec fournisseur, profil, modèle, état, dates et code d’échec ; les succès peuvent fournir identifiant de requête et compteurs d’usage numériques. Ni les messages fournisseur bruts ni les credentials ne sont enregistrés. Les APIs job/variante publiques ne révèlent pas ces détails. Le fournisseur/modèle final est conservé sur le job. `actualProviderCost` reste `null` : aucun prix de catalogue n’est présenté comme une facture réelle.

Le principal et son secours appartiennent à une seule tâche et une seule réservation. Un aperçu coûte un crédit ; le rendu HD agent réserve un supplément de deux crédits et passe par `finalHD`, uniquement avec un profil compatible. Le remboursement après échec porte sur la réservation complète. Le pool mensuel agence et les tarifs par outil restent à construire. Voir [HD.md](HD.md). Un délai total de 120 secondes couvre les appels après lecture de la source, à l’intérieur de la lease de trois minutes. Un job `processing` expiré est remboursé plutôt que relancé ; son issue/facture externe reste inconnue. Voir [AI_JOBS.md](AI_JOBS.md).

## Persistance et API

`GET /api/admin/ai-routing`, avec Bearer plateforme, retourne `{config,profiles,storageReady}`. `PUT` reçoit `{config,baseline:revision}`. La révision augmente côté serveur et une sauvegarde basée sur un ancien état reçoit 409. La saisie reste dans le formulaire après un conflit/une erreur. Recharger récupère explicitement l’état courant. Sauvegarder cette page ne consomme aucun crédit et n’appelle aucun fournisseur.

En PostgreSQL, appliquer `supabase/migrations/202610060005_ai_routing.sql`. La table `private.ai_routing` n’est pas accessible aux rôles `anon` et `authenticated` ; seul le backend privilégié la lit/écrit. Un verrou transactionnel sérialise les révisions entre serveurs. Une table encore absente conserve le routage compatible par défaut, mais l’administration ne peut pas écrire avant la migration. `db:shared` applique sa version locale additive ; les biens restent inchangés.

En JSON local, `DATA_DIR/platform-ai.json` est écrit atomiquement avec permissions privées. Ce mode reste réservé à un serveur unique avec disque persistant. Une configuration invalide n’est pas remplacée silencieusement par les valeurs par défaut.

## Contrats fournisseurs vérifiés le 6 octobre 2026

L’adaptateur OpenAI utilise le contrat JSON d’édition et convertit le masque blanc/noir du produit en alpha : transparent à modifier, opaque à conserver. La documentation précise que le masque guide l’édition sans garantir un découpage exact. [Référence OpenAI des éditions](https://developers.openai.com/api/reference/resources/images/methods/edit), [guide des masques](https://developers.openai.com/api/docs/guides/image-generation).

Gemini reçoit l’image comme contenu et demande une sortie image, sans conversation conservée (`store: false`). L’adaptateur extrait les images des étapes `model_output` d’une interaction terminée. Il ne prétend pas prendre en charge un masque spatial. [Guide d’édition Gemini](https://ai.google.dev/gemini-api/docs/image-generation), [référence Interactions](https://ai.google.dev/api/interactions-api).

Flux suit l’URL de polling BFL renvoyée après soumission. Fill reçoit le masque blanc/noir ; Flux.2/Kontext utilisent l’image et le prompt. Le résultat signé est téléchargé immédiatement puis conservé comme image du job, car les URLs BFL expirent. La clé est envoyée seulement au service BFL, jamais au téléchargement. Les hôtes BFL/Azure de livraison sont admis ; un hôte supplémentaire exact peut être autorisé via `BFL_RESULT_HOSTS`, côté serveur uniquement. Redirects, credentials dans l’URL, port arbitraire ou polling hors BFL sont refusés. [Édition Flux.2](https://docs.bfl.ai/flux_2/flux2_image_editing), [Fill et masques](https://docs.bfl.ai/flux_1_fill).

Ces adaptateurs sont testés sur des réponses techniques contrôlées. Aucune clé réelle n’est provisionnée, aucun appel payant n’a été effectué, et la qualité immobilière doit encore être validée sur des photographies réelles avec les modèles accessibles au compte choisi.
