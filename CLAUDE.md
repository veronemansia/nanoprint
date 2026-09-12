Nous allons maintenant passer de la phase frontend avec données mockées à l’implémentation du backend réel.

## 1. OBJECTIF GLOBAL

L’application possède déjà toutes ses interfaces graphiques et ses interactions frontend principales.

Les différentes pages utilisent actuellement des données mockées pour alimenter :
- les tableaux ;
- les formulaires ;
- les listes déroulantes ;
- les fiches de détail ;
- les statistiques éventuelles ;
- les opérations CRUD simulées ;
- et les autres composants qui dépendent actuellement de données fictives.

L’objectif est maintenant de remplacer progressivement ces données mockées par de vraies données provenant d’un backend sécurisé et d’une base de données MySQL.

IMPORTANT :

Nous ne devons PAS refaire l’interface graphique existante.

Nous ne devons PAS modifier inutilement :
- les formulaires ;
- les champs existants ;
- les tableaux ;
- les colonnes ;
- les boutons ;
- les composants UI ;
- les layouts ;
- le design ;
- les routes frontend ;
- les noms affichés à l’utilisateur ;
- les comportements déjà fonctionnels.

Le travail consiste principalement à remplacer la source des données mockées par une véritable couche backend/API et une base de données.

---

# 2. STACK BACKEND À UTILISER

Le backend devra utiliser :

- PHP orienté objet (POO) ;
- une version PHP récente et stable ;
- PDO pour l’accès à MySQL ;
- MySQL Server ;
- Laragon pour l’environnement local ;
- architecture sécurisée et maintenable ;
- requêtes SQL préparées ;
- validation stricte des données entrantes ;
- gestion correcte des erreurs ;
- séparation claire des responsabilités ;
- authentification et autorisation sécurisées ;
- protection contre les injections SQL ;
- protection des données sensibles ;
- gestion correcte des sessions/tokens selon l’architecture retenue.

La base de données sera une base MySQL appelée :

BDD impression

Tu dois cependant vérifier la convention exacte de nommage déjà utilisée dans le projet avant de créer ou modifier quoi que ce soit.

---

# 3. PRINCIPLE IMPORTANT : NE PAS CASSER L’EXISTANT

Le frontend existe déjà.

Avant toute modification, tu dois analyser le projet afin de comprendre :

- son architecture ;
- ses routes ;
- ses composants ;
- ses Server Components ;
- ses Client Components ;
- ses fonctions de récupération des données ;
- ses données mockées ;
- ses types/interfaces TypeScript ;
- ses formulaires ;
- ses tableaux ;
- ses fonctions CRUD ;
- ses éventuelles actions serveur ;
- sa gestion actuelle des erreurs ;
- son système d’authentification ;
- son système de cache/revalidation.

Tu dois réutiliser au maximum l’architecture existante.

Ne fais pas de refactoring global inutile.

Ne remplace pas une architecture existante simplement parce qu’une autre approche te semble plus élégante.

Toute modification doit avoir une justification technique.

---

# 4. RÈGLE ABSOLUE SUR LES FORMULAIRES

Les champs actuellement présents dans les différents formulaires constituent la référence fonctionnelle.

Tu dois respecter exactement :

- les noms des champs ;
- les labels ;
- les types ;
- les valeurs ;
- les relations entre les champs ;
- les champs obligatoires/optionnels ;
- les valeurs par défaut ;
- les formats attendus ;
- les informations affichées.

Lorsqu’un formulaire correspond à une entité métier, ses champs devront être correctement représentés dans la structure de la table SQL correspondante.

Exemple :

Si un formulaire contient :

- nom
- description
- statut
- date_creation

alors la table SQL correspondante devra être conçue en cohérence avec ces champs.

IMPORTANT :

Ne renomme pas arbitrairement les champs frontend simplement pour les adapter à la base de données.

Si une différence de nommage est techniquement nécessaire, mets en place une couche de mapping claire entre :

Frontend → Backend/API → Base de données

mais conserve l’interface frontend existante.

---

