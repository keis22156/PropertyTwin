Tu vas maintenant continuer et compléter uniquement **l’application web SaaS PropertyTwin**.

IMPORTANT :
- ne travaille PAS sur l’application iOS pour l’instant ;
- l’application iOS existe séparément et enverra plus tard ses données au SaaS ;
- inspecte entièrement le projet web existant avant toute modification ;
- conserve ce qui fonctionne ;
- améliore l’architecture sans casser l’existant ;
- implémente réellement les fonctionnalités ;
- aucune fausse donnée en production ;
- compile, lint et teste régulièrement ;
- corrige les erreurs avant de continuer.

# PÉRIMÈTRE 3D

Nous conservons UNE fonctionnalité 3D :

**l’affichage du rendu RoomPlan envoyé par l’application iOS.**

Le SaaS web doit pouvoir recevoir et afficher :

- structure RoomPlan ;
- pièces ;
- murs ;
- portes ;
- fenêtres ;
- ouvertures ;
- dimensions ;
- objets RoomPlan lorsque disponibles ;
- modèle/export compatible envoyé par l’iPhone.

Créer une vue 3D RoomPlan simple permettant :

- rotation ;
- zoom ;
- déplacement ;
- reset camera ;
- fullscreen ;
- sélection éventuelle d’une pièce ;
- affichage du nom d’une pièce ;
- affichage des dimensions disponibles.

Cette vue est uniquement destinée à **consulter le logement tel qu’il a été scanné**.

NE PAS construire :

- édition 3D ;
- déplacement de murs en 3D ;
- ajout de meubles 3D ;
- génération IA 3D ;
- décoration 3D ;
- rendu photoréaliste 3D ;
- Gaussian splatting ;
- NeRF ;
- reconstruction photoréaliste ;
- configurateur 3D ;
- moteur de jeu.

Toute la personnalisation du logement se fait sur les **PHOTOS 2D avec l’IA**.

---

# 1. VISION PRODUIT

PropertyTwin est un SaaS B2B immobilier permettant aux agences de :

1. recevoir les biens/scans depuis l’app iPhone ;
2. gérer leurs propriétés ;
3. recevoir les photos ;
4. recevoir le RoomPlan ;
5. afficher le plan 2D ;
6. afficher le RoomPlan en 3D ;
7. améliorer les photos ;
8. effectuer des transformations IA ;
9. produire différents contenus marketing ;
10. générer un mini-site unique pour chaque bien ;
11. envoyer ce mini-site aux prospects ;
12. permettre aux prospects de personnaliser les photos ;
13. récupérer les leads ;
14. suivre leur comportement ;
15. comprendre leur niveau d’intérêt.

Le produit possède deux grandes parties :

## PROPERTYTWIN STUDIO

Espace professionnel agence.

## PROPERTYTWIN EXPERIENCE

Mini-site unique envoyé au prospect pour un logement précis.

---

# 2. STACK WEB

Utiliser une stack moderne.

Préférence :

Next.js récent

App Router

React

TypeScript strict

Tailwind CSS

Supabase

PostgreSQL

Supabase Auth

Supabase Storage

Supabase Realtime si pertinent

Stripe

OpenAI / Gemini / Flux via architecture Provider

PostHog si nécessaire

Resend pour emails

Sentry pour erreurs.

Pour RoomPlan 3D :

utiliser une solution web légère telle que Three.js ou Babylon.js uniquement pour afficher le modèle reçu.

Choisir la solution la plus simple et robuste.

---

# 3. DESIGN SYSTEM

Créer une identité premium PropertyTwin.

Inspiration niveau de finition :

Apple

Linear

Airbnb

Stripe

Arc.

Pas de copie.

Éviter :

- gros gradients ;
- violet IA cliché ;
- doré ;
- dashboard générique de template ;
- cards partout ;
- interface surchargée.

Direction :

blanc cassé

gris chauds

noir

accent bleu PropertyTwin

grande qualité typographique

animations discrètes

responsive parfait.

Dark Mode complet.

---

# 4. AUTHENTIFICATION

Créer :

Sign up

Login

Magic Link

