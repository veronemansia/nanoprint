import { NANOPRINT_LOGO } from "@/lib/document-template";

export type CurrencySetting = {
  id: string;
  label: string;
  symbol: string;
  decimals: number;
  isDefault: boolean;
};

export type TaxSetting = {
  id: string;
  label: string;
  rate: number;
  active: boolean;
  code?: string;
  note?: string;
};

export type CompanySettings = {
  tradeName: string;
  legalName: string;
  legalForm: string;
  ninea: string;
  rccm: string;
  address: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  iban: string;
  bank: string;
  logo: string;
  workDays: string;
  openingHours: string;
  paperUnit: string;
  currencies: CurrencySetting[];
  taxes: TaxSetting[];
};

export const DECIMAL_CHOICES = [0, 1, 2, 3, 4];

export const defaultCompanySettings: CompanySettings = {
  tradeName: "NanoPrint",
  legalName: "NanoPrint SARL",
  legalForm: "SARL",
  ninea: "0065432 2A2",
  rccm: "SN-DKR-2018-B-1234",
  address: "Zone industrielle Hann Bel-Air",
  city: "Dakar",
  country: "Sénégal",
  phone: "+221 33 800 00 00",
  email: "contact@nanoprint.sn",
  website: "https://www.nanoprint.sn",
  iban: "SN08 SN010 01001 0123456789 12",
  bank: "CBAO groupe Attijariwafa",
  logo: NANOPRINT_LOGO,
  workDays: "Lundi – samedi",
  openingHours: "07h30 – 18h30",
  paperUnit: "Rame (500 feuilles) et feuille",
  currencies: [
    { id: "cur-xof", label: "Franc", symbol: "", decimals: 0, isDefault: true },
    { id: "cur-eur", label: "Euro", symbol: "€", decimals: 2, isDefault: false },
    { id: "cur-usd", label: "Dollar US", symbol: "$", decimals: 2, isDefault: false },
  ],
  taxes: [
    { id: "tax-tva", label: "TVA", rate: 18, active: true, code: "TVA", note: "Taxe sur la valeur ajoutée" },
    { id: "tax-para", label: "Taxe parafiscale", rate: 1, active: false, code: "TPF", note: "Contribution parafiscale" },
  ],
};

export function newCurrency(patch: Partial<CurrencySetting> = {}): CurrencySetting {
  return {
    id: crypto.randomUUID(),
    label: "",
    symbol: "",
    decimals: 0,
    isDefault: false,
    ...patch,
  };
}

export function newTax(patch: Partial<TaxSetting> = {}): TaxSetting {
  return {
    id: crypto.randomUUID(),
    label: "",
    rate: 0,
    active: true,
    code: "",
    note: "",
    ...patch,
  };
}

export function defaultCurrency(settings: CompanySettings): CurrencySetting {
  return settings.currencies.find((item) => item.isDefault) ?? settings.currencies[0] ?? {
    id: "cur-fallback",
    label: "Franc",
    symbol: "",
    decimals: 0,
    isDefault: true,
  };
}

function stripCfaLabel(value: string) {
  return value
    .replace(/\bfrancs?\s*CFA\b/gi, "Franc")
    .replace(/\bF\s*CFA\b/gi, "")
    .replace(/\bCFA\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCfaSymbol(value: string) {
  return value.replace(/\bF\s*CFA\b/gi, "").replace(/\bCFA\b/gi, "").replace(/\s+/g, " ").trim();
}

export function formatAmount(value: number, _settings?: CompanySettings) {
  return new Intl.NumberFormat("fr-FR").format(Number.isFinite(value) ? value : 0);
}

export function activeTaxes(settings: CompanySettings) {
  return settings.taxes.filter((item) => item.active);
}

export function normalizeCompanySettings(raw: unknown): CompanySettings {
  const row = (raw && typeof raw === "object" ? raw : {}) as Partial<CompanySettings>;
  const currencies = Array.isArray(row.currencies)
    ? row.currencies.map((item, index) => ({
        id: String(item.id || `cur-${index}`),
        label: stripCfaLabel(String(item.label || "").trim()) || `Devise ${index + 1}`,
        symbol: stripCfaSymbol(String(item.symbol || "").trim()),
        decimals: Math.min(4, Math.max(0, Number(item.decimals) || 0)),
        isDefault: Boolean(item.isDefault),
      }))
    : defaultCompanySettings.currencies;
  const withDefault = currencies.some((item) => item.isDefault)
    ? currencies
    : currencies.map((item, index) => ({ ...item, isDefault: index === 0 }));
  const taxes = Array.isArray(row.taxes)
    ? row.taxes.map((item, index) => ({
        id: String(item.id || `tax-${index}`),
        label: String(item.label || "").trim() || `Taxe ${index + 1}`,
        rate: Math.max(0, Number(item.rate) || 0),
        active: Boolean(item.active),
        code: String(item.code || "").trim(),
        note: String(item.note || "").trim(),
      }))
    : defaultCompanySettings.taxes;

  return {
    ...defaultCompanySettings,
    tradeName: String(row.tradeName ?? defaultCompanySettings.tradeName),
    legalName: String(row.legalName ?? defaultCompanySettings.legalName),
    legalForm: String(row.legalForm ?? defaultCompanySettings.legalForm),
    ninea: String(row.ninea ?? defaultCompanySettings.ninea),
    rccm: String(row.rccm ?? defaultCompanySettings.rccm),
    address: String(row.address ?? defaultCompanySettings.address),
    city: String(row.city ?? defaultCompanySettings.city),
    country: String(row.country ?? defaultCompanySettings.country),
    phone: String(row.phone ?? defaultCompanySettings.phone),
    email: String(row.email ?? defaultCompanySettings.email),
    website: String(row.website ?? defaultCompanySettings.website),
    iban: String(row.iban ?? defaultCompanySettings.iban),
    bank: String(row.bank ?? defaultCompanySettings.bank),
    logo: String(row.logo ?? defaultCompanySettings.logo),
    workDays: String(row.workDays ?? defaultCompanySettings.workDays),
    openingHours: String(row.openingHours ?? defaultCompanySettings.openingHours),
    paperUnit: String(row.paperUnit ?? defaultCompanySettings.paperUnit),
    currencies: withDefault.length ? withDefault : defaultCompanySettings.currencies,
    taxes,
  };
}
