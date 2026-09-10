# NanoPrint — matrice de conformité fonctionnelle

Source auditée intégralement : `etats_besoin/gestion-imprimerie-fonctionnalites-finales.html`.

> Le cartouche du cahier des charges annonce « 80+ fonctionnalités », mais son contenu détaillé énumère exactement **72 fonctionnalités** réparties dans 17 modules. Les 72 éléments explicites sont tracés ci-dessous.

## Socle transverse

- [x] Connexion simulée en premier écran, profils Administrateur / Commercial / Opérateur / Comptable
- [x] Session locale temporaire, déconnexion et garde d’accès côté interface
- [x] Navigation responsive, sidebar structurée par domaines métier et header contextuel
- [x] Modèles typés, configuration métier et dépôt de données mock séparés
- [x] CRUD local persistant et réinitialisable pour chacun des 14 modules
- [x] Recherche différée, filtre de statut, pagination, vues tableau/grille et export CSV
- [x] Validation des formulaires, erreurs attendues, attente simulée, confirmations et toasts
- [x] États vides, skeleton de navigation, frontière d’erreur et page 404
- [x] Consultation détaillée, historique mock, impression et contrôle de suppression par rôle
- [x] Responsive mobile/tablette/desktop, navigation clavier, labels et annonces ARIA
- [x] Chaque fonctionnalité du cahier des charges est un écran autonome (onglets + CRUD mock)
- [x] Typographie Saira / Saira Condensed conforme au document de référence
- [x] Routes statiques pré-générées avec `generateStaticParams` et métadonnées par module

## 01 — Configuration & Paramétrage (6/6)

- [x] Catalogue produits et prestations
- [x] Catalogue matières (libellé, prix achat/vente, stock, seuil d’alerte, unités)
- [x] Grilles tarifaires et règles de prix
- [x] Paramétrage des machines et postes
- [x] Modèles de documents
- [x] Paramètres généraux

## 02 — Utilisateurs & Sécurité (3/3)

- [x] Gestion des rôles et permissions
- [x] Journal des actions (audit trail)
- [x] Sauvegarde et sécurité des données

## 03 — Gestion des Clients / CRM (4/4)

- [x] Fiche client détaillée
- [x] Historique des commandes
- [x] Segmentation client
- [x] Gestion des contacts multiples

## 04 — Devis & Commandes (5/5)

- [x] Calculateur de prix automatique
- [x] Génération de devis multi-options
- [x] Conversion devis vers commande
- [x] Suivi des statuts de commande
- [x] Gestion des avenants

## 05 — Prépresse & Fichiers (1/1)

- [x] Réception et stockage des fichiers clients (commandes, dépôt multiple, remplacement, suppression)

## 06 — Planification / Ordonnancement (1/1)

- [x] Planning visuel des machines

## 07 — Achats & Fournisseurs (3/3)

- [x] Fiches fournisseurs (nom, téléphone, adresse, e-mail — consulter, modifier, supprimer, historique des achats)
- [x] Approvisionnement (panier fournisseur / matières, prix figé, bon de livraison)
- [x] Historique d’approvisionnement (liste fournisseur, détail, suppression &lt; 48 h)

## 08 — Stocks & Consommables (3/3)

- [x] Suivi stock (produits finis / matières premières, sortie cassé-perte)
- [x] Seuils d’alerte de réapprovisionnement
- [x] Inventaire et régularisation

## 11 — Machines & Maintenance (4/4)

- [x] Fiche technique de chaque machine
- [x] Maintenance préventive planifiée
- [x] Signalement de pannes
- [x] Suivi du taux d’utilisation des machines

## 12 — Livraison & Expédition (4/4)

- [x] Génération des bons de livraison
- [x] Planification des tournées
- [x] Suivi de colis en ligne simulé
- [x] Gestion du retrait en atelier

## 13 — Facturation & Comptabilité (2/2)

- [x] Facturation automatique
- [x] Gestion des acomptes

## 14 — Ressources Humaines (3/3)

- [x] Gestion des plannings d’équipe
- [x] Pointage du temps de travail
- [x] Suivi des compétences et habilitations

## 15 — Communication & Notifications (3/3)

- [x] Notifications automatiques e-mail ou SMS simulées
- [x] Messagerie interne
- [x] Modèles de communication personnalisables

## 17 — Reporting & Tableaux de bord (4/4)

- [x] Tableau de bord de l’activité
- [x] Rapports de rentabilité
- [x] Statistiques de production
- [x] Export de rapports personnalisés

## Validation technique

- [x] `npx eslint app components lib`
- [x] `npx tsc --noEmit` et routes admin dynamiques pour les 14 modules
- [x] Aucune API, base de données ou clé secrète ajoutée
- [x] Dépendances sans vulnérabilité signalée par `npm audit` lors de l’installation
