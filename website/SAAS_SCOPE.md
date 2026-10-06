# Périmètre SaaS complet — 5 octobre 2026

Source de la demande courante : `/Users/keisaissaoui/.codex/attachments/40e03a7b-e2af-433d-a7bf-bb0f2459372c/pasted-text-1.txt` (87 sections). Le périmètre initial est web ; la demande suivante autorise précisément la connexion iOS à la même base et le retrait des points colorés du scan. La stack Next/React/TypeScript/Tailwind est une préférence ; le socle existant Node/JavaScript est conservé pendant la stabilisation de la boucle principale. Une migration de framework n’est pas assimilée à une livraison fonctionnelle.

| Exigences | Preuve / état |
| --- | --- |
| 1–6 : vision, identité, auth, multi-tenant, onboarding | Auth Supabase et membership serveur, SQL RLS et onboarding implémentés ; intégration réelle Supabase et onboarding complet restant à vérifier/compléter ; adaptateur PostgreSQL et migration métiers disponibles |
| 7–10 : navigation, dashboard, portefeuille et fiche | Dashboard/éditeur existants ; routage complet, liste/grille, filtres ville/agent et nouvelles synthèses encore à compléter |
| 11–15 : API, RoomPlan, 3D, plan, relation photos | API v1 partielle, import RoomGeometry, viewer de consultation et plan interactif ; uploads signés privés implémentés ; vraie connexion Storage, capture RoomPlan et dimensions à vérifier |
| 16–19 : médiathèque, éditeur photo, retouches et auto enhance | Organisation et historique des photos ; Photo Studio avec tous les réglages locaux demandés, recadrage manuel, comparaison et historique par photo ; amélioration automatique conservatrice implémentée ; qualité sur photos réelles, Safari et Storage/CORS réel à vérifier |
| 20–34 : outils IA, masques/segmentation, styles, variantes et router | Studio/gomme manuelle, 13 outils, 8 styles, presets et inspiration, adaptateurs/routage/admin ; historique agent avec parent, chaînage réel des images/masques, favori, renommage, suppression/restauration et téléchargement implémentés ; connexion réelle, segmentation, rendu HD agent avec validation des dimensions et supplément implémenté ; commandes d’historique enrichies acheteur restant à compléter |
| 35–42 : crédits, pools, limites, HD, usage et jobs | Budget par bien, file persistante JSON/PostgreSQL, réservation/remboursement, clés idempotentes, limites visiteurs 2/5 et suivi après recharge testés ; rendu HD agent avec supplément, réservation/remboursement et reprise implémenté ; agence/pools, tarifs par outil, coûts réels et limite globale de concurrence à compléter |
| 43–58 : Experience, buyer IA, versions, liens, QR et événements | Parcours existants testés sur fixtures ; liens par source, limites/identification étendue et démonstration réelle restant à compléter |
| 59–67 : leads, timeline, engagement, CRM, analytics et branding | Leads/notes/statuts, timeline, diffusion et identité existants ; assignation/suivi, offre, engagement et analytics demandés non tous complets |
| 68–70 : white label, texte, vidéos photos | Non livrés ; aucun moteur vidéo/texte configuré |
| 71–73 : checklist, publication, visibilité et équipe | Publication/QR/statuts/privacy existants ; checklist enrichie et invitations/permissions d’équipe à compléter |
| 74–77 : Stripe, admin, FinOps, kill switches | Administration du routage et switches global/acheteur/profil disponibles ; Stripe, synthèses admin/FinOps, coûts réels et switches agence/bien non terminés |
| 78–81 : performance, SEO, RGPD, sécurité | Responsive WebP, lazy 3D, privacy, validation et auth ; Storage signé implémenté/testé sur fixture ; intégration réelle Storage, OpenGraph, consentements/export/suppression et durcissement complet à terminer |
| 82–83 : tests et démo isolée | Tests API/DOM/Chrome techniques ; migrations/RLS testées sur PostgreSQL local ; Supabase réel, providers, Stripe et téléphone à vérifier. Démonstration désactivée en production |
| 84–87 : phases, vertical slice, 3D/IA distinctes et contrôle | Boucle principale prioritaire ; structure RoomPlan en consultation, IA sur photos 2D. Aucun achèvement global revendiqué |

Les compteurs historiques de tests/captures dans VERIFICATION.md sont des étapes chronologiques, pas des validations globales de ce périmètre. L’achèvement nécessite toutes les fonctionnalités demandées et des preuves adaptées, notamment les intégrations externes réelles.

Dernière priorité demandée : base locale PostgreSQL commune sans comptes créée, données actuelles importées/sauvegardées, accès Wi-Fi et connexion iPhone temporaire ajoutés. Les tests valident les échanges API dans les deux sens. La connexion de l’iPhone physique après rebuild reste à effectuer ; l’intégration Supabase hébergée et le reste du SaaS restent incomplets.

Le démarrage répété du serveur commun est corrigé et testé : seule une configuration PostgreSQL partagée authentifiée correspondante est réutilisée. La gomme manuelle est raccordée au studio et aux jobs persistants avec masque validé, idempotence et remboursement. Le routeur et les trois adaptateurs directs sont configurables dans `/admin` et persistés dans une table plateforme privée commune ; contrat et limites dans AI_ROUTING.md. Les clés réelles, la segmentation et les autres exigences ouvertes restent à compléter.

Rendu HD agent : contrat, configuration, contrôle des sorties et limites dans HD.md. Le fournisseur reste indisponible sans credentials/routage compatibles ; aucun appel payant réel ne sert de preuve aux tests.
