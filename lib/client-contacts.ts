import type { MockRecord } from "@/lib/types";

export const CONTACT_ROLES = [
  "Direction",
  "Responsable marketing",
  "Responsable comptabilité",
  "Responsable livraison",
  "Validation BAT",
] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CONTACT_PURPOSE: { role: ContactRole; purpose: string }[] = [
  { role: "Validation BAT", purpose: "Valider un BAT avant impression" },
  { role: "Responsable marketing", purpose: "Valider un visuel ou une campagne" },
  { role: "Responsable comptabilité", purpose: "Envoyer une facture" },
  { role: "Responsable livraison", purpose: "Prévenir que la commande est prête" },
  { role: "Direction", purpose: "Décision ou relance de direction" },
];

export function companyClients(clients: MockRecord[]) {
  return clients.filter((client) => String(client.clientType) !== "Particulier");
}

export function contactsForCompany(contacts: MockRecord[], company: MockRecord) {
  const id = String(company.id);
  const name = String(company.name || "").trim().toLocaleLowerCase("fr");
  return contacts.filter((item) => {
    if (String(item.companyId || "") === id) return true;
    return String(item.company || "").trim().toLocaleLowerCase("fr") === name;
  });
}

export function contactForRole(contacts: MockRecord[], role: ContactRole) {
  return contacts.find((item) => item.status !== "Archivé" && String(item.role) === role);
}

export function contactPurposes(contacts: MockRecord[]) {
  return CONTACT_PURPOSE.map((item) => ({
    ...item,
    contact: contactForRole(contacts, item.role),
  }));
}
