import { computeBillingTotals, type BillingLine } from "@/lib/billing";
import { materialStockStatus, materialStockValue } from "@/lib/materials";
import { normalizeQuoteRef } from "@/lib/quote-conversion";
import type { CompanySettings } from "@/lib/company-settings";
import type { MockRecord } from "@/lib/types";

export type SupplyLine = {
  id: string;
  materialId: string;
  label: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  sellPrice: number;
};

export function supplyLineTotal(line: Pick<SupplyLine, "quantity" | "unitPrice">) {
  return Math.round(Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unitPrice) || 0));
}

export function toBillingLines(lines: SupplyLine[]): BillingLine[] {
  return lines.map((line) => ({
    designation: `${line.label}${line.unit ? ` (${line.unit})` : ""}`,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    total: supplyLineTotal(line),
  }));
}

export function supplyTotals(lines: SupplyLine[], settings: CompanySettings) {
  return computeBillingTotals(toBillingLines(lines), 0, settings);
}

export function parseSupplyLines(raw: string | number | undefined): SupplyLine[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item, index) => {
      const row = item as Partial<SupplyLine>;
      return {
        id: String(row.id || `sl-${index}`),
        materialId: String(row.materialId || ""),
        label: String(row.label || "").trim(),
        unit: String(row.unit || "").trim(),
        quantity: Math.max(0, Math.round(Number(row.quantity) || 0)),
        unitPrice: Math.max(0, Math.round(Number(row.unitPrice) || 0)),
        sellPrice: Math.max(0, Math.round(Number(row.sellPrice) || 0)),
      };
    }).filter((item) => item.materialId && item.label && item.quantity > 0);
  } catch {
    return [];
  }
}

export function stringifySupplyLines(lines: SupplyLine[]) {
  return JSON.stringify(lines.map((line) => ({
    id: line.id,
    materialId: line.materialId,
    label: line.label,
    unit: line.unit,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    sellPrice: line.sellPrice,
  })));
}

export function materialStock(material: MockRecord | undefined) {
  return Math.max(0, Math.round(Number(material?.quantity) || 0));
}

export function clampCartQuantity(quantity: number, stock: number) {
  if (stock < 1) return 0;
  return Math.min(stock, Math.max(1, Math.round(Number(quantity) || 0)));
}

export function addMaterialToCart(lines: SupplyLine[], material: MockRecord): SupplyLine[] {
  const stock = materialStock(material);
  if (stock < 1) return lines;
  const unitPrice = Math.max(0, Math.round(Number(material.buyPrice) || 0));
  const sellPrice = Math.max(0, Math.round(Number(material.sellPrice) || 0));
  const existing = lines.find((line) => line.materialId === material.id);
  if (existing) {
    return lines.map((line) =>
      line.id === existing.id
        ? { ...line, quantity: clampCartQuantity(line.quantity + 1, stock), unitPrice, sellPrice }
        : line,
    );
  }
  return [
    ...lines,
    {
      id: crypto.randomUUID(),
      materialId: String(material.id),
      label: String(material.name),
      unit: String(material.unit || ""),
      quantity: 1,
      unitPrice,
      sellPrice,
    },
  ];
}

export function setCartQuantity(lines: SupplyLine[], lineId: string, quantity: number, stock: number): SupplyLine[] {
  const qty = clampCartQuantity(quantity, stock);
  if (qty < 1) return lines.filter((line) => line.id !== lineId);
  return lines.map((line) => (line.id === lineId ? { ...line, quantity: qty } : line));
}

export function nextSupplyReference(records: MockRecord[], at = new Date()) {
  const stamp = `${String(at.getFullYear()).slice(-2)}${String(at.getMonth() + 1).padStart(2, "0")}${String(at.getDate()).padStart(2, "0")}`;
  const prefix = `APP-${stamp}`;
  const taken = new Set(records.map((item) => normalizeQuoteRef(item.reference)));
  for (let index = 1; index < 100; index += 1) {
    const reference = `${prefix}${String(index).padStart(2, "0")}`;
    if (!taken.has(normalizeQuoteRef(reference))) return reference;
  }
  return `APP-${String(Date.now()).slice(-8)}`;
}

export function applySupplyToMaterials(materials: MockRecord[], lines: SupplyLine[], direction: 1 | -1 = 1) {
  return materials.map((item) => {
    const delta = lines
      .filter((line) => line.materialId === item.id)
      .reduce((sum, line) => sum + line.quantity, 0) * direction;
    if (!delta) return item;
    const quantity = Math.max(0, (Number(item.quantity) || 0) + delta);
    const buyPrice = Number(item.buyPrice) || 0;
    const alertQty = Number(item.alertQty) || 0;
    return {
      ...item,
      quantity,
      value: materialStockValue(quantity, buyPrice),
      status: materialStockStatus(quantity, alertQty),
      updatedAt: "À l’instant",
    };
  });
}

export const SUPPLY_DELETE_WINDOW_MS = 48 * 60 * 60 * 1000;

