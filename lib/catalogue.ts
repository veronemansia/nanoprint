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

function priced(items: Array<[string, number]>) {
  return JSON.stringify(items.map(([label, price]) => ({ label, price })));
}

function composition(items: Array<[string, string, number, string]>) {
  return JSON.stringify(items.map(([materialId, label, quantity, unit]) => ({ materialId, label, quantity, unit })));
}

function grid(items: Array<[number, number]>) {
  return JSON.stringify(items.map(([quantity, amount]) => ({ quantity, amount })));
}

const t0 = "03 sept. 2026";
const t1 = "02 sept. 2026";
const t2 = "01 sept. 2026";
const t3 = "28 août 2026";

function designationOf(format: string, grammage: number, colors: string) {
  return `${format} · ${grammage} g · ${colors}`;
}

const rawCatalogue: MockRecord[] = [
  {
    id: "cat-1", reference: "CAT-001", status: "Actif", updatedAt: t0,
    family: "Cartes de visite", designation: designationOf("85×55 mm", 350, "Quadri R/V"), minQuantity: 250, basePrice: 18000,
    priceGrid: grid([[250, 18000], [500, 28000], [1000, 42000]]),
    name: composeProductTitle("Cartes de visite", designationOf("85×55 mm", 350, "Quadri R/V")),
    printSides: priced([["Recto seul", 18000], ["Recto-verso", 28000]]),
    paperTypes: priced([["Couché mat 350 g", 0], ["Couché brillant 350 g", 1500], ["Carton letterpress 400 g", 12000]]),
    extraOptions: priced([["Pelliculage soft touch", 8000], ["Coins arrondis", 3500], ["Dorure à chaud", 15000]]),
    productKind: "Produit",
    composition: composition([
      ["mat-1", "Couché brillant 135 g — 70×100", 2, "rame"],
      ["mat-6", "Encre Process Magenta 5 kg", 1, "fût 5 kg"],
      ["mat-11", "Film pelliculage mat 76 cm", 1, "rouleau"],
    ]),
  },
  {
    id: "cat-2", reference: "CAT-002", status: "Actif", updatedAt: t0,
    family: "Flyers", designation: designationOf("A5", 135, "Quadri R/V"), minQuantity: 500, basePrice: 42000,
    priceGrid: grid([[500, 42000], [2000, 95000], [5000, 185000]]),
    name: composeProductTitle("Flyers", designationOf("A5", 135, "Quadri R/V")),
    printSides: priced([["Recto 4+0", 42000], ["Recto-verso 4+4", 58000]]),
    paperTypes: priced([["Couché brillant 135 g", 0], ["Couché mat 170 g", 8000], ["Offset 90 g", -6000]]),
    extraOptions: priced([["Vernis acrylique recto", 9000], ["Pelliculage mat", 14000]]),
  },
  {
    id: "cat-3", reference: "CAT-003", status: "Actif", updatedAt: t1,
    family: "Affiches", designation: designationOf("A3", 170, "Quadri R"), minQuantity: 50, basePrice: 24000,
    priceGrid: grid([[50, 24000], [100, 38000], [200, 62000]]),
    name: composeProductTitle("Affiches", designationOf("A3", 170, "Quadri R")),
    printSides: priced([["Recto seul", 24000]]),
    paperTypes: priced([["Couché brillant 170 g", 0], ["Couché mat 200 g", 4500], ["Photo 250 g", 9000]]),
    extraOptions: priced([["Œillets 4 coins", 2500], ["Lamination anti-UV", 6000]]),
  },
  {
    id: "cat-4", reference: "CAT-004", status: "Actif", updatedAt: t1,
    family: "Brochures", designation: designationOf("A4", 150, "Quadri R/V"), minQuantity: 200, basePrice: 185000,
    priceGrid: grid([[200, 185000], [500, 320000], [1000, 540000]]),
    name: composeProductTitle("Brochures", designationOf("A4", 150, "Quadri R/V")),
    printSides: priced([["8 pages 4+4", 185000], ["12 pages 4+4", 248000], ["16 pages 4+4", 312000]]),
    paperTypes: priced([["Couché mat 150 g", 0], ["Couché brillant 170 g", 18000], ["Recyclé 120 g", 12000]]),
    extraOptions: priced([["2 agrafes", 0], ["Pelliculage couverture", 28000], ["Rainage", 8000]]),
  },
  {
    id: "cat-5", reference: "CAT-005", status: "Actif", updatedAt: t1,
    family: "Catalogues", designation: designationOf("A4", 150, "Quadri R/V"), minQuantity: 300, basePrice: 980000,
    priceGrid: grid([[300, 980000], [1000, 2100000], [5000, 2850000]]),
    name: composeProductTitle("Catalogues", designationOf("A4", 150, "Quadri R/V")),
    printSides: priced([["32 pages 4+4", 980000], ["48 pages 4+4", 1380000], ["64 pages 4+4", 1760000]]),
    paperTypes: priced([["Intérieur couché 150 g / couv. 250 g", 0], ["Intérieur 170 g / couv. 300 g", 120000]]),
    extraOptions: priced([["Dos carré collé", 0], ["Pelliculage mat couverture", 85000], ["Signet satin", 45000]]),
  },
  {
    id: "cat-6", reference: "CAT-006", status: "Actif", updatedAt: t1,
    family: "Invitations", designation: designationOf("A6", 300, "Pantone"), minQuantity: 100, basePrice: 42000,
    priceGrid: grid([[100, 42000], [250, 78000], [500, 128000]]),
    name: composeProductTitle("Invitations", designationOf("A6", 300, "Pantone")),
    printSides: priced([["Recto Pantone", 42000], ["Recto-verso Pantone", 61000]]),
    paperTypes: priced([["Carton texturé 300 g", 0], ["Couché mat 350 g", 4000], ["Vergé 280 g", 7000]]),
    extraOptions: priced([["Dorure or", 18000], ["Enveloppe assortie", 12000], ["Découpe à la forme", 15000]]),
  },
  {
    id: "cat-7", reference: "CAT-007", status: "Actif", updatedAt: t2,
    family: "Calendriers", designation: designationOf("A4", 200, "Quadri R"), minQuantity: 100, basePrice: 165000,
    priceGrid: grid([[100, 165000], [250, 280000], [500, 420000]]),
    name: composeProductTitle("Calendriers", designationOf("A4", 200, "Quadri R")),
    printSides: priced([["Recto 13 feuillets", 165000], ["Recto-verso 7 feuillets", 128000]]),
    paperTypes: priced([["Couché mat 200 g", 0], ["Couché brillant 250 g", 18000]]),
    extraOptions: priced([["Spirale métal", 22000], ["Trou + œillet", 8000], ["Chevalet carton", 15000]]),
  },
  {
    id: "cat-8", reference: "CAT-008", status: "Actif", updatedAt: t2,
    family: "T-shirts imprimés", designation: designationOf("Sur mesure", 180, "Quadri R"), minQuantity: 12, basePrice: 4500,
    priceGrid: grid([[12, 54000], [24, 96000], [50, 180000]]),
    name: composeProductTitle("T-shirts imprimés", designationOf("Sur mesure", 180, "Quadri R")),
    printSides: priced([["Poitrine seule", 4500], ["Poitrine + dos", 7500]]),
    paperTypes: priced([["Coton 180 g", 0], ["Coton 220 g", 1200], ["Polyester sport 160 g", 800]]),
    extraOptions: priced([["Impression DTF", 0], ["Sérigraphie 1 couleur", -800], ["Marquage manches", 1800]]),
  },
  {
    id: "cat-9", reference: "CAT-009", status: "Actif", updatedAt: t2,
    family: "Bâches", designation: designationOf("Sur mesure", 510, "Quadri R"), minQuantity: 1, basePrice: 8500,
    priceGrid: grid([[1, 8500], [5, 38000], [10, 70000]]),
    name: composeProductTitle("Bâches", designationOf("Sur mesure", 510, "Quadri R")),
    printSides: priced([["Recto (m²)", 8500]]),
    paperTypes: priced([["Bâche 510 g frontlit", 0], ["Mesh micro-perforée 340 g", 1200], ["Backlit 510 g", 2500]]),
    extraOptions: priced([["Œillets tous les 50 cm", 1500], ["Fourreau haut + bas", 2500], ["Soudure périphérie", 1800]]),
  },
  {
    id: "cat-10", reference: "CAT-010", status: "Actif", updatedAt: t2,
    family: "Stickers", designation: designationOf("Sur mesure", 90, "Quadri R"), minQuantity: 100, basePrice: 18000,
    priceGrid: grid([[100, 18000], [250, 32000], [500, 52000]]),
    name: composeProductTitle("Stickers", designationOf("Sur mesure", 90, "Quadri R")),
    printSides: priced([["Recto adhésif", 18000]]),
    paperTypes: priced([["Vinyle blanc brillant", 0], ["Vinyle transparent", 3500], ["Papier adhésif couché", -2000]]),
    extraOptions: priced([["Découpe à la forme", 8000], ["Planche A4 (non découpé)", -3000], ["Lamination", 4500]]),
  },
  {
    id: "cat-11", reference: "CAT-011", status: "Actif", updatedAt: t3,
    family: "Enveloppes", designation: designationOf("C5", 120, "1+0"), minQuantity: 250, basePrice: 32000,
    priceGrid: grid([[250, 32000], [500, 54000], [1000, 92000]]),
    name: composeProductTitle("Enveloppes", designationOf("C5", 120, "1+0")),
    printSides: priced([["Recto 1+0", 32000], ["Recto 4+0", 48000]]),
    paperTypes: priced([["Offset 120 g", 0], ["Vergé 100 g", 6000]]),
    extraOptions: priced([["Fenêtre", 4500], ["Intérieur teinté", 3500]]),
  },
  {
    id: "cat-12", reference: "CAT-012", status: "Actif", updatedAt: t3,
    family: "Papier à en-tête", designation: designationOf("A4", 90, "Quadri R"), minQuantity: 500, basePrice: 38000,
    priceGrid: grid([[500, 38000], [1000, 62000], [2500, 128000]]),
    name: composeProductTitle("Papier à en-tête", designationOf("A4", 90, "Quadri R")),
    printSides: priced([["Recto 4+0", 38000], ["Recto-verso 4+1", 52000]]),
    paperTypes: priced([["Offset 90 g", 0], ["Offset 120 g", 7000], ["Recyclé 90 g", 4000]]),
    extraOptions: priced([["Filigrane", 9000], ["Pantone logo", 6000]]),
  },
  {
    id: "cat-13", reference: "CAT-013", status: "Actif", updatedAt: t3,
    family: "Reliures", designation: designationOf("A4", 250, "Quadri R"), minQuantity: 20, basePrice: 1500,
    priceGrid: grid([[20, 30000], [50, 65000], [100, 110000]]),
    name: composeProductTitle("Reliures", designationOf("A4", 250, "Quadri R")),
    printSides: priced([["Couverture imprimée", 1500]]),
    paperTypes: priced([["Couverture couché 250 g", 0], ["Couverture 350 g", 400]]),
    extraOptions: priced([["Spirale plastique", 0], ["Spirale métal", 350], ["Dos carré collé", 800], ["Couverture transparente", 200]]),
  },
  {
    id: "cat-14", reference: "CAT-014", status: "Actif", updatedAt: t1,
    family: "Plastification", designation: designationOf("A4", 80, "1+0"), minQuantity: 10, basePrice: 400,
    priceGrid: grid([[10, 4000], [50, 16000], [100, 28000]]),
    name: composeProductTitle("Plastification", designationOf("A4", 80, "1+0")),
    printSides: priced([["Document fourni", 400], ["Impression + plastification", 900]]),
    paperTypes: priced([["Pochettes 80 µ brillant", 0], ["Pochettes 125 µ mat", 150], ["Pochettes 250 µ", 350]]),
    extraOptions: priced([["Coins arrondis", 50], ["Perforation classeur", 30]]),
  },
  {
    id: "cat-15", reference: "CAT-015", status: "Actif", updatedAt: t0,
    family: "Photocopies", designation: designationOf("A4", 80, "1+0"), minQuantity: 1, basePrice: 25,
    priceGrid: grid([[1, 25], [100, 2000], [500, 8000]]),
    name: composeProductTitle("Photocopies", designationOf("A4", 80, "1+0")),
    printSides: priced([["Noir recto", 25], ["Noir recto-verso", 40], ["Couleur recto", 120], ["Couleur recto-verso", 190]]),
    paperTypes: priced([["Offset 80 g", 0], ["Offset 90 g", 5], ["Couché 120 g", 25]]),
    extraOptions: priced([["Agrafage", 15], ["Perforation 2 trous", 10], ["Tri / assemblage", 20]]),
  },
  {
    id: "cat-16", reference: "CAT-016", status: "Brouillon", updatedAt: t2,
    family: "Kakemonos", designation: designationOf("Sur mesure", 220, "Quadri R"), minQuantity: 1, basePrice: 45000,
    priceGrid: grid([[1, 45000], [3, 120000], [5, 185000]]),
    name: composeProductTitle("Kakemonos", designationOf("Sur mesure", 220, "Quadri R")),
    printSides: priced([["Recto 85×200 cm", 45000]]),
    paperTypes: priced([["Bâche 220 g", 0], ["Tissu polyester", 8000]]),
    extraOptions: priced([["Structure aluminium", 18000], ["Housse de transport", 6000]]),
  },
  {
    id: "cat-17", reference: "CAT-017", status: "Actif", updatedAt: t0,
    family: "Conception graphique", designation: "Mise en page et création visuelle", minQuantity: 1, basePrice: 35000,
    priceGrid: grid([[1, 35000], [3, 90000], [5, 140000]]),
    name: composeProductTitle("Conception graphique", "Mise en page et création visuelle"),
    productKind: "Prestation",
    printSides: priced([]),
    paperTypes: priced([]),
    extraOptions: priced([]),
    composition: "[]",
  },
];

export const catalogueRecords: MockRecord[] = rawCatalogue.map((item) => ({
  ...item,
  productKind: catalogueKindOf(item),
  composition: item.composition || "[]",
}));
