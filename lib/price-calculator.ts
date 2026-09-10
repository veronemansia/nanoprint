import { parsePricedOptions, parseQuantityTiers, type PricedOption, type QuantityTier } from "@/lib/catalogue";
import { formatAmount } from "@/lib/company-settings";
import type { CompanySettings } from "@/lib/company-settings";
import type { QuoteTemplateData } from "@/lib/document-template";
import type { MockRecord } from "@/lib/types";

export const qtyFmt = new Intl.NumberFormat("fr-FR");

export function productTiers(product: MockRecord): QuantityTier[] {
  return parseQuantityTiers(product.priceGrid).sort((a, b) => a.quantity - b.quantity);
}

export function requiredMinQty(product: MockRecord) {
  const minQ = Math.max(1, Number(product.minQuantity) || 1);
  const first = productTiers(product)[0]?.quantity || 0;
  return Math.max(minQ, first);
}

export function matchTier(qty: number, tiers: QuantityTier[]) {
  if (!tiers.length || qty <= 0) return undefined;
  let matched: QuantityTier | undefined;
  for (const tier of tiers) {
    if (qty >= tier.quantity) matched = tier;
  }
  return matched;
}

export type LineBreakdown = {
  qty: number;
  minQuantity: number;
  requiredMin: number;
  tiers: QuantityTier[];
  matched?: QuantityTier;
  nextTier?: QuantityTier;
  unitPrice: number;
  job: number;
  printRatio: number;
  paperAmount: number;
  extrasAmount: number;
  extrasDetail: { label: string; amount: number }[];
  total: number;
  beyondLast: boolean;
  hasGrid: boolean;
};

export type QuoteLine = {
  id: string;
  productId: string;
  printId: string;
  paperId: string;
  extraIds: string[];
  quantity: number;
};

export type QuotePayload = {
  clientId: string;
  applyDiscount: boolean;
  lines: QuoteLine[];
};

export function newQuoteLine(): QuoteLine {
  return { id: crypto.randomUUID(), productId: "", printId: "", paperId: "", extraIds: [], quantity: 0 };
}

export function parseQuotePayload(raw: string | number | undefined): QuotePayload | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<QuotePayload>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      clientId: String(parsed.clientId || ""),
      applyDiscount: Boolean(parsed.applyDiscount),
      lines: Array.isArray(parsed.lines)
        ? parsed.lines.map((line) => ({
            id: String(line.id || crypto.randomUUID()),
            productId: String(line.productId || ""),
            printId: String(line.printId || ""),
            paperId: String(line.paperId || ""),
            extraIds: Array.isArray(line.extraIds) ? line.extraIds.map((id) => String(id)) : [],
            quantity: Number(line.quantity) || 0,
          }))
        : [newQuoteLine()],
    };
  } catch {
    return null;
  }
}

export function stringifyQuotePayload(payload: QuotePayload) {
  return JSON.stringify(payload);
}

export function optionById(options: PricedOption[], id: string) {
  return options.find((item) => item.id === id);
}

export function computeLineBreakdown(
  product: MockRecord,
  quantity: number,
  print?: PricedOption,
  paper?: PricedOption,
  extras: PricedOption[] = [],
): LineBreakdown {
  const qty = Math.max(0, Number(quantity) || 0);
  const minQuantity = Math.max(1, Number(product.minQuantity) || 1);
  const requiredMin = requiredMinQty(product);
  const tiers = productTiers(product);
  const hasGrid = tiers.length > 0;
  const matched = matchTier(qty, tiers);
  const last = tiers[tiers.length - 1];
  const nextTier = hasGrid ? tiers.find((tier) => qty > 0 && tier.quantity > qty) : undefined;
  const beyondLast = Boolean(last && qty > last.quantity);
  const base = Number(product.basePrice) || 0;
  const scale = qty / requiredMin;
  let job = 0;
  let unitPrice = 0;
  if (!qty || qty < requiredMin) {
    job = 0;
  } else if (matched && matched.quantity > 0) {
    unitPrice = matched.amount / matched.quantity;
    job = unitPrice * qty;
  } else {
    unitPrice = base / minQuantity;
    job = (print && !hasGrid ? print.price : base) * scale;
  }
  const printRatio = print && base > 0 ? print.price / base : 1;
  if (matched && print && base > 0) job *= printRatio;
  const paperAmount = qty >= requiredMin ? Math.round((paper?.price || 0) * scale) : 0;
  const extrasDetail = qty >= requiredMin
    ? extras.map((item) => ({ label: item.label, amount: Math.round(item.price * scale) }))
    : [];
  const extrasAmount = extrasDetail.reduce((sum, item) => sum + item.amount, 0);
  const total = Math.round(job) + paperAmount + extrasAmount;
  return {
    qty,
    minQuantity,
    requiredMin,
    tiers,
    matched,
    nextTier,
    unitPrice,
    job: Math.round(job),
    printRatio,
    paperAmount,
    extrasAmount,
    extrasDetail,
    total,
    beyondLast,
    hasGrid,
  };
}

