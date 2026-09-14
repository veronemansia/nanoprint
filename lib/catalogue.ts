import type { MockRecord } from "@/lib/types";

export type PricedOption = {
  id: string;
  label: string;
  price: number;
};

const money = new Intl.NumberFormat("fr-FR");

export const defaultCatalogueFamilies = [
  "Cartes de visite",
  "Flyers",
  "Affiches",
  "Brochures",
  "Catalogues",
  "Invitations",
  "Calendriers",
  "T-shirts imprimés",
  "Bâches",
  "Stickers",
  "Enveloppes",
  "Papier à en-tête",
  "Reliures",
  "Plastification",
  "Photocopies",
  "Kakemonos",
  "Chemises à rabat",
  "Carnets",
  "Menus",
  "Packaging",
  "Conception graphique",
];

export type CatalogueKind = "Produit" | "Prestation";

export function catalogueKindOf(record?: MockRecord | { productKind?: string | number } | null): CatalogueKind {
  return record?.productKind === "Prestation" ? "Prestation" : "Produit";
}

export type ProductMaterial = {
  id: string;
  materialId: string;
  label: string;
  quantity: number;
  unit: string;
};

export function newProductMaterial(material: MockRecord, quantity = 1): ProductMaterial {
  return {
    id: crypto.randomUUID(),
    materialId: String(material.id),
    label: String(material.name ?? "").trim(),
    quantity,
    unit: String(material.unit || "u"),
  };
}

export function parseProductMaterials(raw: string | number | undefined): ProductMaterial[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, index) => {
      const row = item as { id?: string; materialId?: string; label?: string; quantity?: number; unit?: string };
      return {
        id: row.id || `mat-${index}`,
        materialId: String(row.materialId ?? "").trim(),
        label: String(row.label ?? "").trim(),
        quantity: Number(row.quantity) || 0,
        unit: String(row.unit ?? "").trim() || "u",
      };
    }).filter((item) => item.label && item.quantity > 0);
  } catch {
    return [];
  }
}

export function stringifyProductMaterials(items: ProductMaterial[]) {
  return JSON.stringify(
    items
      .map((item) => ({
        materialId: item.materialId.trim(),
        label: item.label.trim(),
        quantity: Number(item.quantity) || 0,
        unit: item.unit.trim() || "u",
      }))
      .filter((item) => item.label && item.quantity > 0),
  );
}

export function summarizeProductMaterials(raw: string | number | undefined) {
  const items = parseProductMaterials(raw);
  if (!items.length) return "—";
  const qty = new Intl.NumberFormat("fr-FR");
  return items.map((item) => `${item.label} · ${qty.format(item.quantity)} ${item.unit}`).join(" · ");
}

export function newPricedOption(label = "", price = 0): PricedOption {
  return { id: crypto.randomUUID(), label, price };
}

export function parsePricedOptions(raw: string | number | undefined): PricedOption[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, index) => {
      const row = item as { id?: string; label?: string; price?: number };
      return {
        id: row.id || `opt-${index}`,
        label: String(row.label ?? "").trim(),
        price: Number(row.price) || 0,
      };
    }).filter((item) => item.label);
  } catch {
    return [];
  }
}

export function stringifyPricedOptions(options: PricedOption[]) {
  return JSON.stringify(
    options
      .map((item) => ({ label: item.label.trim(), price: Number(item.price) || 0 }))
      .filter((item) => item.label),
  );
}

export function summarizePricedOptions(raw: string | number | undefined, format = (value: number) => money.format(value)) {
  const items = parsePricedOptions(raw);
  if (!items.length) return "—";
  return items.map((item) => `${item.label} · ${format(item.price)}`).join(" · ");
}

export function composeProductTitle(family: string, designation: string) {
  return [family.trim(), designation.trim()].filter(Boolean).join(" · ");
}

export type QuantityTier = {
  id: string;
  quantity: number;
  amount: number;
};

export function newQuantityTier(quantity = 100, amount = 0): QuantityTier {
  return { id: crypto.randomUUID(), quantity, amount };
}

export function parseQuantityTiers(raw: string | number | undefined): QuantityTier[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, index) => {
      const row = item as { id?: string; quantity?: number; amount?: number };
      return {
        id: row.id || `qty-${index}`,
        quantity: Number(row.quantity) || 0,
        amount: Number(row.amount) || 0,
      };
    }).filter((item) => item.quantity > 0);
  } catch {
    return [];
  }
}

export function stringifyQuantityTiers(tiers: QuantityTier[]) {
  return JSON.stringify(
    tiers
      .map((item) => ({ quantity: Number(item.quantity) || 0, amount: Number(item.amount) || 0 }))
      .filter((item) => item.quantity > 0)
      .sort((a, b) => a.quantity - b.quantity),
  );
}

export function summarizeQuantityTiers(raw: string | number | undefined, format = (value: number) => money.format(value)) {
  const items = parseQuantityTiers(raw);
  if (!items.length) return "Aucune grille";
  return items.map((item) => `Pour ${money.format(item.quantity)} : ${format(item.amount)}`).join(" · ");
}

export const catalogueRecords: MockRecord[] = [];
