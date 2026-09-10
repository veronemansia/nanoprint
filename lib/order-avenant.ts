import { inspectQuote, parseQuotePayload, stringifyQuotePayload, type QuoteLine, type QuotePayload } from "@/lib/price-calculator";
import { parsePricedOptions } from "@/lib/catalogue";
import type { CompanySettings } from "@/lib/company-settings";
import { hydrateOrderRecord, normalizeQuoteRef } from "@/lib/quote-conversion";
import type { MockRecord } from "@/lib/types";

export const AVENANT_STATUSES = ["Brouillon", "Validé", "Facturé"] as const;

export function sanitizeAvenantStatus(value: string) {
  return AVENANT_STATUSES.find((item) => item === value) ?? "";
}

export type OrderSnapshot = {
  quantity: number;
  amount: number;
  dueDate: string;
  name: string;
  quotePayload: string;
};

export type OrderHistoryEntry = {
  id: string;
  at: string;
  avenantId: string;
  avenantRef: string;
  reason: string;
  previous: OrderSnapshot;
  next: OrderSnapshot;
};

export function findOrderByRef(orders: MockRecord[], raw: string) {
  const needle = normalizeQuoteRef(raw);
  if (!needle) return undefined;
  return orders.find((item) => normalizeQuoteRef(item.reference) === needle);
}

export function isOpenOrder(order: MockRecord) {
  return String(order.status || "") !== "Expédiée";
}

export function avenantBlockReason(order: MockRecord) {
  if (!isOpenOrder(order)) {
    return "Cette commande est déjà expédiée. Un avenant n’est possible que tant qu’elle n’est pas terminée.";
  }
  return "";
}

export function snapshotOrder(order: MockRecord): OrderSnapshot {
  return {
    quantity: Number(order.quantity) || 0,
    amount: Number(order.amount) || 0,
    dueDate: String(order.dueDate || ""),
    name: String(order.name || ""),
    quotePayload: String(order.quotePayload || ""),
  };
}

export function parseOrderHistory(raw: string | number | undefined): OrderHistoryEntry[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const row = item as Partial<OrderHistoryEntry>;
      const snap = (value: unknown): OrderSnapshot => {
        const data = (value && typeof value === "object" ? value : {}) as Partial<OrderSnapshot>;
        return {
          quantity: Number(data.quantity) || 0,
          amount: Number(data.amount) || 0,
          dueDate: String(data.dueDate || ""),
          name: String(data.name || ""),
          quotePayload: String(data.quotePayload || ""),
        };
      };
      return {
        id: String(row.id || crypto.randomUUID()),
        at: String(row.at || ""),
        avenantId: String(row.avenantId || ""),
        avenantRef: String(row.avenantRef || ""),
        reason: String(row.reason || "").slice(0, 400),
        previous: snap(row.previous),
        next: snap(row.next),
      };
    });
  } catch {
    return [];
  }
}

export function stringifyOrderHistory(entries: OrderHistoryEntry[]) {
  return JSON.stringify(entries);
}

export function nextAvenantReference(order: MockRecord, avenants: MockRecord[]) {
  const stamp = String(order.reference || "").replace(/^CMD-/i, "") || String(Date.now()).slice(-6);
  const prefix = `AV-${stamp}-`;
  const taken = new Set(avenants.map((item) => normalizeQuoteRef(item.reference)));
  for (let index = 1; index < 100; index += 1) {
    const reference = `${prefix}${String(index).padStart(2, "0")}`;
    if (!taken.has(normalizeQuoteRef(reference))) return reference;
  }
  return `AV-${String(Date.now()).slice(-8)}`;
}

export function sanitizeReason(value: string) {
  return value.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 400);
}

export function sanitizeDueDate(value: string, fallback = "") {
  const next = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : fallback;
}

