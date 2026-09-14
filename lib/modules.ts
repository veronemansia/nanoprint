import type { FeatureDefinition, FieldDefinition, ModuleDefinition, ModuleId } from "@/lib/types";

function f(
  id: string,
  title: string,
  description: string,
  entityName: string,
  entityNamePlural: string,
  createLabel: string,
  statuses: string[],
  fields: FieldDefinition[],
): FeatureDefinition {
  return { id, title, description, entityName, entityNamePlural, createLabel, statuses, fields };
}

export const defaultWorkshops = ["Impression", "Finition", "Façonnage", "Expédition"];

export const modules: ModuleDefinition[] = [
  {
    id: "configuration", number: "01", label: "Configuration & Paramétrage", shortLabel: "Configuration", group: "Fondations",
    description: "Catalogue produits et matières, tarifs, modèles et règles générales qui structurent toute l’activité.",
    features: [
      f("matieres", "Catalogue matières", "Papiers, encres, plaques et autres matières : libellé, prix d’achat et de vente, seuil d’alerte et unités. Le stock n’est pas saisi ici.", "matière", "matières", "Nouvelle matière", ["Disponible", "Stock bas", "Rupture"], [
        { key: "name", label: "Libellé", required: true },
        { key: "type", label: "Type", required: true },
        { key: "unit", label: "Unité", required: true },
        { key: "buyPrice", label: "Prix d’achat", type: "number", required: true },
        { key: "sellPrice", label: "Prix de vente", type: "number", required: true },
        { key: "quantity", label: "Stock", type: "number" },
        { key: "alertQty", label: "Quantité d’alerte", type: "number", required: true },
      ]),
      f("catalogue", "Catalogue produits et prestations", "Définition des produits proposés (cartes de visite, flyers, catalogues…) avec leurs caractéristiques techniques par défaut.", "produit", "produits", "Nouveau produit", ["Actif", "Brouillon", "Archivé"], [
        { key: "name", label: "Intitulé produit" },
        { key: "productKind", label: "Type" },
        { key: "family", label: "Famille", type: "select", required: true },
        { key: "basePrice", label: "Prix de base", type: "number", required: true },
        { key: "minQuantity", label: "Quantité minimum", type: "number", required: true },
        { key: "designation", label: "Désignation complète", required: true },
        { key: "printSides", label: "Nombre de côtés imprimés" },
        { key: "paperTypes", label: "Type de papier" },
        { key: "extraOptions", label: "Options supplémentaires" },
        { key: "composition", label: "Matières premières" },
      ]),
      f("tarifs", "Grilles tarifaires et règles de prix", "Pour chaque produit ou prestation du catalogue, définissez les paliers de quantité et le montant correspondant.", "produit", "produits", "Nouvelle règle", ["Actif", "Brouillon", "Archivé"], [
        { key: "name", label: "Intitulé produit" },
        { key: "family", label: "Famille" },
        { key: "priceGrid", label: "Grille tarifaire" },
      ]),
      f("postes", "Paramétrage des machines et postes", "Enregistrement des capacités, cadences et coûts horaires de chaque équipement pour alimenter les calculs de production.", "poste", "postes", "Nouveau poste", ["Actif", "Maintenance", "Hors service"], [
        { key: "name", label: "Poste / machine", required: true },
        { key: "workshop", label: "Atelier", type: "select", options: defaultWorkshops, required: true },
        { key: "cadence", label: "Cadence", required: true },
        { key: "hourlyCost", label: "Coût horaire", type: "number", required: true },
        { key: "capacity", label: "Capacité quotidienne", type: "number", required: true },
      ]),
      f("modeles-documents", "Modèles de documents", "Concevez vos devis, bons de commande, factures et bons de livraison sur une feuille A4, puis validez pour générer le HTML.", "modèle", "modèles", "Nouveau modèle", ["Publié", "Brouillon", "Archivé"], [
        { key: "name", label: "Libellé", required: true },
      ]),
      f("taxes", "Taxes", "Libellé, pourcentage et activation des taxes. Seules les taxes actives s’appliquent aux devis et factures.", "taxe", "taxes", "Nouvelle taxe", ["Active", "Inactive"], [
        { key: "name", label: "Libellé", required: true },
        { key: "code", label: "Code" },
        { key: "rate", label: "Pourcentage", type: "number", required: true },
        { key: "note", label: "Précision" },
      ]),
      f("parametres-generaux", "Paramètres généraux", "Identité de l’entreprise, logo, coordonnées et règles générales.", "paramètre", "paramètres", "Nouveau paramètre", ["Actif", "À valider"], [
        { key: "name", label: "Paramètre" },
      ]),
    ],
  },
  {
    id: "utilisateurs", number: "02", label: "Utilisateurs & Sécurité", shortLabel: "Utilisateurs", group: "Fondations",
    description: "Accès différenciés, traçabilité et continuité des données de l’entreprise.",
    features: [
      f("roles-permissions", "Gestion des rôles et permissions", "Créez les rôles (libellé et droits CRUD par module), puis les utilisateurs auxquels les affecter.", "utilisateur", "utilisateurs", "Nouvel utilisateur", ["Actif", "Invité", "Suspendu"], [
        { key: "name", label: "Nom complet", required: true },
        { key: "email", label: "E-mail" },
        { key: "phone", label: "Téléphone", required: true },
        { key: "role", label: "Rôle", required: true },
      ]),
      f("audit-trail", "Journal des actions (audit trail)", "Consultation seule des modifications importantes : auteur, module, date et détail.", "événement", "événements", "Ajouter une trace", ["Info", "Modification", "Critique"], [
        { key: "name", label: "Action", required: true },
        { key: "author", label: "Auteur" },
        { key: "module", label: "Module" },
        { key: "occurredAt", label: "Horodatage", type: "date" },
        { key: "detail", label: "Détail", type: "textarea" },
      ]),
      f("sauvegardes", "Sauvegarde et sécurité des données", "Lancez une sauvegarde : elle apparaît ensuite dans le tableau, avec le volume et l’heure d’exécution.", "sauvegarde", "sauvegardes", "Sauvegarder", ["Réussie", "Planifiée", "Échec"], [
        { key: "name", label: "Nom", required: true },
        { key: "frequency", label: "Type" },
        { key: "size", label: "Volume" },
        { key: "location", label: "Emplacement" },
        { key: "lastRun", label: "Exécution", type: "date" },
      ]),
    ],
  },
  {
    id: "clients", number: "03", label: "Gestion des Clients (CRM)", shortLabel: "Clients", group: "Commercial",
    description: "Vision à 360° de la relation client, des contacts aux commandes et documents.",
    features: [
      f("fiches-clients", "Fiche client détaillée", "Deux types de clients : particulier ou entreprise. Remise éventuelle et note interne sur chaque fiche.", "client", "clients", "Nouveau client", ["Actif", "Prospect", "Inactif"], [
        { key: "name", label: "Client", required: true },
        { key: "clientType", label: "Type" },
        { key: "phone", label: "Téléphone" },
        { key: "email", label: "E-mail" },
      ]),
      f("historique-commandes", "Historique des commandes", "Consultation des devis, commandes et factures de chaque client (particulier ou entreprise). Aucune création ici.", "client", "clients", "Consulter", ["Actif", "Prospect", "Inactif"], [
        { key: "name", label: "Client", required: true },
        { key: "clientType", label: "Type" },
        { key: "phone", label: "Téléphone" },
        { key: "email", label: "E-mail" },
      ]),
      f("segmentation", "Segmentation client", "Regroupez les clients par secteur d’activité. L’importance et le comportement se calculent automatiquement d’après les commandes.", "client", "clients", "Affecter des clients", ["Actif", "Prospect", "Inactif"], [
        { key: "name", label: "Client", required: true },
        { key: "clientType", label: "Type" },
        { key: "sector", label: "Secteur" },
      ]),
      f("contacts-multiples", "Gestion des contacts multiples", "Une entreprise n’est pas une seule personne : ajoutez plusieurs interlocuteurs (direction, marketing, comptabilité, livraison, BAT) parmi les entreprises déjà créées.", "contact", "contacts", "Nouveau contact", ["Actif", "Archivé"], [
        { key: "name", label: "Interlocuteur", required: true },
        { key: "company", label: "Entreprise", required: true },
        { key: "role", label: "Rôle", required: true },
        { key: "email", label: "E-mail", type: "email" },
        { key: "phone", label: "Téléphone" },
      ]),
    ],
  },
  {
    id: "devis-commandes", number: "04", label: "Devis & Commandes", shortLabel: "Devis & commandes", group: "Commercial",
    description: "Chiffrage technique, propositions commerciales et transformation sans ressaisie.",
    features: [
      f("calculateur", "Calculateur de prix automatique", "Sélectionnez le client, chargez un produit du catalogue, saisissez la quantité : le prix se calcule tout seul, puis vous imprimez le devis.", "chiffrage", "chiffrages", "Nouveau chiffrage", ["Calculé", "Brouillon", "Converti"], [
        { key: "name", label: "Intitulé", required: true },
        { key: "client", label: "Client", required: true },
        { key: "quantity", label: "Quantité", type: "number", required: true },
        { key: "amount", label: "Estimation", type: "number", required: true },
      ]),
      f("devis-multi", "Génération de devis multi-options", "Même parcours que le calculateur : client, produits du catalogue et grilles. Un même produit peut être repris plusieurs fois, avec des options différentes.", "devis", "devis", "Nouveau devis", ["Brouillon", "Envoyé", "Accepté", "Refusé"], [
        { key: "name", label: "Intitulé", required: true },
        { key: "client", label: "Client", required: true },
        { key: "optionA", label: "Option A", required: true },
        { key: "optionB", label: "Option B" },
        { key: "optionC", label: "Option C" },
        { key: "amount", label: "Montant", type: "number", required: true },
      ]),
      f("conversion", "Conversion devis vers commande", "Saisissez la référence d’un chiffrage du calculateur, vérifiez le détail, puis convertissez-le en commande sans ressaisie.", "devis", "devis", "Convertir un devis", ["Calculé", "Brouillon", "Converti"], [
        { key: "name", label: "Devis source", required: true },
        { key: "client", label: "Client", required: true },
        { key: "orderRef", label: "N° commande généré" },
        { key: "amount", label: "Montant", type: "number", required: true },
        { key: "convertedAt", label: "Date de conversion", type: "date" },
      ]),
      f("statuts-commandes", "Suivi des statuts de commande", "Liste des commandes issues de la conversion. Consultez le détail, changez uniquement le statut, ou supprimez.", "commande", "commandes", "Nouvelle commande", ["En attente", "En production", "En finition", "Expédiée"], [
        { key: "name", label: "Travail", required: true },
        { key: "client", label: "Client", required: true },
        { key: "quantity", label: "Quantité", type: "number", required: true },
        { key: "dueDate", label: "Échéance", type: "date", required: true },
        { key: "amount", label: "Montant", type: "number", required: true },
      ]),
      f("avenants", "Gestion des avenants", "Choisissez une commande non terminée, puis modifiez produits, options, papier, quantité et échéance. Le statut se change dans le suivi des commandes.", "avenant", "avenants", "Nouvel avenant", ["Brouillon", "Validé", "Facturé"], [
        { key: "name", label: "Modification", required: true },
        { key: "order", label: "Commande", required: true },
        { key: "reason", label: "Motif", required: true },
        { key: "delta", label: "Écart de prix", type: "number", required: true },
        { key: "newAmount", label: "Nouveau total", type: "number", required: true },
      ]),
    ],
  },
  {
    id: "prepress", number: "05", label: "Prépresse & Fichiers", shortLabel: "Prépresse", group: "Flux de production",
    description: "Réception et stockage des fichiers clients rattachés aux commandes converties.",
    features: [
      f("fichiers-clients", "Réception et stockage des fichiers clients", "Consultez une commande, déposez un ou plusieurs fichiers, remplacez une version corrigée ou supprimez un fichier.", "fichier", "fichiers", "Déposer des fichiers", ["Reçu", "Versionné"], [
        { key: "name", label: "Nom du fichier", required: true },
        { key: "order", label: "Commande", required: true },
        { key: "format", label: "Format", required: true },
        { key: "version", label: "Version", type: "number", required: true },
        { key: "sizeBytes", label: "Taille", type: "number", required: true },
      ]),
    ],
  },
  {
    id: "planification", number: "06", label: "Planification (Ordonnancement)", shortLabel: "Planification", group: "Flux de production",
    description: "Planning visuel des machines : occupé, libre, commande suivante.",
    features: [
      f("planning-machines", "Planning visuel des machines", "Grille semaine : une ligne par machine, un jour par colonne. Chaque case affiche la commande et l’horaire, ou Libre.", "créneau", "créneaux", "Placer une commande", ["Planifié", "En cours", "Libre", "Terminé"], [
        { key: "name", label: "Travail", required: true },
        { key: "machine", label: "Machine", required: true },
        { key: "order", label: "Commande", required: true },
        { key: "day", label: "Jour", type: "date", required: true },
        { key: "startTime", label: "Début", required: true },
        { key: "endTime", label: "Fin", required: true },
      ]),
    ],
  },
  {
    id: "achats", number: "07", label: "Achats & Fournisseurs", shortLabel: "Achats", group: "Support",
    description: "Sourcing, commandes d’achat, comparaison et réception des marchandises.",
    features: [
      f("fournisseurs", "Fiches fournisseurs", "Nom complet, téléphone, adresse et e-mail. Consultez, modifiez ou supprimez une fiche, et retrouvez l’historique des achats effectués auprès du fournisseur.", "fournisseur", "fournisseurs", "Nouveau fournisseur", ["Actif", "En évaluation", "Suspendu"], [
        { key: "name", label: "Nom complet", required: true },
        { key: "phone", label: "Téléphone", required: true },
        { key: "address", label: "Adresse", type: "textarea", required: true },
        { key: "email", label: "E-mail", type: "email", required: true },
      ]),
      f("approvisionnement", "Approvisionnement", "Choisissez un fournisseur et une matière première. Chaque ligne affiche le prix d’achat, le prix de vente, le stock et une quantité saisissable. La validation édite le bon de livraison.", "approvisionnement", "approvisionnements", "Nouvel approvisionnement", ["Validé"], [
        { key: "name", label: "Fournisseur", required: true },
        { key: "supplier", label: "Fournisseur" },
        { key: "quantity", label: "Quantité", type: "number" },
        { key: "amount", label: "Total TTC", type: "number", required: true },
        { key: "issuedAt", label: "Date", type: "date" },
      ]),
      f("historique-approvisionnement", "Historique d’approvisionnement", "Consultez les approvisionnements par fournisseur : total, date, nombre d’appros. Ouvrez le détail pour voir les matières. Suppression possible dans les 48 heures.", "approvisionnement", "approvisionnements", "Nouvel approvisionnement", ["Validé"], [
        { key: "name", label: "Fournisseur", required: true },
        { key: "amount", label: "Total", type: "number" },
        { key: "issuedAt", label: "Date", type: "date" },
      ]),
    ],
  },
  {
    id: "stocks", number: "08", label: "Stocks & Consommables", shortLabel: "Stocks", group: "Support",
    description: "Disponibilité, valorisation et suivi des produits finis et des matières premières.",
    features: [
      f("stock-papier", "Suivi stock", "Consultez le stock des produits finis et des matières premières. Retirez une quantité en cas de casse, perte ou autre motif.", "article", "articles", "Retirer du stock", ["Disponible", "Stock bas", "Rupture"], [
        { key: "name", label: "Article", required: true },
        { key: "quantity", label: "Stock", type: "number", required: true },
      ]),
      f("seuils-alerte", "Seuils d’alerte de réapprovisionnement", "Notification automatique lorsqu’un article atteint son stock minimum pour déclencher une commande fournisseur.", "seuil", "seuils", "Configurer un seuil", ["OK", "Alerte", "Commande lancée"], [
        { key: "name", label: "Article", required: true },
        { key: "minimum", label: "Stock minimum", type: "number", required: true },
        { key: "current", label: "Stock actuel", type: "number", required: true },
        { key: "supplier", label: "Fournisseur à relancer", required: true },
      ]),
      f("inventaire", "Inventaire et régularisation", "Comptage périodique du stock physique et ajustement des écarts constatés dans le système.", "ligne d’inventaire", "lignes d’inventaire", "Saisir un écart", ["Écart", "Régularisé", "En cours"], [
        { key: "name", label: "Article", required: true },
        { key: "systemQty", label: "Stock système", type: "number", required: true },
        { key: "physicalQty", label: "Stock physique", type: "number", required: true },
        { key: "gap", label: "Écart", type: "number" },
        { key: "reason", label: "Cause", type: "textarea" },
        { key: "qtyInit", label: "Qté init", type: "number" },
        { key: "qtySolde", label: "Qté solde", type: "number" },
      ]),
    ],
  },
  {
    id: "machines", number: "11", label: "Machines & Maintenance", shortLabel: "Machines", group: "Support",
    description: "Disponibilité du parc, entretien préventif, incidents et performance.",
    features: [
      f("fiches-machines", "Fiche technique de chaque machine", "Caractéristiques, capacité de production, historique d’utilisation et documentation technique associée.", "machine", "machines", "Ajouter une machine", ["Disponible", "En production", "Maintenance", "En panne"], [
        { key: "name", label: "Machine", required: true },
        { key: "model", label: "Modèle", required: true },
        { key: "capacity", label: "Capacité", required: true },
        { key: "hours", label: "Heures d’utilisation", type: "number", required: true },
        { key: "docs", label: "Documentation" },
      ]),
      f("maintenance", "Maintenance préventive planifiée", "Calendrier d’entretien basé sur les heures d’utilisation ou le nombre de feuilles imprimées.", "intervention", "interventions", "Planifier un entretien", ["Planifiée", "En cours", "Terminée"], [
        { key: "name", label: "Entretien", required: true },
        { key: "machine", label: "Machine", required: true },
        { key: "trigger", label: "Déclencheur", type: "select", options: ["Heures", "Feuilles imprimées", "Calendaire"], required: true },
        { key: "dueDate", label: "Échéance", type: "date", required: true },
      ]),
      f("pannes", "Signalement de pannes", "Déclaration rapide d’un incident machine par l’opérateur, avec suivi de l’intervention technique jusqu’à résolution.", "panne", "pannes", "Signaler une panne", ["Déclarée", "En intervention", "Résolue"], [
        { key: "name", label: "Incident", required: true },
        { key: "machine", label: "Machine", required: true },
        { key: "operator", label: "Opérateur", required: true },
        { key: "openedAt", label: "Déclarée le", type: "date", required: true },
        { key: "resolution", label: "Résolution", type: "textarea" },
      ]),
      f("utilisation-machines", "Suivi du taux d’utilisation des machines", "Calcul du temps machine réellement productif par rapport au temps disponible, pour repérer les goulots d’étranglement.", "mesure d’utilisation", "mesures d’utilisation", "Saisir une mesure", ["Normal", "Goulot", "Sous-utilisé"], [
        { key: "name", label: "Machine", required: true },
        { key: "available", label: "Temps disponible (h)", type: "number", required: true },
        { key: "productive", label: "Temps productif (h)", type: "number", required: true },
        { key: "rate", label: "Taux (%)", type: "number", required: true },
      ]),
    ],
  },
  {
    id: "livraisons", number: "12", label: "Livraison & Expédition", shortLabel: "Livraisons", group: "Support",
    description: "Préparation, tournées, transporteurs, suivi et retrait en atelier.",
    features: [
      f("bons-livraison", "Génération des bons de livraison", "Édition automatique du bordereau de livraison avec le détail des quantités et références expédiées.", "bon de livraison", "bons de livraison", "Générer un BL", ["Brouillon", "Édité", "Signé"], [
        { key: "name", label: "Destinataire", required: true },
        { key: "order", label: "Commande", required: true },
        { key: "qty", label: "Quantité expédiée", type: "number", required: true },
        { key: "refs", label: "Références", required: true },
      ]),
      f("tournees", "Planification des tournées", "Organisation des livraisons par zone géographique ou par transporteur pour optimiser les trajets.", "tournée", "tournées", "Planifier une tournée", ["Planifiée", "En cours", "Terminée"], [
        { key: "name", label: "Tournée", required: true },
        { key: "zone", label: "Zone", required: true },
        { key: "carrier", label: "Transporteur", type: "select", options: ["Interne", "DHL", "Chronopost"], required: true },
        { key: "stops", label: "Arrêts", type: "number", required: true },
        { key: "date", label: "Date", type: "date", required: true },
      ]),
      f("suivi-colis", "Suivi de colis en ligne", "Partage d’un lien de suivi au client dès la prise en charge du colis par le transporteur.", "colis", "colis", "Ajouter un suivi", ["Pris en charge", "En transit", "Livré"], [
        { key: "name", label: "Destinataire", required: true },
        { key: "tracking", label: "N° de suivi", required: true },
        { key: "link", label: "Lien de suivi", required: true },
        { key: "carrier", label: "Transporteur", required: true },
      ]),
      f("retrait-atelier", "Gestion du retrait en atelier", "Notification automatique au client lorsque sa commande est prête à être récupérée sur place.", "retrait", "retraits", "Notifier un retrait", ["Prêt", "Notifié", "Récupéré"], [
        { key: "name", label: "Client", required: true },
        { key: "order", label: "Commande", required: true },
        { key: "readyAt", label: "Prêt le", type: "date", required: true },
        { key: "notified", label: "Notification", type: "select", options: ["SMS", "E-mail", "Les deux"], required: true },
      ]),
    ],
  },
  {
    id: "facturation", number: "13", label: "Facturation & Comptabilité", shortLabel: "Facturation", group: "Commercial",
    description: "Factures et acomptes générés depuis les commandes converties, sans ressaisie.",
    features: [
      f("factures", "Facturation automatique", "Consultez une commande, choisissez Solde ou Acompte, puis générez la facture A4. L’acompte doit être supérieur à zéro et inférieur au total. Pas de modification ni de suppression.", "facture", "factures", "Générer une facture", ["Acompte", "Soldée"], [
        { key: "name", label: "Client", required: true },
        { key: "order", label: "Commande", required: true },
        { key: "amount", label: "Total TTC", type: "number", required: true },
        { key: "issuedAt", label: "Date d’émission", type: "date", required: true },
      ]),
      f("acomptes", "Gestion des acomptes", "Encaissez un acompte sur une commande : le payé augmente, le reste diminue. Imprimez le reçu de paiement.", "acompte", "acomptes", "Enregistrer un acompte", ["Ouvert", "Partiel", "Soldé"], [
        { key: "name", label: "Client", required: true },
        { key: "order", label: "Commande", required: true },
        { key: "asked", label: "Total", type: "number", required: true },
        { key: "received", label: "Payé", type: "number", required: true },
        { key: "remaining", label: "Reste", type: "number", required: true },
      ]),
    ],
  },
  {
    id: "ressources-humaines", number: "14", label: "Ressources Humaines", shortLabel: "Équipe", group: "Support",
    description: "Équipes, temps passé, compétences et habilitations machine.",
    features: [
      f("plannings-equipe", "Gestion des plannings d’équipe", "Répartition des opérateurs sur les postes et les horaires selon la charge de production prévue.", "affectation", "affectations", "Nouvelle affectation", ["Planifiée", "En poste", "Absente"], [
        { key: "name", label: "Collaborateur", required: true },
        { key: "post", label: "Poste", required: true },
        { key: "shift", label: "Horaire", type: "select", options: ["Matin", "Après-midi", "Journée"], required: true },
        { key: "day", label: "Jour", type: "date", required: true },
      ]),
      f("pointages", "Pointage du temps de travail", "Enregistrement du temps passé par chaque employé sur chaque commande ou poste de production.", "pointage", "pointages", "Saisir un pointage", ["Validé", "En attente", "Corrigé"], [
        { key: "name", label: "Collaborateur", required: true },
        { key: "order", label: "Commande / poste", required: true },
        { key: "hours", label: "Heures", type: "number", required: true },
        { key: "day", label: "Date", type: "date", required: true },
      ]),
      f("competences", "Suivi des compétences et habilitations", "Répertoire des qualifications et formations de chaque opérateur pour affecter les bonnes personnes aux bonnes machines.", "habilitation", "habilitations", "Ajouter une habilitation", ["Valide", "À renouveler", "Expirée"], [
        { key: "name", label: "Collaborateur", required: true },
        { key: "skill", label: "Compétence", required: true },
        { key: "machine", label: "Machine", required: true },
        { key: "expires", label: "Expiration", type: "date", required: true },
      ]),
    ],
  },
  {
    id: "communication", number: "15", label: "Communication & Notifications", shortLabel: "Communication", group: "Support",
    description: "Messages client, échanges internes et modèles cohérents avec la marque.",
    features: [
      f("notifications-auto", "Notifications automatiques par e-mail ou SMS", "Envoi d’alertes au client lors des étapes importantes : devis envoyé, BAT à valider, commande expédiée.", "automatisation", "automatisations", "Créer une automatisation", ["Active", "Brouillon", "Pause"], [
        { key: "name", label: "Déclencheur", required: true },
        { key: "channel", label: "Canal", type: "select", options: ["E-mail", "SMS", "Les deux"], required: true },
        { key: "event", label: "Événement", type: "select", options: ["Devis envoyé", "BAT à valider", "Commande expédiée"], required: true },
        { key: "template", label: "Modèle", required: true },
      ]),
      f("messagerie", "Messagerie interne", "Échange direct entre les équipes commerciales et l’atelier pour clarifier une instruction sur un dossier en cours.", "message", "messages", "Nouveau message", ["Non lu", "Lu", "Archivé"], [
        { key: "name", label: "Objet", required: true },
        { key: "from", label: "De", required: true },
        { key: "to", label: "À", required: true },
        { key: "dossier", label: "Dossier", required: true },
        { key: "body", label: "Message", type: "textarea", required: true },
      ]),
      f("modeles-com", "Modèles de communication personnalisables", "Création de modèles d’e-mails et de documents aux couleurs de l’entreprise pour toutes les communications automatiques.", "modèle", "modèles", "Nouveau modèle", ["Publié", "Brouillon"], [
        { key: "name", label: "Nom", required: true },
        { key: "channel", label: "Canal", type: "select", options: ["E-mail", "SMS", "Document"], required: true },
        { key: "subject", label: "Objet / titre", required: true },
        { key: "body", label: "Contenu", type: "textarea", required: true },
      ]),
    ],
  },
  {
    id: "reporting", number: "17", label: "Reporting & Tableaux de bord", shortLabel: "Reporting", group: "Pilotage",
    description: "Indicateurs décisionnels, rentabilité, production et exports personnalisés.",
    features: [
      f("tableau-activite", "Tableau de bord de l’activité", "Vue d’ensemble du chiffre d’affaires, du nombre de commandes en cours et du taux d’occupation des machines.", "indicateur", "indicateurs", "Ajouter un indicateur", ["À jour", "À actualiser"], [
        { key: "name", label: "Indicateur", required: true },
        { key: "value", label: "Valeur", required: true },
        { key: "period", label: "Période", required: true },
        { key: "trend", label: "Tendance", type: "select", options: ["Hausse", "Stable", "Baisse"], required: true },
      ]),
      f("rapports-rentabilite", "Rapports de rentabilité", "Analyse des marges par client, par type de produit ou par période pour orienter la stratégie commerciale.", "rapport de marge", "rapports de marge", "Nouveau rapport", ["Disponible", "En génération"], [
        { key: "name", label: "Rapport", required: true },
        { key: "axis", label: "Axe", type: "select", options: ["Client", "Produit", "Période"], required: true },
        { key: "margin", label: "Marge", type: "number", required: true },
        { key: "period", label: "Période", required: true },
      ]),
      f("stats-production", "Statistiques de production", "Indicateurs de volumes imprimés, de taux de rebut et de respect des délais sur une période donnée.", "statistique", "statistiques", "Nouvelle statistique", ["Disponible", "Planifiée"], [
        { key: "name", label: "Indicateur", required: true },
        { key: "volume", label: "Volume imprimé", type: "number", required: true },
        { key: "waste", label: "Taux de rebut (%)", type: "number", required: true },
        { key: "otd", label: "Respect des délais (%)", type: "number", required: true },
        { key: "period", label: "Période", required: true },
      ]),
      f("exports-rapports", "Export de rapports personnalisés", "Génération de rapports au format PDF ou tableur selon les indicateurs choisis par l’utilisateur.", "export", "exports", "Composer un export", ["Prêt", "Généré", "Archivé"], [
        { key: "name", label: "Nom du rapport", required: true },
        { key: "indicators", label: "Indicateurs", required: true },
        { key: "format", label: "Format", type: "select", options: ["PDF", "CSV", "XLSX"], required: true },
        { key: "period", label: "Période", required: true },
      ]),
    ],
  },
];

export const moduleMap = Object.fromEntries(modules.map((item) => [item.id, item])) as Record<ModuleId, ModuleDefinition>;

export const navigationGroups = ["Fondations", "Commercial", "Flux de production", "Support", "Pilotage"] as const;

const hiddenNavModuleIds: ModuleId[] = ["machines", "livraisons", "ressources-humaines", "communication"];

export const navModules = modules.filter((item) => !hiddenNavModuleIds.includes(item.id));

export function getFeature(moduleId: string, featureId: string) {
  const moduleDefinition = moduleMap[moduleId as ModuleId];
  if (!moduleDefinition) return null;
  const feature = moduleDefinition.features.find((item) => item.id === featureId);
  if (!feature) return null;
  return { moduleDefinition, feature };
}

export function allFeatureParams() {
  return modules.flatMap((item) => item.features.map((feature) => ({ module: item.id, feature: feature.id })));
}
