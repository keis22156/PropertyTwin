# Photo Studio — retouches gratuites

Dans le dashboard `/agent`, ouvrir un bien enregistré → Photos → Retoucher. Les photos importées (JPEG, PNG, WebP) sont disponibles à gauche ; une URL externe doit d’abord être importée dans le dossier. Les réglages sont appliqués dans le navigateur sur un aperçu de 960 px maximum. Le fichier source enregistré reste intact.

## Réglages

| Outil | Action |
| --- | --- |
| Exposition | Gain de −2 à +2 EV |
| Luminosité | Multiplicateur de 50 à 150 % |
| Contraste | Courbe autour du gris moyen, de −50 à +50 |
| Hautes lumières / Ombres | Courbes pondérées par la luminance, sans génération de contenu |
| Température / Teinte | Correction chaud/froid et vert/magenta ; balance des blancs automatique disponible |
| Saturation | 0 à 200 % |
| Netteté | Accentuation locale limitée, 0 à 100 |
| Rotation | 0°, 90°, 180°, 270° ; l’orientation EXIF du fichier est appliquée d’abord |
| Redresser | −15° à +15°, avec zoom automatique pour éviter les marges vides |
| Recadrer | Rectangle tracé à la souris ou au toucher ; libre, 4:3, 16:9 ou carré |

Annuler/Rétablir conserve les 50 derniers réglages par photo pendant l’ouverture du studio. Changer de photo puis y revenir retrouve ses réglages. Fermer le studio efface cet historique de travail. « Original » montre la source entière ; « Avant / Après » compare la source et les corrections avec la même rotation et le même cadrage, afin de comparer les mêmes pixels.

« Amélioration automatique » analyse la distribution de luminance et les zones proches du gris sur l’aperçu. Elle propose une correction prudente de l’exposition (±0,6 EV maximum), des ombres/hautes lumières et de la balance des blancs, avec une netteté légère. Elle conserve le cadrage et le redressement. Les corrections restent réglables et annulables. Cette heuristique ne récupère pas des détails déjà perdus par saturation, ne remplace pas une capture HDR et ne crée aucun élément du logement. Sa qualité reste à apprécier sur les photos réelles.

## Sauvegarde

« Créer la version retouchée » appelle `POST /api/agent/photo-edit` avec `slug`, `room`, `photo` et les réglages. Le serveur exige une photo importée dans la pièce du bien de l’agence active. Les paramètres sont validés ; un Viewer ne peut pas retoucher. `cropRect` contient `{x,y,width,height}` entre 0 et 1, dans le repère après rotation ; largeur/hauteur minimales 0,05. Le serveur vérifie de nouveau l’association à la pièce avant de confirmer. Une photo retirée/déplacée pendant le traitement provoque 409.

Le même moteur de pixels sert à l’aperçu et à l’export. Le fichier exporté est un WebP qualité 92, limité à 4096 px sur le côté long et 12 millions de pixels avant recadrage ; l’original peut aller jusqu’à la limite d’import de 40 millions de pixels. La netteté/interpolation peut différer visuellement entre aperçu réduit et export. Le moteur ne gère pas un flux RAW, une chaîne colorimétrique d’impression ni une correction de perspective verticale.

Le rendu complet fonctionne dans un worker distinct du serveur HTTP, avec un délai maximum de 60 secondes. Deux retouches peuvent être actives par processus serveur ; la troisième reçoit 429. Lecture Storage, rendu et préparation du nouveau fichier se font hors transaction d’agence ; seul l’enregistrement du média utilise une courte transaction. La limitation n’est pas globale entre plusieurs instances.

La réponse 201 comprend l’URL, les déclinaisons responsive, `original`, les `settings` normalisés et les dimensions. Le studio ajoute cette nouvelle photo à sa pièce ; cliquer ensuite « Enregistrer » sauvegarde le dossier commun à l’app et au web. L’original et les crédits restent inchangés. Un échec de chargement peut être réessayé ; un échec de sauvegarde conserve les réglages dans le studio. Les fichiers créés lors d’une promotion interrompue peuvent rester orphelins dans le Storage privé, comme les autres uploads ; voir STORAGE.md.

## Vérification

Tests de pixels/EXIF, worker, API, DOM et deux parcours Chrome desktop/mobile : détails dans VERIFICATION.md. Les essais Storage utilisent une fixture HTTP et PostgreSQL réel temporaire. CORS du bucket Supabase réel, Safari/iPhone et qualité sur de vraies photos immobilières restent à vérifier.
