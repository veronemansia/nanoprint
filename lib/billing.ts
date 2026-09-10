import { activeTaxes, formatAmount, type CompanySettings } from "@/lib/company-settings";
import { inspectQuote } from "@/lib/price-calculator";
import { hydrateOrderRecord, normalizeQuoteRef } from "@/lib/quote-conversion";
import type { MockRecord } from "@/lib/types";

export type BillingPayment = {
  id: string;
  at: string;
  amount: number;
  receiptRef: string;
};

export type BillingLine = {
  designation: string;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type BillingTax = {
  label: string;
  rate: number;
  amount: number;
};

export type BillingTotals = {
  subtotal: number;
  discount: number;
  taxes: BillingTax[];
  total: number;
};

export function findOrderByRef(orders: MockRecord[], raw: string) {
  const needle = normalizeQuoteRef(raw);
  if (!needle) return undefined;
  return orders.find((item) => normalizeQuoteRef(item.reference) === needle);
}

export function invoicesForOrder(invoices: MockRecord[], order: MockRecord) {
  const orderId = String(order.id);
  const orderRef = normalizeQuoteRef(order.reference);
  return invoices.filter((item) => {
    if (String(item.orderId || "") === orderId) return true;
    return Boolean(orderRef && normalizeQuoteRef(String(item.order || "")) === orderRef);
  });
}

export function invoiceForOrder(invoices: MockRecord[], order: MockRecord) {
  return invoicesForOrder(invoices, order)[0];
}

export function invoiceProgress(order: MockRecord, invoices: MockRecord[]) {
  const total = Math.max(0, Math.round(Number(order.amount) || 0));
  const issued = invoicesForOrder(invoices, order);
  const billed = Math.min(total, issued.reduce((sum, item) => sum + Math.max(0, Math.round(Number(item.amount) || 0)), 0));
  const remaining = Math.max(0, total - billed);
  const hasSolde = issued.some((item) => String(item.settlement || "") === "solde");
  return { total, billed, remaining, hasSolde, issued };
}

export function sanitizeAcompteAmount(raw: string | number, remaining: number) {
  const amount = Math.round(Number(String(raw).replace(/\s/g, "").replace(",", ".")) || 0);
  if (amount <= 0) return { error: "Le montant de l’acompte doit être supérieur à zéro.", amount: 0 };
  if (remaining <= 0) return { error: "Cette commande est déjà entièrement facturée.", amount: 0 };
  if (amount >= remaining) {
    return { error: "L’acompte doit être inférieur au total restant. Pour le reste, choisissez Solde.", amount: 0 };
  }
  return { error: "", amount };
}

export function depositForOrder(deposits: MockRecord[], order: MockRecord) {
  const orderId = String(order.id);
  const orderRef = normalizeQuoteRef(order.reference);
  return deposits.find((item) => {
    if (String(item.orderId || "") === orderId) return true;
    return orderRef && normalizeQuoteRef(String(item.order || "")) === orderRef;
  });
}

export function nextInvoiceReference(invoices: MockRecord[], at = new Date()) {
  const stamp = `${String(at.getFullYear()).slice(-2)}${String(at.getMonth() + 1).padStart(2, "0")}${String(at.getDate()).padStart(2, "0")}`;
  const prefix = `FAC-${stamp}`;
  const taken = new Set(invoices.map((item) => normalizeQuoteRef(item.reference)));
  for (let index = 1; index < 100; index += 1) {
    const reference = `${prefix}${String(index).padStart(2, "0")}`;
    if (!taken.has(normalizeQuoteRef(reference))) return reference;
  }
  return `FAC-${String(Date.now()).slice(-8)}`;
}

export function nextReceiptReference(order: MockRecord, payments: BillingPayment[]) {
  const stamp = String(order.reference || "").replace(/^CMD-/i, "") || String(Date.now()).slice(-6);
  const prefix = `REC-${stamp}-`;
  const taken = new Set(payments.map((item) => normalizeQuoteRef(item.receiptRef)));
  for (let index = 1; index < 100; index += 1) {
    const reference = `${prefix}${String(index).padStart(2, "0")}`;
    if (!taken.has(normalizeQuoteRef(reference))) return reference;
  }
  return `REC-${String(Date.now()).slice(-8)}`;
}

export function nextDepositReference(order: MockRecord) {
  const stamp = String(order.reference || "").replace(/^CMD-/i, "") || String(Date.now()).slice(-6);
  return `ACO-${stamp}`;
}

export function parsePayments(raw: string | number | undefined): BillingPayment[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const row = item as Partial<BillingPayment>;
      return {
        id: String(row.id || crypto.randomUUID()),
        at: String(row.at || ""),
        amount: Math.max(0, Math.round(Number(row.amount) || 0)),
        receiptRef: String(row.receiptRef || ""),
      };
    });
  } catch {
    return [];
  }
}

export function stringifyPayments(entries: BillingPayment[]) {
  return JSON.stringify(entries);
}

