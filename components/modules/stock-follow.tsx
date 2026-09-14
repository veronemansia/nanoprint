"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Minus, Search, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { catalogueKindOf } from "@/lib/catalogue";
import {
  STOCK_WRITEOFF_REASONS,
  formatStockArchive,
  stockQuantity,
  stockStatusOf,
  stockUnit,
  withdrawArchive,
  withdrawBlockReason,
  type StockKind,
} from "@/lib/stock";
import type { MockRecord } from "@/lib/types";

const qtyFmt = new Intl.NumberFormat("fr-FR");

function statusTone(status: string) {
  if (/disponible|ok/i.test(status)) return "green";
  if (/bas|alerte/i.test(status)) return "yellow";
  return "magenta";
}

export function StockFollow() {
  const { records, withdrawStock, te, t } = useApp();
  const [kind, setKind] = useState<StockKind>("finis");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<MockRecord | null>(null);
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<(typeof STOCK_WRITEOFF_REASONS)[number]>("Cassé");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const rows = kind === "finis"
    ? (records.catalogue ?? []).filter((item) => catalogueKindOf(item) !== "Prestation")
    : (records.matieres ?? []);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return rows.filter((item) => {
      if (!needle) return true;
      return [item.name, item.reference, item.family, item.type, item.unit].some((value) =>
        String(value || "").toLocaleLowerCase("fr").includes(needle),
      );
    });
  }, [rows, query]);

  const articleKind = kind === "finis" ? "product" : "material";
  const movements = useMemo(() => {
    return (records["stock-mouvements"] ?? []).filter((item) => String(item.articleKind || "") === articleKind);
  }, [records, articleKind]);
  const preview = target ? withdrawArchive(stockQuantity(target), Math.round(Number(qty) || 0)) : null;

  function openWithdraw(item: MockRecord) {
    setTarget(item);
    setQty("1");
    setReason("Cassé");
    setNote("");
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;
    const quantity = Math.round(Number(qty) || 0);
    const block = withdrawBlockReason(target, quantity, reason);
    if (block) {
      setError(te(block));
      return;
    }
    setPending(true);
    setError("");
    try {
      const ok = await withdrawStock({ kind, id: target.id, quantity, reason, note });
      if (!ok) {
        setError(te("Le retrait n’a pas pu être enregistré."));
        return;
      }
      setTarget(null);
    } catch {
      setError(te("Le retrait a échoué. Réessayez."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="supply-page">
      <button
        type="button"
        className={`stock-kind-switch ${kind === "matieres" ? "is-on" : ""}`}
        role="switch"
        aria-checked={kind === "matieres"}
        aria-label={te("Basculer entre produits finis et matière première")}
        onClick={() => { setKind(kind === "finis" ? "matieres" : "finis"); setQuery(""); }}
      >
        <span className={kind === "finis" ? "is-current" : ""}>{te("Produits finis")}</span>
        <span className="quote-switch" aria-hidden="true"><i /></span>
        <span className={kind === "matieres" ? "is-current" : ""}>{te("Matière première")}</span>
      </button>

      <div className="table-toolbar">
        <label className="table-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={kind === "finis" ? te("Rechercher un produit fini…") : te("Rechercher une matière première…")}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label={te("Effacer")}>
              <X size={15} />
            </button>
          )}
        </label>
        <span className="settings-hint" style={{ margin: 0 }}>{t(filtered.length > 1 ? "stock.articleCountMany" : "stock.articleCount", "{count} article{plural}", { count: filtered.length, plural: filtered.length > 1 ? "s" : "" })}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <h3>{te("Aucun article")}</h3>
          <p>{kind === "finis" ? te("Le catalogue produits est vide.") : te("Le catalogue matières est vide.")}</p>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table supply-cart">
            <thead>
              <tr>
                <th>{te("Article")}</th>
                <th>{kind === "finis" ? te("Famille") : te("Type")}</th>
                <th>{te("Stock")}</th>
                <th>{te("Statut")}</th>
                <th>{te("Retrait")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const stock = stockQuantity(item);
                const unit = stockUnit(item, kind);
                const status = stockStatusOf(item);
                return (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      <small className="supply-stock">{item.reference}</small>
                    </td>
                    <td>{String(kind === "finis" ? item.family : item.type || "—")}</td>
                    <td><b>{qtyFmt.format(stock)}</b> {unit}</td>
                    <td><span className={`status-badge status-${statusTone(status)}`}><i />{te(status)}</span></td>
                    <td>
                      <button type="button" className="button button-secondary" disabled={stock < 1} onClick={() => openWithdraw(item)}>
                        <Minus size={16} /> {te("Retirer")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {movements.length > 0 && (
        <div className="data-table-wrap" style={{ marginTop: 24 }}>
          <table className="data-table supply-cart">
            <thead>
              <tr>
                <th>{te("Article")}</th>
                <th>{te("Motif")}</th>
                <th>{te("Qté init")}</th>
                <th>{te("Sortie")}</th>
                <th>{te("Qté solde")}</th>
                <th>{te("Date")}</th>
              </tr>
            </thead>
            <tbody>
              {movements.slice(0, 20).map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <small className="supply-stock">{item.reference}</small>
                  </td>
                  <td>{te(String(item.reason || item.status || "—"))}</td>
                  <td>{qtyFmt.format(Number(item.qtyInit) || 0)}</td>
                  <td>{qtyFmt.format(Number(item.qtyOut) || 0)}</td>
                  <td><b>{qtyFmt.format(Number(item.qtySolde) || 0)}</b></td>
                  <td className="muted-cell">{item.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {target && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setTarget(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="stock-out-title">
            <div className="modal-head">
              <div>
                <span className="panel-kicker">{te("Sortie de stock")}</span>
                <h2 id="stock-out-title">{target.name}</h2>
              </div>
              <button type="button" onClick={() => setTarget(null)} aria-label={te("Fermer")}><X size={20} /></button>
            </div>
            <form onSubmit={(event) => void submit(event)}>
              <p className="settings-hint">{te("Stock actuel")} : {qtyFmt.format(stockQuantity(target))} {stockUnit(target, kind)}</p>
              {preview && (
                <p className="settings-hint">{formatStockArchive(preview.qtyInit, preview.qtyOut, preview.qtySolde, stockUnit(target, kind), te("Sortie"))}</p>
              )}
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="form-grid">
                <label className="field">
                  <span>{te("Quantité à retirer")}<b> *</b></span>
                  <input
                    type="number"
                    min={1}
                    max={stockQuantity(target)}
                    step={1}
                    value={qty}
                    onChange={(event) => setQty(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>{te("Motif")}<b> *</b></span>
                  <select value={reason} onChange={(event) => setReason(event.target.value as typeof reason)}>
                    {STOCK_WRITEOFF_REASONS.map((item) => <option key={item} value={item}>{te(item)}</option>)}
                  </select>
                </label>
                <label className="field field-wide">
                  <span>{te("Précision")}</span>
                  <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={te("Facultatif")} />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="button button-secondary" onClick={() => setTarget(null)}>{te("Annuler")}</button>
                <button type="submit" className="button button-primary" disabled={pending}>
                  {pending ? <><LoaderCircle className="spin" size={17} /> {te("Enregistrement…")}</> : <><Minus size={17} /> {te("Retirer du stock")}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
