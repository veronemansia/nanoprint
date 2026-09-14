import type { MockRecord } from "@/lib/types";

export const defaultMaterialTypes = [
  "Papier",
  "Encre",
  "Plaque",
  "Vernis",
  "Blanchet",
  "Film",
];

export const defaultMaterialUnits = [
  "rame",
  "feuille",
  "kg",
  "fût 5 kg",
  "litre",
  "bidon 20 L",
  "plaque",
  "jeu",
  "mètre",
  "rouleau",
];

export function materialStockStatus(quantity: number, alertQty: number) {
  if (quantity <= 0) return "Rupture";
  if (quantity <= alertQty) return "Stock bas";
  return "Disponible";
}

export function materialStockValue(quantity: number, buyPrice: number) {
  return Math.round(Math.max(0, quantity) * Math.max(0, buyPrice));
}

export const materialRecords: MockRecord[] = [];
