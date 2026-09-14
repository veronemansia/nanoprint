"use server";

import type { AccessRole } from "@/lib/access";
import type { CompanySettings, TaxSetting } from "@/lib/company-settings";
import { hasSessionCookie, phpFetch } from "@/lib/php-api";
import { RECORD_PATH } from "@/lib/api-features";
import type { QuotePayload } from "@/lib/price-calculator";
import type { ClientHistoryPayload } from "@/lib/client-history";
import type { BillingPayment } from "@/lib/billing";
import type { StockKind } from "@/lib/stock";
import type { ReportExportKind, ReportsBundle } from "@/lib/reports";
import type { MockRecord, MockUser } from "@/lib/types";

function quoteKind(featureId: string): "chiffrage" | "devis" | undefined {
  if (featureId === "calculateur") return "chiffrage";
  if (featureId === "devis-multi") return "devis";
  return undefined;
}

export type BootstrapPayload = {
  user: MockUser;
  settings: CompanySettings;
  accessRoles: AccessRole[];
  catalogueFamilies: string[];
  workshops: string[];
  materialTypes: string[];
  materialUnits: string[];
  clientSectors?: string[];
  records: Record<string, MockRecord[]>;
};

export async function bootstrapAction(): Promise<BootstrapPayload | null> {
  if (!(await hasSessionCookie())) return null;
  try {
    return await phpFetch<BootstrapPayload>("/bootstrap");
  } catch {
    return null;
  }
}

export async function listAuditLogsAction() {
  return phpFetch<MockRecord[]>("/audit-logs");
}

export async function createRecordAction(featureId: string, values: Record<string, string | number>) {
  const path = RECORD_PATH[featureId === "tarifs" ? "catalogue" : featureId];
  if (!path) throw new Error("Feature non migrée.");
  const kind = quoteKind(featureId);
  return phpFetch<MockRecord>(path, {
    method: "POST",
    body: JSON.stringify(kind ? { ...values, kind } : values),
  });
}

export async function updateRecordAction(featureId: string, id: string, values: Record<string, string | number>) {
  const path = RECORD_PATH[featureId === "tarifs" ? "catalogue" : featureId];
  if (!path) throw new Error("Feature non migrée.");
  return phpFetch<MockRecord>(`${path}/${id}`, { method: "PATCH", body: JSON.stringify(values) });
}

export async function deleteRecordAction(featureId: string, id: string) {
  const path = RECORD_PATH[featureId === "tarifs" ? "catalogue" : featureId];
  if (!path) throw new Error("Feature non migrée.");
  await phpFetch(`${path}/${id}`, { method: "DELETE" });
}

export async function saveSettingsAction(next: CompanySettings) {
  const settings = await phpFetch<CompanySettings>("/settings", {
    method: "PUT",
    body: JSON.stringify({
      tradeName: next.tradeName,
      legalName: next.legalName,
      legalForm: next.legalForm,
      ninea: next.ninea,
      rccm: next.rccm,
      address: next.address,
      city: next.city,
      country: next.country,
      phone: next.phone,
      email: next.email,
      website: next.website,
      iban: next.iban,
      bank: next.bank,
      logo: next.logo,
      workDays: next.workDays,
      openingHours: next.openingHours,
      paperUnit: next.paperUnit,
      currencies: next.currencies,
    }),
  });
  if (Array.isArray(next.taxes)) {
    settings.taxes = await syncTaxesAction(next.taxes);
  }
  return settings;
}

export async function resetSettingsAction() {
  return phpFetch<CompanySettings>("/settings/reset", { method: "POST" });
}

export async function syncTaxesAction(taxes: TaxSetting[]) {
  const current = await phpFetch<TaxSetting[]>("/taxes");
  const keep = new Set(taxes.map((item) => item.id));
  for (const item of current) {
    if (!keep.has(item.id)) {
      await phpFetch(`/taxes/${item.id}`, { method: "DELETE" });
    }
  }
  const saved: TaxSetting[] = [];
  for (const item of taxes) {
    const exists = current.some((row) => row.id === item.id);
    saved.push(
      await phpFetch<TaxSetting>(exists ? `/taxes/${item.id}` : "/taxes", {
        method: exists ? "PATCH" : "POST",
        body: JSON.stringify(item),
      }),
    );
  }
  return saved;
}

export async function resetTaxesAction() {
  return phpFetch<TaxSetting[]>("/taxes/reset", { method: "POST" });
}