Forgot password

Google éventuellement

Onboarding agence.

Même compte prévu à terme pour l’app iOS.

---

# 5. MULTI-TENANT

Créer :

Agency

User

AgencyMember

Role.

Roles :

Owner

Admin

Agent

Viewer.

Sécurité Supabase RLS correcte.

Une agence ne doit jamais voir les données d’une autre agence.

---

# 6. ONBOARDING

Première connexion :

Nom agence

Logo

Nom/prénom

Téléphone

Email

Taille équipe

Couleur marque.

Puis :

`Créer mon premier bien`

ou

`Synchroniser depuis PropertyTwin iPhone`.

---

# 7. NAVIGATION

Sidebar :

Accueil

Biens

Studio

Leads

Analytics

Équipe

Crédits

Paramètres.

Bouton :

`+ Nouveau bien`

---

# 8. DASHBOARD

Afficher :

Biens actifs

Vues PropertyTwin Experience

Prospects

Demandes de visite

Transformations IA

Crédits disponibles.

Ajouter :

Activité récente

Biens les plus consultés

Prospects très engagés

Actions rapides.

---

# 9. BIENS

Page `/properties`.

Grid/List.

Chaque bien :

photo

adresse

prix

surface

pièces

statut

agent

vues

leads.

Filtres :

Tous

Brouillons

Publiés

Archivés

Agent

Ville.

Recherche.

---

# 10. FICHE BIEN

Page :

`/properties/[id]`

Header :

photo

adresse

prix

surface

statut.

Actions :

Prévisualiser

Publier

Partager

Modifier.

Navigation interne :

Aperçu

Photos

AI Studio

Plan

RoomPlan 3D

Experience

Leads

Analytics.

---

# 11. SYNCHRONISATION IOS FUTURE

Préparer dès maintenant l’API.

Créer :

`/api/v1`

Endpoints prévus :

GET /properties

POST /properties

PATCH /properties/:id

POST /properties/:id/media/upload-url

POST /properties/:id/roomplan

POST /properties/:id/floorplan

GET /properties/:id

POST /properties/:id/experience/publish.

Créer documentation OpenAPI ou documentation claire.

Signed upload URLs pour fichiers lourds.

---

# 12. ROOMPLAN

Le backend doit pouvoir recevoir depuis l’application :

RoomPlan JSON

plan 2D

fichier spatial compatible

metadata des pièces.

Créer :

RoomPlanAsset

Room

Wall

Opening

Door

Window

Dimension.

Stocker autant que possible les informations structurées.

---

# 13. ROOMPLAN 3D VIEWER

Créer une section :

`Vue RoomPlan`

Afficher le modèle scanné.

Fonctions :

Orbit

Zoom

Pan

Reset

Fullscreen

Vue dessus si utile

Sélection d’une pièce.

Lorsqu’une pièce est sélectionnée :

Salon

18,7 m²

Largeur disponible si connue

Longueur disponible si connue.

Ne jamais inventer une dimension.

---

# 14. PLAN 2D

Afficher le plan généré depuis RoomPlan.

Fonctions :

Zoom

Pan

Afficher/masquer dimensions

Sélectionner pièce.

Cliquer sur une pièce doit pouvoir afficher :

nom

surface

photos associées.

---

# 15. LIEN PLAN ↔ PHOTOS

Créer une interaction intéressante.

Exemple :

L’utilisateur clique :

`Salon`

sur le plan.

PropertyTwin affiche immédiatement :

Photos du salon

Versions IA

Dimensions

RoomPlan correspondant.

---

# 16. MEDIA LIBRARY

Bibliothèque photos complète.

Organisation par pièces.

Salon

Cuisine

Chambre 1

Chambre 2

etc.

Actions :

Upload

Réorganiser

Déplacer

Définir couverture

Supprimer

Dupliquer

Modifier.

---

# 17. PHOTO STUDIO

Créer un éditeur professionnel.

Layout :

photos à gauche

image principale au centre

outils à droite.

Top bar :

Undo

Redo

Original

Before/After

Save.

---

# 18. RETOUCHES GRATUITES

