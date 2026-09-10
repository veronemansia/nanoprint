import { inspectQuote } from "@/lib/price-calculator";
import type { CompanySettings } from "@/lib/company-settings";
import type { MockRecord } from "@/lib/types";

export function normalizeQuoteRef(value: string) {
  return value.trim().replace(/\s+/g, "").toLocaleUpperCase("fr");
}

export function findCalculatorQuote(quotes: MockRecord[], raw: string) {
  const needle = normalizeQuoteRef(raw);
  if (!needle) return undefined;
  return quotes.find((item) => normalizeQuoteRef(item.reference) === needle);
}

export function orderForQuote(orders: MockRecord[], quote: MockRecord) {
  const quoteId = String(quote.id);
  const quoteRef = normalizeQuoteRef(quote.reference);
  const orderRef = normalizeQuoteRef(String(quote.orderRef || ""));
  return orders.find((item) => {
    if (String(item.quoteId || "") === quoteId) return true;
    if (orderRef && normalizeQuoteRef(item.reference) === orderRef) return true;
    return quoteRef && normalizeQuoteRef(String(item.quoteRef || "")) === quoteRef;
  });
}

export function conversionBlockReason(
  quote: MockRecord,
  orders: MockRecord[],
  clients: MockRecord[],
  catalogue: MockRecord[],
  settings: CompanySettings,
) {
  if (quote.status === "Converti" || orderForQuote(orders, quote)) {
    return "Ce devis a déjà été converti en commande.";
  }
  if (quote.status !== "Calculé") {
    return "Seuls les chiffrages au statut Calculé peuvent être convertis.";
  }
  const snap = inspectQuote(quote, clients, catalogue, settings);
  if (!snap.client) return "Client introuvable sur ce devis.";
  if (!snap.ready) return "Le chiffrage est incomplet : vérifiez le produit, les options et la quantité.";
  return "";
}

export function nextOrderReference(orders: MockRecord[], at = new Date()) {
  const stamp = `${String(at.getFullYear()).slice(-2)}${String(at.getMonth() + 1).padStart(2, "0")}${String(at.getDate()).padStart(2, "0")}`;
  const prefix = `CMD-${stamp}`;
  const taken = new Set(orders.map((item) => normalizeQuoteRef(item.reference)));
  for (let index = 1; index < 100; index += 1) {
    const reference = `${prefix}${String(index).padStart(2, "0")}`;
    if (!taken.has(normalizeQuoteRef(reference))) return reference;
  }
  return `CMD-${String(Date.now()).slice(-8)}`;
}

export function defaultOrderDueDate(at = new Date()) {
  const due = new Date(at);
  due.setDate(due.getDate() + 7);
  return due.toISOString().slice(0, 10);
}

export function buildConvertedOrder(
  quote: MockRecord,
  orders: MockRecord[],
  clients: MockRecord[],
  catalogue: MockRecord[],
  settings: CompanySettings,
) {
  const reason = conversionBlockReason(quote, orders, clients, catalogue, settings);
  if (reason) return { error: reason as string, values: null, reference: "" };
  const snap = inspectQuote(quote, clients, catalogue, settings);
  const reference = nextOrderReference(orders);
  const values: Record<string, string | number> = {
    reference,
    name: String(quote.name || `Commande ${quote.reference}`),
    status: "En attente",
    client: String(snap.client?.name || quote.client || ""),
    clientId: String(snap.client?.id || quote.clientId || ""),
    quantity: Number(quote.quantity) || snap.rows.reduce((sum, item) => sum + item.line.quantity, 0),
    amount: snap.totals.total,
    dueDate: defaultOrderDueDate(),
    quoteId: quote.id,
    quoteRef: quote.reference,
    quotePayload: String(quote.quotePayload || ""),
  };
  return { error: "", values, reference };
}

export function hydrateOrderRecord(order: MockRecord, quotes: MockRecord[]): MockRecord {
  const payload = String(order.quotePayload || "").trim();
  if (payload) return order;
  const byId = quotes.find((item) => item.id === String(order.quoteId || ""));
  if (byId && String(byId.quotePayload || "").trim()) {
    return { ...order, quotePayload: byId.quotePayload, clientId: order.clientId || byId.clientId };
  }
  const byLink = quotes.find((item) =>
    String(item.orderId || "") === order.id || String(item.orderRef || "") === order.reference,
  );
  if (byLink && String(byLink.quotePayload || "").trim()) {
    return { ...order, quotePayload: byLink.quotePayload, clientId: order.clientId || byLink.clientId };
  }
  return order;
}

export const ORDER_STATUSES = ["En attente", "En production", "En finition", "Expédiée"] as const;

export function sanitizeOrderStatus(value: string) {
  return ORDER_STATUSES.find((item) => item === value) ?? "";
}
