PROPERTYTWIN EXPERIENCE — MINI-SITE UNIQUE PAR BIEN

PropertyTwin Experience ne doit PAS être un espace générique ou un dashboard destiné à l’acheteur.

Chaque bien immobilier publié doit automatiquement générer son propre mini-site premium, entièrement consacré à CE bien.

Exemples d’URL :

propertytwin.app/p/appartement-victor-hugo-x7k92

ou avec branding agence :

dupont.propertytwin.app/appartement-victor-hugo

L’agent immobilier envoie ce lien directement au client après une visite, par WhatsApp, SMS, email ou QR code.

Le client ne doit pas avoir besoin de créer un compte ni d’installer l’application.

OBJECTIF

Le mini-site doit donner l’impression que l’agence a créé une expérience digitale personnalisée spécialement pour le logement que le client vient de visiter.

Le client doit pouvoir :

revoir le bien tranquillement chez lui ;

retrouver les photos ;

consulter les caractéristiques ;

voir le plan ;

consulter la 3D si disponible ;

revoir les différentes pièces ;

tester des transformations IA ;

créer sa propre version du logement ;

sauvegarder ses transformations ;

demander une nouvelle visite ;

poser une question ;

contacter l’agent ;

exprimer son intérêt.

Le mini-site doit être extrêmement premium et mobile-first.

PAGE D’ACCUEIL DU MINI-SITE

Hero plein écran ou très visuel.

Afficher :

photo principale du bien

adresse ou quartier selon configuration

prix

surface

nombre de pièces

nombre de chambres

nom/logo de l’agence

photo et prénom de l’agent

CTA principal :

Explorer le logement

CTA secondaire :

Contacter [Prénom de l’agent]

Exemple :

Appartement Victor Hugo

Paris 16e

895 000 €

72 m² · 3 pièces · 2 chambres

Présenté par :
Sophie Martin
Agence Dupont Immobilier

NAVIGATION DU MINI-SITE

Créer une navigation légère et élégante :

Découvrir

Photos

Plan

3D

Imaginer

Informations

Contact

Sur mobile, utiliser une navigation adaptée et très fluide.

Le client ne doit jamais avoir l’impression d’utiliser un logiciel professionnel.

Il doit avoir l’impression de consulter une présentation digitale haut de gamme du logement.

SECTION “DÉCOUVRIR”

Présenter le logement de manière éditoriale.

Grande photo.

Petit texte :

Imaginez votre quotidien ici.

Afficher les informations essentielles :

72 m²

3 pièces

2 chambres

4e étage

Ascenseur

Balcon

DPE

etc.

Afficher uniquement les informations configurées par l’agent.

GALERIE

Créer une galerie immersive.

Photos organisées par pièce :

Salon

Cuisine

Chambre principale

Chambre 2

Salle de bain

Extérieur

L’utilisateur peut ouvrir une photo plein écran et naviguer par swipe.

PLAN

Afficher le vrai plan issu de PropertyTwin.

Permettre :

zoom

déplacement

sélection des pièces.

En cliquant sur :

Salon

ouvrir les photos et variantes correspondantes.

Si le scan RoomPlan possède des dimensions fiables :

les afficher.

Ne jamais inventer une mesure.

3D

Si le logement possède un modèle 3D :

afficher :

Explorer en 3D

Le client peut tourner autour du modèle ou naviguer selon les capacités disponibles.

Charger la 3D uniquement lorsque l’utilisateur ouvre cette section afin de préserver les performances.

SECTION PRINCIPALE : “IMAGINEZ-VOUS ICI”

Cette section est le différenciateur majeur de PropertyTwin.

Titre :

Et si ce logement devenait le vôtre ?

Sous-titre :

Personnalisez les pièces et découvrez leur potentiel en quelques secondes.

Afficher les différentes pièces.

Exemple :

Salon

[photo]

Boutons rapides :

Meubler

Vider

Changer le sol

Changer les murs

Japandi

Contemporain

Créer mon style

MODIFICATION IA CÔTÉ CLIENT

Le client peut choisir une photo et demander une transformation.

Exemples :

Mets du parquet clair.

Transforme cette chambre en bureau.

Fais-moi un salon japandi.

Retire le canapé.

Mets les murs en blanc cassé.

Chaque génération doit :

conserver la photo originale ;

créer une variante ;

être associée à ce bien ;

être associée à la BuyerSession ;

consommer les crédits définis par l’agence ;

respecter le rate limit.

AVANT / APRÈS

Après chaque transformation :

afficher un slider :

Avant ←→ Ma version

Boutons :

Sauvegarder

Créer une autre version

Partager

“MA VERSION DU LOGEMENT”

Créer une section personnelle dans la session du visiteur.

Exemple :

Ma version

Salon
→ Japandi

Cuisine
→ Parquet clair

Chambre 2
→ Bureau

Permettre au client de retrouver toutes ses modifications durant sa session.

Si le client renseigne ses coordonnées :

associer ensuite ces variantes au lead.

CONTEXTE POST-VISITE

Le mini-site doit particulièrement fonctionner après une visite physique.

Créer éventuellement un bandeau discret :

Merci pour votre visite.

Vous pouvez maintenant revoir le logement et imaginer différentes possibilités d’aménagement.

L’agent peut générer/envoyer le lien directement après le rendez-vous.

LIEN PERSONNALISÉ POUR UN CLIENT

Prévoir deux types de liens :

Lien général

propertytwin.app/p/x92kd

Tout le monde voit la même présentation.

Lien client personnalisé

propertytwin.app/v/x92kd/a8f72

Ce lien associe automatiquement la session à un prospect connu.

Exemple :

Sophie Martin envoie PropertyTwin à Paul Dupont après la visite.