# 5. NEXT.JS : DOCUMENTATION À CONSULTER AVANT L’IMPLÉMENTATION

Le frontend utilise Next.js.

Avant de commencer l’implémentation, tu dois consulter attentivement la documentation officielle Next.js concernant :

### Fetching Data
https://nextjs.org/docs/app/getting-started/fetching-data

### Mutating Data
https://nextjs.org/docs/app/getting-started/mutating-data

### Caching
https://nextjs.org/docs/app/getting-started/caching

### Revalidating
https://nextjs.org/docs/app/getting-started/revalidating

### Error Handling
https://nextjs.org/docs/app/getting-started/error-handling

### Proxy
https://nextjs.org/docs/app/getting-started/proxy

### Authentication
https://nextjs.org/docs/app/guides/authentication

Ces documentations doivent être étudiées AVANT l’implémentation.

L’objectif est de respecter les mécanismes modernes de Next.js concernant :

- Server Components ;
- Client Components ;
- récupération des données côté serveur ;
- mutations ;
- Server Actions lorsque pertinentes ;
- appels API ;
- gestion du cache ;
- invalidation/revalidation ;
- gestion des erreurs ;
- protection des routes ;
- authentification ;
- autorisation ;
- Proxy/Middleware selon la version utilisée ;
- séparation des responsabilités frontend/backend.

Ne propose pas une architecture basée sur d’anciennes pratiques Next.js si la version actuelle du projet permet une approche plus moderne.

Tu dois d’abord identifier la version exacte de Next.js utilisée dans le projet.

---

# 6. ARCHITECTURE ATTENDUE

Avant de coder, tu dois déterminer l’architecture la plus adaptée à l’existant.

L’architecture devra idéalement séparer :

Frontend Next.js
        ↓
Couche d’accès aux données / API
        ↓
Backend PHP sécurisé
        ↓
PDO
        ↓
MySQL

Cependant, ne considère pas cette architecture comme définitive avant d’avoir analysé le projet.

Tu dois déterminer précisément :

- comment Next.js communiquera avec PHP ;
- quelles routes API PHP seront nécessaires ;
- comment les données seront sérialisées ;
- comment seront gérées les erreurs HTTP ;
- comment seront gérées les validations ;
- comment seront gérées les authentifications ;
- comment seront gérées les autorisations ;
- comment seront gérées les sessions/tokens ;
- comment seront protégées les requêtes ;
- comment seront gérées les mutations ;
- comment seront gérés le cache et la revalidation côté Next.js.

---

# 7. BASE DE DONNÉES

Avant de créer les tables SQL, tu dois analyser toutes les interfaces de `/admin/utilisateurs/`.

Pour chaque module, identifie :

1. l’entité métier ;
2. les champs utilisés ;
3. les champs obligatoires ;
4. les relations éventuelles ;
5. les clés primaires ;
6. les clés étrangères ;
7. les contraintes ;
8. les statuts ;
9. les valeurs par défaut ;
10. les timestamps ;
11. les index nécessaires ;
12. les éventuelles relations 1-1, 1-N ou N-N.

Ne crée pas une table SQL simplement en recopiant visuellement un formulaire.

Tu dois comprendre le modèle métier derrière chaque formulaire.

Le schéma SQL doit être :
- normalisé ;
- cohérent ;
- sécurisé ;
- évolutif ;
- performant ;
- compatible avec MySQL ;
- cohérent avec les données réellement utilisées par le frontend.

---

# 8. API / BACKEND PHP

Le backend PHP doit être développé en POO.

Évite absolument un gros fichier PHP contenant toute la logique.

Utilise une séparation claire, par exemple selon les besoins du projet :

- configuration ;
- connexion PDO ;
- repositories ;
- services ;
- contrôleurs ;
- validation ;
- réponses HTTP ;
- authentification ;
- autorisation ;
- gestion des exceptions ;
- routing/API.

L’architecture exacte doit être déterminée après analyse du projet.

Utilise systématiquement :