export function computeLineTotal(
  product: MockRecord,
  quantity: number,
  print?: PricedOption,
  paper?: PricedOption,
  extras: PricedOption[] = [],
) {
  return computeLineBreakdown(product, quantity, print, paper, extras).total;
}

export function computeQuoteTotals(lines: { total: number }[], discountPercent: number, applyDiscount: boolean) {
  const grosses = lines.map((line) => line.total);
  const priced = computeQuotePricing(grosses, discountPercent, applyDiscount);
  return {
    subtotal: priced.subtotal,
    discountAmount: priced.discountAmount,
    total: priced.total,
    rebate: priced.rebate,
    nets: priced.nets,
  };
}

export function computeQuotePricing(grosses: number[], discountPercent: number, applyDiscount: boolean) {
  const subtotal = grosses.reduce((sum, value) => sum + (Number(value) || 0), 0);
  const rebate = applyDiscount ? Math.min(100, Math.max(0, Number(discountPercent) || 0)) : 0;
  const discountAmount = Math.round(subtotal * (rebate / 100));
  const total = Math.max(0, subtotal - discountAmount);
  const nets: number[] = [];
  let allocated = 0;
  grosses.forEach((gross, index) => {
    const amount = Number(gross) || 0;
    if (index === grosses.length - 1) {
      nets.push(Math.max(0, total - allocated));
      return;
    }
    const net = rebate ? Math.round(amount * (1 - rebate / 100)) : amount;
    nets.push(net);
    allocated += net;
  });
  return { subtotal, discountAmount, total, rebate, nets };
}

export function clientAddress(client: MockRecord) {
  return [client.address, client.city, client.country].filter(Boolean).join(", ");
}

export function lineDesignation(product: MockRecord, print?: PricedOption, paper?: PricedOption, extras: PricedOption[] = []) {
  return [product.name, print?.label, paper?.label, ...extras.map((item) => item.label)].filter(Boolean).join(" · ");
}

export function formatQuoteLines(
  lines: { designation: string; quantity: number; total: number }[],
  settings: CompanySettings,
) {
  return lines.map((line) => ({
    designation: line.designation,
    quantity: new Intl.NumberFormat("fr-FR").format(line.quantity),
    unit: formatAmount(line.quantity ? line.total / line.quantity : 0, settings),
    total: formatAmount(line.total, settings),
  }));
}

export type ResolvedQuoteLine = {
  line: QuoteLine;
  product: MockRecord;
  prints: PricedOption[];
  papers: PricedOption[];
  extraOptions: PricedOption[];
  print?: PricedOption;
  paper?: PricedOption;
  extras: PricedOption[];
  total: number;
  designation: string;
  minQuantity: number;
  requiredMin: number;
  breakdown: LineBreakdown;
  valid: boolean;
  warning: string;
  hint: string;
};

