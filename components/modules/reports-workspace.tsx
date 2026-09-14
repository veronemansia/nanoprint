"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { formatAmount } from "@/lib/company-settings";
import { useApp } from "@/components/providers/app-provider";
import { exportReportAction, loadReportsAction } from "@/app/actions/data";
import {
  buildReportsFromRecords,
  csvFromBundle,
  defaultReportPeriod,
  downloadCsv,
  emptyReportsBundle,
  type ReportExportKind,
  type ReportsBundle,
} from "@/lib/reports";
import type { FeatureDefinition } from "@/lib/types";

const EXPORT_CARDS: Array<{ kind: ReportExportKind; title: string; hint: string }> = [
  { kind: "activity", title: "Activité & échéances", hint: "Retards et livraisons de la semaine, CSV" },
  { kind: "receivables", title: "Encours clients", hint: "Reste à encaisser et ancienneté 0–30 / 31–60 / 61+" },
  { kind: "pipeline", title: "Carnet de commandes", hint: "Répartition attente, production, finition, expédiée" },
  { kind: "sales-clients", title: "CA par client", hint: "Chiffre d’affaires et marge matières estimée" },
  { kind: "sales-products", title: "CA par produit", hint: "Répartition au prorata des quantités" },
  { kind: "stock", title: "Stocks & sorties", hint: "Alertes, valeur et consommations de la période" },
  { kind: "purchases", title: "Achats fournisseurs", hint: "Montants des bons validés sur la période" },
  { kind: "production", title: "Production", hint: "Volumes commandés par statut" },
  { kind: "audit", title: "Journal d’audit", hint: "Jusqu’à 5 000 événements de la période" },
];

function ReportTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  if (!rows.length) {
    return <p className="report-note">Aucune donnée sur cette période.</p>;
  }
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}><span className="cell-clip">{cell}</span></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportsWorkspace({ feature }: { feature: FeatureDefinition }) {
  const { records, notify, settings, t, apiLive } = useApp();
  const initial = defaultReportPeriod();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [bundle, setBundle] = useState<ReportsBundle>(emptyReportsBundle(initial.from, initial.to));
  const [pending, setPending] = useState(false);
  const [exporting, setExporting] = useState("");
  const money = (value: number) => formatAmount(value, settings);

  const load = useCallback(async (start: string, end: string) => {
    setPending(true);
    try {
      if (apiLive) {
        setBundle(await loadReportsAction(start, end));
        return;
      }
      setBundle(buildReportsFromRecords(records, start, end));
    } catch {
      setBundle(buildReportsFromRecords(records, start, end));
    } finally {
      setPending(false);
    }
  }, [apiLive, records]);

  useEffect(() => {
    if (!from || !to || from > to) return;
    void load(from, to);
  }, [from, to, load]);

  async function exportKind(kind: ReportExportKind) {
    setExporting(kind);
    try {
      if (apiLive) {
        const file = await exportReportAction(kind, from, to);
        downloadCsv(file.filename, file.csv);
      } else {
        const file = csvFromBundle(kind, bundle);
        downloadCsv(file.filename, file.csv);
      }
      notify("Export prêt", t("toast.exported", "Fichier CSV généré."), "info");
    } catch (error) {
      const file = csvFromBundle(kind, bundle);
      downloadCsv(file.filename, file.csv);
      notify("Export local", error instanceof Error ? error.message : t("report.exportLocal", "Export généré depuis les données locales."), "info");
    } finally {
      setExporting("");
    }
  }

  const kpis = bundle.kpis;
  const maxPipe = Math.max(1, ...bundle.pipeline.byStatus.map((row) => row.count));

  return (
    <div className="report-page">
      <div className="report-toolbar">
        <label className="field">
          <span>Du</span>
          <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="field">
          <span>Au</span>
          <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="button button-secondary" disabled={pending} onClick={() => void load(from, to)}>
          {pending ? <><LoaderCircle className="spin" size={17} /> Chargement…</> : "Actualiser"}
        </button>
        {from > to ? <p className="report-note">La date de début doit précéder la date de fin.</p> : null}
      </div>

      {feature.id === "tableau-activite" ? (
        <>
          <section className="metric-grid" aria-label="Indicateurs">
            <article className="metric-card">
              <span className="metric-label">Chiffre d’affaires période</span>
              <strong>{money(kpis.billedPeriod > 0 ? kpis.billedPeriod : kpis.orderedPeriod)}</strong>
              <p>Facturé {money(kpis.billedPeriod)} · commandé {money(kpis.orderedPeriod)}</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">Commandes actives</span>
              <strong>{kpis.activeOrders}</strong>
              <p>{money(kpis.activeAmount)} encore en atelier</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">Occupation machines</span>
              <strong>{kpis.occupation}<small>%</small></strong>
              <p>Créneaux planifiés / 8 h × 7 j</p>
            </article>
            <article className="metric-card attention">
              <span className="metric-label">Encours clients</span>
              <strong>{money(bundle.receivables.remaining)}</strong>
              <p>{bundle.receivables.rows.length} commande(s) à encaisser</p>
            </article>
          </section>

          <article className="panel">
            <div className="panel-head"><div><span className="panel-kicker">Pipeline</span><h2>Carnet de commandes</h2></div></div>
            <div className="metric-grid">
              {bundle.pipeline.byStatus.map((row) => (
                <article className="metric-card" key={row.status}>
                  <span className="metric-label">{row.status}</span>
                  <strong>{row.count}</strong>
                  <p>{money(row.amount)}</p>
                  <div className="mini-progress"><i style={{ width: `${Math.round((row.count / maxPipe) * 100)}%` }} /></div>
                </article>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head"><div><span className="panel-kicker">Échéances</span><h2>Retards et semaine</h2></div></div>
            <ReportTable
              headers={["Type", "Référence", "Client", "Statut", "Échéance", "Montant"]}
              rows={[
                ...bundle.overdue.map((row) => ["Retard", row.reference, row.client, row.status, row.dueDate, money(row.amount)]),
                ...bundle.dueSoon.map((row) => ["Cette semaine", row.reference, row.client, row.status, row.dueDate, money(row.amount)]),
              ]}
            />
          </article>

          <article className="panel">
            <div className="panel-head"><div><span className="panel-kicker">Trésorerie</span><h2>Encours clients</h2></div>
              <button type="button" onClick={() => void exportKind("receivables")}>CSV</button>
            </div>
            <p className="report-note">Reste à encaisser : acompte saisi, sinon montant de la commande. Les commandes expédiées sont exclues.</p>
            <ReportTable
              headers={["Client", "Commande", "Statut", "Échéance", "Total", "Encaissé", "Reste", "Ancienneté"]}
              rows={bundle.receivables.rows.map((row) => [row.client, row.reference, row.status, row.dueDate, money(row.total), money(row.paid), money(row.remaining), row.aging])}
            />
          </article>
        </>
      ) : null}

      {feature.id === "rapports-rentabilite" ? (
        <>
          <p className="report-note">La marge affichée est une estimation matières (nomenclature × prix d’achat). Elle n’inclut pas la main-d’œuvre, les machines ni les rebuts.</p>
          <section className="metric-grid">
            <article className="metric-card">
              <span className="metric-label">CA clients</span>
              <strong>{money(bundle.sales.clients.reduce((sum, row) => sum + row.amount, 0))}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Marge matières estimée</span>
              <strong>{money(bundle.sales.clients.reduce((sum, row) => sum + row.margin, 0))}</strong>
            </article>
            <article className="metric-card">
              <span className="metric-label">Achats période</span>
              <strong>{money(bundle.purchases.total)}</strong>
              <p>{bundle.purchases.count} bon(s) fournisseur</p>
            </article>
          </section>
          <article className="panel">
            <div className="panel-head"><div><span className="panel-kicker">Clients</span><h2>Chiffre d’affaires par client</h2></div>
              <button type="button" onClick={() => void exportKind("sales-clients")}>CSV</button>
            </div>
            <ReportTable
              headers={["Client", "Commandes", "CA", "Coût matières estimé", "Marge estimée"]}
              rows={bundle.sales.clients.map((row) => [row.name, row.orders, money(row.amount), money(row.materialCost), money(row.margin)])}
            />
          </article>
          <article className="panel">
            <div className="panel-head"><div><span className="panel-kicker">Produits</span><h2>Chiffre d’affaires par produit</h2></div>
              <button type="button" onClick={() => void exportKind("sales-products")}>CSV</button>
            </div>
            <ReportTable
              headers={["Produit", "Famille", "Commandes", "Quantité", "CA réparti", "Coût matières estimé", "Marge estimée"]}
              rows={bundle.sales.products.map((row) => [row.name, row.family ?? "—", row.orders, row.quantity ?? 0, money(row.amount), money(row.materialCost), money(row.margin)])}
            />
          </article>
          <article className="panel">
            <div className="panel-head"><div><span className="panel-kicker">Période</span><h2>CA mensuel</h2></div></div>
            <ReportTable
              headers={["Mois", "Commandes", "CA", "Coût matières estimé", "Marge estimée"]}
              rows={bundle.sales.months.map((row) => [row.name, row.orders, money(row.amount), money(row.materialCost), money(row.margin)])}
            />
          </article>
          <article className="panel">
            <div className="panel-head"><div><span className="panel-kicker">Achats</span><h2>Dépenses fournisseurs</h2></div>
              <button type="button" onClick={() => void exportKind("purchases")}>CSV</button>
            </div>
            <ReportTable
              headers={["Fournisseur", "Bons", "Montant", "Dernier BL"]}
              rows={bundle.purchases.suppliers.map((row) => [row.name, row.count, money(row.amount), row.lastDate])}
            />
          </article>
        </>
      ) : null}

      {feature.id === "stats-production" ? (
        <>
          <section className="metric-grid">
            <article className="metric-card">
              <span className="metric-label">Volume commandé</span>
              <strong>{bundle.production.volume}</strong>
              <p>{bundle.production.orders} commande(s) sur la période</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">Respect des délais</span>
              <strong>{bundle.production.otd}<small>%</small></strong>
              <p>Parmi les commandes expédiées (date de mise à jour ≤ échéance)</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">Occupation atelier</span>
              <strong>{bundle.production.occupation}<small>%</small></strong>
              <p>7 prochains jours</p>
            </article>
            <article className="metric-card">
              <span className="metric-label">Taux de rebut</span>
              <strong>—</strong>
              <p>Non saisi dans l’atelier</p>
            </article>
          </section>
          <article className="panel">
            <div className="panel-head"><div><span className="panel-kicker">Statuts</span><h2>Production par statut</h2></div>
              <button type="button" onClick={() => void exportKind("production")}>CSV</button>
            </div>
            <ReportTable
              headers={["Statut", "Commandes", "Volume", "Montant"]}
              rows={bundle.production.byStatus.map((row) => [row.status, row.count, row.quantity, money(row.amount)])}
            />
          </article>
          <article className="panel">
            <div className="panel-head"><div><span className="panel-kicker">Matières</span><h2>Stocks et consommations</h2></div>
              <button type="button" onClick={() => void exportKind("stock")}>CSV</button>
            </div>
            <p className="report-note">{bundle.stock.alerts} alerte(s) · valeur stock {money(bundle.stock.value)} · sorties {bundle.stock.consumed}</p>
            <ReportTable
              headers={["Matière", "Référence", "Statut", "Stock", "Seuil", "Valeur", "Sorties"]}
              rows={bundle.stock.materials.map((row) => [row.name, row.reference, row.status, row.quantity, row.alertQty, money(row.value), row.consumed])}
            />
          </article>
        </>
      ) : null}

      {feature.id === "exports-rapports" ? (
        <>
          <p className="report-note">Les exports sont générés en CSV (Excel, séparateur point-virgule). PDF et XLSX ne sont pas encore proposés.</p>
          <div className="export-cards">
            {EXPORT_CARDS.map((card) => (
              <article className="export-card" key={card.kind}>
                <strong>{card.title}</strong>
                <p>{card.hint}</p>
                <button className="button button-secondary" disabled={Boolean(exporting)} onClick={() => void exportKind(card.kind)}>
                  {exporting === card.kind ? <><LoaderCircle className="spin" size={17} /> Préparation…</> : <><Download size={17} /> Télécharger CSV</>}
                </button>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