Ne doivent pas consommer de crédits IA.

Crop

Rotation

Straighten

Exposure

Brightness

Contrast

Highlights

Shadows

Temperature

White Balance

Saturation

Sharpness.

Exécution locale/browser lorsque possible.

---

# 19. AUTO ENHANCE

Bouton :

`Amélioration automatique`

Corriger naturellement :

exposition

ombres

highlights

balance des blancs

netteté.

Objectif :

photo immobilière naturelle.

---

# 20. AI STUDIO

Créer une section très premium.

Outils :

Meubler

Vider

Ranger

Supprimer

Changer sol

Changer murs

Rénover

Changer style

Changer usage pièce

Ciel

Day to Dusk

Image inspiration

Prompt personnalisé.

---

# 21. HOME STAGING

Choix pièce :

Salon

Cuisine

Chambre

Bureau

Salle à manger

etc.

Styles :

Contemporain

Japandi

Scandinave

Minimaliste

Parisien

Industriel

Classique

Méditerranéen.

---

# 22. VIDER UNE PIÈCE

Deux modes :

Ranger

Vider complètement.

Conserver :

architecture

portes

fenêtres

sol

murs

perspective.

---

# 23. MAGIC ERASER

Créer masque interactif.

Brush

Erase

Undo

Reset.

Puis :

`Supprimer l’objet`

Envoyer image + masque au backend.

---

# 24. SÉLECTION INTELLIGENTE

Permettre :

clic sur objet

→ segmentation automatique

→ sélection.

Exemple :

canapé

table

lit

voiture

personne.

Puis :

Supprimer

ou éventuellement remplacer.

Masque manuel en fallback.

---

# 25. CHANGER LE SOL

Presets :

Chêne clair

Chêne foncé

Point de Hongrie

Béton ciré

Pierre

Carrelage

Moquette.

---

# 26. CHANGER MUR

Presets :

Blanc cassé

Beige

Greige

Vert olive

Bleu

Gris chaud.

Color picker.

Wallpaper si pertinent.

---

# 27. TRANSFORMER USAGE

Exemples :

Chambre → Bureau

Chambre → Chambre bébé

Chambre → Dressing

Pièce vide → Salle de sport

Salon → Salle à manger.

---

# 28. RÉNOVATION

Modes :

Refresh

Standard

Premium.

Selon pièce :

Cuisine

Salle de bain

Salon

Chambre.

Ajouter :

`Visualisation non contractuelle`.

---

# 29. IMAGE D’INSPIRATION

Photo originale

+

image inspiration.

Demander au modèle de reprendre :

ambiance

palette

mobilier

style

sans modifier inutilement l’architecture.

---

# 30. PROMPT LIBRE

Champ :

`Décrivez votre idée`

Exemple :

“Transforme cette chambre en bureau moderne avec bibliothèque en bois clair.”

---

# 31. BEFORE / AFTER

Slider interactif.

Original ↔ Résultat.

Responsive et tactile.

---

# 32. VARIANTES

Chaque génération crée une variante.

Arborescence :

Original

→ Japandi

→ Japandi + parquet

→ Japandi + murs beige.

Conserver historique.

Permettre :

favori

rename

delete

download

HD render.

---

# 33. IA PROVIDER ROUTER

Créer abstraction :

ImageEditingProvider.

Providers :

OpenAIProvider

GeminiProvider

FluxProvider.

Le reste de l’application ne doit pas dépendre directement d’un modèle.

---

# 34. ROUTING

Pouvoir configurer :

Home staging → modèle premium

Magic Erase → modèle précis

Buyer Preview → modèle rapide

Final HD → modèle premium

Fallback → second provider.

Configuration dans admin.

---

# 35. CRÉDITS

Créer monnaie interne PropertyTwin.

Exemple :

Retouche locale = 0

Wall/Floor = 1

Erase = 1

Declutter = 1

Empty Room = 2

Style = 2

Home Staging = 3

Renovation = 3

HD = supplément.

---

# 36. BUDGET AGENCE

Chaque plan possède un pool mensuel.

Exemple :

Solo

Agency

Pro.

Afficher consommation.

