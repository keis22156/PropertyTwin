# PropertyTwin dans Codex Cloud

Dépôt prévu : **keis22156/PropertyTwin**, privé, branche `main`. La création et le push doivent être confirmés par GitHub avant de considérer ce dépôt disponible.

## Préparation incluse

- Application iOS et SaaS dans le même dépôt, avec le SaaS isolé dans `website/`.
- Cahier des charges complet dans `website/SAAS_REQUIREMENTS.md` et état des travaux dans `website/SAAS_SCOPE.md`.
- Instructions pour les tâches dans `AGENTS.md`.
- Installation reproductible : `bash scripts/cloud-setup.sh` (`npm ci`, puis build).
- Vérifications GitHub Actions sur Linux : Node 22, build, lint et tests web.
- `.env`, `connection.txt`, PostgreSQL, médias clients locaux, `node_modules`, captures de vérification et réglages Xcode personnels exclus de Git. Les exemples de configuration restent disponibles.

## Créer l’environnement

1. Ouvrir ChatGPT/Codex avec le compte associé au connecteur GitHub **keis22156**.
2. Choisir **Work in → Cloud → Select environment → Create environment** dans l’interface actuelle. Si votre interface utilise encore les environnements Codex classiques, ouvrir ses paramètres d’environnements et créer un environnement.
3. Sélectionner **keis22156/PropertyTwin**, puis **Get started**. Si le dépôt n’apparaît pas, autoriser l’application GitHub de Codex à accéder à ce nouveau dépôt privé.
4. Demander à la préparation d’utiliser Node 22 et de lancer, depuis la racine :

   ```sh
   bash scripts/cloud-setup.sh
   cd website
   npm run lint
   npm test
   ```

   Pour un environnement classique avec champ « setup script », mettre `bash scripts/cloud-setup.sh` dans ce champ ; le script retrouve la racine du dépôt même si le dossier courant change.
5. Autoriser les accès nécessaires aux registres npm pendant l’installation. Aucun fournisseur IA ni accès à une base réelle n’est nécessaire pour les tests techniques.
6. Examiner les résultats de préparation, sélectionner **Publish** et attendre **Environment published**.
7. Sélectionner cet environnement et **Start a new task**, avec la branche `main` quand le choix est proposé.

Procédure basée sur la [documentation officielle Codex Cloud](https://learn.chatgpt.com/docs/cloud) et les [environnements Cloud](https://learn.chatgpt.com/docs/environments/cloud-environments). Les libellés peuvent différer dans l’interface classique : [documentation des environnements classiques](https://learn.chatgpt.com/docs/environments/cloud-environment).

## Texte de départ pour poursuivre le SaaS

```text
Continue uniquement le SaaS PropertyTwin dans website/.
Lis AGENTS.md, website/SAAS_REQUIREMENTS.md et website/SAAS_SCOPE.md avant de modifier.
Inspecte les sources et vérifie l’état réel ; les résultats historiques ne prouvent pas l’achèvement.
Conserve le périmètre complet du cahier des charges et commence par stabiliser la boucle agent → bien → photos → RoomPlan → IA → publication → Experience → lead.
Les outils et presets du Studio et le transport de l’image d’inspiration viennent d’être ajoutés : vérifie leur parcours de bout en bout avant de poursuivre les exigences ouvertes.
Ne modifie pas l’iOS pour cette tâche. RoomPlan reste en consultation seule ; toutes les transformations se font sur les photos 2D.
Les tests doivent employer leurs données temporaires et leurs providers techniques, sans appels payants ni base de production.
Après chaque étape significative : npm run build, npm run lint, npm test depuis website/.
Mets à jour l’état du périmètre et fournis une PR avec ce qui a été vérifié et ce qui reste à connecter.
```

Une nouvelle tâche Cloud reçoit le dépôt et cette instruction ; les pièces jointes et le contexte de la conversation locale ne sont pas automatiquement dans GitHub.

## Configuration et hébergement

Le Cloud de Codex est l’environnement de travail du développeur. L’hébergement permanent du SaaS et la base PostgreSQL hébergée sont une étape séparée.

Ne copier ni `website/.env` ni la connexion PostgreSQL `127.0.0.1:54329` du Mac dans le Cloud. Les biens actuellement sur le Mac restent locaux jusqu’à une migration explicite et vérifiée.

Pour les intégrations futures, utiliser `website/.env.example` comme inventaire. Les URL/paramètres publics vont dans les variables d’environnement ; les credentials sensibles dans le mécanisme de secrets de l’environnement. Les clés fournisseurs restent côté serveur. Les tests n’exigent aucun secret réel.

`dev:shared` utilise actuellement les binaires PostgreSQL Homebrew du Mac. Pour vérifier PostgreSQL dans Linux, installer PostgreSQL et définir `POSTGRES_BIN` vers son dossier de binaires avant `npm run test:postgres`. La vérification Chrome nécessite aussi un navigateur disponible. Xcode et le rebuild iPhone continuent à se faire sur le Mac.
