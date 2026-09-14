export const RECORD_PATH: Record<string, string> = {
  matieres: "/materials",
  catalogue: "/catalogue-products",
  postes: "/workstations",
  "modeles-documents": "/document-templates",
  "roles-permissions": "/users",
  sauvegardes: "/backups",
  "fiches-clients": "/clients",
  "contacts-multiples": "/client-contacts",
  calculateur: "/quotes",
  "devis-multi": "/quotes",
  "statuts-commandes": "/orders",
  "planning-machines": "/machine-slots",
  fournisseurs: "/suppliers",
  approvisionnement: "/supplies",
  "seuils-alerte": "/stock-alerts",
  inventaire: "/inventories",
};

export function isApiFeature(featureId: string) {
  return featureId === "tarifs" || featureId in RECORD_PATH || featureId === "taxes" || featureId === "parametres-generaux";
}
