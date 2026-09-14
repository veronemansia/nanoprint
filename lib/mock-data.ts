import type { MockRecord } from "@/lib/types";

const FEATURE_KEYS = [
  "catalogue",
  "matieres",
  "tarifs",
  "postes",
  "modeles-documents",
  "parametres-generaux",
  "roles-permissions",
  "audit-trail",
  "sauvegardes",
  "fiches-clients",
  "historique-commandes",
  "segmentation",
  "contacts-multiples",
  "calculateur",
  "devis-multi",
  "conversion",
  "statuts-commandes",
  "avenants",
  "fichiers-clients",
  "planning-machines",
  "fournisseurs",
  "approvisionnement",
  "seuils-alerte",
  "inventaire",
  "fiches-machines",
  "maintenance",
  "pannes",
  "utilisation-machines",
  "bons-livraison",
  "tournees",
  "suivi-colis",
  "retrait-atelier",
  "factures",
  "acomptes",
  "plannings-equipe",
  "pointages",
  "competences",
  "notifications-auto",
  "messagerie",
  "modeles-com",
  "tableau-activite",
  "rapports-rentabilite",
  "stats-production",
  "exports-rapports",
] as const;

export const mockRecords: Record<string, MockRecord[]> = Object.fromEntries(
  FEATURE_KEYS.map((key) => [key, [] as MockRecord[]]),
);

export const activityFeed: { id: number; title: string; detail: string; tone: string }[] = [];

export const dashboardSeries: { month: string; revenue: number; margin: number }[] = [];