export function supplyCreatedAt(record: MockRecord) {
  const created = String(record.createdAt || "").trim();
  if (created && !Number.isNaN(Date.parse(created))) return new Date(created);
  const issued = String(record.issuedAt || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(issued)) return new Date(`${issued}T12:00:00`);
  if (issued && !Number.isNaN(Date.parse(issued))) return new Date(issued);
  return undefined;
}

export function canDeleteSupply(record: MockRecord, now = new Date()) {
  const at = supplyCreatedAt(record);
  if (!at) return false;
  const age = now.getTime() - at.getTime();
  return age >= 0 && age < SUPPLY_DELETE_WINDOW_MS;
}

export function deleteSupplyBlockReason(record: MockRecord, now = new Date()) {
  if (!canDeleteSupply(record, now)) {
    return "Un approvisionnement ne peut être supprimé que dans les 48 heures.";
  }
  return "";
}

export type SupplierSupplyGroup = {
  key: string;
  supplierId: string;
  supplier: string;
  count: number;
  total: number;
  lastDate: string;
  items: MockRecord[];
};

export function groupSuppliesBySupplier(records: MockRecord[]): SupplierSupplyGroup[] {
  const groups = new Map<string, SupplierSupplyGroup>();
  for (const item of records) {
    const supplierId = String(item.supplierId || "");
    const supplier = String(item.supplier || item.name || "Fournisseur");
    const key = supplierId || supplier.toLocaleLowerCase("fr");
    const current = groups.get(key);
    if (current) {
      current.count += 1;
      current.total += Number(item.amount) || 0;
      current.items.push(item);
      const date = String(item.issuedAt || current.lastDate);
      if (date > current.lastDate) current.lastDate = date;
    } else {
      groups.set(key, {
        key,
        supplierId,
        supplier,
        count: 1,
        total: Number(item.amount) || 0,
        lastDate: String(item.issuedAt || ""),
        items: [item],
      });
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => String(b.issuedAt || "").localeCompare(String(a.issuedAt || ""))),
    }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.supplier.localeCompare(b.supplier, "fr"));
}

export function supplyBlockReason(supplierId: string, lines: SupplyLine[], suppliers: MockRecord[], materials: MockRecord[]) {
  if (!supplierId) return "Choisissez un fournisseur.";
  if (!suppliers.some((item) => item.id === supplierId)) return "Ce fournisseur n’existe plus.";
  if (!lines.length) return "Ajoutez au moins une matière au panier.";
  if (lines.some((line) => line.quantity < 1)) return "Chaque ligne doit avoir une quantité d’au moins 1.";
  if (lines.some((line) => !materials.some((item) => item.id === line.materialId))) {
    return "Une matière du panier n’existe plus dans le catalogue.";
  }
  const overStock = lines.find((line) => {
    const material = materials.find((item) => item.id === line.materialId);
    return line.quantity > materialStock(material);
  });
  if (overStock) {
    const material = materials.find((item) => item.id === overStock.materialId);
    const stock = materialStock(material);
    return `La quantité de « ${overStock.label} » ne peut pas dépasser le stock (${stock} ${overStock.unit || "u"}).`;
  }
  return "";
}

function packed(lines: SupplyLine[]) {
  return stringifySupplyLines(lines);
}

const t0 = "03 sept. 2026";
const t1 = "02 sept. 2026";
const t2 = "01 sept. 2026";

function supplyRecord(
  id: string,
  reference: string,
  supplier: string,
  supplierId: string,
  status: string,
  updatedAt: string,
  issuedAt: string,
  lines: SupplyLine[],
  amount: number,
): MockRecord {
  return {
    id,
    reference,
    name: supplier,
    status,
    updatedAt,
    supplier,
    supplierId,
    quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    amount,
    issuedAt,
    lines: packed(lines),
  };
}

export const supplyRecords: MockRecord[] = [
  supplyRecord("app-1", "APP-26090301", "Papeteries du Sahel", "fou-1", "Validé", t0, "2026-09-03", [
    { id: "sl-1", materialId: "mat-1", label: "Couché brillant 135 g — 70×100", unit: "rame", quantity: 120, unitPrice: 15400, sellPrice: 18500 },
    { id: "sl-2", materialId: "mat-3", label: "Offset 90 g — 65×92", unit: "rame", quantity: 40, unitPrice: 9000, sellPrice: 11200 },
  ], 2605440),
  supplyRecord("app-2", "APP-26090201", "InkPro Afrique", "fou-2", "Validé", t1, "2026-09-02", [
    { id: "sl-3", materialId: "mat-7", label: "Encre Process Cyan 5 kg", unit: "fût 5 kg", quantity: 24, unitPrice: 28500, sellPrice: 34200 },
    { id: "sl-4", materialId: "mat-6", label: "Encre Process Magenta 5 kg", unit: "fût 5 kg", quantity: 12, unitPrice: 28500, sellPrice: 34200 },
  ], 1210680),
  supplyRecord("app-3", "APP-26090101", "Print Supply Sénégal", "fou-3", "Validé", t2, "2026-09-01", [
    { id: "sl-5", materialId: "mat-11", label: "Film pelliculage mat 76 cm", unit: "rouleau", quantity: 8, unitPrice: 52500, sellPrice: 68000 },
  ], 495600),
];
