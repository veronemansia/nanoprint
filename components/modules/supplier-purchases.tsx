"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { formatAmount } from "@/lib/company-settings";
import { formatHistoryDate, historyLineDescription, historyTotal } from "@/lib/client-history";
import {
  purchaseDetailFields,
  purchasesForSupplier,
} from "@/lib/supplier-purchases";
import { parseSupplyLines, supplyLineTotal } from "@/lib/supply";
import { useApp } from "@/components/providers/app-provider";
import type { CompanySettings } from "@/lib/company-settings";
import type { MockRecord } from "@/lib/types";

function statusTone(status: string) {
  if (/conforme|payée|actif|disponible|livrée|terminé|reçu|validé|présent|signé|or|réussie|complète|publié|imputé|récupéré|confirmé/i.test(status)) return "green";
  if (/retard|panne|rupture|bloqué|non conforme|échec|suspendu|critique|expiré|refusé|écart/i.test(status)) return "magenta";
  if (/attente|bas|partiel|maintenance|correction|reprise|préparer|brouillon|alerte|urgence|envoy/i.test(status)) return "yellow";
  return "cyan";
}

function showValue(value: string | number | undefined, key: string, settings: CompanySettings) {
  if (value === undefined || value === "") return "—";
  if (key === "amount" && typeof value === "number") return formatAmount(value, settings);
  if (typeof value === "number") return new Intl.NumberFormat("fr-FR").format(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
  }
  return String(value);
}

export function SupplierPurchaseDrawer({
  supplier,
  onClose,
  onBackToFiche,
}: {
  supplier: MockRecord;
  onClose: () => void;
  onBackToFiche?: () => void;
}) {
  const { records, settings } = useApp();
  const purchases = useMemo(() => purchasesForSupplier(records, supplier), [records, supplier]);
  const [selected, setSelected] = useState<MockRecord | null>(null);
  const selectedLines = selected ? parseSupplyLines(selected.lines) : [];

  return (
    <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="detail-drawer history-drawer" role="dialog" aria-modal="true" aria-label={`Achats ${supplier.name}`}>
        <div className="drawer-head">
          <span className="record-ref">{supplier.reference}</span>
          <button onClick={onClose} aria-label="Fermer"><X size={20} /></button>
        </div>
        <div className="drawer-title">
          <span className={`status-badge status-${statusTone(supplier.status)}`}><i />{supplier.status}</span>
          <h2>{supplier.name}</h2>
          <p>{purchases.length} achat{purchases.length > 1 ? "s" : ""} auprès de ce fournisseur</p>
        </div>

        {selected ? (
          <div className="drawer-section">
            <button type="button" className="text-link history-back" onClick={() => setSelected(null)}>
              <ArrowLeft size={15} /> Retour aux achats
            </button>
            <span className="panel-kicker">Approvisionnement</span>
            <h3 className="history-item-title">{selected.reference}</h3>
            <p className="settings-hint">{selected.name}</p>
            <span className={`status-badge status-${statusTone(selected.status)}`}><i />{selected.status}</span>
            <dl>
              {purchaseDetailFields.map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{showValue(selected[field.key], field.key, settings)}</dd>
                </div>
              ))}
              {selectedLines.length > 0 && (
                <div>
                  <dt>Matières</dt>
                  <dd>
                    {selectedLines.map((line) => (
                      <span key={line.id} style={{ display: "block" }}>
                        {line.quantity} {line.unit} · {line.label} · {formatAmount(supplyLineTotal(line), settings)}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ) : (
          <div className="drawer-section">
            <span className="panel-kicker">Historique des achats</span>
            {purchases.length === 0 ? (
              <p className="settings-hint">Aucun approvisionnement n’a encore été validé auprès de ce fournisseur.</p>
            ) : (
              <ul className="history-orders">
                {purchases.map((record) => {
                  const total = historyTotal(record);
                  const lines = parseSupplyLines(record.lines);
                  const summary = lines.length
                    ? lines.map((line) => `${line.quantity} ${line.unit} ${line.label}`).join(" · ")
                    : historyLineDescription(record);
                  return (
                    <li key={record.id}>
                      <button type="button" onClick={() => setSelected(record)}>
                        <strong>{record.reference}</strong>
                        <span>{summary}</span>
                        <small>{formatHistoryDate(record)}</small>
                        {total !== undefined && <b>Total : {formatAmount(total, settings)}</b>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {onBackToFiche && !selected && (
          <div className="drawer-actions">
            <button className="button button-secondary" onClick={onBackToFiche}>
              <ArrowLeft size={16} /> Retour à la fiche
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