function sanitizeLine(line: QuoteLine, catalogue: MockRecord[]): QuoteLine | null {
  const product = catalogue.find((item) => item.id === String(line.productId || "") && item.status !== "Archivé");
  if (!product) return null;
  const prints = parsePricedOptions(product.printSides);
  const papers = parsePricedOptions(product.paperTypes);
  const extras = parsePricedOptions(product.extraOptions);
  const extraAllowed = new Set(extras.map((item) => item.id));
  return {
    id: String(line.id || crypto.randomUUID()),
    productId: product.id,
    printId: prints.some((item) => item.id === line.printId) ? line.printId : "",
    paperId: papers.some((item) => item.id === line.paperId) ? line.paperId : "",
    extraIds: (Array.isArray(line.extraIds) ? line.extraIds : []).map((id) => String(id)).filter((id) => extraAllowed.has(id)),
    quantity: Math.max(0, Math.round(Number(line.quantity) || 0)),
  };
}

export function previewOrderAvenant(
  order: MockRecord,
  quotes: MockRecord[],
  clients: MockRecord[],
  catalogue: MockRecord[],
  settings: CompanySettings,
  payload: QuotePayload,
  dueDate: string,
) {
  const live = hydrateOrderRecord(order, quotes);
  const previous = snapshotOrder(live);
  const aligned = quotePayloadFromOrder(live, quotes);
  if (aligned) previous.quotePayload = stringifyQuotePayload(aligned);
  const clientId = String(aligned?.clientId || parseQuotePayload(live.quotePayload)?.clientId || live.clientId || "");
  const lines = (payload.lines ?? []).map((line) => sanitizeLine(line, catalogue)).filter((line): line is QuoteLine => Boolean(line));
  if (!lines.length) {
    return { error: "Ajoutez au moins un produit du catalogue.", previous, next: previous, delta: 0, snap: null as ReturnType<typeof inspectQuote> | null };
  }
  const nextPayload: QuotePayload = {
    clientId,
    applyDiscount: Boolean(payload.applyDiscount),
    lines,
  };
  const nextRecord: MockRecord = {
    ...live,
    quotePayload: stringifyQuotePayload(nextPayload),
  };
  const snap = inspectQuote(nextRecord, clients, catalogue, settings);
  if (!snap.ready) {
    return {
      error: snap.rows.find((item) => item.warning)?.warning || "Complétez le produit, les options et la quantité.",
      previous,
      next: previous,
      delta: 0,
      snap,
    };
  }
  const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const next: OrderSnapshot = {
    quantity,
    amount: snap.totals.total,
    dueDate: sanitizeDueDate(dueDate, previous.dueDate),
    name: previous.name,
    quotePayload: String(nextRecord.quotePayload),
  };
  return { error: "", previous, next, delta: next.amount - previous.amount, snap };
}

export function canonicalQuotePayload(raw: string) {
  const parsed = parseQuotePayload(raw);
  if (!parsed) return "";
  return JSON.stringify({
    clientId: parsed.clientId,
    applyDiscount: parsed.applyDiscount,
    lines: parsed.lines.map((line) => ({
      productId: line.productId,
      printId: line.printId,
      paperId: line.paperId,
      extraIds: [...line.extraIds].sort(),
      quantity: line.quantity,
    })),
  });
}

export function quotePayloadFromOrder(order: MockRecord, quotes: MockRecord[]): QuotePayload | null {
  const live = hydrateOrderRecord(order, quotes);
  const parsed = parseQuotePayload(live.quotePayload);
  if (!parsed) return null;
  const payloadQty = parsed.lines.reduce((sum, line) => sum + line.quantity, 0);
  const orderQty = Number(live.quantity) || 0;
  if (orderQty > 0 && parsed.lines.length === 1 && payloadQty !== orderQty) {
    return { ...parsed, lines: [{ ...parsed.lines[0], quantity: orderQty }] };
  }
  return parsed;
}

export function avenantUnchanged(previous: OrderSnapshot, next: OrderSnapshot) {
  return previous.dueDate === next.dueDate
    && canonicalQuotePayload(previous.quotePayload) === canonicalQuotePayload(next.quotePayload);
}
