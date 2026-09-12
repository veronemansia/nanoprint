export type Role = "Administrateur" | "Commercial" | "Opérateur" | "Comptable";

export type MockUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  roleId?: string;
  companyId?: string;
};

export type ModuleId =
  | "configuration"
  | "utilisateurs"
  | "clients"
  | "devis-commandes"
  | "prepress"
  | "planification"
  | "achats"
  | "stocks"
  | "machines"
  | "livraisons"
  | "facturation"
  | "ressources-humaines"
  | "communication"
  | "reporting";

export type FieldDefinition = {
  key: string;
  label: string;
  type?: "text" | "email" | "number" | "date" | "select" | "textarea";
  options?: string[];
  required?: boolean;
};

export type FeatureDefinition = {
  id: string;
  title: string;
  description: string;
  entityName: string;
  entityNamePlural: string;
  createLabel: string;
  statuses: string[];
  fields: FieldDefinition[];
};

export type ModuleDefinition = {
  id: ModuleId;
  number: string;
  label: string;
  shortLabel: string;
  description: string;
  group: "Fondations" | "Commercial" | "Flux de production" | "Support" | "Pilotage";
  features: FeatureDefinition[];
};

export type MockRecord = {
  id: string;
  name: string;
  reference: string;
  status: string;
  updatedAt: string;
  [key: string]: string | number;
};

export type Toast = {
  id: string;
  title: string;
  message: string;
  tone: "success" | "error" | "info";
};
