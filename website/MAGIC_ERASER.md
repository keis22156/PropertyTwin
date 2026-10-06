# Gomme IA — sélection manuelle

Dans `/agent`, ouvrir un bien enregistré, puis **Studio IA → Gomme IA · sélectionner un objet**. La photo doit avoir été importée dans le dossier. Les URLs externes ne sont pas acceptées pour cette opération.

Le pinceau sélectionne une zone, « Effacer le masque » la désélectionne. La taille est réglable de 1 à 20 % du petit côté de la photo. Annuler/Rétablir conserve 50 opérations ; Réinitialiser est annulable. Les traits utilisent des coordonnées normalisées, limitées à 200 traits de 3 000 points chacun. Un geste interrompu est abandonné. La sélection reste en mémoire pendant l’ouverture du dialog ; fermer ou recharger avant son envoi la perd. Ce parcours est manuel : la segmentation automatique d’un objet au clic reste à construire.

L’aperçu bleu n’est pas une image générée. Dessiner ne déclenche aucun appel fournisseur. Le masque exporté reprend les dimensions de l’original orienté, jusqu’à 8 192 px par côté et 40 mégapixels. L’original n’est jamais remplacé. Après acceptation serveur, le dialog se ferme et la tâche continue pendant la navigation/recharge du dashboard. Le résultat devient une variante avec comparaison Avant/Après. Une erreur d’envoi laisse la sélection et l’instruction disponibles ; une erreur après acceptation est signalée dans le studio et rembourse le crédit réservé.

## Contrat serveur

`POST /api/agent/generate` authentifié :

```json
{
  "slug": "SLUG",
  "room": "ROOM_ID",
  "photo": "/media/IDENTIFIANT_DE_32_CARACTERES.png",
  "action": "Supprimer un objet",
  "prompt": "Retirer uniquement l’objet sélectionné",
  "mask": {"base64": "PNG_BASE64", "width": 2400, "height": 1600},
  "async": true,
  "idempotencyKey": "CLE_ALEATOIRE_16_A_128_CARACTERES"
}
```

Réponse HTTP 202 `{job}` et suivi `/api/agent/jobs?id=…`, comme les autres transformations. Un masque n’est accepté que pour cette action côté agent. Le visiteur conserve ses opérations sans masque. Le corps de génération est limité à 3 Mo ; le PNG décodé et canonique à 2 Mo. Le serveur exige un PNG opaque en niveaux de gris, non vide et de dimensions déclarées cohérentes. Il convertit les niveaux ≥128 en blanc et les autres en noir. La signature idempotente utilise ce PNG canonique : un encodage PNG différent des mêmes pixels retrouve la même tâche.

Le worker lit la photo importée depuis son disque ou Storage privé, applique son orientation EXIF et vérifie les dimensions contre le masque **avant l’appel payant**. Une différence échoue et restitue la réservation. L’original stocké garde ses octets. Les masques sont enregistrés dans les entrées privées des jobs JSON/PostgreSQL pour la reprise ; ils ne sont exposés ni dans le job API ni dans la variante publique. Ce stockage dans les snapshots augmente leur taille et doit évoluer pour des volumes importants.

## Backend d’images à connecter

Configurer `AI_ENDPOINT`, éventuellement `AI_TOKEN`, et `AI_SUPPORTS_MASK=1` seulement si le backend prend réellement en charge le contrat suivant :

| Champ | Valeur |
| --- | --- |
| `image_base64` | PNG original orienté, sans le bleu de l’aperçu |
| `mask_base64` | PNG noir/blanc, opaque, même taille |
| `mask_width`, `mask_height` | Dimensions en pixels |
| `mask_convention` | `white-edit-black-keep` : blanc à modifier, noir à conserver |
| `action` | `Supprimer un objet` |
| `quality` | `preview` |
| `user_prompt`, `instruction`, `preserve_geometry` | Intention et contraintes de conservation |

L’en-tête `Idempotency-Key` est celui du job. Le backend doit respecter cette clé et traduire la convention si son modèle utilise un masque inversé ou un canal alpha. Les formats de résultat restent ceux de [AI_JOBS.md](AI_JOBS.md). Une configuration absente/incompatible reçoit 503 avant réservation ; aucun faux résultat n’est produit. `GET /api/agent/ai-config`, authentifié, expose seulement `{configured,maskEditing}`, selon les routes effectivement disponibles.

L’administration peut aussi sélectionner l’adaptateur direct OpenAI ou Flux Fill pour cette opération, avec leurs clés côté serveur. OpenAI reçoit un masque alpha converti ; Flux Fill reçoit le masque blanc/noir. Gemini et Flux.2/Kontext ne sont pas considérés comme compatibles avec cette gomme. Un profil de secours compatible peut prendre le relais selon la politique de [AI_ROUTING.md](AI_ROUTING.md).

Coût actuel : **1 crédit** par réussite, réservation à l’envoi, remboursement unique après échec. La qualité réelle de l’inpainting et la conservation des pixels hors sélection dépendent du fournisseur ; elles ne sont pas garanties par le transport du masque. Les adaptateurs directs et leur routage sont disponibles ; la connexion réelle et la validation photographique restent à effectuer.

## Vérifications

`npm test` couvre validation/canonicalisation PNG, orientation, idempotence, crédits, erreurs, séparation agent/acheteur et cycle du dialog. `npm run test:postgres` vérifie également la persistance et le transfert à un fournisseur/Storage simulés, sur une base isolée réelle.

`VISUAL_CASES=agent-mask-desktop,agent-mask-mobile npm run verify:visual` utilise un vrai canvas Chrome, des gestes souris/tactiles émulés et une photo technique. Il contrôle pinceau/effacement, historique, export à taille originale, rejet conservant la sélection et navigation pendant la génération. Le fournisseur de test ne réalise pas une suppression d’objet : une photographie réelle, un backend compatible et Safari/iPhone restent à vérifier.
