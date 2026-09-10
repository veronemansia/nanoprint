"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { mockRecords } from "@/lib/mock-data";
import { defaultCatalogueFamilies } from "@/lib/catalogue";
import { defaultMaterialTypes, defaultMaterialUnits } from "@/lib/materials";
import { defaultAccessRoles, normalizeAccessRoles, type AccessRole } from "@/lib/access";
import { defaultCompanySettings, formatAmount, normalizeCompanySettings, type CompanySettings } from "@/lib/company-settings";
import { DEFAULT_CLIENT_SECTORS } from "@/lib/client-segmentation";
import { defaultWorkshops } from "@/lib/modules";
import { buildConvertedOrder, hydrateOrderRecord, orderForQuote } from "@/lib/quote-conversion";
import {
  avenantBlockReason,
  avenantUnchanged,
  nextAvenantReference,
  parseOrderHistory,
  previewOrderAvenant,
  sanitizeReason,
  stringifyOrderHistory,
} from "@/lib/order-avenant";
import {
  billingLines,
  depositForOrder,
  depositSnapshot,
  invoiceProgress,
  nextDepositReference,
  nextInvoiceReference,
  nextReceiptReference,
  sanitizeAcompteAmount,
  sanitizePaymentAmount,
  stringifyPayments,
  todayIso,
  type BillingPayment,
} from "@/lib/billing";
import {
  clearClientFileBlobs,
  deleteClientFileBlob,
  findOrderFileByName,
  formatFromName,
  nextClientFileReference,
  putClientFileBlob,
  sanitizeClientFiles,
} from "@/lib/client-files";
import type { QuotePayload } from "@/lib/price-calculator";
import {
  applySupplyToMaterials,
  deleteSupplyBlockReason,
  nextSupplyReference,
  parseSupplyLines,
  stringifySupplyLines,
  supplyBlockReason,
  supplyTotals,
  type SupplyLine,
} from "@/lib/supply";
import { applyStockWithdraw, withdrawBlockReason, type StockKind } from "@/lib/stock";
import { defaultLocale, LOCALE_STORAGE, isLocale, localizeKnown, readStoredLocale, translate, type Locale } from "@/lib/i18n";
import type { MockRecord, MockUser, Role, Toast } from "@/lib/types";

type AppContextValue = {
  ready: boolean;
  user: MockUser | null;
  records: Record<string, MockRecord[]>;
  catalogueFamilies: string[];
  workshops: string[];
  clientSectors: string[];
  materialTypes: string[];
  materialUnits: string[];
  settings: CompanySettings;
  accessRoles: AccessRole[];
  addCatalogueFamily: (name: string) => void;
  addWorkshop: (name: string) => void;
  renameWorkshop: (from: string, to: string) => string;
  deleteWorkshop: (name: string) => string | undefined;
  addMaterialType: (name: string) => void;
  renameMaterialType: (from: string, to: string) => string;
  deleteMaterialType: (name: string) => string | undefined;
  addMaterialUnit: (name: string) => void;
  renameMaterialUnit: (from: string, to: string) => string;
  deleteMaterialUnit: (name: string) => string | undefined;
  addClientSector: (name: string) => string;
  renameClientSector: (from: string, to: string) => string;
  deleteClientSector: (name: string) => void;
  assignClientsToSector: (ids: string[], sector: string) => Promise<void>;
  saveSettings: (next: CompanySettings) => Promise<void>;
  resetSettings: () => void;
  saveRole: (role: AccessRole) => Promise<void>;
  deleteRole: (id: string) => Promise<void>;
  login: (email: string, role: Role) => Promise<void>;
  logout: () => void;
  createRecord: (featureId: string, values: Record<string, string | number>) => Promise<MockRecord>;
  updateRecord: (featureId: string, id: string, values: Record<string, string | number>) => Promise<void>;
  deleteRecord: (featureId: string, id: string) => Promise<void>;
  resetFeature: (featureId: string) => void;
  convertCalculatorQuote: (quoteId: string) => Promise<MockRecord | null>;
  applyOrderAvenant: (orderId: string, input: { reason: string; dueDate: string; payload: QuotePayload }) => Promise<MockRecord | null>;
  issueInvoice: (orderId: string, input: { settlement: "solde" | "acompte"; amount?: number }) => Promise<MockRecord | null>;
  recordDepositPayment: (orderId: string, amount: number) => Promise<{ deposit: MockRecord; payment: BillingPayment } | null>;
  uploadOrderFiles: (orderId: string, files: File[]) => Promise<MockRecord[] | null>;
  replaceOrderFile: (fileId: string, file: File) => Promise<MockRecord | null>;
  deleteOrderFile: (fileId: string) => Promise<boolean>;
  validateSupply: (input: { supplierId: string; lines: SupplyLine[] }) => Promise<MockRecord | null>;
  deleteSupply: (id: string) => Promise<boolean>;
  withdrawStock: (input: { kind: StockKind; id: string; quantity: number; reason: string; note?: string }) => Promise<boolean>;
  notify: (title: string, message: string, tone?: Toast["tone"]) => void;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, fallback: string, vars?: Record<string, string | number>) => string;
  te: (text: string) => string;
};

