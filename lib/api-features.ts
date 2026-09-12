export const RECORD_PATH: Record<string, string> = {
  matieres: "/materials",
  catalogue: "/catalogue-products",
  postes: "/workstations",
  "modeles-documents": "/document-templates",
  "roles-permissions": "/users",
  sauvegardes: "/backups",
};

export function isApiFeature(featureId: string) {
  return featureId === "tarifs" || featureId in RECORD_PATH || featureId === "taxes" || featureId === "parametres-generaux";
}
