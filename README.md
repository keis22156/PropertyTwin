# PropertyTwin

Le dépôt regroupe l’app iOS et le SaaS dans `website/`. Pour préparer une tâche sur le dépôt GitHub dans Codex Cloud, voir [CLOUD.md](CLOUD.md). L’installation web depuis la racine se fait avec `bash scripts/cloud-setup.sh`.

PropertyTwin est une application iOS native destinée aux agents immobiliers. Elle capture une pièce avec le LiDAR et Apple RoomPlan, conserve sa géométrie, génère un plan 2D et exporte le vrai modèle 3D en USDZ.

## Prérequis

- Xcode récent
- iOS 17 minimum
- iPhone ou iPad compatible LiDAR pour le scan réel
- Une Development Team Apple pour installer l’application sur un appareil

Ouvrez `PropertyTwin.xcodeproj`, sélectionnez le schéma **PropertyTwin**, puis votre appareil. Le simulateur permet de parcourir l’interface, mais RoomPlan y est volontairement désactivé : aucun scan n’y est simulé.

## Architecture

- `Models` : modèles SwiftData et représentation Codable indépendante de RoomPlan.
- `Services` : compatibilité/capture RoomPlan, export de fichiers et retours haptiques.
- `Features/Scanner` : sélection, onboarding et pont SwiftUI vers `RoomCaptureView`.
- `Features/FloorPlan` : projection X/Z, normalisation, Canvas, zoom et déplacement.
- `Features/RoomResult` : résultat, détails, Quick Look USDZ et pièces sauvegardées.
- `Features/Home` et `Features/Property` : logements et navigation.
- `DesignSystem` : couleurs et composants visuels partagés.

## Fonctionnement du scan

`RoomCaptureSession.isSupported` vérifie réellement la présence du LiDAR. Après autorisation caméra, `RoomCaptureView` exécute la session native. Son delegate reçoit le `CapturedRoomData`, laisse RoomPlan le traiter, puis reçoit le vrai `CapturedRoom`. PropertyTwin conserve les murs, sols, portes, fenêtres, ouvertures, objets, sections, matrices, dimensions, relations et niveaux de confiance.

Le plan transforme les centres et axes locaux des surfaces du repère 3D RoomPlan vers le plan horizontal X/Z. Les surfaces de sol ne produisent une aire que lorsque RoomPlan fournit un polygone exploitable ; aucune dimension n’est inventée.

## Stockage

Les logements, pièces et géométries Codable sont stockés avec SwiftData. Les fichiers USDZ sont écrits séparément dans :

`Application Support/PropertyTwin/Scans`

Quick Look affiche directement ces vrais exports.

## Phase 2

L’application comprend désormais un dashboard agent, une navigation en cinq onglets, les campagnes multi-pièces, la fusion Apple `StructureBuilder`, une galerie locale avec miniatures, un Design Studio piloté par `ImageGenerationProvider`, une Buyer Experience, des estimations indicatives, une simulation de financement, des leads et des analytics locaux.

Une campagne multi-pièces conserve la même `ARSession`. PropertyTwin appelle ensuite le vrai `StructureBuilder`. Si RoomPlan refuse la fusion parce que les espaces ne sont pas compatibles, les scans restent séparés : l’application n’invente jamais la position relative des pièces.

Les fonctions IA restent désactivées tant qu’aucun provider sécurisé n’est injecté. `UnconfiguredImageProvider` renvoie alors explicitement « Fonction IA non configurée ».

Pour activer les transformations réelles, renseignez une URL HTTPS dans
**Profil → IA sécurisée**. Le contrat serveur est documenté dans
`AI_BACKEND_CONTRACT.md`. Le client prend en charge les réponses image binaires,
base64 ou URL HTTPS et ne contient aucune clé fournisseur.

Les images sont compressées et enregistrées dans :

`Application Support/PropertyTwin/Images`

Le mode Démo est explicitement identifié et n’écrit aucune donnée fictive dans le parcours réel.

## Tests

La cible `PropertyTwinTests` utilise Swift Testing et couvre les murs horizontaux, verticaux et inclinés, la bounding box, la normalisation, le scaling mètres/pixels et l’aire d’un sol irrégulier.

## Base commune locale app et dashboard

Depuis `website`, lancer `npm run dev:shared`. La commande démarre PostgreSQL et le serveur accessible sur le Wi-Fi. Le dashboard est à http://localhost:3000/agent ; les adresses iPhone et la clé agent sont dans `website/data/connection.txt` (privé). Rebuild Xcode Debug, puis utiliser « Connecter l’iPhone » dans le dashboard pour relier une fois l’app au même serveur. L’app ouverte synchronise ensuite automatiquement les dossiers toutes les dix secondes. Aucune création de compte n’est nécessaire pour ce mode local. Les données existantes sont sauvegardées/importées une fois ; les redémarrages reprennent la même base. Voir [la configuration de la base commune](website/POSTGRES.md).
