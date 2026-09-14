"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, CheckCircle2,
  Clock3, Download, Factory, FileText, PackageCheck, TrendingUp,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAmount } from "@/lib/company-settings";
import { useApp } from "@/components/providers/app-provider";
import { exportReportAction, loadReportsAction } from "@/app/actions/data";
import {
  buildReportsFromRecords,
  csvFromBundle,
  defaultReportPeriod,
  downloadCsv,
  emptyReportsBundle,
  type ReportsBundle,
} from "@/lib/reports";

export function DashboardOverview() {
  const { user, notify, settings, t, locale, records, apiLive } = useApp();
  const [bundle, setBundle] = useState<ReportsBundle>(emptyReportsBundle());
  const [months, setMonths] = useState("6");
  const [pending, setPending] = useState(false);
  const today = new Date().toLocaleDateString(locale === "en" ? "en-GB" : locale === "es" ? "es-ES" : "fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const todayLabel = today.charAt(0).toUpperCase() + today.slice(1);
  const kpis = bundle.kpis;
  const money = (value: number) => formatAmount(value, settings);
  const chart = useMemo(() => {
    const size = months === "12" ? 12 : 6;
    return bundle.series.slice(-size);
  }, [bundle.series, months]);
  const periodMargin = bundle.sales.months.reduce((sum, row) => sum + row.margin, 0);
  const trendUp = kpis.revenueTrend >= 0;
  const progress = kpis.orderedMonth > 0 ? Math.min(100, Math.round((kpis.billedMonth / kpis.orderedMonth) * 100)) : (kpis.revenueMonth > 0 ? 100 : 0);

  const load = useCallback(async () => {
    const period = defaultReportPeriod();
    try {
      if (apiLive) {
        setBundle(await loadReportsAction(period.from, period.to));
        return;
      }
    } catch {
      // Hybrid: the local records remain the source if PHP is down.
    }
    setBundle(buildReportsFromRecords(records, period.from, period.to));
  }, [apiLive, records]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportActivity() {
    setPending(true);
    try {
      if (apiLive) {
        const file = await exportReportAction("activity", bundle.period.from, bundle.period.to);
        downloadCsv(file.filename, file.csv);
      } else {
        const file = csvFromBundle("activity", bundle);
        downloadCsv(file.filename, file.csv);
      }
      notify("Export prêt", t("toast.exported", "Rapport d’activité exporté."), "info");
    } catch (error) {
      const file = csvFromBundle("activity", bundle);
      downloadCsv(file.filename, file.csv);
      notify("Export local", error instanceof Error ? error.message : t("dash.exportLocal", "Export généré depuis les données locales."), "info");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-content dashboard-page">
      <section className="page-heading dashboard-heading">
        <div>
          <span className="eyebrow">{todayLabel}</span>
          <h1>{t("dash.hello", "Bonjour {name},", { name: user?.name.split(" ")[0] ?? "" })}</h1>
          <p>{t("dash.lead", "Voici l’état de votre imprimerie aujourd’hui.")}</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" disabled={pending} onClick={() => void exportActivity()}><Download size={17} /> {t("dash.export", "Exporter")}</button>
        </div>
      </section>

      <section className="metric-grid" aria-label={t("dash.metrics", "Indicateurs clés")}>
        <article className="metric-card">
          <div className="metric-top"><span className="metric-icon cyan"><TrendingUp size={19} /></span><span className={`trend ${trendUp ? "positive" : "negative"}`}>{trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {kpis.revenueTrend}%</span></div>
          <span className="metric-label">{t("dash.revenue", "Chiffre d’affaires du mois")}</span>
          <strong>{money(kpis.revenueMonth)}</strong>
          <p>{kpis.billedMonth > 0 ? t("dash.revenueHintBilled", "Facturé {billed} · commandé {ordered}", { billed: money(kpis.billedMonth), ordered: money(kpis.orderedMonth) }) : t("dash.revenueHintOrdered", "Commandé {ordered}", { ordered: money(kpis.orderedMonth) })}</p>
          <div className="mini-progress"><i style={{ width: `${progress}%` }} /></div>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span className="metric-icon magenta"><FileText size={19} /></span><span className="trend positive"><ArrowUpRight size={14} /> {kpis.dueWeek}</span></div>
          <span className="metric-label">{t("dash.orders", "Commandes actives")}</span>
          <strong>{kpis.activeOrders}</strong>
          <p>{kpis.dueWeek > 0 ? t("dash.ordersHintDue", "{n} livraison(s) prévue(s) cette semaine", { n: kpis.dueWeek }) : t("dash.ordersHint", "Aucune livraison prévue cette semaine")}</p>
          <div className="metric-breakdown"><span><i className="dot cyan" />{t("dash.inProductionN", "{n} en production", { n: kpis.inProduction })}</span><span><i className="dot yellow" />{t("dash.inFinishingN", "{n} en finition", { n: kpis.inFinishing })}</span></div>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span className="metric-icon yellow"><Factory size={19} /></span><span className={`trend ${kpis.occupation >= 70 ? "negative" : "positive"}`}>{kpis.occupation >= 70 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {kpis.occupation}%</span></div>
          <span className="metric-label">{t("dash.occupation", "Occupation machines")}</span>
          <strong>{kpis.occupation}<small>%</small></strong><p>{t("dash.occupationHint", "Capacité atelier sur les 7 prochains jours")}</p>
          <div className="machine-dots"><i /><i /><i /><i /></div>
        </article>
        <article className="metric-card attention">
          <div className="metric-top"><span className="metric-icon red"><AlertTriangle size={19} /></span><span className="trend warning">{t("dash.attention", "À traiter")}</span></div>
          <span className="metric-label">{t("dash.attentionLabel", "Points d’attention")}</span>
          <strong>{kpis.attention}</strong>
          <p>{kpis.attention > 0 ? t("dash.attentionHintN", "{late} retard(s) · {stock} stock · {cash} encours", { late: kpis.overdue, stock: kpis.stockAlerts, cash: kpis.openReceivables }) : t("dash.attentionHint", "Aucun point d’attention")}</p>
          <Link href="/admin/planification/planning-machines">{t("dash.openPlanning", "Ouvrir le planning")} <ArrowRight size={14} /></Link>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-head">
            <div><span className="panel-kicker">{t("dash.perfKicker", "Performance commerciale")}</span><h2>{t("dash.activityMargin", "Activité & marge")}</h2></div>
            <select aria-label={t("dash.chartPeriod", "Période du graphique")} value={months} onChange={(event) => setMonths(event.target.value)}>
              <option value="6">{t("dash.last6", "6 derniers mois")}</option>
              <option value="12">{t("dash.last12", "12 derniers mois")}</option>
            </select>
          </div>
          <div className="chart-summary">
            <div><span>{t("dash.revenueLabel", "Chiffre d’affaires")}</span><strong>{money(chart.reduce((sum, row) => sum + row.revenue, 0))}</strong></div>
            <div><span>{t("dash.grossMargin", "Marge matières estimée")}</span><strong>{money(periodMargin)}</strong></div>
            <div className="legend"><span><i className="cyan" /> {t("dash.ca", "CA")}</span><span><i className="magenta" /> {t("dash.margin", "Marge")}</span></div>
          </div>
          <div className="chart-wrap" aria-label={t("dash.chartAria", "Graphique du chiffre d’affaires et de la marge")}>
            <ResponsiveContainer width="100%" height={245}>
              <AreaChart data={chart} margin={{ top: 12, right: 5, left: -26, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#08a6c9" stopOpacity={0.26} /><stop offset="100%" stopColor="#08a6c9" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e8e5de" strokeDasharray="3 4" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#77766f", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#77766f", fontSize: 11 }} />
                <Tooltip contentStyle={{ border: "1px solid #ddd9cf", borderRadius: 10, boxShadow: "0 12px 30px rgba(25,25,22,.1)" }} formatter={(value) => money(Number(value) || 0)} />
                <Area type="monotone" dataKey="revenue" name="CA" stroke="#08a6c9" strokeWidth={2.5} fill="url(#revenueFill)" />
                <Area type="monotone" dataKey="margin" name="Marge" stroke="#d90a74" strokeWidth={2.2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel activity-panel">
          <div className="panel-head"><div><span className="panel-kicker">{t("dash.realtime", "Temps réel")}</span><h2>{t("dash.recent", "Activité récente")}</h2></div><button onClick={() => void load()}>{t("dash.refresh", "Actualiser")}</button></div>
          <div className="activity-list">
            {bundle.activity.length ? bundle.activity.map((activity) => (
              <div className="activity-item" key={activity.id}><i className={`activity-dot ${activity.tone}`} /><div><strong>{activity.title}</strong><span>{activity.detail}</span></div></div>
            )) : <p className="report-note">{t("dash.noActivity", "Aucune activité récente.")}</p>}
          </div>
          <Link className="panel-link" href="/admin/utilisateurs/audit-trail">{t("dash.fullJournal", "Voir le journal complet")} <ArrowRight size={15} /></Link>
        </article>
      </section>

      <section className="dashboard-grid lower">
        <article className="panel production-panel">
          <div className="panel-head"><div><span className="panel-kicker">{t("dash.workshop", "Atelier")}</span><h2>{t("dash.priority", "Travaux prioritaires")}</h2></div><Link href="/admin/planification/planning-machines">{t("dash.seePlanning", "Voir le planning")} <ArrowRight size={15} /></Link></div>
          <div className="priority-list">
            {bundle.overdue.length ? bundle.overdue.map((job) => (
              <div className="priority-row" key={job.reference}>
                <div className="job-ref"><strong>{job.reference}</strong><span>{job.name}</span></div>
                <span className="job-machine">{job.client}</span>
                <div className="job-progress"><span><i className="magenta" style={{ width: "100%" }} /></span><b>{job.status}</b></div>
                <span>{job.dueDate}</span>
              </div>
            )) : <p className="report-note">{t("dash.noPriority", "Aucun retard de livraison.")}</p>}
          </div>
        </article>

        <article className="panel deadlines-panel">
          <div className="panel-head"><div><span className="panel-kicker">{t("dash.deadlines", "Échéances")}</span><h2>{t("dash.thisWeek", "Cette semaine")}</h2></div><Link href="/admin/planification/planning-machines">{t("dash.planning", "Planning")}</Link></div>
          <div className="deadline-stat"><span className="metric-icon cyan"><PackageCheck size={18} /></span><div><strong>{t("dash.deliveriesN", "{n} livraison(s)", { n: kpis.dueWeek })}</strong><span>{bundle.dueSoon[0] ? t("dash.nextDue", "prochaine {ref}", { ref: bundle.dueSoon[0].reference }) : t("dash.deliveriesHint", "aucune aujourd’hui")}</span></div></div>
          <div className="deadline-stat"><span className="metric-icon yellow"><Clock3 size={18} /></span><div><strong>{t("dash.overdueN", "{n} en retard", { n: kpis.overdue })}</strong><span>{t("dash.overdueHint", "commandes non expédiées")}</span></div></div>
          <div className="deadline-stat"><span className="metric-icon green"><CheckCircle2 size={18} /></span><div><strong>{t("dash.otdN", "{n}% dans les délais", { n: kpis.otd })}</strong><span>{t("dash.otdHintLive", "parmi les commandes expédiées sur la période")}</span></div></div>
          <div className="deadline-stat"><span className="metric-icon magenta"><Boxes size={18} /></span><div><strong>{t("dash.stocksN", "{n} stock critique", { n: kpis.stockAlerts })}</strong><span>{kpis.stockAlerts > 0 ? t("dash.stocksHintN", "réapprovisionnement à prévoir") : t("dash.stocksHint", "aucun réapprovisionnement requis")}</span></div></div>
        </article>
      </section>
    </div>
  );
}
