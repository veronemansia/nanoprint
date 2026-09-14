import { catalogueKindOf, parseProductMaterials } from "@/lib/catalogue";
import { parseQuotePayload } from "@/lib/price-calculator";
import type { MockRecord } from "@/lib/types";

export type ReportPeriod = { from: string; to: string };

export type ReportKpis = {
  revenueMonth: number;
  billedMonth: number;
  orderedMonth: number;
  billedPeriod: number;
  orderedPeriod: number;
  revenueTrend: number;
  activeOrders: number;
  activeAmount: number;
  inProduction: number;
  inFinishing: number;
  overdue: number;
  dueWeek: number;
  stockAlerts: number;
  openReceivables: number;
  attention: number;
  occupation: number;
  otd: number;
};

export type ReportSeriesPoint = {
  month: string;
  key: string;
  revenue: number;
  ordered: number;
  margin: number;
};

export type ReportActivity = {
  id: string;
  title: string;
  detail: string;
  tone: string;
  at: string;
  module?: string;
};

export type ReportDueOrder = {
  reference: string;
  name: string;
  client: string;
  status: string;
  dueDate: string;
  amount: number;
};

export type ReportStatusRow = {
  status: string;
  count: number;
  amount: number;
  quantity: number;
};

export type ReportReceivableRow = {
  client: string;
  reference: string;
  status: string;
  dueDate: string;
  total: number;
  paid: number;
  remaining: number;
  aging: string;
  daysLate: number;
};

export type ReportSalesRow = {
  name: string;
  family?: string;
  orders: number;
  quantity?: number;
  amount: number;
  materialCost: number;
  margin: number;
};

export type ReportStockRow = {
  id: string;
  name: string;
  reference: string;
  status: string;
  quantity: number;
  alertQty: number;
  value: number;
  consumed: number;
};

export type ReportPurchaseRow = {
  name: string;
  count: number;
  amount: number;
  lastDate: string;
};

export type ReportsBundle = {
  period: ReportPeriod;
  kpis: ReportKpis;
  series: ReportSeriesPoint[];
  activity: ReportActivity[];
  pipeline: { byStatus: ReportStatusRow[]; total: number; amount: number };
  overdue: ReportDueOrder[];
  dueSoon: ReportDueOrder[];
  receivables: { rows: ReportReceivableRow[]; total: number; paid: number; remaining: number };
  sales: {
    clients: ReportSalesRow[];
    products: ReportSalesRow[];
    months: Array<{ key: string; name: string; orders: number; amount: number; materialCost: number; margin: number }>;
  };
  stock: { materials: ReportStockRow[]; alerts: number; value: number; consumed: number };
  purchases: { suppliers: ReportPurchaseRow[]; total: number; count: number };
  production: {
    volume: number;
    orders: number;
    otd: number;
    occupation: number;
    waste: number | null;
    byStatus: ReportStatusRow[];
  };
};

export const REPORT_EXPORT_KINDS = [
  "activity",
  "receivables",
  "pipeline",
  "sales-clients",
  "sales-products",
  "stock",
  "purchases",
  "audit",
  "production",
] as const;

export type ReportExportKind = (typeof REPORT_EXPORT_KINDS)[number];

