"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Filter, X } from "lucide-react";
import { clientKindOf } from "@/components/modules/client-form";
import { formatAmount } from "@/lib/company-settings";
import {
  HISTORY_TYPE_OPTIONS,
  countHistoryItems,
  filterHistoryGroups,
  flattenHistory,
  formatHistoryDate,
  historyForClient,
  historyItemFields,
  historyLineDescription,
  historyTotal,
  type HistoryEntry,
  type HistoryKind,
} from "@/lib/client-history";
import { useApp } from "@/components/providers/app-provider";
import type { CompanySettings } from "@/lib/company-settings";
import type { MockRecord } from "@/lib/types";

function statusTone(status: string) {
  if (/conforme|payée|actif|disponible|livrée|terminé|reçu|validé|présent|signé|or|réussie|complète|publié|imputé|récupéré|accepté|expédiée/i.test(status)) return "green";
  if (/retard|panne|rupture|bloqué|non conforme|échec|suspendu|critique|expiré|refusé/i.test(status)) return "magenta";
  if (/attente|bas|partiel|maintenance|correction|reprise|préparer|brouillon|alerte|urgence|envoy/i.test(status)) return "yellow";
  return "cyan";
}

function showValue(value: string | number | undefined, key: string, settings: CompanySettings) {
  if (value === undefined || value === "") return "—";
  if (["amount", "asked", "received"].includes(key) && typeof value === "number") {
    return formatAmount(value, settings);
  }
  if (typeof value === "number") return new Intl.NumberFormat("fr-FR").format(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
  }
  return String(value);
}

export function ClientHistoryDrawer({
  client,
  onClose,
}: {
  client: MockRecord;
  onClose: () => void;
}) {
  const { records, settings, te } = useApp();
  const groups = useMemo(() => historyForClient(records, client), [records, client]);
  const [type, setType] = useState<HistoryKind | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = useMemo(() => flattenHistory(filterHistoryGroups(groups, { type, from, to })), [groups, type, from, to]);
  const total = countHistoryItems(groups);
  const visible = filtered.length;
  const filteredOut = type !== "all" || Boolean(from || to);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<{ kind: HistoryKind; record: MockRecord } | null>(null);
  const kind = clientKindOf(client);

  function resetFilters() {
    setType("all");
    setFrom("");
    setTo("");
  }

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="detail-drawer history-drawer" role="dialog" aria-modal="true" aria-label={`Commandes ${client.name}`}>
        <div className="drawer-head">
          <span className="record-ref">{client.reference}</span>
          <button onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        </div>
        <div className="drawer-title">
          <span className={`status-badge status-${statusTone(client.status)}`}><i />{client.status}</span>
          <h2>{client.name}</h2>
          <p>{kind} · {filteredOut ? `${visible} / ${total}` : total} commande{total > 1 ? "s" : ""} précédente{total > 1 ? "s" : ""}</p>
        </div>

        {selected ? (
          <HistoryItemView
            kind={selected.kind}
            record={selected.record}
            settings={settings}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className="drawer-section">
            <div className="history-section-head">
              <span className="panel-kicker">Commandes précédentes</span>
              {total > 0 && (
                <button
                  type="button"
                  className={`history-filter-toggle${showFilters || filteredOut ? " active" : ""}`}
                  aria-expanded={showFilters}
                  onClick={() => setShowFilters((value) => !value)}
                >
                  <Filter size={14} /> {showFilters ? te("Masquer") : te("Filtres")}
                </button>
              )}
            </div>
            {total > 0 && showFilters && (
              <div className="history-filters">
                <label className="field">
                  <span>{te("Type")}</span>
                  <select value={type} onChange={(event) => setType(event.target.value as HistoryKind | "all")}>
                    {HISTORY_TYPE_OPTIONS.map((option) => (
                      <option key={option.kind} value={option.kind}>{te(option.label)}</option>
                    ))}
                  </select>
                </label>
                <div className="history-filters-dates">
                  <label className="field">
                    <span>{te("Du")}</span>
                    <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>{te("Au")}</span>
                    <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
                  </label>
                </div>
                {filteredOut && (
                  <button type="button" className="text-link" onClick={resetFilters}>{te("Réinitialiser les filtres")}</button>
                )}
              </div>
            )}
            {total === 0 ? (
              <p className="settings-hint">Aucune commande précédente pour ce client.</p>
            ) : visible === 0 ? (
              <p className="settings-hint">Aucune commande pour ce type ou cette période.</p>
            ) : (
              <HistoryOrderList
                entries={filtered}
                settings={settings}
                onOpen={(entry) => setSelected({ kind: entry.kind, record: entry.record })}
              />
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function HistoryOrderList({
  entries,
  settings,
  onOpen,
}: {
  entries: HistoryEntry[];
  settings: CompanySettings;
  onOpen: (entry: HistoryEntry) => void;
}) {
  return (
    <ul className="history-orders">
      {entries.map((entry) => {
        const total = historyTotal(entry.record);
        return (
          <li key={`${entry.kind}-${entry.record.id}`}>
            <button type="button" onClick={() => onOpen(entry)}>
              <strong>{entry.record.reference}</strong>
              <span>{historyLineDescription(entry.record)}</span>
              <small>{formatHistoryDate(entry.record)}</small>
              {total !== undefined && <b>Total : {formatAmount(total, settings)}</b>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function HistoryItemView({
  kind,
  record,
  settings,
  onBack,
}: {
  kind: HistoryKind;
  record: MockRecord;
  settings: CompanySettings;
  onBack: () => void;
}) {
  const fields = historyItemFields[kind];
  const labels: Record<HistoryKind, string> = {
    devis: "Devis",
    commande: "Commande",
    facture: "Facture",
    acompte: "Acompte",
  };

  return (
    <div className="drawer-section">
      <button type="button" className="text-link history-back" onClick={onBack}><ArrowLeft size={15} /> Retour aux commandes</button>
      <span className="panel-kicker">{labels[kind]}</span>
      <h3 className="history-item-title">{record.reference}</h3>
      <p className="settings-hint">{record.name}</p>
      <span className={`status-badge status-${statusTone(record.status)}`}><i />{record.status}</span>
      <dl>
        {fields.map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd>{showValue(record[field.key], field.key, settings)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
