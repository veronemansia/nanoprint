"use client";

import Link from "next/link";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Boxes, CheckCircle2,
  Clock3, Download, Factory, FileText, PackageCheck, TrendingUp,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { activityFeed, dashboardSeries } from "@/lib/mock-data";
import { formatAmount } from "@/lib/company-settings";
import { useApp } from "@/components/providers/app-provider";

export function DashboardOverview() {
  const { user, notify, settings, t } = useApp();

  return (
    <div className="page-content dashboard-page">
      <section className="page-heading dashboard-heading">
        <div>
          <span className="eyebrow">Jeudi 03 septembre 2026</span>
          <h1>{t("dash.hello", "Bonjour {name},", { name: user?.name.split(" ")[0] ?? "" })}</h1>
          <p>{t("dash.lead", "Voici l’état de votre imprimerie aujourd’hui. Trois actions méritent votre attention.")}</p>
        </div>
        <div className="heading-actions">
          <button className="button button-secondary" onClick={() => notify("Rapport préparé", "Le rapport d’activité a été généré en mode démonstration.", "info")}><Download size={17} /> {t("dash.export", "Exporter")}</button>
        </div>
      </section>

      <section className="metric-grid" aria-label={t("dash.metrics", "Indicateurs clés")}>
        <article className="metric-card">
          <div className="metric-top"><span className="metric-icon cyan"><TrendingUp size={19} /></span><span className="trend positive"><ArrowUpRight size={14} /> 12,4%</span></div>
          <span className="metric-label">{t("dash.revenue", "Chiffre d’affaires du mois")}</span>
          <strong>12,8 M</strong>
          <p>{t("dash.revenueHint", "Objectif mensuel atteint à 47%")}</p><div className="mini-progress"><i style={{ width: "47%" }} /></div>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span className="metric-icon magenta"><FileText size={19} /></span><span className="trend positive"><ArrowUpRight size={14} /> 4</span></div>
          <span className="metric-label">{t("dash.orders", "Commandes actives")}</span>
          <strong>28</strong><p>{t("dash.ordersHint", "8 doivent être livrées cette semaine")}</p>
          <div className="metric-breakdown"><span><i className="dot cyan" />{t("dash.inProduction", "12 en production")}</span><span><i className="dot yellow" />{t("dash.inFinishing", "6 en finition")}</span></div>
        </article>
        <article className="metric-card">
          <div className="metric-top"><span className="metric-icon yellow"><Factory size={19} /></span><span className="trend negative"><ArrowDownRight size={14} /> 2,1%</span></div>
          <span className="metric-label">{t("dash.occupation", "Occupation machines")}</span>
          <strong>78<small>%</small></strong><p>{t("dash.occupationHint", "Capacité atelier sur les 7 prochains jours")}</p>
          <div className="machine-dots"><i className="on" /><i className="on" /><i className="on" /><i /></div>
        </article>
        <article className="metric-card attention">
          <div className="metric-top"><span className="metric-icon red"><AlertTriangle size={19} /></span><span className="trend warning">{t("dash.attention", "À traiter")}</span></div>
          <span className="metric-label">{t("dash.attentionLabel", "Points d’attention")}</span>
          <strong>3</strong><p>{t("dash.attentionHint", "1 retard, 1 rupture et 1 non-conformité")}</p>
          <Link href="/admin/planification/planning-machines">{t("dash.openPlanning", "Ouvrir le planning")} <ArrowRight size={14} /></Link>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-head">
            <div><span className="panel-kicker">{t("dash.perfKicker", "Performance commerciale")}</span><h2>{t("dash.activityMargin", "Activité & marge")}</h2></div>
            <select aria-label={t("dash.chartPeriod", "Période du graphique")} defaultValue="6"><option value="6">{t("dash.last6", "6 derniers mois")}</option><option value="12">{t("dash.last12", "12 derniers mois")}</option></select>
          </div>
          <div className="chart-summary">
            <div><span>{t("dash.revenueLabel", "Chiffre d’affaires")}</span><strong>{formatAmount(123900000, settings)}</strong></div>
            <div><span>{t("dash.grossMargin", "Marge brute")}</span><strong>37,0 M</strong></div>
            <div className="legend"><span><i className="cyan" /> {t("dash.ca", "CA")}</span><span><i className="magenta" /> {t("dash.margin", "Marge")}</span></div>
          </div>
          <div className="chart-wrap" aria-label={t("dash.chartAria", "Graphique du chiffre d’affaires et de la marge")}>
            <ResponsiveContainer width="100%" height={245}>
              <AreaChart data={dashboardSeries} margin={{ top: 12, right: 5, left: -26, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#08a6c9" stopOpacity={0.26} /><stop offset="100%" stopColor="#08a6c9" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e8e5de" strokeDasharray="3 4" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#77766f", fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#77766f", fontSize: 11 }} />
                <Tooltip contentStyle={{ border: "1px solid #ddd9cf", borderRadius: 10, boxShadow: "0 12px 30px rgba(25,25,22,.1)" }} formatter={(value) => [`${value} M`]} />
                <Area type="monotone" dataKey="revenue" name="CA" stroke="#08a6c9" strokeWidth={2.5} fill="url(#revenueFill)" />
                <Area type="monotone" dataKey="margin" name="Marge" stroke="#d90a74" strokeWidth={2.2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel activity-panel">
          <div className="panel-head"><div><span className="panel-kicker">{t("dash.realtime", "Temps réel")}</span><h2>{t("dash.recent", "Activité récente")}</h2></div><button onClick={() => notify("Fil actualisé", "Les événements récents sont à jour.", "info")}>{t("dash.refresh", "Actualiser")}</button></div>
          <div className="activity-list">
            {activityFeed.map((activity) => (
              <div className="activity-item" key={activity.id}><i className={`activity-dot ${activity.tone}`} /><div><strong>{activity.title}</strong><span>{activity.detail}</span></div></div>
            ))}
          </div>
          <Link className="panel-link" href="/admin/utilisateurs/audit-trail">{t("dash.fullJournal", "Voir le journal complet")} <ArrowRight size={15} /></Link>
        </article>
      </section>

      <section className="dashboard-grid lower">
        <article className="panel production-panel">
          <div className="panel-head"><div><span className="panel-kicker">{t("dash.workshop", "Atelier")}</span><h2>{t("dash.priority", "Travaux prioritaires")}</h2></div><Link href="/admin/planification/planning-machines">{t("dash.seePlanning", "Voir le planning")} <ArrowRight size={15} /></Link></div>
          <div className="priority-list">
            {[
              ["CMD-260903", "Catalogue rentrée", "Heidelberg XL", "46", "Impression", "cyan"],
              ["CMD-260899", "Dépliants prévention", "Atelier finition", "78", "Finition", "yellow"],
              ["CMD-260886", "Rapport annuel 2025", "Reliure", "62", "Reliure", "magenta"],
            ].map(([ref, name, machine, progress, status, tone]) => (
              <div className="priority-row" key={ref}>
                <div className="job-ref"><strong>{ref}</strong><span>{name}</span></div>
                <span className="job-machine">{machine}</span>
                <div className="job-progress"><span><i style={{ width: `${progress}%` }} className={tone} /></span><b>{progress}%</b></div>
                <span className={`status-badge status-${tone}`}>{status}</span>
                <Link href="/admin/planification/planning-machines" aria-label={`Ouvrir ${ref}`}><ArrowRight size={16} /></Link>
              </div>
            ))}
          </div>
        </article>

        <article className="panel deadlines-panel">
          <div className="panel-head"><div><span className="panel-kicker">{t("dash.deadlines", "Échéances")}</span><h2>{t("dash.thisWeek", "Cette semaine")}</h2></div><Link href="/admin/planification/planning-machines">{t("dash.planning", "Planning")}</Link></div>
          <div className="deadline-stat"><span className="metric-icon cyan"><PackageCheck size={18} /></span><div><strong>{t("dash.deliveries", "8 livraisons")}</strong><span>{t("dash.deliveriesHint", "dont 3 aujourd’hui")}</span></div></div>
          <div className="deadline-stat"><span className="metric-icon yellow"><Clock3 size={18} /></span><div><strong>{t("dash.bats", "5 BAT en attente")}</strong><span>{t("dash.batsHint", "délai moyen 18 heures")}</span></div></div>
          <div className="deadline-stat"><span className="metric-icon green"><CheckCircle2 size={18} /></span><div><strong>{t("dash.otd", "91% dans les délais")}</strong><span>{t("dash.otdHint", "+3 points ce mois")}</span></div></div>
          <div className="deadline-stat"><span className="metric-icon magenta"><Boxes size={18} /></span><div><strong>{t("dash.stocks", "2 stocks critiques")}</strong><span>{t("dash.stocksHint", "réapprovisionnement requis")}</span></div></div>
        </article>
      </section>
    </div>
  );
}
