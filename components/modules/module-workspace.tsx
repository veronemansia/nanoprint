"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Check, ChevronLeft, ChevronRight, Download, Ellipsis, Eye, FileDown,
  Filter, Grid2X2, HardDrive, History, List, LoaderCircle, Pencil, Plus, RotateCcw, Search, Trash2, TriangleAlert, X,
} from "lucide-react";
import { CatalogueProductForm } from "@/components/modules/catalogue-product-form";
import { MaterialForm, MaterialDetail } from "@/components/modules/material-form";
import { DocumentDesigner, DocumentNameModal, DocumentPreview } from "@/components/modules/document-designer";
import { GeneralSettings } from "@/components/modules/general-settings";
import { TarifGridForm } from "@/components/modules/tarif-grid-form";
import { RolePanel, UserDetail, UserForm } from "@/components/modules/users-access";
import { ClientDetail, ClientForm } from "@/components/modules/client-form";
import { ClientHistoryDrawer } from "@/components/modules/client-history";
import { ClientSegmentation } from "@/components/modules/client-segmentation";
import { ClientContacts } from "@/components/modules/client-contacts";
import { PriceCalculatorForm, QuoteDetail } from "@/components/modules/price-calculator";
import { QuoteConversion } from "@/components/modules/quote-conversion";
import { OrderAvenants } from "@/components/modules/order-avenants";
import { OrderInvoices, OrderDeposits } from "@/components/modules/order-billing";
import { OrderClientFiles } from "@/components/modules/order-client-files";
import { MachinePlanning } from "@/components/modules/machine-planning";
import { OrderDetail } from "@/components/modules/order-detail";
import { SupplierPurchaseDrawer } from "@/components/modules/supplier-purchases";
import { SupplyOrders } from "@/components/modules/supply-orders";
import { SupplyHistory } from "@/components/modules/supply-history";
import { StockFollow } from "@/components/modules/stock-follow";
import { Taxes } from "@/components/modules/taxes";
import { ReportsWorkspace } from "@/components/modules/reports-workspace";
import { downloadCsv } from "@/lib/reports";
import { exportReportAction } from "@/app/actions/data";
import { countHistoryItems, historyForClient } from "@/lib/client-history";
import { catalogueKindOf, parsePricedOptions, parseProductMaterials, parseQuantityTiers, summarizePricedOptions, summarizeProductMaterials, summarizeQuantityTiers, type CatalogueKind } from "@/lib/catalogue";
import { formatAmount } from "@/lib/company-settings";
import { localeTag, localizeFeature, localizeModule, type Locale } from "@/lib/i18n";
import { inventoryGap } from "@/lib/stock";
import type { CompanySettings } from "@/lib/company-settings";
import { useApp } from "@/components/providers/app-provider";
import type { FeatureDefinition, MockRecord, ModuleDefinition } from "@/lib/types";

type ModalState =
  | { type: "create" }
  | { type: "edit"; record: MockRecord }
  | { type: "delete"; record: MockRecord }
  | { type: "detail"; record: MockRecord }
  | { type: "purchases"; record: MockRecord }
  | { type: "design"; name: string; record?: MockRecord }
  | { type: "preview"; record: MockRecord }
  | null;

const MONEY_KEYS = ["amount", "paid", "revenue", "value", "basePrice", "hourlyCost", "asked", "received", "sold", "material", "machine", "labor", "margin", "saving", "newAmount", "delta", "buyPrice", "sellPrice"];