- PDO ;
- prepared statements ;
- validation des entrées ;
- typage lorsque pertinent ;
- gestion des exceptions ;
- réponses HTTP cohérentes ;
- JSON pour les API ;
- logs appropriés sans exposer de données sensibles.

Ne concatène jamais directement des valeurs utilisateur dans les requêtes SQL.

---

# 9. SÉCURITÉ

La sécurité est une priorité.

Tu dois notamment prendre en compte :

- SQL Injection ;
- XSS ;
- CSRF lorsque pertinent ;
- authentification ;
- autorisation ;
- contrôle d’accès aux routes ;
- validation serveur ;
- validation frontend en complément ;
- gestion des mots de passe avec password_hash/password_verify si des mots de passe sont concernés ;
- protection des secrets ;
- variables d’environnement ;
- CORS si nécessaire ;
- gestion sécurisée des cookies ;
- expiration des sessions/tokens ;
- limitation de l’exposition des informations d’erreur ;
- principe du moindre privilège ;
- protection des endpoints sensibles.

Ne jamais considérer la validation frontend comme suffisante.

Toute donnée venant du client doit être considérée comme non fiable.

---

# 10. DONNÉES MOCKÉES

Les données mockées existantes doivent être utilisées comme référence pour comprendre :

- la structure actuelle des données ;
- les types ;
- les relations ;
- les valeurs possibles ;
- les états ;
- les cas d’utilisation ;
- les données affichées dans les tableaux.

Mais elles ne doivent plus être la source définitive des données une fois le module migré.

Pour chaque module migré :

AVANT :

Frontend → Mock data

APRÈS :

Frontend → Backend/API → PHP → PDO → MySQL

Les mocks doivent être retirés ou désactivés uniquement lorsque le remplacement réel fonctionne correctement.

Ne supprime pas prématurément les mocks avant validation du nouveau flux.

---

# 11. MÉTHODE DE TRAVAIL OBLIGATOIRE

Tu dois travailler progressivement.

Nous allons commencer UNIQUEMENT par :

/admin/utilisateurs/

Tu dois analyser TOUS les modules présents dans ce dossier avant de commencer l’implémentation.

## ÉTAPE 1 — AUDIT

Commence par analyser :

- l’arborescence ;
- les pages ;
- les composants ;
- les fichiers de données mockées ;
- les types ;
- les formulaires ;
- les tableaux ;
- les appels de données ;
- les fonctions CRUD ;
- les dépendances entre modules.

## ÉTAPE 2 — CARTOGRAPHIE

Pour chaque module de `/admin/utilisateurs/`, crée une cartographie :

Module
→ Page
→ Composants
→ Mock utilisé
→ Champs
→ Entité métier
→ Table SQL envisagée
→ Endpoints/API nécessaires
→ Opérations CRUD
→ Relations
→ Validation
→ Authentification/autorisation
→ Cache/revalidation

## ÉTAPE 3 — MODÈLE DE DONNÉES

Propose le schéma MySQL correspondant.

Pour chaque table, indique :

- nom ;
- colonnes ;
- type ;
- NULL/NOT NULL ;
- valeur par défaut ;
- clé primaire ;
- clés étrangères ;
- index ;
- contraintes ;
- relations.

## ÉTAPE 4 — ARCHITECTURE BACKEND

Propose l’organisation des fichiers PHP.

Explique le rôle de chaque couche.

## ÉTAPE 5 — ARCHITECTURE NEXT.JS

Explique comment chaque page de `/admin/utilisateurs/` récupérera et modifiera les données.

Précise notamment :

- Server Component ou Client Component ;
- fetch ;
- mutation ;
- Server Action si pertinente ;
- cache ;
- revalidation ;
- gestion des erreurs ;
- protection de route.

## ÉTAPE 6 — PLAN D’IMPLÉMENTATION

Définis l’ordre exact dans lequel nous allons développer les modules.

Commence par le module présentant le moins de dépendances afin de valider l’architecture avant de migrer les modules plus complexes.

---

# 12. RÈGLE TRÈS IMPORTANTE : NE PAS CODER IMMÉDIATEMENT