---

# 37. BUDGET ACHETEUR

Chaque bien possède son propre budget IA.

Exemple :

Appartement Victor Hugo

Buyer AI budget :

50 crédits.

Une fois atteint :

bloquer automatiquement les nouvelles générations acheteurs.

Ne jamais permettre de consommation illimitée.

---

# 38. LIMITES BUYER

Exemple :

Visiteur anonyme :

2 générations.

Lead identifié :

+3 générations.

Puis :

limite atteinte.

---

# 39. PREVIEW VS HD

Buyer Experience :

génération optimisée web/mobile.

Agent :

possibilité de demander :

`Générer en qualité HD`.

Éviter de payer inutilement une génération très lourde pour chaque test.

---

# 40. AI USAGE

Enregistrer chaque opération :

agencyId

propertyId

userId

buyerSessionId

provider

model

operation

quality

creditsCharged

actualProviderCost

duration

status.

---

# 41. JOB QUEUE

States :

queued

processing

completed

failed.

L’utilisateur peut quitter la page.

Notification lorsque fini.

---

# 42. CRÉDITS ET ÉCHECS

Ne débiter définitivement les crédits que si la politique choisie le permet.

Si génération échoue :

refund automatique.

Utiliser idempotency keys.

Double clic ne doit jamais lancer deux opérations payantes identiques.

---

# 43. PROPERTYTWIN EXPERIENCE

Chaque propriété publiée possède son propre **mini-site premium indépendant**.

Exemple :

`propertytwin.app/p/appartement-victor-hugo-x92k`

Ce n’est PAS un dashboard.

Ce n’est PAS une annonce classique.

C’est l’expérience digitale du logement.

---

# 44. OBJECTIF DU MINI-SITE

Après une visite physique :

l’agent envoie le PropertyTwin au prospect.

Le prospect peut :

revoir le bien

voir photos

voir plan

voir RoomPlan 3D

imaginer transformations

créer ses versions

sauvegarder

contacter agent

demander seconde visite

indiquer intérêt.

---

# 45. HERO EXPERIENCE

Grande photo.

Adresse/quartier.

Prix.

Surface.

Pièces.

Chambres.

Logo agence.

Photo agent.

CTA :

`Explorer le logement`

`Contacter Sophie`.

---

# 46. NAVIGATION EXPERIENCE

Découvrir

Photos

Plan

Vue RoomPlan

Imaginer

Informations

Contact.

---

# 47. GALERIE EXPERIENCE

Immersive.

Photos par pièces.

Swipe.

Fullscreen.

Before/After si variantes agent disponibles.

---

# 48. ROOMPLAN CÔTÉ ACHETEUR

Afficher le RoomPlan 3D du logement.

Mais uniquement consultation.

Acheteur peut :

tourner

zoomer

sélectionner une pièce.

Exemple :

sélection Salon

→ photos du salon.

Pas d’édition 3D.

---

# 49. PLAN CÔTÉ ACHETEUR

Plan 2D interactif.

Cliquer sur Chambre 2 :

ouvrir :

photos

dimensions

possibilités d’aménagement IA.

---

# 50. IMAGINEZ-VOUS ICI

Section centrale :

`Et si ce logement devenait le vôtre ?`

Sélectionner pièce/photo.

Actions :

Meubler

Vider

Changer sol

Changer murs

Japandi

Contemporain

Bureau

Chambre enfant

Créer mon style.

---

# 51. MODIFICATIONS BUYER

L’acheteur peut écrire :

“Mets du parquet clair”

“Transforme cette chambre en bureau”

“Fais-moi une décoration Japandi”

“Retire le canapé”.

Tout se fait sur la PHOTO.

Jamais sur RoomPlan 3D.

---

# 52. MA VERSION

Créer :

`Ma version du logement`

Exemple :

Salon
→ Japandi

Chambre 2
→ Bureau

Cuisine
→ Parquet clair.

Sauvegarde dans BuyerSession.

---

# 53. IDENTIFICATION

Après quelques générations :

`Sauvegardez votre projet`

Nom

Email

Téléphone.

Puis ajouter transformations supplémentaires si prévu.

