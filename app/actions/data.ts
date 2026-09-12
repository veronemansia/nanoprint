"use server";

import type { AccessRole } from "@/lib/access";
import type { CompanySettings, TaxSetting } from "@/lib/company-settings";
import { hasSessionCookie, phpFetch } from "@/lib/php-api";
import { RECORD_PATH } from "@/lib/api-features";
import type { MockRecord, MockUser } from "@/lib/types";

export type BootstrapPayload = {
  user: MockUser;
  settings: CompanySettings;
  accessRoles: AccessRole[];
  catalogueFamilies: string[];
  workshops: string[];
  materialTypes: string[];
  materialUnits: string[];
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

export async function createRecordAction(featureId: string, values: Record<string, string | number>) {
  const path = RECORD_PATH[featureId === "tarifs" ? "catalogue" : featureId];
  if (!path) throw new Error("Feature non migrée.");
  return phpFetch<MockRecord>(path, { method: "POST", body: JSON.stringify(values) });
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