export async function addLookupAction(kind: string, name: string) {
  const result = await phpFetch<{ name: string }>(`/${kind}`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return result.name;
}

export async function renameLookupAction(kind: string, from: string, to: string) {
  const result = await phpFetch<{ name: string }>(`/${kind}`, {
    method: "PATCH",
    body: JSON.stringify({ from, to }),
  });
  return result.name;
}

export async function saveRoleAction(role: AccessRole) {
  return phpFetch<AccessRole>(`/roles/${role.id}`, {
    method: "PUT",
    body: JSON.stringify(role),
  });
}

export async function deleteRoleAction(id: string) {
  return phpFetch<{
    accessRoles: AccessRole[];
    fallback: { id: string; name: string };
  }>(`/roles/${id}`, { method: "DELETE" });
}

export async function deleteLookupAction(kind: string, name: string) {
  const result = await phpFetch<{ name: string }>(`/${kind}`, {
    method: "DELETE",
    body: JSON.stringify({ name }),
  });
  return result.name;
}

export async function addClientSectorAction(name: string) {
  const result = await phpFetch<{ name: string }>("/client-sectors", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return result.name;
}

export async function renameClientSectorAction(from: string, to: string) {
  const result = await phpFetch<{ name: string }>("/client-sectors", {
    method: "PATCH",
    body: JSON.stringify({ from, to }),
  });
  return result.name;
}

export async function deleteClientSectorAction(name: string) {
  const result = await phpFetch<{ name: string }>("/client-sectors", {
    method: "DELETE",
    body: JSON.stringify({ name }),
  });
  return result.name;
}

export async function assignClientsSectorAction(ids: string[], sector: string) {
  return phpFetch<MockRecord[]>("/clients/assign-sector", {
    method: "POST",
    body: JSON.stringify({ ids, sector }),
  });
}

export async function listClientHistoryAction(clientId: string) {
  return phpFetch<ClientHistoryPayload>(`/clients/${encodeURIComponent(clientId)}/history`);
}

export async function convertQuoteAction(quoteId: string) {
  return phpFetch<{ quote: MockRecord; order: MockRecord; materials?: MockRecord[]; movements?: MockRecord[]; consumed?: number }>(
    `/quotes/${encodeURIComponent(quoteId)}/convert`,
    { method: "POST" },
  );
}

export async function applyOrderAvenantAction(orderId: string, input: { reason: string; dueDate: string; payload: QuotePayload }) {
  return phpFetch<{ order: MockRecord; avenant: MockRecord }>(`/orders/${orderId}/amendments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function issueInvoiceAction(orderId: string, input: { settlement: "solde" | "acompte"; amount?: number }) {
  return phpFetch<MockRecord>(`/orders/${encodeURIComponent(orderId)}/invoices`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function recordDepositPaymentAction(orderId: string, amount: number) {
  return phpFetch<{ deposit: MockRecord; payment: BillingPayment }>(`/orders/${encodeURIComponent(orderId)}/deposit-payments`, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export async function uploadOrderFilesAction(orderId: string, formData: FormData) {
  return phpFetch<{ files: MockRecord[] }>(`/orders/${encodeURIComponent(orderId)}/files`, {
    method: "POST",
    body: formData,
  });
}

export async function replaceOrderFileAction(fileId: string, formData: FormData) {
  return phpFetch<MockRecord>(`/order-files/${encodeURIComponent(fileId)}/replace`, {
    method: "POST",
    body: formData,
  });
}

export async function deleteOrderFileAction(fileId: string) {
  await phpFetch(`/order-files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
}

export async function validateSupplyAction(input: { supplierId: string; lines: { materialId: string; quantity: number; qtyAppro?: number }[] }) {
  return phpFetch<{ supply: MockRecord; materials: MockRecord[] }>("/supplies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteSupplyAction(id: string) {
  return phpFetch<{ ok: boolean; materials: MockRecord[] }>(`/supplies/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function withdrawStockAction(input: { kind: StockKind; id: string; quantity: number; reason: string; note?: string }) {
  return phpFetch<{
    movement: MockRecord;
    materials: MockRecord[];
    catalogue: MockRecord[];
    movements: MockRecord[];
  }>("/stock-withdrawals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createStockAlertAction(values: Record<string, string | number>) {
  return phpFetch<{ alert: MockRecord; materials: MockRecord[]; catalogue: MockRecord[] }>("/stock-alerts", {
    method: "POST",
    body: JSON.stringify(values),
  });
}

export async function updateStockAlertAction(id: string, values: Record<string, string | number>) {
  return phpFetch<{ alert: MockRecord; materials: MockRecord[]; catalogue: MockRecord[] }>(`/stock-alerts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(values),
  });
}

export async function updateInventoryAction(id: string, values: Record<string, string | number>) {
  return phpFetch<{ inventory: MockRecord; inventories?: MockRecord[]; materials: MockRecord[]; catalogue: MockRecord[] }>(`/inventories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(values),
  });
}

export async function loadReportsAction(from = "", to = "") {
  const query = new URLSearchParams();
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  const suffix = query.toString();
  return phpFetch<ReportsBundle>(`/reports${suffix ? `?${suffix}` : ""}`);
}

export async function exportReportAction(kind: ReportExportKind, from = "", to = "") {
  const query = new URLSearchParams({ kind });
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  return phpFetch<{ filename: string; csv: string }>(`/reports/export?${query.toString()}`);
}