export function depositSnapshot(order: MockRecord, deposit?: MockRecord) {
  const total = Math.max(0, Math.round(Number(order.amount) || 0));
  const paid = Math.min(total, Math.max(0, Math.round(Number(deposit?.received) || 0)));
  const remaining = Math.max(0, total - paid);
  const status = paid <= 0 ? "Ouvert" : remaining <= 0 ? "Soldé" : "Partiel";
  return { total, paid, remaining, status, payments: parsePayments(deposit?.payments) };
}

export function sanitizePaymentAmount(raw: string | number, remaining: number) {
  const amount = Math.round(Number(raw) || 0);
  if (amount <= 0) return { error: "Indiquez un montant à encaisser.", amount: 0 };
  if (remaining <= 0) return { error: "Cette commande est déjà soldée.", amount: 0 };
  if (amount > remaining) return { error: "Le montant dépasse le reste à payer.", amount: 0 };
  return { error: "", amount };
}

export function billingLines(
  order: MockRecord,
  quotes: MockRecord[],
  clients: MockRecord[],
  catalogue: MockRecord[],
  settings: CompanySettings,
): { lines: BillingLine[]; discount: number; rebate: number; client?: MockRecord } {
  const live = hydrateOrderRecord(order, quotes);
  const snap = inspectQuote(live, clients, catalogue, settings);
  if (snap.rows.length) {
    return {
      client: snap.client ?? undefined,
      rebate: snap.rebate,
      discount: snap.discountOn ? snap.totals.discountAmount : 0,
      lines: snap.rows.map((item) => ({
        designation: item.designation,
        quantity: item.line.quantity,
        unitPrice: item.breakdown.unitPrice,
        total: item.total,
      })),
    };
  }
  const quantity = Math.max(1, Number(order.quantity) || 1);
  const total = Math.max(0, Number(order.amount) || 0);
  return {
    client: clients.find((item) => item.id === String(order.clientId || "")) ?? clients.find((item) => item.name === order.client),
    rebate: 0,
    discount: 0,
    lines: [{
      designation: String(order.name || "Prestation d’impression"),
      quantity,
      unitPrice: Math.round(total / quantity),
      total,
    }],
  };
}

export function computeBillingTotals(lines: BillingLine[], discount: number, settings: CompanySettings): BillingTotals {
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const rebate = Math.max(0, discount);
  const net = Math.max(0, subtotal - rebate);
  const taxes = activeTaxes(settings).map((tax) => ({
    label: tax.label,
    rate: tax.rate,
    amount: Math.round(net * (tax.rate / 100)),
  }));
  return {
    subtotal,
    discount: rebate,
    taxes,
    total: net + taxes.reduce((sum, tax) => sum + tax.amount, 0),
  };
}

export function formatBillingDate(iso = "") {
  const value = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date().toISOString().slice(0, 10);
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(`${value}T12:00:00`));
}

export function todayIso(at = new Date()) {
  return at.toISOString().slice(0, 10);
}

const UNITS = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];

function belowTwenty(value: number) {
  return UNITS[value] || "";
}

function twoDigits(value: number): string {
  if (value < 17) return belowTwenty(value);
  if (value < 20) return `dix-${belowTwenty(value - 10)}`;
  const tens = Math.floor(value / 10);
  const unit = value % 10;
  const tensWord = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"][tens];
  if (tens === 7 || tens === 9) {
    const rest = 10 + unit;
    const joiner = rest === 11 ? " et " : "-";
    return `${tens === 7 ? "soixante" : "quatre-vingt"}${joiner}${twoDigits(rest)}`;
  }
  if (!unit) return tens === 8 ? "quatre-vingts" : tensWord;
  if (unit === 1 && tens !== 8) return `${tensWord} et un`;
  return `${tensWord}-${belowTwenty(unit)}`;
}

function threeDigits(value: number): string {
  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  const head = hundred === 0 ? "" : hundred === 1 ? "cent" : `${belowTwenty(hundred)} cent${rest ? "" : "s"}`;
  const tail = rest ? twoDigits(rest) : "";
  return [head, tail].filter(Boolean).join(" ");
}

export function amountInWords(value: number) {
  const amount = Math.max(0, Math.round(Number(value) || 0));
  if (!amount) return "zéro franc CFA";
  const billion = Math.floor(amount / 1_000_000_000);
  const million = Math.floor((amount % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((amount % 1_000_000) / 1000);
  const rest = amount % 1000;
  const parts: string[] = [];
  if (billion) parts.push(billion === 1 ? "un milliard" : `${threeDigits(billion)} milliards`);
  if (million) parts.push(million === 1 ? "un million" : `${threeDigits(million)} millions`);
  if (thousand) parts.push(thousand === 1 ? "mille" : `${threeDigits(thousand)} mille`);
  if (rest) parts.push(threeDigits(rest));
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return `${text} franc${amount > 1 ? "s" : ""} CFA`;
}

export function moneyLabel(amount: number, settings: CompanySettings) {
  return `${formatAmount(amount, settings)} F CFA`;
}
