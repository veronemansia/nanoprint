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

const t0 = "03 sept. 2026";
const t1 = "02 sept. 2026";
const t2 = "01 sept. 2026";
const t3 = "28 août 2026";

function r(
  id: string,
  reference: string,
  name: string,
  quantity: number,
  alertQty: number,
  extra: Record<string, string | number>,
  updatedAt: string,
): MockRecord {
  const buyPrice = Number(extra.buyPrice) || 0;
  return {
    id,
    reference,
    name,
    status: materialStockStatus(quantity, alertQty),
    updatedAt,
    quantity,
    alertQty,
    value: materialStockValue(quantity, buyPrice),
    ...extra,
  };
}

export const materialRecords: MockRecord[] = [
  r("mat-1", "MAT-CB135", "Couché brillant 135 g — 70×100", 120, 20, {
    type: "Papier", unit: "rame", buyPrice: 15400, sellPrice: 18500,
  }, t0),
  r("mat-2", "MAT-CM170", "Couché mat 170 g — 65×92", 0, 20, {
    type: "Papier", unit: "rame", buyPrice: 19000, sellPrice: 22800,
  }, t0),
  r("mat-3", "MAT-OF90", "Offset 90 g — 65×92", 40, 15, {
    type: "Papier", unit: "rame", buyPrice: 9000, sellPrice: 11200,
  }, t1),
  r("mat-4", "MAT-RE120", "Recyclé 120 g — 70×100", 0, 10, {
    type: "Papier", unit: "rame", buyPrice: 11800, sellPrice: 14500,
  }, t2),
  r("mat-5", "MAT-CB150", "Couché 150 g numérique SRA3", 0, 12, {
    type: "Papier", unit: "rame", buyPrice: 7000, sellPrice: 8900,
  }, t1),
  r("mat-6", "MAT-MAG", "Encre Process Magenta 5 kg", 12, 5, {
    type: "Encre", unit: "fût 5 kg", buyPrice: 28500, sellPrice: 34200,
  }, t0),
  r("mat-7", "MAT-CYA", "Encre Process Cyan 5 kg", 24, 8, {
    type: "Encre", unit: "fût 5 kg", buyPrice: 28500, sellPrice: 34200,
  }, t0),
  r("mat-8", "MAT-PLQ", "Plaques offset 745×605", 0, 80, {
    type: "Plaque", unit: "plaque", buyPrice: 4800, sellPrice: 6200,
  }, t1),
  r("mat-9", "MAT-VER", "Vernis acrylique 20 L", 0, 3, {
    type: "Vernis", unit: "bidon 20 L", buyPrice: 93000, sellPrice: 118000,
  }, t1),
  r("mat-10", "MAT-BLA", "Blanchet Heidelberg XL 75", 0, 2, {
    type: "Blanchet", unit: "jeu", buyPrice: 185000, sellPrice: 240000,
  }, t2),
  r("mat-11", "MAT-FILM", "Film pelliculage mat 76 cm", 8, 4, {
    type: "Film", unit: "rouleau", buyPrice: 52500, sellPrice: 68000,
  }, t3),
];
