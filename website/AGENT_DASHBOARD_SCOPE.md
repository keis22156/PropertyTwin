# Priorité : dashboard et éditeur agent

La demande utilisateur place désormais le dashboard web et l’éditeur agent avant les mini-sites. La direction graphique est une plateforme professionnelle moderne : navigation latérale, portefeuille en cartes, informations structurées, gestion des médias et performance par bien.

## Référence fonctionnelle

Sources officielles consultées le 5 octobre 2026 :
- https://nodalview.com/fr : photographie HDR, édition IA, vidéo, visites virtuelles, plans.
- https://nodalview.com/fr/logiciel-visite-virtuelle-immobilier : édition et personnalisation 360°, smart links, statistiques, capture de contacts, visites guidées, compatibilité Ricoh et Matterport.
- https://help.nodalview.com/fr/articles/9337138-diffusion-contacts-suivez-et-analysez-l-impact-des-visuels-que-vous-partagez : diffusion, origine des visiteurs, évolution des consultations et contacts.

Cette recherche décrit les grandes familles publiquement documentées, pas une preuve exhaustive de toutes les options de chaque formule Nodalview. PropertyTwin conserve son identité et ne prétend pas réimplémenter sa technologie propriétaire Smart Fusion.

| Module | État actuel |
| --- | --- |
| Vue d’ensemble | Nouveau dashboard, compteurs réels, accès portefeuille et outils |
| Portefeuille | Cartes, recherche, filtres par état, création et édition |
| Informations | Description, prix, surface, pièces, chambres, caractéristiques, DPE et crédits |
| Photos | Imports locaux/signés, pièces, couverture, réorganisation dans les deux sens, déplacement entre pièces, duplication et retrait ; Annuler/Rétablir sur les références photo avant enregistrement |
| Studio IA agent | Endpoint authentifié, variantes distinctes des visiteurs, choix photo, action/style, comparaison et gomme manuelle avec masque, historique et tâche persistante ; backend réel compatible requis |
| Routage IA | Administration `/admin` avec principal/secours par outil, profils OpenAI/Gemini/Flux/HTTP et switches global/acheteur ; clés réelles et qualité des modèles à valider |
| Plans / 3D | Liens de vrais modèles et import de plan image ; pipeline iOS RoomPlan existant |
| Vidéos / visites 360° | Gestion des URLs et documents existants ; éditeur de panoramas/hotspots et moteur vidéo à construire |
| Contacts | Recherche, filtres, export CSV, fiches prospect, étapes de suivi, notes et timeline ; intégrations CRM externes à construire |
| Diffusion | Compteurs de visites, contacts et durée ; liens personnalisés avec canal ; graphique sur 14 jours et répartition des consultations par canal |
| Identité agence | Identité commune enregistrée côté serveur, fusion des conflits et propagation aux biens liés ; gestion d’équipe à compléter |
| Retouches photo | Photo Studio local avec exposition/luminosité, contraste, ombres/lumières, balance des blancs, saturation/netteté, rotation/redressement et recadrage manuel ; historique, comparaison et amélioration automatique ; source conservée. Capture HDR séparée non construite |
| Sessions guidées, équipe et intégrations CRM | À construire ; aucune intégration externe configurée |

Le dashboard et son formulaire d’édition sont couverts par tests DOM. La revue Chrome desktop/mobile utilise désormais un serveur et un profil temporaires ; les preuves et limites figurent dans VERIFICATION.md. Les mini-sites sont conservés et ne constituent plus la priorité actuelle.

## Espace partagé avec l’app

Les biens créés dans l’app arrivent automatiquement en brouillon après configuration du serveur. Les modifications web reviennent dans l’app au premier plan. L’éditeur propose « Données app » pour les offres, mesures, variantes et coordonnées synchronisées. Aucune inscription ni compte utilisateur : une clé donne accès à l’espace serveur commun. Les détails de validation et limites figurent dans VERIFICATION.md.

La liste Contacts présente les deux moyens de contact disponibles. Sur mobile, les lignes sont affichées comme des cartes lisibles avec le bien, la demande et le statut commercial ; l’ouverture de la fiche prospect reste disponible. Ce rendu est vérifié à 390 px dans Chrome isolé.

La nouvelle portée complète SaaS est suivie dans SAAS_SCOPE.md. Supabase Auth et les rôles serveur sont préparés ; le mode PostgreSQL fournit la base commune et le mode Supabase Storage permet les uploads signés privés. La clé locale sans compte reste un mode de développement. L’éditeur Plans & 3D reçoit un RoomGeometry JSON et propose sa consultation Three.js, chargée au clic. L’import par le vrai champ fichier et les gestes sont contrôlés dans Chrome sur une structure technique. Supabase/Auth/Storage et le provider IA réels restent à connecter/vérifier ; voir POSTGRES.md et STORAGE.md.