const PIPELINE_STATUSES = ["En attente", "En production", "En finition", "Expédiée"] as const;
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function isoDate(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultReportPeriod(now = new Date()) {
  return {
    from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
    to: isoDate(now),
  };
}

export function emptyReportsBundle(from?: string, to?: string): ReportsBundle {
  const period = from && to ? { from, to } : defaultReportPeriod();
  return {
    period,
    kpis: {
      revenueMonth: 0,
      billedMonth: 0,
      orderedMonth: 0,
      billedPeriod: 0,
      orderedPeriod: 0,
      revenueTrend: 0,
      activeOrders: 0,
      activeAmount: 0,
      inProduction: 0,
      inFinishing: 0,
      overdue: 0,
      dueWeek: 0,
      stockAlerts: 0,
      openReceivables: 0,
      attention: 0,
      occupation: 0,
      otd: 0,
    },
    series: [],
    activity: [],
    pipeline: { byStatus: PIPELINE_STATUSES.map((status) => ({ status, count: 0, amount: 0, quantity: 0 })), total: 0, amount: 0 },
    overdue: [],
    dueSoon: [],
    receivables: { rows: [], total: 0, paid: 0, remaining: 0 },
    sales: { clients: [], products: [], months: [] },
    stock: { materials: [], alerts: 0, value: 0, consumed: 0 },
    purchases: { suppliers: [], total: 0, count: 0 },
    production: { volume: 0, orders: 0, otd: 0, occupation: 0, waste: null, byStatus: [] },
  };
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "nanoprint-rapport.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function num(record: MockRecord | undefined, key: string) {
  return Number(record?.[key] ?? 0) || 0;
}

function text(record: MockRecord | undefined, key: string, fallback = "") {
  const value = record?.[key];
  return value == null ? fallback : String(value);
}

function inRange(iso: string, from: string, to: string) {
  return Boolean(iso) && iso >= from && iso <= to;
}

function daysBetween(fromIso: string, toIso: string) {
  const from = Date.parse(`${fromIso}T12:00:00`);
  const to = Date.parse(`${toIso}T12:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

function trend(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function csvCell(value: string | number) {
  let out = String(value ?? "");
  if (out !== "" && /^[=+\-@\t\r]/.test(out)) out = `'${out}`;
  if (/[";\n\r]/.test(out)) out = `"${out.replaceAll('"', '""')}"`;
  return out;
}

function csvTable(headers: string[], rows: Array<Array<string | number>>) {
  const lines = [headers.map(csvCell).join(";"), ...rows.map((row) => row.map(csvCell).join(";"))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function accum(prev: { orders: number; amount: number; materialCost: number } | undefined, amount: number, cost: number) {
  const row = prev ?? { orders: 0, amount: 0, materialCost: 0 };
  return { orders: row.orders + 1, amount: row.amount + amount, materialCost: row.materialCost + cost };
}

export function buildReportsFromRecords(
  records: Record<string, MockRecord[]>,
  from: string,
  to: string,
): ReportsBundle {
  const period = defaultReportPeriod();
  const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : period.from;
  const toDate = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : period.to;
  const today = isoDate();
  const week = isoDate(new Date(Date.now() + 6 * 86_400_000));
  const monthFrom = period.from;
  const prev = new Date();
  prev.setDate(1);
  prev.setMonth(prev.getMonth() - 1);
  const prevFrom = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;
  const prevTo = isoDate(new Date(prev.getFullYear(), prev.getMonth() + 1, 0));

  const orders = records["statuts-commandes"] ?? [];
  const clients = records["fiches-clients"] ?? [];
  const invoices = records.factures ?? [];
  const deposits = records.acomptes ?? [];
  const materials = records.matieres ?? [];
  const catalogue = records.catalogue ?? [];
  const movements = records["stock-mouvements"] ?? [];
  const supplies = records.approvisionnement ?? [];
  const suppliers = records.fournisseurs ?? [];
  const slots = records["planning-machines"] ?? [];
  const workstations = records.postes ?? [];
  const audits = records["audit-trail"] ?? [];

  const clientName = (order: MockRecord) => {
    const named = text(order, "client");
    if (named) return named;
    const found = clients.find((item) => item.id === text(order, "clientId"));
    return text(found, "name", "Client");
  };

  const sumInvoices = (start: string, end: string) =>
    invoices.reduce((sum, row) => (inRange(text(row, "issuedAt"), start, end) ? sum + num(row, "amount") : sum), 0);
  const orderDate = (order: MockRecord) => text(order, "dueDate");
  const sumOrders = (start: string, end: string) =>
    orders.reduce((sum, row) => (inRange(orderDate(row), start, end) ? sum + num(row, "amount") : sum), 0);

  const billedMonth = Math.round(sumInvoices(monthFrom, today));
  const billedPrev = Math.round(sumInvoices(prevFrom, prevTo));
  const orderedMonth = Math.round(sumOrders(monthFrom, today));
  const billedPeriod = Math.round(sumInvoices(fromDate, toDate));
  const orderedPeriod = Math.round(sumOrders(fromDate, toDate));
  const revenue = billedMonth > 0 ? billedMonth : orderedMonth;

  const open = orders.filter((row) => text(row, "status") !== "Expédiée");
  const byStatusMap = new Map<string, ReportStatusRow>();
  for (const status of PIPELINE_STATUSES) byStatusMap.set(status, { status, count: 0, amount: 0, quantity: 0 });
  for (const order of orders) {
    const status = text(order, "status");
    const row = byStatusMap.get(status) ?? { status, count: 0, amount: 0, quantity: 0 };
    row.count += 1;
    row.amount += num(order, "amount");
    row.quantity += num(order, "quantity");
    byStatusMap.set(status, row);
  }
  const byStatus = PIPELINE_STATUSES.map((status) => {
    const row = byStatusMap.get(status)!;
    return { ...row, amount: Math.round(row.amount), quantity: Math.round(row.quantity) };
  });
  const pipeline = {
    byStatus,
    total: byStatus.reduce((sum, row) => sum + row.count, 0),
    amount: byStatus.reduce((sum, row) => sum + row.amount, 0),
  };

  const toDue = (order: MockRecord): ReportDueOrder => ({
    reference: text(order, "reference"),
    name: text(order, "name"),
    client: clientName(order),
    status: text(order, "status"),
    dueDate: orderDate(order),
    amount: Math.round(num(order, "amount")),
  });
  const overdue = open.filter((row) => orderDate(row) && orderDate(row) < today).sort((a, b) => orderDate(a).localeCompare(orderDate(b))).slice(0, 12).map(toDue);
  const dueSoon = open.filter((row) => inRange(orderDate(row), today, week)).sort((a, b) => orderDate(a).localeCompare(orderDate(b))).slice(0, 12).map(toDue);

  const depositByOrder = new Map(deposits.map((row) => [text(row, "orderId"), row]));
  const receivableRows: ReportReceivableRow[] = [];
  for (const order of open) {
    const deposit = depositByOrder.get(order.id);
    const total = Math.round(num(order, "amount"));
    const paid = Math.round(num(deposit, "received"));
    const remaining = Math.max(0, deposit ? Math.round(num(deposit, "remaining")) : total - paid);
    if (remaining < 1) continue;
    const due = orderDate(order);
    const days = due && due < today ? Math.max(0, daysBetween(due, today)) : 0;
    receivableRows.push({
      client: clientName(order),
      reference: text(order, "reference"),
      status: text(order, "status"),
      dueDate: due,
      total,
      paid,
      remaining,
      aging: days <= 30 ? "0-30" : days <= 60 ? "31-60" : "61+",
      daysLate: days,
    });
  }
  receivableRows.sort((a, b) => b.remaining - a.remaining);
  const receivables = {
    rows: receivableRows.slice(0, 80),
    total: receivableRows.reduce((sum, row) => sum + row.total, 0),
    paid: receivableRows.reduce((sum, row) => sum + row.paid, 0),
    remaining: receivableRows.reduce((sum, row) => sum + row.remaining, 0),
  };

  const buy = new Map(materials.map((row) => [row.id, num(row, "buyPrice")]));
  const bom = new Map<string, Array<{ materialId: string; qty: number }>>();
  const productMeta = new Map<string, { name: string; family: string }>();
  for (const product of catalogue) {
    productMeta.set(product.id, { name: text(product, "name"), family: text(product, "family", "—") });
    if (catalogueKindOf(product) === "Prestation") continue;
    const parts = parseProductMaterials(text(product, "composition")).map((part) => ({
      materialId: part.materialId,
      qty: part.quantity,
    }));
    if (parts.length) bom.set(product.id, parts);
  }

  const clientsSales = new Map<string, { orders: number; amount: number; materialCost: number }>();
  const productSales = new Map<string, ReportSalesRow>();
  const monthSales = new Map<string, { orders: number; amount: number; materialCost: number }>();
  const periodOrders = orders.filter((row) => inRange(orderDate(row), fromDate, toDate));
  for (const order of periodOrders) {
    const amount = num(order, "amount");
    const payload = parseQuotePayload(text(order, "quotePayload"));
    const lineQty = new Map<string, number>();
    let qtyTotal = 0;
    for (const line of payload?.lines ?? []) {
      const pid = String(line.productId || "").trim();
      const qty = Math.max(0, Number(line.quantity) || 0);
      if (!pid || qty < 1) continue;
      lineQty.set(pid, (lineQty.get(pid) ?? 0) + qty);
      qtyTotal += qty;
    }
    let orderCost = 0;
    for (const [pid, qty] of lineQty) {
      for (const part of bom.get(pid) ?? []) {
        orderCost += part.qty * qty * (buy.get(part.materialId) ?? 0);
      }
    }
    const client = clientName(order);
    clientsSales.set(client, accum(clientsSales.get(client), amount, orderCost));
    const ym = orderDate(order).slice(0, 7) || fromDate.slice(0, 7);
    monthSales.set(ym, accum(monthSales.get(ym), amount, orderCost));
    if (!lineQty.size) continue;
    for (const [pid, qty] of lineQty) {
      const share = qtyTotal > 0 ? amount * (qty / qtyTotal) : 0;
      let costShare = 0;
      for (const part of bom.get(pid) ?? []) costShare += part.qty * qty * (buy.get(part.materialId) ?? 0);
      const meta = productMeta.get(pid) ?? { name: "Produit inconnu", family: "—" };
      const prevRow = productSales.get(pid) ?? { name: meta.name, family: meta.family, orders: 0, quantity: 0, amount: 0, materialCost: 0, margin: 0 };
      prevRow.orders += 1;
      prevRow.quantity = (prevRow.quantity ?? 0) + qty;
      prevRow.amount += share;
      prevRow.materialCost += costShare;
      productSales.set(pid, prevRow);
    }
  }

  const mapNamed = (items: Map<string, { orders: number; amount: number; materialCost: number }>) =>
    [...items.entries()]
      .map(([name, row]) => ({
        name,
        orders: row.orders,
        amount: Math.round(row.amount),
        materialCost: Math.round(row.materialCost),
        margin: Math.round(row.amount - row.materialCost),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 40);

  const sales = {
    clients: mapNamed(clientsSales),
    products: [...productSales.values()]
      .map((row) => ({
        ...row,
        amount: Math.round(row.amount),
        materialCost: Math.round(row.materialCost),
        quantity: Math.round(row.quantity ?? 0),
        margin: Math.round(row.amount - row.materialCost),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 40),
    months: [...monthSales.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, row]) => ({
        key,
        name: key,
        orders: row.orders,
        amount: Math.round(row.amount),
        materialCost: Math.round(row.materialCost),
        margin: Math.round(row.amount - row.materialCost),
      })),
  };

  const consumedMap = new Map<string, number>();
  let consumedTotal = 0;
  for (const move of movements) {
    if (text(move, "articleKind") !== "material") continue;
    consumedMap.set(text(move, "articleId"), (consumedMap.get(text(move, "articleId")) ?? 0) + num(move, "qtyOut"));
    consumedTotal += num(move, "qtyOut");
  }
  const stockRows: ReportStockRow[] = materials.map((row) => {
    const quantity = num(row, "quantity");
    const alertQty = num(row, "alertQty");
    return {
      id: row.id,
      name: text(row, "name"),
      reference: text(row, "reference"),
      status: text(row, "status"),
      quantity: Math.round(quantity),
      alertQty: Math.round(alertQty),
      value: Math.round(Math.max(0, quantity) * Math.max(0, num(row, "buyPrice"))),
      consumed: Math.round(consumedMap.get(row.id) ?? 0),
    };
  });
  stockRows.sort((a, b) => {
    const aAlert = a.quantity <= a.alertQty ? 0 : 1;
    const bAlert = b.quantity <= b.alertQty ? 0 : 1;
    return aAlert - bAlert || b.consumed - a.consumed;
  });
  const stock = {
    materials: stockRows.slice(0, 80),
    alerts: stockRows.filter((row) => row.quantity <= row.alertQty).length,
    value: stockRows.reduce((sum, row) => sum + row.value, 0),
    consumed: Math.round(consumedTotal),
  };

  const purchaseMap = new Map<string, ReportPurchaseRow>();
  for (const supply of supplies) {
    if (!inRange(text(supply, "issuedAt"), fromDate, toDate)) continue;
    const supplier = suppliers.find((item) => item.id === text(supply, "supplierId"));
    const name = text(supplier, "name") || text(supply, "name") || "Fournisseur";
    const prevRow = purchaseMap.get(name) ?? { name, count: 0, amount: 0, lastDate: "" };
    prevRow.count += 1;
    prevRow.amount += num(supply, "amount");
    const issued = text(supply, "issuedAt");
    if (issued > prevRow.lastDate) prevRow.lastDate = issued;
    purchaseMap.set(name, prevRow);
  }
  const purchaseRows = [...purchaseMap.values()].map((row) => ({ ...row, amount: Math.round(row.amount) })).sort((a, b) => b.amount - a.amount);
  const purchases = {
    suppliers: purchaseRows,
    total: purchaseRows.reduce((sum, row) => sum + row.amount, 0),
    count: purchaseRows.reduce((sum, row) => sum + row.count, 0),
  };

  const otdRate = 0;

  let minutes = 0;
  for (const slot of slots) {
    if (!inRange(text(slot, "day"), today, week)) continue;
    if (text(slot, "status") === "Libre") continue;
    const startParts = text(slot, "startTime", "08:00").split(":");
    const endParts = text(slot, "endTime", "18:00").split(":");
    const startMin = (Number(startParts[0]) || 0) * 60 + (Number(startParts[1]) || 0);
    const endMin = (Number(endParts[0]) || 0) * 60 + (Number(endParts[1]) || 0);
    if (endMin > startMin) minutes += endMin - startMin;
  }
  const activeMachines = workstations.filter((row) => text(row, "status") === "Actif").length || workstations.length;
  const occupation = activeMachines < 1 ? 0 : Math.min(100, Math.round((minutes / (activeMachines * 8 * 7 * 60)) * 100));

  const productionByStatus: ReportStatusRow[] = [];
  let volume = 0;
  for (const order of periodOrders) {
    const status = text(order, "status");
    const found = productionByStatus.find((row) => row.status === status);
    const qty = num(order, "quantity");
    volume += qty;
    if (found) {
      found.count += 1;
      found.quantity += qty;
      found.amount += num(order, "amount");
    } else {
      productionByStatus.push({ status, count: 1, amount: num(order, "amount"), quantity: qty });
    }
  }

  const series: ReportSeriesPoint[] = [];
  const start = new Date();
  start.setDate(1);
  start.setMonth(start.getMonth() - 11);
  for (let i = 0; i < 12; i += 1) {
    const cursor = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    const billed = invoices.reduce((sum, row) => (text(row, "issuedAt").startsWith(key) ? sum + num(row, "amount") : sum), 0);
    const ordered = orders.reduce((sum, row) => (orderDate(row).startsWith(key) ? sum + num(row, "amount") : sum), 0);
    series.push({
      month: MONTHS[cursor.getMonth()],
      key,
      revenue: Math.round(billed > 0 ? billed : ordered),
      ordered: Math.round(ordered),
      margin: 0,
    });
  }

  const stockAlerts = stock.alerts;
  const openReceivables = receivableRows.length;
  const kpis: ReportKpis = {
    revenueMonth: Math.round(revenue),
    billedMonth,
    orderedMonth,
    billedPeriod,
    orderedPeriod,
    revenueTrend: trend(revenue, billedPrev > 0 ? billedPrev : Math.round(sumOrders(prevFrom, prevTo))),
    activeOrders: open.length,
    activeAmount: Math.round(open.reduce((sum, row) => sum + num(row, "amount"), 0)),
    inProduction: byStatus.find((row) => row.status === "En production")?.count ?? 0,
    inFinishing: byStatus.find((row) => row.status === "En finition")?.count ?? 0,
    overdue: overdue.length,
    dueWeek: dueSoon.length,
    stockAlerts,
    openReceivables,
    attention: overdue.length + stockAlerts + openReceivables,
    occupation,
    otd: otdRate,
  };

  const activity: ReportActivity[] = audits.slice(0, 12).map((row, index) => {
    const action = text(row, "name") || text(row, "action") || text(row, "status");
    const tone = /supprim|delete/i.test(action) ? "magenta" : /cré|convert/i.test(action) ? "cyan" : "green";
    return {
      id: `act-${index + 1}`,
      title: text(row, "author") || text(row, "name") || "Système",
      detail: text(row, "detail") || action,
      tone,
      at: text(row, "updatedAt"),
      module: text(row, "module"),
    };
  });

  return {
    period: { from: fromDate, to: toDate },
    kpis,
    series,
    activity,
    pipeline,
    overdue,
    dueSoon,
    receivables,
    sales,
    stock,
    purchases,
    production: {
      volume: Math.round(volume),
      orders: periodOrders.length,
      otd: otdRate,
      occupation,
      waste: null,
      byStatus: productionByStatus.map((row) => ({ ...row, amount: Math.round(row.amount), quantity: Math.round(row.quantity) })),
    },
  };
}

export function csvFromBundle(kind: ReportExportKind, bundle: ReportsBundle) {
  const stamp = `${bundle.period.from}_${bundle.period.to}`;
  if (kind === "activity") {
    return {
      filename: `activite-${stamp}.csv`,
      csv: csvTable(
        ["Type", "Référence", "Client", "Statut", "Échéance", "Montant"],
        [
          ...bundle.overdue.map((row) => ["Retard", row.reference, row.client, row.status, row.dueDate, row.amount]),
          ...bundle.dueSoon.map((row) => ["Cette semaine", row.reference, row.client, row.status, row.dueDate, row.amount]),
        ],
      ),
    };
  }
  if (kind === "receivables") {
    return {
      filename: `encours-clients-${stamp}.csv`,
      csv: csvTable(
        ["Client", "Commande", "Statut", "Échéance", "Total", "Encaissé", "Reste", "Ancienneté"],
        bundle.receivables.rows.map((row) => [row.client, row.reference, row.status, row.dueDate, row.total, row.paid, row.remaining, row.aging]),
      ),
    };
  }
  if (kind === "pipeline") {
    return {
      filename: `carnet-commandes-${stamp}.csv`,
      csv: csvTable(
        ["Statut", "Commandes", "Montant", "Quantité"],
        bundle.pipeline.byStatus.map((row) => [row.status, row.count, row.amount, row.quantity]),
      ),
    };
  }
  if (kind === "sales-clients") {
    return {
      filename: `ca-clients-${stamp}.csv`,
      csv: csvTable(
        ["Client", "Commandes", "CA", "Coût matières estimé", "Marge estimée"],
        bundle.sales.clients.map((row) => [row.name, row.orders, row.amount, row.materialCost, row.margin]),
      ),
    };
  }
  if (kind === "sales-products") {
    return {
      filename: `ca-produits-${stamp}.csv`,
      csv: csvTable(
        ["Produit", "Famille", "Commandes", "Quantité", "CA réparti", "Coût matières estimé", "Marge estimée"],
        bundle.sales.products.map((row) => [row.name, row.family ?? "", row.orders, row.quantity ?? 0, row.amount, row.materialCost, row.margin]),
      ),
    };
  }
  if (kind === "stock") {
    return {
      filename: `stocks-${stamp}.csv`,
      csv: csvTable(
        ["Matière", "Référence", "Statut", "Stock", "Seuil", "Valeur", "Sorties période"],
        bundle.stock.materials.map((row) => [row.name, row.reference, row.status, row.quantity, row.alertQty, row.value, row.consumed]),
      ),
    };
  }
  if (kind === "purchases") {
    return {
      filename: `achats-${stamp}.csv`,
      csv: csvTable(
        ["Fournisseur", "Bons", "Montant", "Dernier BL"],
        bundle.purchases.suppliers.map((row) => [row.name, row.count, row.amount, row.lastDate]),
      ),
    };
  }
  if (kind === "production") {
    return {
      filename: `production-${stamp}.csv`,
      csv: csvTable(
        ["Statut", "Commandes", "Volume", "Montant"],
        bundle.production.byStatus.map((row) => [row.status, row.count, row.quantity, row.amount]),
      ),
    };
  }
  return {
    filename: `audit-${stamp}.csv`,
    csv: csvTable(
      ["Date", "Auteur", "Module", "Fonction", "Action", "Détail"],
      bundle.activity.map((row) => [row.at, row.title, row.module ?? "", "", "", row.detail]),
    ),
  };
}
