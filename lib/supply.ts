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
  qtyInit: number;
  qtyAppro: number;
  qtySolde: number;
  unitPrice: number;
  sellPrice: number;
};

const qtyFmt = new Intl.NumberFormat("fr-FR");

export function supplyQtyAppro(line: Pick<SupplyLine, "quantity" | "qtyAppro"> | { quantity?: number; qtyAppro?: number }) {
  return Math.max(0, Math.round(Number(line.quantity ?? line.qtyAppro) || 0));
}

export function withSupplyArchive(line: SupplyLine, initStock: number): SupplyLine {
  const qtyInit = Math.max(0, Math.round(Number(initStock) || 0));
  const qtyAppro = Math.max(0, Math.round(Number(line.quantity ?? line.qtyAppro) || 0));
  return {
    ...line,
    quantity: qtyAppro,
    qtyInit,
    qtyAppro,
    qtySolde: qtyInit + qtyAppro,
  };
}

export function formatSupplyArchive(line: Pick<SupplyLine, "qtyInit" | "qtyAppro" | "qtySolde" | "quantity" | "unit">, unit = line.unit || "u") {
  const qtyInit = Math.max(0, Math.round(Number(line.qtyInit) || 0));
  const qtyAppro = supplyQtyAppro(line);
  const qtySolde = Math.max(0, Math.round(Number(line.qtySolde ?? qtyInit + qtyAppro) || 0));
  return `Init ${qtyFmt.format(qtyInit)} · Appro ${qtyFmt.format(qtyAppro)} · Solde ${qtyFmt.format(qtySolde)} ${unit}`.trim();
}

export function supplyLineTotal(line: Pick<SupplyLine, "quantity" | "qtyAppro" | "unitPrice">) {
  return Math.round(Math.max(0, supplyQtyAppro(line)) * Math.max(0, Number(line.unitPrice) || 0));
}

export function toBillingLines(lines: SupplyLine[]): BillingLine[] {
  return lines.map((line) => ({
    designation: `${line.label}${line.unit ? ` (${line.unit})` : ""}`,
    quantity: supplyQtyAppro(line),
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
        quantity: Math.max(0, Math.round(Number(row.qtyAppro ?? row.quantity) || 0)),
        qtyInit: Math.max(0, Math.round(Number(row.qtyInit) || 0)),
        qtyAppro: Math.max(0, Math.round(Number(row.qtyAppro ?? row.quantity) || 0)),
        qtySolde: Math.max(0, Math.round(Number(row.qtySolde ?? (Number(row.qtyInit) || 0) + (Number(row.qtyAppro ?? row.quantity) || 0)) || 0)),
        unitPrice: Math.max(0, Math.round(Number(row.unitPrice) || 0)),
        sellPrice: Math.max(0, Math.round(Number(row.sellPrice) || 0)),
      };
    }).filter((item) => item.materialId && item.label && item.qtyAppro > 0);
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
    quantity: supplyQtyAppro(line),
    qtyInit: line.qtyInit,
    qtyAppro: supplyQtyAppro(line),
    qtySolde: line.qtySolde,
    unitPrice: line.unitPrice,
    sellPrice: line.sellPrice,
  })));
}

export function materialStock(material: MockRecord | undefined) {
  return Math.max(0, Math.round(Number(material?.quantity) || 0));
}

export function addMaterialToCart(lines: SupplyLine[], material: MockRecord): SupplyLine[] {
  const unitPrice = Math.max(0, Math.round(Number(material.buyPrice) || 0));
  const sellPrice = Math.max(0, Math.round(Number(material.sellPrice) || 0));
  const qtyInit = materialStock(material);
  const existing = lines.find((line) => line.materialId === material.id);
  if (existing) {
    const nextQty = supplyQtyAppro(existing) + 1;
    return lines.map((line) =>
      line.id === existing.id
        ? withSupplyArchive({ ...line, quantity: nextQty, qtyAppro: nextQty, unitPrice, sellPrice }, qtyInit)
        : line,
    );
  }
  return [
    ...lines,
    withSupplyArchive({
      id: crypto.randomUUID(),
      materialId: String(material.id),
      label: String(material.name),
      unit: String(material.unit || ""),
      quantity: 1,
      qtyInit,
      qtyAppro: 1,
      qtySolde: qtyInit + 1,
      unitPrice,
      sellPrice,
    }, qtyInit),
  ];
}

export function setCartQuantity(lines: SupplyLine[], lineId: string, quantity: number, initStock: number): SupplyLine[] {
  const qty = Math.max(0, Math.round(Number(quantity) || 0));
  return lines.map((line) => (line.id === lineId ? withSupplyArchive({ ...line, quantity: qty, qtyAppro: qty }, initStock) : line));
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
      .reduce((sum, line) => sum + supplyQtyAppro(line), 0) * direction;
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
  if (lines.some((line) => supplyQtyAppro(line) < 1)) return "Chaque ligne doit avoir une quantité d’au moins 1.";
  if (lines.some((line) => !materials.some((item) => item.id === line.materialId))) {
    return "Une matière du panier n’existe plus dans le catalogue.";
  }
  return "";
}

export const supplyRecords: MockRecord[] = [];