---

# 54. LIENS PERSONNALISÉS

Lien général :

`/p/[slug]`

Lien prospect :

`/v/[secure-token]`

Exemple :

Paul Dupont

+

Appartement Victor Hugo.

---

# 55. SMART LINKS

Créer plusieurs liens par bien :

WhatsApp Paul

Email Julie

Instagram

Portail

QR agence.

Tracker chaque source.

---

# 56. QR CODE

Après publication :

afficher QR code.

Actions :

Copier

Download

Partager.

---

# 57. BUYER SESSION

Tracker session.

Anonymous visitor ID respectueux de la confidentialité.

Si identifié :

associer au Lead.

---

# 58. EVENTS

Tracker :

experience_open

return_visit

gallery_open

photo_view

floorplan_open

roomplan_open

room_selected

ai_open

ai_generation

variant_saved

contact_clicked

visit_requested

interest_submitted.

---

# 59. LEADS

Page Leads.

Afficher :

Nom

Bien

Source

Dernière activité

Statut

Engagement

Agent.

---

# 60. LEAD DETAIL

Afficher :

coordonnées

bien

timeline

temps cumulé

nombre visites

photos consultées

pièces consultées

transformations IA

variantes sauvegardées

demandes.

---

# 61. ENGAGEMENT

Utiliser statut simple :

Nouveau

Actif

Très engagé.

Ne pas présenter un faux score prédictif comme scientifique.

---

# 62. TIMELINE

Exemple :

14:02 — PropertyTwin ouvert

14:04 — Galerie

14:05 — Salon

14:07 — Plan

14:08 — RoomPlan

14:10 — Salon Japandi généré

14:12 — Version sauvegardée

14:14 — Seconde visite demandée.

---

# 63. CONTACT

CTA sticky mobile :

`Contacter Sophie`

Options :

Appeler

Message

Être rappelé

Demander une visite

Poser une question.

---

# 64. SIGNAL INTÉRÊT

Créer :

`Ce bien m’intéresse`

Options :

Très intéressé

Seconde visite

Question

Discuter du prix

Je réfléchis.

---

# 65. CRM LIGHT

Statuts :

New

Contacted

Visit booked

Qualified

Offer

Won

Lost.

Notes.

Assignation agent.

Follow-up date.

---

# 66. ANALYTICS

Agence :

visiteurs

vues

return visitors

leads

conversion

demandes visites

AI generations

RoomPlan opens

plan opens

photos populaires

biens populaires

sources.

---

# 67. BRANDING

Logo

couleur

nom

agent

photo

email

téléphone

site.

Appliquer sur PropertyTwin Experience.

---

# 68. WHITE LABEL

Plans avancés :

possibilité masquer :

`Powered by PropertyTwin`.

---

# 69. GÉNÉRATION TEXTE

Ajouter assistant rédaction.

Générer :

titre annonce

description courte

description complète

points forts

post Instagram

post LinkedIn

email prospect.

Ne jamais inventer une caractéristique.

---

# 70. VIDÉO PHOTO

Créer vidéo immobilière à partir des photos.

Pas de génération 3D.

Formats :

9:16

16:9

1:1.

Transitions

logo

adresse

prix

text overlays.

Architecture provider pour rendu.

---

# 71. PUBLICATION

Checklist :

cover

prix

adresse/quartier

surface

photos

plan

agent.

Puis :

`Publier PropertyTwin`.

---

# 72. MODES

Draft

Published

Unlisted

Private

Archived.

Mode conseillé par défaut :

Unlisted.

---

# 73. TEAM

Invitations.

Roles.

Assignation bien.

Permissions.

---

# 74. STRIPE

Plans :

Trial

Solo

Agency

Pro.

Gérer :

subscriptions

upgrades

downgrades

billing portal

credit packs

webhooks.

---

# 75. ADMIN PROPERTYTWIN

Créer `/admin`.

Afficher :

Agences

Utilisateurs

MRR

Abonnements

Crédits

AI usage

Coût API

Storage

Jobs

Errors.

---

# 76. FINOPS IA

Créer dashboard interne :

