# Rendu HD depuis une variante

Dans le Studio, chaque variante d’aperçu conservée dans l’espace possède une action **Générer en HD · 2 crédits**. Une confirmation affiche le supplément avant l’envoi. Le résultat devient un enfant de la version choisie ; l’original et les aperçus sont conservés. Les variantes HD affichent leurs dimensions effectivement décodées et se téléchargent avec leurs octets d’origine. Elles peuvent servir à une nouvelle transformation d’aperçu, mais un second rendu HD identique depuis une variante déjà HD est refusé.

Le rendu reprend la composition de la variante, sans réappliquer l’opération initiale, ses presets, son masque ou sa référence d’inspiration. Le prompt demande de préserver cadrage, mobilier, matériaux, couleurs et architecture. Cela reste une génération photo IA : le respect visuel exact doit être évalué sur des photographies réelles. L’avertissement « Visualisation non contractuelle » d’une rénovation est transmis à ses enfants, y compris HD.

## Coût et file

Les prix internes sont définis dans `ai-hd.mjs` et retournés par `GET /api/agent/ai-config` : aperçu **1 crédit**, rendu HD **2 crédits supplémentaires**. Le prix est décidé côté serveur ; le client ne fournit ni tarif ni bytes source. Ce supplément n’est pas un coût API facturé. Les tarifs par outil et le pool mensuel agence restent à construire ; le budget par bien reste actuellement commun aux agents et acheteurs.

Le HD utilise la file persistante existante : réservation atomique de deux crédits, contrôle du budget entier, une clé idempotente par intention, délai de 30 secondes et remboursement unique après échec. Fermer/recharger le Studio retrouve le job ; le budget réservé puis remboursé est actualisé pendant son suivi. Un job déjà envoyé au fournisseur n’est jamais relancé automatiquement après expiration de sa lease, car sa facture externe peut être inconnue.

Le HD est réservé aux agents autorisés à modifier. Un acheteur ne peut pas contourner cette restriction avec `quality: "hd"`. Une variante d’un autre bien, d’une autre pièce, d’une autre photo ou d’un autre propriétaire n’est jamais une source. Les parents supprimés avant prise en charge échouent avec remboursement ; les sources déjà capturées restent disponibles au travail en cours.

## Configuration fournisseur

Dans `/admin`, configurer **Rendu HD** (`finalHD`) vers un profil compatible et, éventuellement, un secours compatible. La capacité est vérifiée avant réservation puis avant appel ; aucun HD n’est simulé en l’absence de fournisseur.

| Adaptateur | Requête HD |
| --- | --- |
| OpenAI GPT Image 2 / 2.5 Sunburst ou Flare, snapshots documentés compris | `quality: high`, taille explicite dérivée de la source, grand côté cible 2048 px, multiples de 16, plafond de 3 686 400 pixels ; une source carrée demande 1920 × 1920 |
| Gemini 3.1 Flash Image / 3 Pro Image, versions preview comprises | `image_size: 2K`, ratio disponible le plus proche de la source |
| Flux.2 Pro / Pro Preview | `width` et `height` explicites, mêmes dimensions cibles que ci-dessus |
| HTTP existant | `AI_SUPPORTS_HD=1`, `quality: hd`, `action: Rendu HD`, `output_width`, `output_height`, photo source en base64 et instruction de conservation ; retour binaire PNG/JPEG/WebP ou JSON `image_base64` |

Les autres modèles, notamment Kontext, Fill et Gemini Flash Lite Image, ne sont pas annoncés compatibles HD. Ajouter une clé ne prouve pas l’accès au modèle. Le profil initial HTTP reste indisponible pour le HD tant que son flag n’est pas activé et son contrat réellement implémenté.

La source doit être inline ou un média possédé. Un ancien résultat sous URL HTTPS distante reste consultable/téléchargeable selon CORS, mais le HD est explicitement indisponible ; le serveur ne télécharge pas d’URL arbitraire. Les sources de ratio hors 1:3–3:1 sont refusées sans appel fournisseur ; la réservation est remboursée.

Chaque sortie HD est limitée à 16 Mo, inspectée et décodée. Son grand côté doit mesurer au moins 1920 px et son petit côté au moins 640 px. Une petite image, une image corrompue ou une URL seule échoue et rembourse les deux crédits. Le serveur ne redimensionne pas un aperçu pour le faire passer pour un rendu HD. Les dimensions réellement obtenues sont stockées sur la variante. Un résultat accepté mais invalide ne déclenche aucun secours payant automatique.

Contrats consultés le 6 octobre 2026 : [OpenAI éditions/taille](https://developers.openai.com/api/reference/resources/images/methods/edit), [Gemini image/2K](https://ai.google.dev/gemini-api/docs/image-generation), [Flux dimensions](https://help.bfl.ai/articles/8916739058-what-aspect-ratios-and-output-dimensions-are-supported).

Les tests de contrat, file, budget, accès, validation et UI emploient des images techniques et des réponses contrôlées. Aucun fournisseur payant réel n’a été appelé. Les rendus immobiliers et leur fidélité restent à vérifier après configuration d’un compte fournisseur.