const STORAGE_DATA = "nanoprint.mock.records.v33";
const STORAGE_USER = "nanoprint.mock.session.v1";
const AppContext = createContext<AppContextValue | null>(null);

const wait = (duration = 550) => new Promise((resolve) => setTimeout(resolve, duration));

function titleCaseEmail(email: string) {
  const local = email.split("@")[0].replace(/[._-]+/g, " ");
  return local.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Utilisateur NanoPrint";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<MockUser | null>(null);
  const [records, setRecords] = useState<Record<string, MockRecord[]>>(mockRecords);
  const [catalogueFamilies, setCatalogueFamilies] = useState<string[]>(defaultCatalogueFamilies);
  const [workshops, setWorkshops] = useState<string[]>(defaultWorkshops);
  const [clientSectors, setClientSectors] = useState<string[]>(DEFAULT_CLIENT_SECTORS);
  const [materialTypes, setMaterialTypes] = useState<string[]>(defaultMaterialTypes);
  const [materialUnits, setMaterialUnits] = useState<string[]>(defaultMaterialUnits);
  const [settings, setSettings] = useState<CompanySettings>(defaultCompanySettings);
  const [accessRoles, setAccessRoles] = useState<AccessRole[]>(defaultAccessRoles);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE, next);
    } catch {
      /* ignore quota / private mode */
    }
  }, []);

  const t = useCallback((key: string, fallback: string, vars?: Record<string, string | number>) => {
    return translate(locale, key, fallback, vars);
  }, [locale]);

  const te = useCallback((text: string) => localizeKnown(locale, text), [locale]);

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      try {
        const savedUser = localStorage.getItem(STORAGE_USER);
        const savedRecords = localStorage.getItem(STORAGE_DATA);
        if (savedUser) setUser(JSON.parse(savedUser) as MockUser);
        if (savedRecords) {
          const parsed = JSON.parse(savedRecords) as {
            records?: Record<string, MockRecord[]>;
            catalogueFamilies?: string[];
            workshops?: string[];
            clientSectors?: string[];
            materialTypes?: string[];
            materialUnits?: string[];
            settings?: unknown;
            accessRoles?: unknown;
          };
          if (parsed.records) setRecords({ ...mockRecords, ...parsed.records });
          if (parsed.catalogueFamilies?.length) {
            setCatalogueFamilies([...new Set([...defaultCatalogueFamilies, ...parsed.catalogueFamilies])]);
          }
          const storedWorkshops = parsed.workshops ?? [];
          const fromPostes = (parsed.records?.postes ?? mockRecords.postes).map((item) => String(item.workshop || "")).filter(Boolean);
          setWorkshops([...new Set([...defaultWorkshops, ...storedWorkshops, ...fromPostes])]);
          const storedSectors = parsed.clientSectors ?? [];
          const fromClients = (parsed.records?.["fiches-clients"] ?? mockRecords["fiches-clients"]).map((item) => String(item.sector || "")).filter(Boolean);
          setClientSectors([...new Set([...DEFAULT_CLIENT_SECTORS, ...storedSectors, ...fromClients])]);
          const materials = parsed.records?.matieres ?? mockRecords.matieres ?? [];
          const fromMaterialTypes = materials.map((item) => String(item.type || "")).filter(Boolean);
          const fromMaterialUnits = materials.map((item) => String(item.unit || "")).filter(Boolean);
          setMaterialTypes([...new Set([...defaultMaterialTypes, ...(parsed.materialTypes ?? []), ...fromMaterialTypes])]);
          setMaterialUnits([...new Set([...defaultMaterialUnits, ...(parsed.materialUnits ?? []), ...fromMaterialUnits])]);
          if (parsed.settings) setSettings(normalizeCompanySettings(parsed.settings));
          if (parsed.accessRoles) setAccessRoles(normalizeAccessRoles(parsed.accessRoles));
        }
      } catch {
        localStorage.removeItem(STORAGE_USER);
        localStorage.removeItem(STORAGE_DATA);
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_DATA, JSON.stringify({ records, catalogueFamilies, workshops, clientSectors, materialTypes, materialUnits, settings, accessRoles }));
  }, [ready, records, catalogueFamilies, workshops, clientSectors, materialTypes, materialUnits, settings, accessRoles]);

  const notify = useCallback((title: string, message: string, tone: Toast["tone"] = "success") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, title: localizeKnown(locale, title), message: localizeKnown(locale, message), tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4300);
  }, [locale]);

  const login = useCallback(async (email: string, role: Role) => {
    await wait(900);
    const name = titleCaseEmail(email);
    const nextUser: MockUser = {
      id: crypto.randomUUID(),
      name,
      email,
      role,
      initials: name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase(),
    };
    localStorage.setItem(STORAGE_USER, JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const addCatalogueFamily = useCallback((name: string) => {
    const label = name.trim();
    if (!label) return;
    setCatalogueFamilies((current) => current.includes(label) ? current : [...current, label]);
  }, []);

  const addWorkshop = useCallback((name: string) => {
    const label = name.trim();
    if (!label) return;
    setWorkshops((current) => current.includes(label) ? current : [...current, label]);
  }, []);

  const renameWorkshop = useCallback((from: string, to: string) => {
    const next = to.trim();
    if (!from || !next) return from;
    setWorkshops((current) => {
      if (from === next) return current.includes(next) ? current : [...current, next];
      const withoutFrom = current.filter((item) => item !== from);
      return withoutFrom.includes(next) ? withoutFrom : [...withoutFrom, next];
    });
    setRecords((current) => ({
      ...current,
      postes: (current.postes ?? []).map((record) =>
        String(record.workshop) === from ? { ...record, workshop: next } : record,
      ),
    }));
    return next;
  }, []);

  const deleteWorkshop = useCallback((name: string) => {
    const remaining = workshops.filter((item) => item !== name);
    if (!remaining.length) return name;
    setWorkshops(remaining);
    const fallback = remaining[0];
    setRecords((current) => ({
      ...current,
      postes: (current.postes ?? []).map((record) =>
        String(record.workshop) === name ? { ...record, workshop: fallback } : record,
      ),
    }));
    return fallback;
  }, [workshops]);

  const addMaterialType = useCallback((name: string) => {
    const label = name.trim();
    if (!label) return;
    setMaterialTypes((current) => current.includes(label) ? current : [...current, label]);
  }, []);

  const renameMaterialType = useCallback((from: string, to: string) => {
    const next = to.trim();
    if (!from || !next) return from;
    setMaterialTypes((current) => {
      if (from === next) return current.includes(next) ? current : [...current, next];
      const withoutFrom = current.filter((item) => item !== from);
      return withoutFrom.includes(next) ? withoutFrom : [...withoutFrom, next];
    });
    setRecords((current) => ({
      ...current,
      matieres: (current.matieres ?? []).map((record) =>
        String(record.type) === from ? { ...record, type: next } : record,
      ),
    }));
    return next;
  }, []);

  const deleteMaterialType = useCallback((name: string) => {
    const remaining = materialTypes.filter((item) => item !== name);
    if (!remaining.length) return name;
    setMaterialTypes(remaining);
    const fallback = remaining[0];
    setRecords((current) => ({
      ...current,
      matieres: (current.matieres ?? []).map((record) =>
        String(record.type) === name ? { ...record, type: fallback } : record,
      ),
    }));
    return fallback;
  }, [materialTypes]);

  const addMaterialUnit = useCallback((name: string) => {
    const label = name.trim();
    if (!label) return;
    setMaterialUnits((current) => current.includes(label) ? current : [...current, label]);
  }, []);

  const renameMaterialUnit = useCallback((from: string, to: string) => {
    const next = to.trim();
    if (!from || !next) return from;
    setMaterialUnits((current) => {
      if (from === next) return current.includes(next) ? current : [...current, next];
      const withoutFrom = current.filter((item) => item !== from);
      return withoutFrom.includes(next) ? withoutFrom : [...withoutFrom, next];
    });
    setRecords((current) => ({
      ...current,
      matieres: (current.matieres ?? []).map((record) =>
        String(record.unit) === from ? { ...record, unit: next } : record,
      ),
    }));
    return next;
  }, []);

  const deleteMaterialUnit = useCallback((name: string) => {
    const remaining = materialUnits.filter((item) => item !== name);
    if (!remaining.length) return name;
    setMaterialUnits(remaining);
    const fallback = remaining[0];
    setRecords((current) => ({
      ...current,
      matieres: (current.matieres ?? []).map((record) =>
        String(record.unit) === name ? { ...record, unit: fallback } : record,
      ),
    }));
    return fallback;
  }, [materialUnits]);

  const addClientSector = useCallback((name: string) => {
    const label = name.trim();
    if (!label) return "";
    setClientSectors((current) => current.includes(label) ? current : [...current, label]);
    return label;
  }, []);

  const renameClientSector = useCallback((from: string, to: string) => {
    const next = to.trim();
    if (!from || !next) return from;
    setClientSectors((current) => {
      if (from === next) return current.includes(next) ? current : [...current, next];
      const withoutFrom = current.filter((item) => item !== from);
      return withoutFrom.includes(next) ? withoutFrom : [...withoutFrom, next];
    });
    setRecords((current) => ({
      ...current,
      "fiches-clients": (current["fiches-clients"] ?? []).map((record) =>
        String(record.sector) === from ? { ...record, sector: next } : record,
      ),
    }));
    return next;
  }, []);

  const deleteClientSector = useCallback((name: string) => {
    setClientSectors((current) => current.filter((item) => item !== name));
    setRecords((current) => ({
      ...current,
      "fiches-clients": (current["fiches-clients"] ?? []).map((record) =>
        String(record.sector) === name ? { ...record, sector: "" } : record,
      ),
    }));
  }, []);

  const assignClientsToSector = useCallback(async (ids: string[], sector: string) => {
    await wait(350);
    const label = sector.trim();
    setRecords((current) => ({
      ...current,
      "fiches-clients": (current["fiches-clients"] ?? []).map((record) =>
        ids.includes(record.id) ? { ...record, sector: label, updatedAt: "À l’instant" } : record,
      ),
    }));
    notify("Affectation enregistrée", t("toast.assigned", "{n} client(s) classé(s) dans « {label} ».", { n: ids.length, label }));
  }, [notify, t]);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_USER);
    setUser(null);
  }, []);

  const createRecord = useCallback(async (featureId: string, values: Record<string, string | number>) => {
    await wait();
    const prefix = featureId.slice(0, 3).toUpperCase();
    const next: MockRecord = {
      id: crypto.randomUUID(),
      reference: `${prefix}-${String(Date.now()).slice(-5)}`,
      name: String(values.name || "Sans titre"),
      status: String(values.status || "En attente"),
      updatedAt: "À l’instant",
      ...values,
    };
    setRecords((current) => ({ ...current, [featureId]: [next, ...(current[featureId] ?? [])] }));
    notify("Enregistrement créé", t("toast.added", "{ref} a été ajouté.", { ref: next.reference }));
    return next;
  }, [notify, t]);

  const updateRecord = useCallback(async (featureId: string, id: string, values: Record<string, string | number>) => {
    await wait();
    setRecords((current) => {
      const previous = (current[featureId] ?? []).find((record) => record.id === id);
      const next: Record<string, MockRecord[]> = {
        ...current,
        [featureId]: (current[featureId] ?? []).map((record) =>
          record.id === id ? { ...record, ...values, updatedAt: "À l’instant" } : record,
        ),
      };
      if (featureId === "fournisseurs" && previous) {
        const newName = String(values.name ?? previous.name);
        const relabel = (list?: MockRecord[]) => (list ?? []).map((item) =>
          String(item.supplierId) === id || item.supplier === previous.name
            ? { ...item, supplier: newName, supplierId: id }
            : item,
        );
        next.approvisionnement = relabel(current.approvisionnement);
        next["stock-papier"] = relabel(current["stock-papier"]);
        next["seuils-alerte"] = relabel(current["seuils-alerte"]);
      }
      return next;
    });
    notify("Modifications enregistrées", "La fiche a été mise à jour.");
  }, [notify]);

  const deleteRecord = useCallback(async (featureId: string, id: string) => {
    await wait(450);
    setRecords((current) => ({
      ...current,
      [featureId]: (current[featureId] ?? []).filter((record) => record.id !== id),
    }));
    notify("Élément supprimé", "La suppression a été appliquée aux données locales.", "info");
  }, [notify]);

  const convertCalculatorQuote = useCallback(async (quoteId: string) => {
    const safeId = String(quoteId || "").trim();
    const quote = (records.calculateur ?? []).find((item) => item.id === safeId);
    if (!quote) {
      notify("Conversion impossible", "Ce devis n’existe pas dans le calculateur.", "error");
      return null;
    }
    const built = buildConvertedOrder(
      quote,
      records["statuts-commandes"] ?? [],
      records["fiches-clients"] ?? [],
      records.catalogue ?? [],
      settings,
    );
    if (built.error || !built.values) {
      notify("Conversion impossible", built.error || "Chiffrage non convertible.", "error");
      return null;
    }
    await wait();
    const order: MockRecord = {
      id: crypto.randomUUID(),
      reference: built.reference,
      name: String(built.values.name),
      status: "En attente",
      updatedAt: "À l’instant",
      ...built.values,
    };
    let applied = true;
    setRecords((current) => {
      const currentQuote = (current.calculateur ?? []).find((item) => item.id === safeId);
      if (!currentQuote || currentQuote.status === "Converti" || orderForQuote(current["statuts-commandes"] ?? [], currentQuote)) {
        applied = false;
        return current;
      }
      return {
        ...current,
        calculateur: (current.calculateur ?? []).map((item) =>
          item.id === safeId
            ? { ...item, status: "Converti", orderRef: order.reference, orderId: order.id, updatedAt: "À l’instant" }
            : item,
        ),
        "statuts-commandes": [order, ...(current["statuts-commandes"] ?? [])],
      };
    });
    if (!applied) {
      notify("Conversion impossible", "Ce devis a déjà été converti.", "error");
      return null;
    }
    notify("Devis converti", t("toast.converted", "{quote} est devenu {order} (En attente).", { quote: quote.reference, order: order.reference }));
    return order;
  }, [records, settings, notify, t]);

  const applyOrderAvenant = useCallback(async (orderId: string, input: { reason: string; dueDate: string; payload: QuotePayload }) => {
    const safeId = String(orderId || "").trim();
    const reason = sanitizeReason(input.reason);
    const order = (records["statuts-commandes"] ?? []).find((item) => item.id === safeId);
    if (!order) {
      notify("Avenant impossible", "Cette commande n’existe pas.", "error");
      return null;
    }
    if (!reason) {
      notify("Avenant impossible", "Le motif est obligatoire.", "error");
      return null;
    }
    const closed = avenantBlockReason(order);
    if (closed) {
      notify("Avenant impossible", closed, "error");
      return null;
    }
    const quotes = records.calculateur ?? [];
    const preview = previewOrderAvenant(
      hydrateOrderRecord(order, quotes),
      quotes,
      records["fiches-clients"] ?? [],
      records.catalogue ?? [],
      settings,
      input.payload,
      String(input.dueDate || ""),
    );
    if (preview.error) {
      notify("Avenant impossible", preview.error, "error");
      return null;
    }
    if (avenantUnchanged(preview.previous, preview.next)) {
      notify("Avenant impossible", "Aucun changement à enregistrer.", "error");
      return null;
    }
    await wait();
    const avenant: MockRecord = {
      id: crypto.randomUUID(),
      reference: nextAvenantReference(order, records.avenants ?? []),
      name: reason.slice(0, 80),
      status: "Validé",
      updatedAt: "À l’instant",
      order: order.reference,
      orderId: order.id,
      reason,
      delta: preview.delta,
      newAmount: preview.next.amount,
      previousAmount: preview.previous.amount,
      quantity: preview.next.quantity,
    };
    const entry = {
      id: crypto.randomUUID(),
      at: "À l’instant",
      avenantId: avenant.id,
      avenantRef: avenant.reference,
      reason,
      previous: preview.previous,
      next: preview.next,
    };
    let applied = true;
    setRecords((current) => {
      const currentOrder = (current["statuts-commandes"] ?? []).find((item) => item.id === safeId);
      if (!currentOrder) {
        applied = false;
        return current;
      }
      const history = [...parseOrderHistory(currentOrder.orderHistory), entry];
      return {
        ...current,
        "statuts-commandes": (current["statuts-commandes"] ?? []).map((item) =>
          item.id === safeId
            ? {
                ...item,
                quantity: preview.next.quantity,
                amount: preview.next.amount,
                dueDate: preview.next.dueDate,
                quotePayload: preview.next.quotePayload,
                orderHistory: stringifyOrderHistory(history),
                updatedAt: "À l’instant",
              }
            : item,
        ),
        avenants: [avenant, ...(current.avenants ?? [])],
      };
    });
    if (!applied) {
      notify("Avenant impossible", "La commande n’est plus disponible.", "error");
      return null;
    }
    notify("Avenant enregistré", t("toast.avenantSaved", "{avenant} met à jour {order}. L’historique est conservé.", { avenant: avenant.reference, order: order.reference }));
    return avenant;
  }, [records, settings, notify, t]);

  const issueInvoice = useCallback(async (orderId: string, input: { settlement: "solde" | "acompte"; amount?: number }) => {
    const safeId = String(orderId || "").trim();
    const order = (records["statuts-commandes"] ?? []).find((item) => item.id === safeId);
    if (!order) {
      notify("Facture impossible", "Cette commande n’existe pas.", "error");
      return null;
    }
    const progress = invoiceProgress(order, records.factures ?? []);
    if (progress.hasSolde || progress.remaining <= 0) {
      notify("Facture impossible", "Cette commande est déjà soldée.", "error");
      return progress.issued[0] ?? null;
    }
    const settlement = input.settlement === "acompte" ? "acompte" : "solde";
    let billed = progress.remaining;
    if (settlement === "acompte") {
      const check = sanitizeAcompteAmount(input.amount ?? 0, progress.remaining);
      if (check.error) {
        notify("Facture impossible", check.error, "error");
        return null;
      }
      billed = check.amount;
    }
    await wait();
    const packed = billingLines(order, records.calculateur ?? [], records["fiches-clients"] ?? [], records.catalogue ?? [], settings);
    const remaining = Math.max(0, progress.remaining - billed);
    const invoice: MockRecord = {
      id: crypto.randomUUID(),
      reference: nextInvoiceReference(records.factures ?? []),
      name: `${order.client || packed.client?.name || "Client"} — ${order.name}`,
      status: remaining <= 0 ? "Soldée" : "Acompte",
      updatedAt: "À l’instant",
      order: order.reference,
      orderId: order.id,
      client: String(order.client || packed.client?.name || ""),
      amount: billed,
      issuedAt: todayIso(),
      settlement,
      remaining,
    };
    setRecords((current) => ({
      ...current,
      factures: [invoice, ...(current.factures ?? [])],
    }));
    notify(
      settlement === "acompte" ? "Facture d’acompte" : "Facture de solde",
      t("toast.invoiceIssued", "{ref} · {amount}. Reste {remaining}.", { ref: invoice.reference, amount: formatAmount(billed, settings), remaining: formatAmount(remaining, settings) }),
    );
    return invoice;
  }, [records, settings, notify, t]);

  const recordDepositPayment = useCallback(async (orderId: string, amount: number) => {
    const safeId = String(orderId || "").trim();
    const order = (records["statuts-commandes"] ?? []).find((item) => item.id === safeId);
    if (!order) {
      notify("Paiement impossible", "Cette commande n’existe pas.", "error");
      return null;
    }
    const current = depositForOrder(records.acomptes ?? [], order);
    const snap = depositSnapshot(order, current);
    const check = sanitizePaymentAmount(amount, snap.remaining);
    if (check.error) {
      notify("Paiement impossible", check.error, "error");
      return null;
    }
    await wait();
    const payment: BillingPayment = {
      id: crypto.randomUUID(),
      at: "À l’instant",
      amount: check.amount,
      receiptRef: nextReceiptReference(order, snap.payments),
    };
    const payments = [...snap.payments, payment];
    const paid = snap.paid + check.amount;
    const remaining = Math.max(0, snap.total - paid);
    const status = remaining <= 0 ? "Soldé" : "Partiel";
    const deposit: MockRecord = current
      ? {
          ...current,
          status,
          asked: snap.total,
          received: paid,
          remaining,
          payments: stringifyPayments(payments),
          updatedAt: "À l’instant",
        }
      : {
          id: crypto.randomUUID(),
          reference: nextDepositReference(order),
          name: String(order.client || "Client"),
          status,
          updatedAt: "À l’instant",
          order: order.reference,
          orderId: order.id,
          asked: snap.total,
          received: paid,
          remaining,
          payments: stringifyPayments(payments),
        };
    setRecords((currentRecords) => {
      const list = currentRecords.acomptes ?? [];
      const exists = list.some((item) => item.id === deposit.id);
      return {
        ...currentRecords,
        acomptes: exists ? list.map((item) => (item.id === deposit.id ? deposit : item)) : [deposit, ...list],
      };
    });
    notify("Paiement enregistré", t("toast.paymentSaved", "{amount} encaissé. Reste {remaining}.", { amount: formatAmount(check.amount, settings), remaining: formatAmount(remaining, settings) }));
    return { deposit, payment };
  }, [records, settings, notify, t]);

  const uploadOrderFiles = useCallback(async (orderId: string, files: File[]) => {
    const order = (records["statuts-commandes"] ?? []).find((item) => item.id === String(orderId || "").trim());
    if (!order) {
      notify("Dépôt impossible", "Cette commande n’existe pas.", "error");
      return null;
    }
    const check = sanitizeClientFiles(files);
    if (check.error) {
      notify("Dépôt impossible", check.error, "error");
      return null;
    }
    const current = records["fichiers-clients"] ?? [];
    const created: MockRecord[] = [];
    const replaced: MockRecord[] = [];
    let nextList = current;
    for (const file of check.files) {
      const existing = findOrderFileByName(nextList, order, file.name);
      if (existing) {
        await putClientFileBlob(existing.id, file);
        const updated: MockRecord = {
          ...existing,
          name: file.name,
          status: "Versionné",
          updatedAt: "À l’instant",
          format: formatFromName(file.name),
          version: (Number(existing.version) || 1) + 1,
          sizeBytes: file.size,
          stored: 1,
          client: String(order.client || existing.client || ""),
          order: order.reference,
          orderId: order.id,
        };
        nextList = nextList.map((item) => (item.id === existing.id ? updated : item));
        replaced.push(updated);
        continue;
      }
      const record: MockRecord = {
        id: crypto.randomUUID(),
        reference: nextClientFileReference(nextList, order),
        name: file.name,
        status: "Reçu",
        updatedAt: "À l’instant",
        order: order.reference,
        orderId: order.id,
        client: String(order.client || ""),
        format: formatFromName(file.name),
        version: 1,
        sizeBytes: file.size,
        stored: 1,
      };
      await putClientFileBlob(record.id, file);
      nextList = [record, ...nextList];
      created.push(record);
    }
    setRecords((currentRecords) => ({ ...currentRecords, "fichiers-clients": nextList }));
    if (created.length && replaced.length) {
      notify("Fichiers mis à jour", t("toast.filesMixed", "{created} déposé(s), {replaced} remplacé(s).", { created: created.length, replaced: replaced.length }));
    } else if (replaced.length) {
      notify("Fichiers corrigés", t("toast.filesReplaced", "{n} fichier(s) remplacé(s) par une nouvelle version.", { n: replaced.length }));
    } else {
      notify("Fichiers déposés", t("toast.filesUploaded", "{n} fichier(s) enregistré(s) pour {order}.", { n: created.length, order: order.reference }));
    }
    return [...created, ...replaced];
  }, [records, notify, t]);

  const replaceOrderFile = useCallback(async (fileId: string, file: File) => {
    const current = records["fichiers-clients"] ?? [];
    const existing = current.find((item) => item.id === String(fileId || "").trim());
    if (!existing) {
      notify("Remplacement impossible", "Ce fichier n’existe plus.", "error");
      return null;
    }
    const check = sanitizeClientFiles([file]);
    if (check.error) {
      notify("Remplacement impossible", check.error, "error");
      return null;
    }
    const nextFile = check.files[0];
    if (!nextFile) return null;
    await putClientFileBlob(existing.id, nextFile);
    const updated: MockRecord = {
      ...existing,
      name: nextFile.name,
      status: "Versionné",
      updatedAt: "À l’instant",
      format: formatFromName(nextFile.name),
      version: (Number(existing.version) || 1) + 1,
      sizeBytes: nextFile.size,
      stored: 1,
    };
    setRecords((currentRecords) => ({
      ...currentRecords,
      "fichiers-clients": (currentRecords["fichiers-clients"] ?? []).map((item) => (item.id === existing.id ? updated : item)),
    }));
    notify("Fichier corrigé", t("toast.fileVersion", "{name} · version {version}.", { name: updated.name, version: updated.version }));
    return updated;
  }, [records, notify, t]);

  const deleteOrderFile = useCallback(async (fileId: string) => {
    const current = records["fichiers-clients"] ?? [];
    const existing = current.find((item) => item.id === String(fileId || "").trim());
    if (!existing) {
      notify("Suppression impossible", "Ce fichier n’existe plus.", "error");
      return false;
    }
    await deleteClientFileBlob(existing.id);
    setRecords((currentRecords) => ({
      ...currentRecords,
      "fichiers-clients": (currentRecords["fichiers-clients"] ?? []).filter((item) => item.id !== existing.id),
    }));
    notify("Fichier supprimé", existing.name, "info");
    return true;
  }, [records, notify]);

  const validateSupply = useCallback(async (input: { supplierId: string; lines: SupplyLine[] }) => {
    const supplier = (records.fournisseurs ?? []).find((item) => item.id === String(input.supplierId || ""));
    const materials = records.matieres ?? [];
    const block = supplyBlockReason(String(input.supplierId || ""), input.lines, records.fournisseurs ?? [], materials);
    if (block || !supplier) {
      notify("Validation impossible", block || "Fournisseur introuvable.", "error");
      return null;
    }
    const totals = supplyTotals(input.lines, settings);
    await wait();
    const reference = nextSupplyReference(records.approvisionnement ?? []);
    const record: MockRecord = {
      id: crypto.randomUUID(),
      reference,
      name: supplier.name,
      status: "Validé",
      updatedAt: "À l’instant",
      supplier: supplier.name,
      supplierId: supplier.id,
      quantity: input.lines.reduce((sum, line) => sum + line.quantity, 0),
      amount: totals.total,
      issuedAt: todayIso(),
      createdAt: new Date().toISOString(),
      lines: stringifySupplyLines(input.lines),
    };
    setRecords((current) => ({
      ...current,
      approvisionnement: [record, ...(current.approvisionnement ?? [])],
      matieres: applySupplyToMaterials(current.matieres ?? [], input.lines),
    }));
    notify("Approvisionnement validé", t("toast.supplyReady", "{ref} — le bon de livraison est prêt.", { ref: reference }));
    return record;
  }, [records, settings, notify, t]);

  const deleteSupply = useCallback(async (id: string) => {
    const existing = (records.approvisionnement ?? []).find((item) => item.id === id);
    if (!existing) {
      notify("Suppression impossible", "Cet approvisionnement n’existe plus.", "error");
      return false;
    }
    const block = deleteSupplyBlockReason(existing);
    if (block) {
      notify("Suppression impossible", block, "error");
      return false;
    }
    const lines = parseSupplyLines(existing.lines);
    await wait();
    setRecords((current) => ({
      ...current,
      approvisionnement: (current.approvisionnement ?? []).filter((item) => item.id !== id),
      matieres: applySupplyToMaterials(current.matieres ?? [], lines, -1),
    }));
    notify("Approvisionnement supprimé", t("toast.supplyDeleted", "{ref} a été retiré. Le stock a été ajusté.", { ref: existing.reference }), "info");
    return true;
  }, [records, notify, t]);

  const withdrawStock = useCallback(async (input: { kind: StockKind; id: string; quantity: number; reason: string; note?: string }) => {
    const source = input.kind === "finis" ? "catalogue" : "matieres";
    const existing = (records[source] ?? []).find((item) => item.id === input.id);
    const block = withdrawBlockReason(existing, input.quantity, input.reason);
    if (!existing || block) {
      notify("Retrait impossible", block || "Article introuvable.", "error");
      return false;
    }
    await wait();
    setRecords((current) => ({
      ...current,
      [source]: (current[source] ?? []).map((item) =>
        item.id === existing.id ? applyStockWithdraw(item, input.quantity, input.kind) : item,
      ),
    }));
    const detail = input.note?.trim() ? ` — ${input.note.trim()}` : "";
    notify("Stock retiré", t("toast.stockOut", "{qty} retiré(s) de « {name} » ({reason}){detail}.", { qty: input.quantity, name: existing.name, reason: localizeKnown(locale, input.reason), detail }), "success");
    return true;
  }, [records, notify, t, locale]);

  const saveSettings = useCallback(async (next: CompanySettings) => {
    await wait(350);
    const normalized = normalizeCompanySettings(next);
    setSettings(normalized);
    notify("Paramètres enregistrés", "Les règles générales de l’entreprise ont été mises à jour.");
  }, [notify]);

  const resetSettings = useCallback(() => {
    setSettings(defaultCompanySettings);
    notify("Paramètres restaurés", "Les informations NanoPrint de démonstration ont été rétablies.", "info");
  }, [notify]);

  const saveRole = useCallback(async (role: AccessRole) => {
    await wait(350);
    const next = normalizeAccessRoles([role])[0];
    setAccessRoles((current) => {
      const exists = current.some((item) => item.id === next.id);
      return exists ? current.map((item) => (item.id === next.id ? next : item)) : [...current, next];
    });
    setRecords((current) => ({
      ...current,
      "roles-permissions": (current["roles-permissions"] ?? []).map((record) =>
        String(record.roleId) === next.id ? { ...record, role: next.name } : record,
      ),
    }));
    notify("Rôle enregistré", t("toast.roleSaved", "{name} a été mis à jour.", { name: next.name }));
  }, [notify, t]);

  const deleteRole = useCallback(async (id: string) => {
    await wait(350);
    const remaining = accessRoles.filter((item) => item.id !== id);
    if (remaining.length === accessRoles.length || !remaining.length) return;
    const fallback = remaining[0];
    setAccessRoles(remaining);
    setRecords((current) => ({
      ...current,
      "roles-permissions": (current["roles-permissions"] ?? []).map((record) =>
        String(record.roleId) === id ? { ...record, roleId: fallback.id, role: fallback.name } : record,
      ),
    }));
    notify("Rôle supprimé", "Les utilisateurs concernés ont été réaffectés.", "info");
  }, [accessRoles, notify]);

  const resetFeature = useCallback((featureId: string) => {
    if (featureId === "parametres-generaux") {
      setSettings(defaultCompanySettings);
      notify("Paramètres restaurés", "Les informations NanoPrint de démonstration ont été rétablies.", "info");
      return;
    }
    if (featureId === "taxes") {
      setSettings((current) => ({ ...current, taxes: defaultCompanySettings.taxes }));
      notify("Taxes restaurées", "Les taxes de démonstration ont été rétablies.", "info");
      return;
    }
    if (featureId === "roles-permissions") {
      setAccessRoles(defaultAccessRoles);
      setRecords((current) => ({ ...current, "roles-permissions": mockRecords["roles-permissions"] ?? [] }));
      notify("Données restaurées", "Utilisateurs et rôles de démonstration rétablis.", "info");
      return;
    }
    if (featureId === "segmentation") {
      setClientSectors(DEFAULT_CLIENT_SECTORS);
      setRecords((current) => ({
        ...current,
        "fiches-clients": mockRecords["fiches-clients"] ?? [],
        segmentation: [],
      }));
      notify("Données restaurées", "Les secteurs et affectations de démonstration ont été rétablis.", "info");
      return;
    }
    if (featureId === "matieres") {
      setMaterialTypes(defaultMaterialTypes);
      setMaterialUnits(defaultMaterialUnits);
    }
    if (featureId === "tarifs") {
      setRecords((current) => ({
        ...current,
        catalogue: (current.catalogue ?? []).map((record) => {
          const seed = mockRecords.catalogue.find((item) => item.id === record.id);
          return { ...record, priceGrid: seed?.priceGrid ?? "[]" };
        }),
      }));
      notify("Grilles restaurées", "Les paliers de démonstration ont été rétablis sur les produits du catalogue.", "info");
      return;
    }
    if (featureId === "fichiers-clients") {
      void clearClientFileBlobs();
    }
    if (featureId === "historique-approvisionnement") {
      setRecords((current) => ({ ...current, approvisionnement: mockRecords.approvisionnement ?? [] }));
      notify("Données restaurées", "L’historique d’approvisionnement de démonstration a été rétabli.", "info");
      return;
    }
    setRecords((current) => ({ ...current, [featureId]: mockRecords[featureId] ?? [] }));
    notify("Données restaurées", "Le jeu de démonstration de cet écran a été rétabli.", "info");
  }, [notify]);

  const value = useMemo(
    () => ({ ready, user, records, catalogueFamilies, workshops, clientSectors, materialTypes, materialUnits, settings, accessRoles, addCatalogueFamily, addWorkshop, renameWorkshop, deleteWorkshop, addMaterialType, renameMaterialType, deleteMaterialType, addMaterialUnit, renameMaterialUnit, deleteMaterialUnit, addClientSector, renameClientSector, deleteClientSector, assignClientsToSector, saveSettings, resetSettings, saveRole, deleteRole, login, logout, createRecord, updateRecord, deleteRecord, convertCalculatorQuote, applyOrderAvenant, issueInvoice, recordDepositPayment, uploadOrderFiles, replaceOrderFile, deleteOrderFile, validateSupply, deleteSupply, withdrawStock, resetFeature, notify, locale, setLocale, t, te }),
    [ready, user, records, catalogueFamilies, workshops, clientSectors, materialTypes, materialUnits, settings, accessRoles, addCatalogueFamily, addWorkshop, renameWorkshop, deleteWorkshop, addMaterialType, renameMaterialType, deleteMaterialType, addMaterialUnit, renameMaterialUnit, deleteMaterialUnit, addClientSector, renameClientSector, deleteClientSector, assignClientsToSector, saveSettings, resetSettings, saveRole, deleteRole, login, logout, createRecord, updateRecord, deleteRecord, convertCalculatorQuote, applyOrderAvenant, issueInvoice, recordDepositPayment, uploadOrderFiles, replaceOrderFile, deleteOrderFile, validateSupply, deleteSupply, withdrawStock, resetFeature, notify, locale, setLocale, t, te],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => {
          const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? CircleAlert : Info;
          return (
            <div className={`toast toast-${toast.tone}`} key={toast.id} role="status">
              <Icon size={19} />
              <div><strong>{toast.title}</strong><span>{toast.message}</span></div>
              <button aria-label={t("common.closeToast", "Fermer la notification")} onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X size={16} /></button>
            </div>
          );
        })}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp doit être utilisé dans AppProvider");
  return context;
}