export function resolveQuoteLine(line: QuoteLine, catalogue: MockRecord[]): ResolvedQuoteLine | null {
  const product = catalogue.find((item) => item.id === line.productId);
  if (!product) return null;
  const prints = parsePricedOptions(product.printSides);
  const papers = parsePricedOptions(product.paperTypes);
  const extraOptions = parsePricedOptions(product.extraOptions);
  const print = optionById(prints, line.printId);
  const paper = optionById(papers, line.paperId);
  const extras = extraOptions.filter((item) => line.extraIds.includes(item.id));
  const breakdown = computeLineBreakdown(product, line.quantity, print, paper, extras);
  const qty = breakdown.qty;
  let warning = "";
  let hint = "";
  if (!qty) warning = "Indiquez la quantité commandée.";
  else if (qty < breakdown.requiredMin) {
    warning = `Quantité trop basse : minimum ${qtyFmt.format(breakdown.requiredMin)} ex. (fiche produit${breakdown.hasGrid ? " et premier palier de la grille" : ""}).`;
  } else if (prints.length && !print) warning = "Choisissez le nombre de côtés imprimés.";
  else if (papers.length && !paper) warning = "Choisissez le type de papier.";
  else if (breakdown.hasGrid && !breakdown.matched) warning = "Aucun palier de la grille ne correspond à cette quantité.";
  if (!warning && breakdown.nextTier) {
    const missing = breakdown.nextTier.quantity - qty;
    hint = `Plus que ${qtyFmt.format(missing)} ex. pour le palier ${qtyFmt.format(breakdown.nextTier.quantity)}.`;
  } else if (!warning && breakdown.beyondLast && breakdown.matched) {
    hint = `Au-delà du dernier palier (${qtyFmt.format(breakdown.matched.quantity)} ex.) : le prix unitaire de ce palier est conservé.`;
  }
  return {
    line,
    product,
    prints,
    papers,
    extraOptions,
    print,
    paper,
    extras,
    total: breakdown.total,
    designation: lineDesignation(product, print, paper, extras),
    minQuantity: breakdown.minQuantity,
    requiredMin: breakdown.requiredMin,
    breakdown,
    valid: !warning && breakdown.total > 0,
    warning,
    hint,
  };
}

export function quoteLinesReady(resolved: Array<ResolvedQuoteLine | null>) {
  const rows = resolved.filter((item): item is ResolvedQuoteLine => Boolean(item));
  return rows.length > 0 && rows.length === resolved.length && rows.every((item) => item.valid);
}

export function buildQuoteTemplateData(
  client: MockRecord,
  resolved: ResolvedQuoteLine[],
  total: number,
  settings: CompanySettings,
  ref: string,
  pricing?: { rebate: number; discountAmount: number; nets: number[] },
): QuoteTemplateData {
  const productLines = formatQuoteLines(
    resolved.map((item) => ({
      designation: item.designation,
      quantity: item.line.quantity,
      total: item.total,
    })),
    settings,
  );
  if (pricing && pricing.discountAmount > 0) {
    productLines.push({
      designation: `Remise client ${pricing.rebate} %`,
      quantity: "—",
      unit: "",
      total: `− ${formatAmount(pricing.discountAmount, settings)}`,
    });
  }
  return {
    client: String(client.name || ""),
    phone: String(client.phone || "—"),
    address: clientAddress(client) || "—",
    email: String(client.email || "—"),
    ref,
    date: new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date()),
    amount: formatAmount(total, settings),
    lines: productLines,
  };
}

export function inspectQuote(
  record: MockRecord,
  clients: MockRecord[],
  catalogue: MockRecord[],
  settings: CompanySettings,
) {
  const payload = parseQuotePayload(record.quotePayload);
  const client = clients.find((item) => item.id === String(payload?.clientId || record.clientId || ""))
    ?? clients.find((item) => item.name === record.client);
  const resolved = (payload?.lines ?? []).map((line) => resolveQuoteLine(line, catalogue));
  const rows = resolved.filter((item): item is ResolvedQuoteLine => Boolean(item));
  const rebate = Number(client?.discount) || 0;
  const discountOn = Boolean(payload?.applyDiscount && rebate > 0);
  const totals = computeQuoteTotals(
    rows.map((item) => ({ total: item.total })),
    rebate,
    discountOn,
  );
  const ready = Boolean(client && quoteLinesReady(resolved));
  const templateData = (ref: string): QuoteTemplateData | null => {
    if (!client || !rows.length) return null;
    return buildQuoteTemplateData(
      client,
      rows,
      totals.total,
      settings,
      ref,
      discountOn ? { rebate: totals.rebate, discountAmount: totals.discountAmount, nets: totals.nets } : undefined,
    );
  };
  return { payload, client, resolved, rows, rebate, discountOn, totals, ready, templateData };
}
