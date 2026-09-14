import { historyItemIsoDate } from "@/lib/client-history";
import type { MockRecord } from "@/lib/types";

export function mentionsSupplier(record: MockRecord, supplier: MockRecord) {
  const supplierId = String(supplier.id || "");
  if (supplierId && String(record.supplierId || "") === supplierId) return true;
  const name = String(supplier.name || "").trim().toLocaleLowerCase("fr");
  if (!name) return false;
  return String(record.supplier || "").trim().toLocaleLowerCase("fr") === name;
}

export function purchasesForSupplier(all: Record<string, MockRecord[]>, supplier: MockRecord) {
  return [...(all.approvisionnement ?? [])]
    .filter((item) => mentionsSupplier(item, supplier))
    .sort((a, b) => historyItemIsoDate(b).localeCompare(historyItemIsoDate(a)));
}

export const purchaseDetailFields = [
  { key: "reference", label: "Approvisionnement" },
  { key: "supplier", label: "Fournisseur" },
  { key: "quantity", label: "Qté appro" },
  { key: "qtyInit", label: "Qté init" },
  { key: "amount", label: "Total TTC" },
  { key: "issuedAt", label: "Date" },
  { key: "status", label: "Statut" },
  { key: "updatedAt", label: "Mise à jour" },
] as const;