function displayValue(value: string | number, key: string, settings: CompanySettings, locale: Locale = "fr") {
  const money = (amount: number) => formatAmount(amount, settings);
  const tag = localeTag(locale);
  if (key === "discount") {
    const rebate = Number(value);
    return rebate > 0 ? `${rebate} %` : "—";
  }
  if (key === "priceGrid") {
    return summarizeQuantityTiers(value, money);
  }
  if (["printSides", "paperTypes", "extraOptions"].includes(key)) {
    return summarizePricedOptions(value, money);
  }
  if (key === "composition") {
    return summarizeProductMaterials(value);
  }
  if (key === "productKind") {
    return catalogueKindOf({ productKind: String(value || "Produit") });
  }
  if (typeof value === "number") {
    if (MONEY_KEYS.includes(key)) return money(value);
    return new Intl.NumberFormat(tag).format(value);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(tag, { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
  }
  return value || "—";
}

function statusTone(status: string) {
  if (/conforme|payée|actif|disponible|livrée|terminé|reçu|validé|présent|signé|or|réussie|complète|publié|imputé|récupéré|ok|régularisé/i.test(status)) return "green";
  if (/retard|panne|rupture|bloqué|non conforme|échec|suspendu|critique|expiré|refusé/i.test(status)) return "magenta";
  if (/attente|bas|partiel|maintenance|correction|reprise|préparer|brouillon|alerte|urgence/i.test(status)) return "yellow";
  return "cyan";
}

export function ModuleWorkspace({ module, feature }: { module: ModuleDefinition; feature: FeatureDefinition }) {
  const { records, createRecord, updateRecord, deleteRecord, resetFeature, notify, user, settings, t, locale, refreshAuditLogs, apiLive } = useApp();
  const uiModule = useMemo(() => localizeModule(module, t), [module, t]);
  const uiFeature = useMemo(() => localizeFeature(feature, t), [feature, t]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("Tous");
  const [view, setView] = useState<"table" | "grid">("table");
  const [modal, setModal] = useState<ModalState>(null);
  const [pending, setPending] = useState(false);
  const [page, setPage] = useState(1);
  const [accessTab, setAccessTab] = useState<"users" | "roles">("users");
  const [listKind, setListKind] = useState<CatalogueKind>("Produit");
  const pageSize = 8;
  const isTarifs = feature.id === "tarifs";
  const isCatalogue = feature.id === "catalogue";
  const usesKindSwitch = isTarifs || isCatalogue;
  const isDocs = feature.id === "modeles-documents";
  const isSettings = feature.id === "parametres-generaux";
  const isTaxes = feature.id === "taxes";
  const isUsers = feature.id === "roles-permissions";
  const isAudit = feature.id === "audit-trail";
  const isBackup = feature.id === "sauvegardes";
  const isHistory = feature.id === "historique-commandes";
  const isSegmentation = feature.id === "segmentation";
  const isContacts = feature.id === "contacts-multiples";
  const isConversion = feature.id === "conversion";
  const isAvenants = feature.id === "avenants";
  const isInvoices = feature.id === "factures";
  const isDeposits = feature.id === "acomptes";
  const isClientFiles = feature.id === "fichiers-clients";
  const isMachinePlanning = feature.id === "planning-machines";
  const isSupply = feature.id === "approvisionnement";
  const isSupplyHistory = feature.id === "historique-approvisionnement";
  const isStockFollow = feature.id === "stock-papier";
  const isInventory = feature.id === "inventaire";
  const isOrders = feature.id === "statuts-commandes";
  const isSuppliers = feature.id === "fournisseurs";
  const isMaterials = feature.id === "matieres";
  const isReporting = module.id === "reporting";
  const readOnly = isAudit || isHistory;
  useEffect(() => {
    if (!isAudit || !apiLive) return;
    void refreshAuditLogs();
  }, [isAudit, apiLive, refreshAuditLogs]);
  const sourceId = isTarifs ? "catalogue" : isHistory ? "fiches-clients" : feature.id;
  const rows = useMemo(() => records[sourceId] ?? [], [records, sourceId]);
  const money = (amount: number) => formatAmount(amount, settings);

  const filtered = useMemo(() => {
    const normalized = deferredQuery.toLocaleLowerCase("fr");
    return rows.filter((record) => {
      const haystack = isDocs
        ? [record.name, record.reference, record.status]
        : isUsers
          ? [record.name, record.reference, record.email, record.phone, record.address, record.role, record.status]
          : isHistory
            ? [record.name, record.reference, record.clientType, record.phone, record.email, record.status]
            : Object.values(record);
      const matchesQuery = !normalized || haystack.some((value) => String(value).toLocaleLowerCase("fr").includes(normalized));
      const matchesKind = !usesKindSwitch || catalogueKindOf(record) === listKind;
      return matchesQuery && matchesKind && (status === "Tous" || record.status === status);
    });
  }, [deferredQuery, rows, status, isDocs, isUsers, isHistory, usesKindSwitch, listKind]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const secondaryFields = uiFeature.fields.filter((field) => field.key !== "name" && !(usesKindSwitch && field.key === "productKind")).slice(0, isMaterials ? 4 : 3);
  const editLabel = isDocs ? t("ws.design", "Concevoir") : isTarifs ? t("ws.priceGrid", "Grille tarifaire") : t("common.edit", "Modifier");
  const showRoles = isUsers && accessTab === "roles";

  function openModal(next: ModalState) {
    if (!next) {
      setModal(null);
      return;
    }
    if (isDocs && next.type === "detail") {
      setModal({ type: "preview", record: next.record });
      return;
    }
    if (isDocs && next.type === "edit") {
      setModal({ type: "design", name: next.record.name, record: next.record });
      return;
    }
    setModal(next);
  }

  function exportCsv() {
    const keys = ["reference", "name", "status", ...feature.fields.map((field) => field.key).filter((key) => key !== "name" && key !== "html" && key !== "layout")];
    const csv = [keys.join(";"), ...filtered.map((record) => keys.map((key) => {
      const raw = record[key] ?? "";
      const shown = key === "priceGrid"
        ? summarizeQuantityTiers(raw, money)
        : ["printSides", "paperTypes", "extraOptions"].includes(key)
          ? summarizePricedOptions(raw, money)
          : key === "composition"
            ? summarizeProductMaterials(raw)
            : String(raw);
      return `"${shown.replaceAll('"', '""')}"`;
    }).join(";"))].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `nanoprint-${feature.id}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify("Export prêt", t("toast.exported", "{n} ligne(s) exportées.", { n: filtered.length }), "info");
  }

  async function exportAudit() {
    setPending(true);
    try {
      const file = await exportReportAction("audit");
      downloadCsv(file.filename, file.csv);
      notify("Export prêt", t("toast.exported", "Journal d’audit exporté."), "info");
    } catch (error) {
      exportCsv();
      notify("Export local", error instanceof Error ? error.message : t("ws.exportLocal", "Export généré depuis le tableau affiché."), "info");
    } finally {
      setPending(false);
    }
  }

  async function runBackup() {
    setPending(true);
    try {
      const now = new Date();
      const stamp = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(now);
      await createRecord("sauvegardes", {
        name: `Sauvegarde ${stamp}`,
        status: "Réussie",
        frequency: "Manuelle",
        size: `${(1.6 + Math.random() * 2.1).toFixed(1).replace(".", ",")} Go`,
        location: "Stockage local NanoPrint",
        lastRun: now.toISOString().slice(0, 10),
      });
    } finally {
      setPending(false);
    }
  }

  if (isSettings) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <GeneralSettings />
      </div>
    );
  }

  if (isTaxes) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <Taxes />
      </div>
    );
  }

  if (isSegmentation) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <ClientSegmentation />
      </div>
    );
  }

  if (isContacts) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <ClientContacts />
      </div>
    );
  }

  if (isConversion) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <QuoteConversion />
      </div>
    );
  }

  if (isAvenants) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <OrderAvenants />
      </div>
    );
  }

  if (isInvoices || isDeposits) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        {isInvoices ? <OrderInvoices /> : <OrderDeposits />}
      </div>
    );
  }

  if (isClientFiles) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <OrderClientFiles />
      </div>
    );
  }

  if (isMachinePlanning) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <MachinePlanning />
      </div>
    );
  }

  if (isSupply) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <SupplyOrders />
      </div>
    );
  }

  if (isSupplyHistory) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <SupplyHistory />
      </div>
    );
  }

  if (isStockFollow) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <StockFollow />
      </div>
    );
  }

  if (isReporting) {
    return (
      <div className="page-content module-page">
        <section className="page-heading">
          <div>
            <span className="eyebrow">{uiModule.label}</span>
            <h1>{uiFeature.title}</h1>
            <p>{uiFeature.description}</p>
          </div>
        </section>
        <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
          {uiModule.features.map((item) => (
            <Link
              key={item.id}
              href={`/admin/${module.id}/${item.id}`}
              className={item.id === feature.id ? "active" : ""}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <ReportsWorkspace feature={feature} />
      </div>
    );
  }

  return (
    <div className="page-content module-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">{uiModule.label}</span>
          <h1>{uiFeature.title}</h1>
          <p>{uiFeature.description}</p>
        </div>
        <div className="heading-actions">
          {isAudit && <button className="button button-secondary" disabled={pending} onClick={() => void exportAudit()}><Download size={17} /> {t("common.export", "Exporter")}</button>}
          {!readOnly && <button className="button button-secondary" onClick={exportCsv}><Download size={17} /> {t("common.export", "Exporter")}</button>}
          {isBackup && (
            <button className="button button-primary" disabled={pending} onClick={runBackup}>
              {pending ? <><LoaderCircle className="spin" size={17} /> {t("ws.backingUp", "Sauvegarde…")}</> : <><HardDrive size={17} /> {t("ws.backup", "Sauvegarder")}</>}
            </button>
          )}
          {!isTarifs && !readOnly && !isBackup && !showRoles && !isOrders && !isInventory && (
            <button className="button button-primary" onClick={() => setModal({ type: "create" })}><Plus size={17} /> {isCatalogue && listKind === "Prestation" ? t("ws.newService", "Nouvelle prestation") : uiFeature.createLabel}</button>
          )}
        </div>
      </section>

      <nav className="feature-tabs" aria-label={t("shell.featuresOf", "Fonctionnalités {label}", { label: uiModule.shortLabel })}>
        {uiModule.features.map((item) => (
          <Link
            key={item.id}
            href={`/admin/${module.id}/${item.id}`}
            className={item.id === feature.id ? "active" : ""}
          >
            {item.title}
          </Link>
        ))}
      </nav>

      {isUsers && (
        <button
          type="button"
          className={`stock-kind-switch ${accessTab === "roles" ? "is-on" : ""}`}
          role="switch"
          aria-checked={accessTab === "roles"}
          aria-label={t("ws.toggleAccess", "Basculer entre utilisateurs et rôles")}
          onClick={() => {
            setAccessTab(accessTab === "users" ? "roles" : "users");
            setQuery("");
            setPage(1);
          }}
        >
          <span className={accessTab === "users" ? "is-current" : ""}>{t("ws.users", "Utilisateurs")}</span>
          <span className="quote-switch" aria-hidden="true"><i /></span>
          <span className={accessTab === "roles" ? "is-current" : ""}>{t("ws.roles", "Rôles")}</span>
        </button>
      )}

      {showRoles ? (
        <RolePanel />
      ) : (
      <section className="data-section">
        {usesKindSwitch && (
          <button
            type="button"
            className={`stock-kind-switch ${listKind === "Prestation" ? "is-on" : ""}`}
            role="switch"
            aria-checked={listKind === "Prestation"}
            aria-label={t("ws.toggleKind", "Basculer entre produit et prestation")}
            onClick={() => {
              setListKind(listKind === "Produit" ? "Prestation" : "Produit");
              setQuery("");
              setPage(1);
            }}
          >
            <span className={listKind === "Produit" ? "is-current" : ""}>{t("ws.product", "Produit")}</span>
            <span className="quote-switch" aria-hidden="true"><i /></span>
            <span className={listKind === "Prestation" ? "is-current" : ""}>{t("ws.service", "Prestation")}</span>
          </button>
        )}
        <div className="table-toolbar">
          <label className="table-search">
            <Search size={17} />
            <input id="page-search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={usesKindSwitch ? (listKind === "Prestation" ? t("ws.searchService", "Rechercher une prestation…") : t("ws.searchProduct", "Rechercher un produit…")) : t("ws.searchEntity", "Rechercher un {entity}…", { entity: uiFeature.entityName })} />
            {query && <button onClick={() => setQuery("")} aria-label={t("common.clearSearch", "Effacer la recherche")}><X size={15} /></button>}
          </label>
          <div className="toolbar-actions">
            <label className="filter-select">
              <Filter size={16} />
              <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="Tous">{t("common.all", "Tous")}</option>
                {feature.statuses.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            {!readOnly && <button className="icon-button" title={t("common.resetData", "Réinitialiser les données")} onClick={() => resetFeature(isTarifs ? "tarifs" : feature.id)}><RotateCcw size={17} /></button>}
            <span className="view-switch">
              <button className={view === "table" ? "active" : ""} onClick={() => setView("table")} aria-label={t("common.viewTable", "Vue tableau")}><List size={17} /></button>
              <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")} aria-label={t("common.viewCards", "Vue fiches")}><Grid2X2 size={16} /></button>
            </span>
          </div>
        </div>

        {pageRows.length === 0 ? (
          <div className="empty-state">
            <span><Search size={25} /></span>
            <h3>{usesKindSwitch && listKind === "Prestation" ? t("ws.emptyService", "Aucune prestation") : t("ws.emptyEntity", "Aucun {entity}", { entity: uiFeature.entityName })}</h3>
            <p>{isTarifs ? (listKind === "Prestation" ? t("ws.emptyTarifService", "Les grilles tarifaires s’appliquent aux prestations déjà créées dans le catalogue.") : t("ws.emptyTarifProduct", "Les grilles tarifaires s’appliquent aux produits déjà créés dans le catalogue.")) : isCatalogue && listKind === "Prestation" ? t("ws.emptyCatalogueService", "Modifiez les filtres ou créez une première prestation.") : isHistory ? t("ws.emptyHistory", "Aucun client ne correspond à la recherche.") : isOrders ? t("ws.emptyOrders", "Aucune commande ne correspond. Elles arrivent depuis la conversion de devis.") : isInventory ? t("ws.emptyInventory", "Aucune ligne d’inventaire ne correspond à la recherche.") : readOnly ? t("ws.emptyAudit", "Aucun événement ne correspond à la recherche.") : isBackup ? t("ws.emptyBackup", "Lancez une première sauvegarde.") : t("ws.emptyDefault", "Modifiez les filtres ou créez un premier enregistrement.")}</p>
            <div>
              <button className="button button-secondary" onClick={() => { setQuery(""); setStatus("Tous"); }}>{t("ws.clearFilters", "Effacer les filtres")}</button>
              {isTarifs ? (
                <Link className="button button-primary" href="/admin/configuration/catalogue">{t("ws.openCatalogue", "Ouvrir le catalogue")}</Link>
              ) : isOrders ? (
                <Link className="button button-primary" href="/admin/devis-commandes/conversion">{t("ws.convertQuote", "Convertir un devis")}</Link>
              ) : isBackup ? (
                <button className="button button-primary" disabled={pending} onClick={runBackup}><HardDrive size={16} /> {t("ws.backup", "Sauvegarder")}</button>
              ) : readOnly || isInventory ? null : (
                <button className="button button-primary" onClick={() => setModal({ type: "create" })}><Plus size={16} /> {isCatalogue && listKind === "Prestation" ? t("ws.newService", "Nouvelle prestation") : uiFeature.createLabel}</button>
              )}
            </div>
          </div>
        ) : view === "table" ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <colgroup>
                <col className="col-ref" />
                <col className="col-name" />
                {secondaryFields.map((field) => <col key={field.key} />)}
                <col className="col-status" />
                <col className="col-date" />
                <col className="col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th>{t("common.reference", "Référence")}</th>
                  <th>{uiFeature.fields.find((field) => field.key === "name")?.label ?? t("common.designation", "Désignation")}</th>
                  {secondaryFields.map((field) => <th key={field.key}>{field.label}</th>)}
                  <th>{t("common.status", "Statut")}</th>
                  <th>{t("common.updated", "Mise à jour")}</th>
                  <th><span className="sr-only">{t("common.actions", "Actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((record) => (
                  <tr key={record.id}>
                    <td title={record.reference}><span className="cell-clip"><button className="reference-button" onClick={() => openModal({ type: isTarifs ? "edit" : "detail", record })}>{record.reference}</button></span></td>
                    <td title={record.name}><strong className="cell-clip"><button className="name-button" onClick={() => openModal({ type: isTarifs ? "edit" : "detail", record })}>{record.name}</button></strong></td>
                    {secondaryFields.map((field) => {
                      const shown = displayValue(record[field.key] ?? "", field.key, settings, locale);
                      return <td key={field.key} title={String(shown)}><span className="cell-clip">{shown}</span></td>;
                    })}
                    <td><span className="cell-clip"><span className={`status-badge status-${statusTone(record.status)}`}><i />{record.status}</span></span></td>
                    <td className="muted-cell"><span className="cell-clip">{record.updatedAt}</span></td>
                    <td><RowActions record={record} onOpen={openModal} canDelete={!isTarifs && !readOnly && user?.role === "Administrateur"} showDelete={!isTarifs && !readOnly} showEdit={!readOnly && !isBackup && !isOrders} showHistory={isSuppliers} editLabel={editLabel} consultLabel={isHistory ? t("ws.consultOrders", "Consulter les commandes") : t("common.consult", "Consulter")} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="record-grid">
            {pageRows.map((record) => (
              <article className="record-card" key={record.id}>
                <div className="record-card-top">
                  <span className="record-ref">{record.reference}</span>
                  <RowActions record={record} onOpen={openModal} canDelete={!isTarifs && !readOnly && user?.role === "Administrateur"} showDelete={!isTarifs && !readOnly} showEdit={!readOnly && !isBackup && !isOrders} showHistory={isSuppliers} editLabel={editLabel} consultLabel={isHistory ? t("ws.consultOrders", "Consulter les commandes") : t("common.consult", "Consulter")} />
                </div>
                <h3><button className="name-button" onClick={() => openModal({ type: isTarifs ? "edit" : "detail", record })}>{record.name}</button></h3>
                <span className={`status-badge status-${statusTone(record.status)}`}><i />{record.status}</span>
                <dl>{secondaryFields.map((field) => {
                  const shown = displayValue(record[field.key] ?? "", field.key, settings, locale);
                  return <div key={field.key}><dt>{field.label}</dt><dd title={String(shown)}>{shown}</dd></div>;
                })}</dl>
                <button className="card-detail-link" onClick={() => openModal({ type: isTarifs ? "edit" : "detail", record })}>{isTarifs ? t("ws.openGrid", "Ouvrir la grille") : isDocs ? t("ws.seeDesign", "Voir le design") : isHistory ? t("ws.consultOrdersCount", "Consulter les commandes ({count})", { count: countHistoryItems(historyForClient(records, record)) }) : t("ws.openRecord", "Ouvrir la fiche")} <ArrowRight size={15} /></button>
              </article>
            ))}
          </div>
        )}

        <div className="table-footer">
          <span>{t("common.page", "Page {current} sur {total}", { current: currentPage, total: pages })}</span>
          <div>
            <button disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /> {t("common.previous", "Précédent")}</button>
            <button disabled={currentPage >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>{t("common.next", "Suivant")} <ChevronRight size={16} /></button>
          </div>
        </div>
      </section>
      )}

      {modal?.type === "create" && isDocs && (
        <DocumentNameModal
          onClose={() => setModal(null)}
          onDesign={(name) => setModal({ type: "design", name })}
        />
      )}
      {modal?.type === "design" && (
        <DocumentDesigner
          name={modal.name}
          record={modal.record}
          pending={pending}
          statuses={feature.statuses}
          onClose={() => setModal(null)}
          onSubmit={async (values) => {
            setPending(true);
            try {
              if (modal.record) await updateRecord(feature.id, modal.record.id, values);
              else await createRecord(feature.id, values);
              setModal(null);
            } finally {
              setPending(false);
            }
          }}
        />
      )}
      {modal?.type === "preview" && (
        <DocumentPreview
          record={modal.record}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ type: "design", name: modal.record.name, record: modal.record })}
        />
      )}
      {modal?.type === "detail" && isHistory && (
        <ClientHistoryDrawer client={modal.record} onClose={() => setModal(null)} />
      )}
      {modal?.type === "purchases" && (
        <SupplierPurchaseDrawer
          supplier={(records.fournisseurs ?? []).find((item) => item.id === modal.record.id) ?? modal.record}
          onClose={() => setModal(null)}
          onBackToFiche={() => setModal({ type: "detail", record: modal.record })}
        />
      )}
      {modal?.type === "detail" && !isHistory && (
        <DetailDrawer
          feature={uiFeature}
          record={(records[feature.id] ?? []).find((item) => item.id === modal.record.id) ?? modal.record}
          settings={settings}
          onClose={() => setModal(null)}
          onEdit={() => setModal({ type: "edit", record: modal.record })}
          onPurchases={isSuppliers ? () => setModal({ type: "purchases", record: modal.record }) : undefined}
        />
      )}
      {modal?.type === "edit" && isTarifs && (
        <TarifGridForm
          record={modal.record}
          pending={pending}
          onClose={() => setModal(null)}
          onSubmit={async (values) => {
            setPending(true);
            try {
              await updateRecord("catalogue", modal.record.id, values);
              setModal(null);
            } finally {
              setPending(false);
            }
          }}
        />
      )}
      {(modal?.type === "create" || modal?.type === "edit") && !isTarifs && !isDocs && !readOnly && !isBackup && !isOrders && (
        feature.id === "catalogue" ? (
          <CatalogueProductForm
            feature={feature}
            record={modal.type === "edit" ? modal.record : undefined}
            defaultKind={listKind}
            pending={pending}
            onClose={() => setModal(null)}
            onSubmit={async (values) => {
              setPending(true);
              try {
                if (modal.type === "edit") await updateRecord(feature.id, modal.record.id, values);
                else await createRecord(feature.id, values);
                setModal(null);
              } finally {
                setPending(false);
              }
            }}
          />
        ) : feature.id === "matieres" ? (
          <MaterialForm
            feature={feature}
            record={modal.type === "edit" ? modal.record : undefined}
            pending={pending}
            onClose={() => setModal(null)}
            onSubmit={async (values) => {
              setPending(true);
              try {
                if (modal.type === "edit") await updateRecord(feature.id, modal.record.id, values);
                else await createRecord(feature.id, values);
                setModal(null);
              } finally {
                setPending(false);
              }
            }}
          />
        ) : isUsers ? (
          <UserForm
            record={modal.type === "edit" ? modal.record : undefined}
            pending={pending}
            statuses={feature.statuses}
            onClose={() => setModal(null)}
            onSubmit={async (values) => {
              setPending(true);
              try {
                if (modal.type === "edit") await updateRecord(feature.id, modal.record.id, values);
                else await createRecord(feature.id, values);
                setModal(null);
              } finally {
                setPending(false);
              }
            }}
          />
        ) : feature.id === "fiches-clients" ? (
          <ClientForm
            record={modal.type === "edit" ? modal.record : undefined}
            pending={pending}
            statuses={feature.statuses}
            onClose={() => setModal(null)}
            onSubmit={async (values) => {
              setPending(true);
              try {
                if (modal.type === "edit") await updateRecord(feature.id, modal.record.id, values);
                else await createRecord(feature.id, values);
                setModal(null);
              } finally {
                setPending(false);
              }
            }}
          />
        ) : feature.id === "calculateur" ? (
          <PriceCalculatorForm
            record={modal.type === "edit" ? modal.record : undefined}
            pending={pending}
            onClose={() => setModal(null)}
            onSubmit={async (values) => {
              setPending(true);
              try {
                if (modal.type === "edit") await updateRecord(feature.id, modal.record.id, values);
                else await createRecord(feature.id, values);
                setModal(null);
              } finally {
                setPending(false);
              }
            }}
          />
        ) : feature.id === "devis-multi" ? (
          <PriceCalculatorForm
            mode="devis-multi"
            record={modal.type === "edit" ? modal.record : undefined}
            pending={pending}
            onClose={() => setModal(null)}
            onSubmit={async (values) => {
              setPending(true);
              try {
                if (modal.type === "edit") await updateRecord(feature.id, modal.record.id, values);
                else await createRecord(feature.id, values);
                setModal(null);
              } finally {
                setPending(false);
              }
            }}
          />
        ) : (
        <RecordFormModal
          feature={uiFeature}
          record={modal.type === "edit" ? modal.record : undefined}
          pending={pending}
          onClose={() => setModal(null)}
          onSubmit={async (values) => {
            setPending(true);
            try {
              if (modal.type === "edit") await updateRecord(feature.id, modal.record.id, values);
              else await createRecord(feature.id, values);
              setModal(null);
            } finally {
              setPending(false);
            }
          }}
        />
        )
      )}
      {modal?.type === "delete" && !isTarifs && !readOnly && (
        <ConfirmDeleteModal
          record={modal.record}
          pending={pending}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            setPending(true);
            try {
              await deleteRecord(feature.id, modal.record.id);
              setModal(null);
            } finally {
              setPending(false);
            }
          }}
        />
      )}
    </div>
  );
}

function RowActions({ record, onOpen, canDelete, showDelete = true, showEdit = true, showHistory = false, editLabel, consultLabel }: { record: MockRecord; onOpen: (modal: ModalState) => void; canDelete: boolean; showDelete?: boolean; showEdit?: boolean; showHistory?: boolean; editLabel?: string; consultLabel?: string }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className="row-actions">
      <button aria-label={t("common.actionsFor", "Actions pour {ref}", { ref: record.reference })} onClick={() => setOpen((value) => !value)}><Ellipsis size={18} /></button>
      {open && (
        <div className="action-menu">
          <button onClick={() => { onOpen({ type: "detail", record }); setOpen(false); }}><Eye size={15} /> {consultLabel ?? t("common.consult", "Consulter")}</button>
          {showEdit && (
            <button onClick={() => { onOpen({ type: "edit", record }); setOpen(false); }}><Pencil size={15} /> {editLabel ?? t("common.edit", "Modifier")}</button>
          )}
          {showHistory && (
            <button onClick={() => { onOpen({ type: "purchases", record }); setOpen(false); }}><History size={15} /> {t("ws.purchaseHistory", "Historique des achats")}</button>
          )}
          {showDelete && (
            <button className="danger" disabled={!canDelete} title={!canDelete ? t("common.adminOnly", "Réservé aux administrateurs") : undefined} onClick={() => { onOpen({ type: "delete", record }); setOpen(false); }}><Trash2 size={15} /> {t("common.delete", "Supprimer")}</button>
          )}
        </div>
      )}
    </div>
  );
}

function RecordFormModal({ feature, record, pending, onClose, onSubmit }: {
  feature: FeatureDefinition;
  record?: MockRecord;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string | number>) => Promise<void>;
}) {
  const { t } = useApp();
  const [error, setError] = useState("");
  const isInventory = feature.id === "inventaire";
  const [systemQty, setSystemQty] = useState(Number(record?.systemQty) || 0);
  const [physicalQty, setPhysicalQty] = useState(Number(record?.physicalQty) || 0);
  const computedGap = inventoryGap(systemQty, physicalQty);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const values: Record<string, string | number> = {};
    for (const field of feature.fields) {
      if (isInventory && (field.key === "gap" || field.key === "qtyInit" || field.key === "qtySolde")) {
        if (field.key === "gap") values.gap = computedGap;
        if (field.key === "qtyInit") values.qtyInit = systemQty;
        if (field.key === "qtySolde") values.qtySolde = physicalQty;
        continue;
      }
      const raw = String(formData.get(field.key) ?? "").trim();
      if (field.required && !raw && raw !== "0") {
        setError(t("common.requiredField", "Le champ « {label} » est obligatoire.", { label: field.label }));
        return;
      }
      values[field.key] = field.type === "number" ? Number(raw || 0) : raw;
    }
    if (isInventory) {
      values.systemQty = systemQty;
      values.physicalQty = physicalQty;
      values.gap = computedGap;
    }
    values.status = String(formData.get("status") || feature.statuses[0]);
    await onSubmit(values);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{record ? t("common.modify", "Modification") : t("common.create", "Création")}</span>
            <h2 id="record-modal-title">{record ? record.name : feature.createLabel}</h2>
          </div>
          <button onClick={onClose} aria-label={t("common.close", "Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            {feature.fields.map((field) => (
              field.key === "workshop" ? (
                <WorkshopField
                  key={field.key}
                  name={field.key}
                  required={field.required}
                  defaultValue={String(record?.[field.key] ?? field.options?.[0] ?? "")}
                />
              ) : (
              <label className={`field ${field.type === "textarea" ? "field-wide" : ""}`} key={field.key}>
                <span>{field.label}{field.required && <b> *</b>}</span>
                {isInventory && field.key === "systemQty" ? (
                  <input name={field.key} type="number" min={0} step={1} value={systemQty} onChange={(event) => setSystemQty(Math.max(0, Math.round(Number(event.target.value) || 0)))} />
                ) : isInventory && field.key === "physicalQty" ? (
                  <input name={field.key} type="number" min={0} step={1} value={physicalQty} onChange={(event) => setPhysicalQty(Math.max(0, Math.round(Number(event.target.value) || 0)))} />
                ) : isInventory && field.key === "gap" ? (
                  <input name={field.key} type="number" value={computedGap} readOnly aria-readonly="true" />
                ) : isInventory && field.key === "qtyInit" ? (
                  <input name={field.key} type="number" value={systemQty} readOnly aria-readonly="true" />
                ) : isInventory && field.key === "qtySolde" ? (
                  <input name={field.key} type="number" value={physicalQty} readOnly aria-readonly="true" />
                ) : field.type === "select" ? (
                  <select name={field.key} defaultValue={String(record?.[field.key] ?? field.options?.[0] ?? "")}>
                    {field.options?.map((option) => <option key={option}>{option}</option>)}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea name={field.key} defaultValue={String(record?.[field.key] ?? "")} rows={3} />
                ) : (
                  <input name={field.key} type={field.type ?? "text"} defaultValue={String(record?.[field.key] ?? "")} min={field.type === "number" ? 0 : undefined} />
                )}
              </label>
              )
            ))}
            <label className="field">
              <span>{t("common.status", "Statut")}</span>
              <select name="status" defaultValue={record?.status ?? feature.statuses[0]}>
                {feature.statuses.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          {isInventory && (
            <p className="settings-hint">Init {systemQty} · Physique {physicalQty} · Solde {physicalQty}</p>
          )}
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>{t("common.cancel", "Annuler")}</button>
            <button className="button button-primary" disabled={pending}>
              {pending ? <><LoaderCircle className="spin" size={17} /> {t("common.saving", "Enregistrement…")}</> : <><Check size={17} /> {t("common.save", "Enregistrer")}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WorkshopField({ name, defaultValue, required }: { name: string; defaultValue: string; required?: boolean }) {
  const { workshops, addWorkshop, renameWorkshop, deleteWorkshop, t } = useApp();
  const [value, setValue] = useState(defaultValue || workshops[0] || "");
  const [mode, setMode] = useState<"idle" | "add" | "edit">("idle");
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState("");
  const options = useMemo(() => [...new Set([...workshops, ...(value ? [value] : [])])], [workshops, value]);
  const canDelete = options.length > 1;

  function closeEditor() {
    setMode("idle");
    setDraft("");
    setLocalError("");
  }

  function save() {
    const label = draft.trim();
    if (!label) {
      setLocalError(t("ws.workshopName", "Saisissez un nom d’atelier."));
      return;
    }
    if (mode === "edit") {
      setValue(renameWorkshop(value, label));
    } else {
      addWorkshop(label);
      setValue(label);
    }
    closeEditor();
  }

  function remove() {
    if (!canDelete) return;
    const fallback = deleteWorkshop(value);
    setValue(fallback || "");
    closeEditor();
  }

  return (
    <div className="field">
      <span>{t("ws.workshop", "Atelier")}{required && <b> *</b>}</span>
      <div className="family-select-row">
        <select name={name} value={value} onChange={(event) => { setValue(event.target.value); closeEditor(); }}>
          {options.map((item) => <option key={item}>{item}</option>)}
        </select>
        <button type="button" className="icon-button" title={t("ws.addWorkshop", "Ajouter un atelier")} onClick={() => { setMode("add"); setDraft(""); setLocalError(""); }}><Plus size={17} /></button>
        <button type="button" className="icon-button" title={t("ws.editWorkshop", "Modifier l’atelier")} disabled={!value} onClick={() => { setMode("edit"); setDraft(value); setLocalError(""); }}><Pencil size={16} /></button>
        <button type="button" className="icon-button danger" title={canDelete ? t("ws.deleteWorkshop", "Supprimer l’atelier") : t("ws.workshopRequired", "Au moins un atelier est requis")} disabled={!canDelete} onClick={remove}><Trash2 size={16} /></button>
      </div>
      {mode !== "idle" && (
        <div className="inline-add">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } }}
            placeholder={mode === "edit" ? t("ws.workshopRename", "Nouveau nom de l’atelier") : t("ws.workshopPlaceholder", "Nouvel atelier (ex. Prépresse)")}
          />
          <button type="button" className="button button-primary" onClick={save}>{mode === "edit" ? t("common.save", "Enregistrer") : t("ws.add", "Ajouter")}</button>
          <button type="button" className="button button-secondary" onClick={closeEditor}>{t("common.cancel", "Annuler")}</button>
        </div>
      )}
      {localError && <div className="form-error" role="alert">{localError}</div>}
    </div>
  );
}

function ConfirmDeleteModal({ record, pending, onClose, onConfirm }: { record: MockRecord; pending: boolean; onClose: () => void; onConfirm: () => Promise<void> }) {
  const { t } = useApp();
  return (
    <div className="modal-backdrop">
      <div className="modal modal-small" role="alertdialog" aria-modal="true">
        <span className="danger-icon"><TriangleAlert size={24} /></span>
        <h2>{t("ws.deleteTitle", "Supprimer {ref} ?", { ref: record.reference })}</h2>
        <p>{t("ws.deleteBody", "Cette action retirera « {name} » des données locales. Vous pourrez restaurer le jeu de démonstration depuis la barre d’outils.", { name: record.name })}</p>
        <div className="modal-actions">
          <button className="button button-secondary" onClick={onClose}>{t("common.cancel", "Annuler")}</button>
          <button className="button button-danger" disabled={pending} onClick={onConfirm}>
            {pending ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />} {t("common.delete", "Supprimer")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TarifDetail({ record, settings }: { record: MockRecord; settings: CompanySettings }) {
  const { t, locale } = useApp();
  const qty = new Intl.NumberFormat(localeTag(locale));
  const tiers = parseQuantityTiers(record.priceGrid);

  return (
    <>
      <dl>
        <div><dt>{t("common.reference", "Référence")}</dt><dd>{record.reference}</dd></div>
        <div><dt>{t("ws.productTitle", "Intitulé produit")}</dt><dd>{record.name}</dd></div>
        <div><dt>{t("ws.family", "Famille")}</dt><dd>{record.family || "—"}</dd></div>
        <div><dt>{t("ws.fullName", "Désignation complète")}</dt><dd>{record.designation || "—"}</dd></div>
      </dl>
      <div className="option-detail">
        <strong>{t("ws.priceGrid", "Grille tarifaire")}</strong>
        {tiers.length === 0 ? <p>{t("ws.noTier", "Aucun palier. Ouvrez la grille pour en ajouter.")}</p> : (
          <ul>
            {tiers.map((row) => (
              <li key={`${row.quantity}-${row.amount}`}>
                <span>{t("ws.forQty", "Pour {qty}", { qty: qty.format(row.quantity) })}</span>
                <b>{formatAmount(row.amount, settings)}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function CatalogueDetail({ record, settings }: { record: MockRecord; settings: CompanySettings }) {
  const { t, locale } = useApp();
  const qty = new Intl.NumberFormat(localeTag(locale));
  const kind = catalogueKindOf(record);
  const materials = parseProductMaterials(record.composition);
  const groups = [
    { title: t("ws.printSides", "Nombre de côtés imprimés"), key: "printSides" },
    { title: t("ws.paperType", "Type de papier"), key: "paperTypes" },
    { title: t("ws.extraOptions", "Options supplémentaires"), key: "extraOptions" },
  ] as const;

  return (
    <>
      <dl>
        <div><dt>{t("common.reference", "Référence")}</dt><dd>{record.reference}</dd></div>
        <div><dt>{t("ws.type", "Type")}</dt><dd>{kind}</dd></div>
        <div><dt>{t("ws.productTitle", "Intitulé produit")}</dt><dd>{record.name}</dd></div>
        <div><dt>{t("ws.family", "Famille")}</dt><dd>{record.family}</dd></div>
        <div><dt>{t("ws.basePrice", "Prix de base")}</dt><dd>{formatAmount(Number(record.basePrice) || 0, settings)}</dd></div>
        <div><dt>{t("ws.fullName", "Désignation complète")}</dt><dd>{record.designation || "—"}</dd></div>
        <div><dt>{t("ws.minQty", "Quantité minimum")}</dt><dd>{t("ws.copies", "{qty} ex.", { qty: qty.format(Number(record.minQuantity) || 0) })}</dd></div>
      </dl>
      {kind === "Produit" && groups.map((group) => {
        const rows = parsePricedOptions(record[group.key]);
        return (
          <div className="option-detail" key={group.key}>
            <strong>{group.title}</strong>
            {rows.length === 0 ? <p>{t("ws.noLine", "Aucune ligne.")}</p> : (
              <ul>
                {rows.map((row) => (
                  <li key={`${group.key}-${row.label}`}>
                    <span>{row.label}</span>
                    <b>{formatAmount(row.price, settings)}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <div className="option-detail">
        <strong>{t("ws.rawMaterials", "Matières premières")}</strong>
        {materials.length === 0 ? <p>{t("ws.noMaterial", "Aucune matière associée.")}</p> : (
          <ul>
            {materials.map((row) => (
              <li key={`${row.materialId}-${row.label}`}>
                <span>{row.label}</span>
                <b>{qty.format(row.quantity)} {row.unit}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function DetailDrawer({ feature, record, settings, onClose, onEdit, onPurchases }: { feature: FeatureDefinition; record: MockRecord; settings: CompanySettings; onClose: () => void; onEdit: () => void; onPurchases?: () => void }) {
  const { t, locale } = useApp();
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="detail-drawer" role="dialog" aria-modal="true" aria-label={`${t("ws.openRecord", "Ouvrir la fiche")} ${record.reference}`}>
        <div className="drawer-head">
          <span className="record-ref">{record.reference}</span>
          <button onClick={onClose} aria-label={t("common.close", "Fermer")}><X size={20} /></button>
        </div>
        <div className="drawer-title">
          <span className={`status-badge status-${statusTone(record.status)}`}><i />{record.status}</span>
          <h2>{record.name}</h2>
          <p>{t("ws.updatedOn", "{title} · mis à jour {date}", { title: feature.title, date: record.updatedAt })}</p>
        </div>
        <div className="drawer-section">
          <span className="panel-kicker">{t("ws.detailSheet", "Fiche détaillée")}</span>
          {feature.id === "catalogue" ? (
            <CatalogueDetail record={record} settings={settings} />
          ) : feature.id === "matieres" ? (
            <MaterialDetail record={record} settings={settings} />
          ) : feature.id === "tarifs" ? (
            <TarifDetail record={record} settings={settings} />
          ) : feature.id === "roles-permissions" ? (
            <UserDetail record={record} />
          ) : feature.id === "fiches-clients" ? (
            <ClientDetail record={record} />
          ) : feature.id === "calculateur" || feature.id === "devis-multi" ? (
            <QuoteDetail record={record} kind={feature.id === "devis-multi" ? "devis" : "chiffrage"} />
          ) : feature.id === "statuts-commandes" ? (
            <OrderDetail record={record} />
          ) : (
            <dl>
              <div><dt>{t("common.reference", "Référence")}</dt><dd>{record.reference}</dd></div>
              {feature.fields.map((field) => (
                <div key={field.key}><dt>{field.label}</dt><dd>{displayValue(record[field.key] ?? "", field.key, settings, locale)}</dd></div>
              ))}
            </dl>
          )}
        </div>
        {feature.id === "fournisseurs" ? null : (
        <div className="drawer-section mock-timeline">
          <span className="panel-kicker">{t("ws.history", "Historique")}</span>
          <div><i /><p><strong>{t("ws.recordUpdated", "Fiche mise à jour")}</strong><span>{record.updatedAt}</span></p></div>
          <div><i /><p><strong>{t("ws.creation", "Création")}</strong><span>28 août 2026 · Système</span></p></div>
        </div>
        )}
        <div className="drawer-actions">
          {onPurchases && (
            <button className="button button-secondary" onClick={onPurchases}><History size={16} /> {t("ws.purchaseHistory", "Historique des achats")}</button>
          )}
          {feature.id === "statuts-commandes" || feature.id === "fournisseurs" ? null : (
            <button className="button button-secondary" onClick={() => window.print()}><FileDown size={16} /> {t("common.print", "Imprimer")}</button>
          )}
          {feature.id !== "audit-trail" && feature.id !== "sauvegardes" && feature.id !== "statuts-commandes" && (
            <button className="button button-primary" onClick={onEdit}><Pencil size={16} /> {feature.id === "tarifs" ? t("ws.editGrid", "Modifier la grille") : t("common.edit", "Modifier")}</button>
          )}
        </div>
      </aside>
    </div>
  );
}