AVANT DE MODIFIER LE MOINDRE FICHIER :

1. analyse le projet ;
2. consulte les documentations Next.js indiquées ;
3. identifie les modules de `/admin/utilisateurs/` ;
4. comprends les mocks ;
5. comprends les formulaires ;
6. comprends les tableaux ;
7. identifie les entités ;
8. propose le schéma de données ;
9. propose l’architecture backend ;
10. propose l’architecture Next.js ;
11. identifie les risques et dépendances ;
12. présente-moi le plan complet.

À cette étape, tu ne dois PAS encore modifier le code.

Je veux d’abord valider le plan.

---

# 13. FORMAT DE TA PREMIÈRE RÉPONSE

Ta première réponse doit être UNIQUEMENT un audit et un plan d’action.

Elle doit contenir :

## A. Analyse de l’existant

Ce que tu as trouvé dans le projet.

## B. Modules de `/admin/utilisateurs/`

Liste complète des modules détectés.

## C. Cartographie des données

Pour chaque module :

- mock ;
- champs ;
- entité ;
- table SQL ;
- opérations CRUD.

## D. Architecture proposée

Frontend Next.js
→ API
→ PHP POO
→ PDO
→ MySQL

avec les détails adaptés au projet.

## E. Structure SQL proposée

Liste des tables et relations.

## F. Structure backend PHP proposée

Arborescence des fichiers/dossiers.

## G. Intégration Next.js

Explique précisément comment seront utilisés :

- Server Components ;
- Client Components ;
- fetch ;
- mutations ;
- cache ;
- revalidation ;
- gestion des erreurs ;
- Proxy ;
- authentification.

## H. Sécurité

Liste les mesures de sécurité prévues.

## I. Ordre d’implémentation

Donne l’ordre exact des modules à migrer.

## J. Risques / points à valider

Liste les éléments nécessitant éventuellement une décision avant implémentation.

## K. Plan de migration

Décris comment nous passerons progressivement :

Mock
→ API
→ Backend PHP
→ MySQL
→ validation
→ suppression/remplacement du mock

---

# 14. RÈGLE POUR LES MODIFICATIONS FUTURES

Une fois le plan validé, travaille module par module.

Pour chaque module :

1. analyser ;
2. créer/modifier la BDD ;
3. créer le backend PHP ;
4. tester les endpoints ;
5. connecter Next.js ;
6. remplacer les mocks ;
7. gérer cache/revalidation ;
8. gérer les erreurs ;
9. tester les formulaires ;
10. tester les tableaux ;
11. tester les opérations CRUD ;
12. vérifier la sécurité ;
13. vérifier qu'aucune interface existante n'a été cassée.

Après chaque module, indique clairement :

- fichiers créés ;
- fichiers modifiés ;
- fichiers supprimés uniquement si nécessaire ;
- tables SQL créées/modifiées ;
- endpoints créés ;
- flux de données ;
- tests effectués ;
- problèmes rencontrés ;
- points restant à traiter.

---

# 15. CONTRAINTE FONDAMENTALE

Le principe directeur de tout le travail est :

« MODIFIER LE MINIMUM NÉCESSAIRE POUR REMPLACER LES DONNÉES MOCKÉES PAR DES DONNÉES RÉELLES. »

L’UI existante est considérée comme validée.

Ne la reconstruis pas.

Ne change pas son comportement sans raison.

Ne renomme pas arbitrairement les champs.

Ne change pas les composants existants simplement pour appliquer une préférence personnelle.

Concentre le travail sur :

BDD → Backend PHP sécurisé → API → intégration Next.js → données réelles.

---

# 16. PREMIÈRE MISSION

Commence maintenant par analyser le projet et particulièrement :

/admin/utilisateurs/

Consulte également les documentations Next.js indiquées plus haut.

NE MODIFIE AUCUN CODE POUR LE MOMENT.

Présente-moi d’abord l’audit complet et le plan d’implémentation détaillé.

J’attendrai ma validation du plan avant que tu commences à modifier les fichiers.