Quand Paul ouvre le lien :

BuyerSession
→ Paul Dupont
→ Appartement Victor Hugo

L’agence peut alors voir son activité sans lui demander de se reconnecter.

Utiliser des tokens sécurisés impossibles à deviner.

Ne jamais exposer les identifiants internes.

PARTAGE APRÈS VISITE

Dans le dashboard agent :

bouton :

Envoyer PropertyTwin

Ouvre une fenêtre :

Client :
Paul Dupont

Canal :

Email

SMS

WhatsApp

Copier le lien

Message pré-rempli :

`Bonjour Paul,

Merci pour votre visite de l’appartement Victor Hugo.

Vous pouvez retrouver ici les photos, le plan et imaginer différentes possibilités d’aménagement :

[lien]

Bien à vous,
Sophie`

Permettre à l’agent de modifier ce message.

CONTACT AGENT

Le mini-site doit garder un CTA contact accessible.

Bouton sticky mobile :

Contacter Sophie

Au clic :

Demander une visite

Être rappelé

Poser une question

Je suis intéressé

DEMANDER UNE VISITE

Formulaire simple :

Nom

Téléphone

Email

Disponibilités

Message.

Si le visiteur est déjà identifié par lien personnalisé :

préremplir les informations.

INTÉRÊT ACHETEUR

Créer CTA :

Ce bien m’intéresse

Puis :

Très intéressé

J’aimerais une seconde visite

J’ai une question

Je souhaite parler du prix

Je réfléchis encore

L’information doit remonter directement au dashboard agent.

ANALYTICS DU MINI-SITE

Créer une BuyerSession unique par visiteur.

Tracker :

mini_site_open

property_return_visit

gallery_open

photo_view

room_view

floorplan_open

3d_open

ai_studio_open

ai_generation

variant_saved

contact_clicked

visit_requested

interest_submitted

session_duration

L’agent doit ensuite voir :

Paul Dupont

4 visites du mini-site

12 min 38 cumulées

Plan consulté

Salon modifié 3 fois

Cuisine modifiée 2 fois

Version “Japandi” sauvegardée

A cliqué “Ce bien m’intéresse”

TIMELINE CÔTÉ AGENT

Dans le lead :

Paul Dupont

Appartement Victor Hugo

Timeline :

14:02 — Mini-site ouvert

14:04 — Galerie consultée

14:06 — Plan ouvert

14:08 — Salon transformé en style Japandi

14:10 — Nouvelle transformation du salon

14:12 — Cuisine consultée

14:13 — A sauvegardé une variante

14:14 — “Ce bien m’intéresse”

Cela doit être très lisible.

BRANDING

Chaque mini-site doit reprendre automatiquement :

logo agence

couleur de marque

nom agence

coordonnées

photo agent

nom agent.

Mais l’interface principale reste PropertyTwin et ne doit jamais devenir graphiquement incohérente.

Plan supérieur futur :

Powered by PropertyTwin peut être masqué.

URL ET PUBLICATION

Quand l’agent clique :

Publier

PropertyTwin doit :

vérifier que le bien possède au minimum une photo ;

créer un slug unique ;

générer le mini-site ;

fournir immédiatement son URL ;

afficher QR code ;

afficher boutons WhatsApp, email, copier le lien.

États :

Draft

Published

Unlisted

Archived.

PRIVACY

Modes :

Public

Accessible avec URL et indexable si l’agence le souhaite.

Unlisted

Accessible uniquement avec le lien.

Private / Lead gated

Demande nom/email avant accès.

Le mode par défaut doit être :

Unlisted

car le lien est principalement envoyé personnellement aux acheteurs.

MOBILE FIRST

La majorité des acheteurs ouvriront probablement le lien depuis WhatsApp/SMS sur smartphone.

Le mini-site doit donc être exceptionnel sur mobile.

Priorités :

temps de chargement ;

grandes photos ;

navigation au pouce ;

transformations simples ;

CTA contact sticky ;

gestures ;

pas de dashboard desktop compressé.

PERFORMANCE

Le mini-site public doit être extrêmement léger.

Ne pas charger immédiatement :

3D ;

visite 360° ;

toutes les images HD.

Utiliser :

thumbnails

responsive images

lazy loading

preloading intelligent.

La galerie et le hero doivent apparaître presque instantanément.

DIFFÉRENCE AVEC UNE ANNONCE IMMOBILIÈRE

Le mini-site ne doit PAS ressembler à une annonce SeLoger/Leboncoin.

Une annonce sert à découvrir un bien.

PropertyTwin Experience intervient principalement lorsque le prospect connaît déjà le bien ou vient de le visiter.

Le ton doit donc être :

Explorez davantage

et non :

Achetez cet appartement.

L’objectif est de permettre au prospect de se projeter.

OBJECTIF BUSINESS

L’agence doit pouvoir dire :

Après chaque visite, j’envoie le PropertyTwin du logement.

PropertyTwin devient alors une extension numérique de chaque visite immobilière.

L’agent peut comprendre ce que le prospect consulte après la visite et reprendre contact au bon moment avec davantage de contexte.

DÉMO IDÉALE

La démonstration commerciale doit être :

ouvrir Appartement Victor Hugo dans le dashboard ;

cliquer Buyer Experience;

cliquer Publier;

QR code apparaît ;

scanner le QR code avec un téléphone ;

magnifique mini-site du bien ;

ouvrir Salon ;

demander Transforme cette pièce en bureau;

nouvelle version générée ;

la sauvegarder ;

cliquer Ce bien m’intéresse;

retourner au dashboard agence ;

voir immédiatement l’activité du prospect.

Cette séquence doit être l’un des principaux effets WOW de PropertyTwin.