CA abonnement

coût IA

coût par agence

coût par propriété

coût moyen génération

marge estimée

ratio coût IA / CA.

---

# 77. KILL SWITCHES

Pouvoir couper :

AI globalement

Buyer AI

Provider spécifique

Agence

Bien.

---

# 78. PERFORMANCE

PropertyTwin Experience doit charger extrêmement rapidement.

Images optimisées.

AVIF/WebP.

Lazy loading.

RoomPlan 3D chargé uniquement si l’utilisateur ouvre cette section.

Ne jamais charger RoomPlan au premier affichage.

---

# 79. SEO

Pour Experience publique uniquement.

Metadata.

OpenGraph.

Preview sociale.

Mode Unlisted :

noindex.

---

# 80. RGPD

Consentement approprié.

Suppression Lead.

Suppression Session.

Export données.

Marketing consent distinct.

Pas de tracking excessif.

---

# 81. SÉCURITÉ

RLS.

Signed URLs.

Validation Zod.

Server-side authorization.

Rate limiting.

Webhook validation.

Secrets backend uniquement.

File validation.

---

# 82. TESTS

Créer tests sur :

Auth

Multi-tenancy

Properties

Media

Credits

AI jobs

RoomPlan upload

Experience publish

Smart Links

Buyer Sessions

Lead Capture

Stripe.

E2E :

Créer compte

Créer agence

Créer bien

Ajouter photos

Ajouter RoomPlan fixture

Modifier photo

Publier

Ouvrir Experience

Voir RoomPlan

Créer variante IA

Soumettre lead

Voir lead dashboard.

---

# 83. DONNÉES DEMO

Créer dataset développement séparé :

Appartement Victor Hugo.

Bien exemple clairement marqué DEMO.

Avec :

photos

plan

RoomPlan fixture

Buyer sessions

leads.

Jamais utiliser ces données en production.

---

# 84. PRIORITÉ DE DÉVELOPPEMENT

PHASE 1

Auth

Agency

Properties

Media.

PHASE 2

Photo Studio

AI Studio

Credits

AI jobs.

PHASE 3

RoomPlan ingestion

Plan 2D

RoomPlan 3D viewer.

PHASE 4

PropertyTwin Experience

Buyer AI

Smart Links.

PHASE 5

Leads

Analytics

CRM light.

PHASE 6

Stripe

Admin

FinOps

Polish.

---

# 85. VERTICAL SLICE À FAIRE AVANT TOUT LE RESTE

Avant de développer toutes les options secondaires, obtenir une boucle totalement fonctionnelle :

Agent se connecte

→ crée un bien

→ ajoute photos

→ reçoit/charge RoomPlan

→ ouvre RoomPlan 3D

→ modifie une photo avec AI Studio

→ publie PropertyTwin Experience

→ ouvre le mini-site

→ voit photos + plan + RoomPlan

→ transforme une photo côté acheteur

→ renseigne coordonnées

→ agent voit immédiatement le lead et son activité.

Tant que cette boucle n’est pas stable, ne perds pas du temps avec des fonctions secondaires.

---

# 86. RÈGLE CENTRALE

Toujours distinguer :

## ROOMPLAN 3D

Représentation spatiale du logement réel.

Consultation uniquement.

## AI PHOTO EDITING

Projection visuelle du potentiel du logement.

Toutes les transformations se font ici.

Ne mélange jamais les deux.

PropertyTwin doit pouvoir dire :

**“Explorez le logement tel qu’il est grâce au RoomPlan, puis imaginez ce qu’il pourrait devenir grâce à l’IA.”**

---

# 87. COMMENCE MAINTENANT

Inspecte le projet web existant.

Ne me renvoie pas seulement une roadmap.

Travaille directement dans le repository.

Identifie les composants existants.

Réutilise-les lorsque propres.

Commence par la vertical slice principale.

Après chaque étape importante :

build

lint

test

corrige les erreurs.

À la fin réponds uniquement :

## Fonctionnel
liste courte.

## À connecter
APIs/variables externes manquantes.

## À vérifier
tests manuels.

## Prochaine priorité
une seule action.