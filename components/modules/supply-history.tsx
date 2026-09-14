"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Eye, LoaderCircle, Printer, Search, Trash2, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { formatAmount } from "@/lib/company-settings";
import { renderSupplyDeliveryHtml } from "@/lib/supply-document";
import { printQuoteHtml, wrapDocumentPreview } from "@/lib/document-template";
import {
  canDeleteSupply,
  formatSupplyArchive,
  groupSuppliesBySupplier,
  parseSupplyLines,
  supplyLineTotal,
  type SupplierSupplyGroup,
} from "@/lib/supply";
import type { MockRecord } from "@/lib/types";

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const qtyFmt = new Intl.NumberFormat("fr-FR");

function formatIsoDate(value: string) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return dateFmt.format(new Date(`${value.slice(0, 10)}T12:00:00`));
  return value;
}

export function SupplyHistory() {
  const { records, settings, deleteSupply, te } = useApp();
  const supplies = records.approvisionnement ?? [];
  const suppliers = records.fournisseurs ?? [];
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ html: string; title: string } | null>(null);
  const money = (amount: number) => formatAmount(amount, settings);

  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return groupSuppliesBySupplier(supplies).filter((group) => {
      if (!needle) return true;
      return [group.supplier, ...group.items.map((item) => item.reference)].some((value) =>
        String(value || "").toLocaleLowerCase("fr").includes(needle),
      );
    });
  }, [supplies, query]);

  const selected = groups.find((group) => group.key === openKey);

  function printSupply(record: MockRecord) {
    const party = suppliers.find((item) => item.id === String(record.supplierId || ""));
    setPreview({
      html: renderSupplyDeliveryHtml(record, party, settings),
      title: record.reference,
    });
  }

  async function removeSupply(record: MockRecord) {
    setPendingId(record.id);
    setError("");
    try {
      const ok = await deleteSupply(record.id);
      if (!ok) {
        setError(te("La suppression est impossible après 48 heures."));
        return;
      }
      setConfirmId("");
    } catch {
      setError(te("La suppression a échoué. Réessayez."));
    } finally {
      setPendingId("");
    }
  }

  return (
    <div className="supply-page">
      {error && <p className="form-error" role="alert">{error}</p>}

      {selected ? (
        <SupplierDetail
          group={selected}
          money={money}
          confirmId={confirmId}
          pendingId={pendingId}
          onBack={() => { setOpenKey(""); setConfirmId(""); setError(""); }}
          onConfirm={setConfirmId}
          onDelete={(record) => void removeSupply(record)}
          onPrint={printSupply}
        />
      ) : (
        <>
          <div className="table-toolbar">
            <label className="table-search">
              <Search size={17} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher un fournisseur ou une référence…"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Effacer">
                  <X size={15} />
                </button>
              )}
            </label>
            <span className="settings-hint" style={{ margin: 0 }}>{groups.length} fournisseur{groups.length > 1 ? "s" : ""}</span>
          </div>

          {groups.length === 0 ? (
            <div className="empty-state">
              <h3>Aucun approvisionnement</h3>
              <p>Validez un panier dans Approvisionnement pour constituer l’historique.</p>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table supply-cart">
                <thead>
                  <tr>
                    <th>Fournisseur</th>
                    <th>Total</th>
                    <th>Date</th>
                    <th>Nb appros</th>
                    <th>Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.key}>
                      <td><strong>{group.supplier}</strong></td>
                      <td><b>{money(group.total)}</b></td>
                      <td>{formatIsoDate(group.lastDate)}</td>
                      <td>{qtyFmt.format(group.count)}</td>
                      <td>
                        <button type="button" className="button button-secondary" onClick={() => setOpenKey(group.key)}>
                          <Eye size={16} /> Détails
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {preview && (
        <div className="modal-backdrop designer-preview-backdrop quote-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPreview(null)}>
          <div className="quote-output is-invoice" role="dialog" aria-modal="true">
            <div className="designer-preview-head">
              <div>
                <span className="panel-kicker">Document A4</span>
                <h2>Bon de livraison {preview.title}</h2>
              </div>
              <div className="heading-actions">
                <button type="button" className="button button-secondary" onClick={() => setPreview(null)}>Fermer</button>
                <button type="button" className="button button-primary" onClick={() => printQuoteHtml(preview.html, `BL ${preview.title}`)}>
                  <Printer size={16} /> Imprimer
                </button>
              </div>
            </div>
            <div className="quote-output-body">
              <div className="quote-output-preview">
                <iframe className="quote-output-frame" title={`Aperçu BL ${preview.title}`} sandbox="" srcDoc={wrapDocumentPreview(preview.html)} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SupplierDetail({
  group,
  money,
  confirmId,
  pendingId,
  onBack,
  onConfirm,
  onDelete,
  onPrint,
}: {
  group: SupplierSupplyGroup;
  money: (amount: number) => string;
  confirmId: string;
  pendingId: string;
  onBack: () => void;
  onConfirm: (id: string) => void;
  onDelete: (record: MockRecord) => void;
  onPrint: (record: MockRecord) => void;
}) {
  return (
    <section className="data-section">
      <div className="section-title">
        <div>
          <button type="button" className="text-link history-back" onClick={onBack}>
            <ArrowLeft size={15} /> Retour à la liste
          </button>
          <span className="panel-kicker">Détail</span>
          <h2>{group.supplier}</h2>
          <p className="settings-hint">{qtyFmt.format(group.count)} approvisionnement{group.count > 1 ? "s" : ""} · total {money(group.total)}</p>
        </div>
      </div>

      <ul className="supply-history-list">
        {group.items.map((record) => {
          const lines = parseSupplyLines(record.lines);
          const removable = canDeleteSupply(record);
          return (
            <li key={record.id} className="supply-history-card">
              <header>
                <div>
                  <strong>{record.reference}</strong>
                  <span>{formatIsoDate(String(record.issuedAt || ""))}</span>
                </div>
                <b>{money(Number(record.amount) || 0)}</b>
              </header>
              <ul className="quote-detail-lines conv-lines">
                {lines.map((line) => (
                  <li key={line.id}>
                    <div>
                      <strong>{line.label}</strong>
                      <span>{formatSupplyArchive(line)} × {money(line.unitPrice)}</span>
                    </div>
                    <b>{money(supplyLineTotal(line))}</b>
                  </li>
                ))}
              </ul>
              <div className="heading-actions" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                <button type="button" className="button button-secondary" onClick={() => onPrint(record)}>
                  <Printer size={16} /> Bon de livraison
                </button>
                {removable ? (
                  confirmId === record.id ? (
                    <>
                      <button type="button" className="button button-secondary" onClick={() => onConfirm("")}>Annuler</button>
                      <button type="button" className="button button-primary" disabled={pendingId === record.id} onClick={() => onDelete(record)}>
                        {pendingId === record.id ? <><LoaderCircle className="spin" size={16} /> Suppression…</> : <><Trash2 size={16} /> Confirmer</>}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="button button-secondary" onClick={() => onConfirm(record.id)}>
                      <Trash2 size={16} /> Supprimer
                    </button>
                  )
                ) : (
                  <span className="settings-hint" style={{ margin: 0 }}>Suppression close (48 h)</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
