import type { MockRecord } from "@/lib/types";

export type HistoryKind = "devis" | "commande" | "facture" | "acompte";

export type HistoryGroup = {
  kind: HistoryKind;
  label: string;
  items: MockRecord[];
};

const GROUPS: { kind: HistoryKind; label: string; source: string }[] = [
  { kind: "devis", label: "Devis", source: "devis-multi" },
  { kind: "commande", label: "Commandes", source: "statuts-commandes" },
  { kind: "facture", label: "Factures", source: "factures" },
  { kind: "acompte", label: "Acomptes", source: "acomptes" },
];

export const historyItemFields: Record<HistoryKind, { key: string; label: string }[]> = {
  devis: [
    { key: "reference", label: "Référence" },
    { key: "name", label: "Intitulé" },
    { key: "client", label: "Client" },
    { key: "optionA", label: "Option A" },
    { key: "optionB", label: "Option B" },
    { key: "optionC", label: "Option C" },
    { key: "amount", label: "Montant retenu" },
    { key: "status", label: "Statut" },
    { key: "updatedAt", label: "Mise à jour" },
  ],
  commande: [
    { key: "reference", label: "Référence" },
    { key: "name", label: "Travail" },
    { key: "client", label: "Client" },
    { key: "quantity", label: "Quantité" },
    { key: "dueDate", label: "Échéance" },
    { key: "amount", label: "Montant" },
    { key: "status", label: "Statut" },
    { key: "updatedAt", label: "Mise à jour" },
  ],
  facture: [
    { key: "reference", label: "Référence" },
    { key: "name", label: "Libellé" },
    { key: "order", label: "Commande" },
    { key: "amount", label: "Total" },
    { key: "issuedAt", label: "Émise le" },
    { key: "status", label: "Statut" },
    { key: "updatedAt", label: "Mise à jour" },
  ],
  acompte: [
    { key: "reference", label: "Référence" },
    { key: "name", label: "Client" },
    { key: "order", label: "Commande" },
    { key: "asked", label: "Total" },
    { key: "received", label: "Payé" },
    { key: "remaining", label: "Reste" },
    { key: "status", label: "Statut" },
    { key: "updatedAt", label: "Mise à jour" },
  ],
};

export function mentionsClient(record: MockRecord, client: MockRecord) {
  const name = String(client.name || "").trim().toLocaleLowerCase("fr");
  if (!name) return false;
  const blob = [record.client, record.name, record.company].map((value) => String(value || "")).join(" ").toLocaleLowerCase("fr");
  return blob.includes(name);
}

export const HISTORY_TYPE_OPTIONS: { kind: HistoryKind | "all"; label: string }[] = [
  { kind: "all", label: "Tous les types" },
  ...GROUPS.map((group) => ({ kind: group.kind, label: group.label })),
];

const ISO_DATE_KEYS = ["issuedAt", "dueDate", "sentAt", "signedAt", "convertedAt", "orderedAt", "receivedAt"];

const FRENCH_MONTHS: Record<string, string> = {
  janv: "01",
  fevr: "02",
  févr: "02",
  mars: "03",
  avr: "04",
  mai: "05",
  juin: "06",
  juil: "07",
  aout: "08",
  août: "08",
  sept: "09",
  oct: "10",
  nov: "11",
  dec: "12",
  déc: "12",
};

export function historyItemIsoDate(record: MockRecord): string {
  for (const key of ISO_DATE_KEYS) {
    const value = String(record[key] || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  }
  const raw = String(record.updatedAt || "").trim();
  const match = raw.match(/^(\d{1,2})\s+([a-zéûô.]+)\s+(\d{4})$/i);
  if (!match) return "";
  const month = FRENCH_MONTHS[match[2].toLocaleLowerCase("fr").replace(".", "")];
  return month ? `${match[3]}-${month}-${match[1].padStart(2, "0")}` : "";
}

function inDateRange(iso: string, from: string, to: string) {
  if (!from && !to) return true;
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

export function filterHistoryGroups(
  groups: HistoryGroup[],
  filters: { type: HistoryKind | "all"; from: string; to: string },
): HistoryGroup[] {
  const from = filters.from && filters.to && filters.from > filters.to ? filters.to : filters.from;
  const to = filters.from && filters.to && filters.from > filters.to ? filters.from : filters.to;
  return groups
    .filter((group) => filters.type === "all" || group.kind === filters.type)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => inDateRange(historyItemIsoDate(item), from, to)),
    }));
}

export function historyForClient(all: Record<string, MockRecord[]>, client: MockRecord): HistoryGroup[] {
  return GROUPS.map((group) => ({
    kind: group.kind,
    label: group.label,
    items: (all[group.source] ?? []).filter((item) => mentionsClient(item, client)),
  }));
}

export type HistoryEntry = {
  kind: HistoryKind;
  label: string;
  record: MockRecord;
};

export function flattenHistory(groups: HistoryGroup[]): HistoryEntry[] {
  return groups
    .flatMap((group) => group.items.map((record) => ({ kind: group.kind, label: group.label, record })))
    .sort((a, b) => historyItemIsoDate(a.record).localeCompare(historyItemIsoDate(b.record)));
}

export function historyLineDescription(record: MockRecord) {
  const name = String(record.name || "").trim();
  const quantity = Number(record.quantity);
  if (quantity > 0) {
    return `${new Intl.NumberFormat("fr-FR").format(quantity)} ${name}`;
  }
  return name;
}

export function formatHistoryDate(record: MockRecord) {
  const iso = historyItemIsoDate(record);
  if (!iso) return String(record.updatedAt || "—");
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
}

export function historyTotal(record: MockRecord) {
  if (typeof record.amount === "number") return record.amount;
  if (typeof record.received === "number" && record.received > 0) return record.received;
  if (typeof record.asked === "number") return record.asked;
  return undefined;
}

export function countHistoryItems(groups: HistoryGroup[]) {
  return groups.reduce((total, group) => total + group.items.length, 0);
}
