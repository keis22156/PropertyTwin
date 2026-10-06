# Outils et presets du Studio

Le catalogue partagé `public/ai-tools.mjs` définit les 13 outils, 8 styles, 7 sols, 6 couleurs de murs et une couleur personnalisée, usages, niveaux de rénovation et ambiances de ciel. Le formulaire affiche uniquement les contrôles utiles à l’outil sélectionné. L’instruction libre est facultative pour les presets ; le prompt personnalisé exige une instruction.

Les choix restent en mémoire dans l’onglet par bien/pièce/photo, y compris après un refus de génération et après navigation dans l’éditeur. Les jobs persistants conservent les choix normalisés dans `input.options`. L’idempotence inclut ces options et l’image d’inspiration. Une option inconnue ou incompatible est refusée avant réservation d’un crédit.

Ranger garde les meubles principaux ; vider retire les éléments mobiles en conservant les finitions et équipements fixes. Sol/murs limitent explicitement leur transformation à la finition sélectionnée. Rénovation affiche « Visualisation non contractuelle » et conserve ce marqueur sur la variante. Ces instructions guident les modèles ; la qualité et la fidélité architecturale nécessitent une vérification sur des images réelles.

L’image d’inspiration est importée dans les médias de l’agence, sans ajout dans la galerie publique du bien. Elle doit être un média image appartenant à l’agence, distinct de la photo source. Le job privé conserve sa référence ; les variantes publiques n’exposent pas cette URL. Le backend lit l’original et la référence une seule fois chacun avant les tentatives fournisseur.

- OpenAI : deux éléments `images`, original puis référence, conformément à la [documentation officielle](https://developers.openai.com/api/reference/resources/images/methods/edit).
- Gemini : deux contenus image dans l’interaction, conformément à [Image generation](https://ai.google.dev/gemini-api/docs/image-generation).
- FLUX.2 Pro/Pro Preview : original dans `input_image`, inspiration dans `input_image_2`, conformément à [Image editing](https://docs.bfl.ai/flux_2/flux2_image_editing). Les modèles Kontext et Fill ne sont pas présentés comme compatibles avec cette référence.
- Backend HTTP existant : `reference_image_base64` et `reference_mime_type`. Il doit déclarer sa capacité réelle par `AI_SUPPORTS_REFERENCE=1`. Sans cette déclaration, la route est refusée avant débit. `options` et `instruction` structurent les autres presets.

Le tarif actuel reste un crédit par aperçu pour tous les outils ; les tarifs différenciés, pools agence et HD du cahier des charges restent à implémenter. La sélection automatique d’objet reste à faire ; la gomme utilise un masque manuel.
