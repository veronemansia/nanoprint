import { materialStockStatus, materialStockValue } from "@/lib/materials";
import type { MockRecord } from "@/lib/types";

export const STOCK_WRITEOFF_REASONS = ["Cassé", "Perte", "Calage", "Périmé", "Autre"] as const;

export type StockKind = "finis" | "matieres";
export type StockWriteoffReason = (typeof STOCK_WRITEOFF_REASONS)[number];

export const FINISHED_STOCK_DEFAULTS: Record<string, number> = {
  "cat-1": 420,
  "cat-2": 1600,
  "cat-3": 90,
  "cat-4": 40,
  "cat-5": 0,
  "cat-6": 220,
  "cat-7": 12,
  "cat-8": 0,
  "cat-9": 8,
  "cat-10": 350,
  "cat-11": 180,
  "cat-12": 500,
  "cat-13": 0,
  "cat-14": 60,
  "cat-15": 0,
  "cat-16": 3,
};

export function stockQuantity(record: MockRecord) {
  return Math.max(0, Math.round(Number(record.quantity) || 0));
}

export function stockAlert(record: MockRecord) {
  return Math.max(0, Math.round(Number(record.alertQty) || 0));
}

export function stockUnit(record: MockRecord, kind: StockKind) {
  return String(record.unit || (kind === "finis" ? "ex." : "u"));
}

export function stockStatusOf(record: MockRecord) {
  return materialStockStatus(stockQuantity(record), stockAlert(record) || (stockQuantity(record) > 0 ? 1 : 0));
}

export function withFinishedStock(records: MockRecord[]) {
  return records.map((item) => {
    const hasQty = item.quantity !== undefined && item.quantity !== "";
    const quantity = hasQty ? stockQuantity(item) : (FINISHED_STOCK_DEFAULTS[item.id] ?? 0);
    return {
      ...item,
      quantity,
      unit: String(item.unit || "ex."),
      alertQty: stockAlert(item) || 40,
    };
  });
}

export function withdrawBlockReason(record: MockRecord | undefined, quantity: number, reason: string) {
  if (!record) return "Cet article n’existe plus.";
  const stock = stockQuantity(record);
  if (stock < 1) return "Aucun stock à retirer.";
  if (!Number.isFinite(quantity) || quantity < 1) return "Indiquez une quantité d’au moins 1.";
  if (quantity > stock) return `La quantité ne peut pas dépasser le stock (${stock}).`;
  if (!STOCK_WRITEOFF_REASONS.includes(reason as StockWriteoffReason)) return "Choisissez un motif.";
  return "";
}

export function inventoryGap(systemQty: number, physicalQty: number) {
  return Math.round(Number(physicalQty) || 0) - Math.round(Number(systemQty) || 0);
}

export function applyStockWithdraw(record: MockRecord, quantity: number, kind: StockKind): MockRecord {
  const nextQty = Math.max(0, stockQuantity(record) - Math.max(0, Math.round(quantity)));
  const buyPrice = Number(record.buyPrice) || Number(record.basePrice) || 0;
  const alertQty = stockAlert(record);
  if (kind === "matieres") {
    return {
      ...record,
      quantity: nextQty,
      value: materialStockValue(nextQty, buyPrice),
      status: materialStockStatus(nextQty, alertQty),
      updatedAt: "À l’instant",
    };
  }
  return {
    ...record,
    quantity: nextQty,
    unit: stockUnit(record, "finis"),
    updatedAt: "À l’instant",
  };
}
