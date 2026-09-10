"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle, PencilLine, Plus, Search, X } from "lucide-react";
import { DiscountToggle, QuoteProductCard } from "@/components/modules/price-calculator";
import { useApp } from "@/components/providers/app-provider";
import { formatAmount } from "@/lib/company-settings";
import { parsePricedOptions } from "@/lib/catalogue";
import {
  avenantBlockReason,
  avenantUnchanged,
  canonicalQuotePayload,
  findOrderByRef,
  isOpenOrder,
  parseOrderHistory,
  previewOrderAvenant,
  quotePayloadFromOrder,
  sanitizeReason,
} from "@/lib/order-avenant";
import { hydrateOrderRecord, normalizeQuoteRef } from "@/lib/quote-conversion";
import {
  clientAddress,
  inspectQuote,
  newQuoteLine,
  parseQuotePayload,
  qtyFmt,
  requiredMinQty,
  type QuoteLine,
} from "@/lib/price-calculator";
import type { MockRecord } from "@/lib/types";

function statusTone(status: string) {
  if (/expédi/i.test(status)) return "green";
  if (/attente|brouillon/i.test(status)) return "yellow";
  return "cyan";
}

export function OrderAvenants() {
  const { records, settings, applyOrderAvenant, te, t } = useApp();
  const orders = records["statuts-commandes"] ?? [];
  const quotes = records.calculateur ?? [];
  const clients = records["fiches-clients"] ?? [];
  const catalogue = records.catalogue ?? [];
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [applyDiscount, setApplyDiscount] = useState(true);
  const [lines, setLines] = useState<QuoteLine[]>([newQuoteLine()]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const money = (amount: number) => formatAmount(amount, settings);

  const openOrders = useMemo(() => orders.filter(isOpenOrder), [orders]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return openOrders.filter((item) => {
      if (!needle) return true;
      return [item.reference, item.name, item.client, item.status].some((value) =>
        String(value || "").toLocaleLowerCase("fr").includes(needle),
      );
    });
  }, [openOrders, query]);

  const typed = findOrderByRef(orders, query);
  const selected = openOrders.find((item) => item.id === selectedId)
    ?? (typed && isOpenOrder(typed) ? typed : undefined);

  useEffect(() => {
    if (typed && isOpenOrder(typed) && typed.id !== selectedId) {
      setSelectedId(typed.id);
      setEditing(false);
    }
  }, [typed, selectedId]);

  const hydrated = selected ? hydrateOrderRecord(selected, quotes) : null;
  const payload = {
    clientId: String(hydrated?.clientId || parseQuotePayload(hydrated?.quotePayload)?.clientId || ""),
    applyDiscount,
    lines,
  };
  const preview = hydrated
    ? previewOrderAvenant(hydrated, quotes, clients, catalogue, settings, payload, dueDate)
    : null;
  const block = selected ? avenantBlockReason(selected) : typed && !isOpenOrder(typed)
    ? avenantBlockReason(typed)
    : "";

  useEffect(() => {
    if (!hydrated || !editing) return;
    const current = quotePayloadFromOrder(hydrated, quotes);
    setLines(current?.lines.length ? current.lines : [newQuoteLine()]);
    setApplyDiscount(current?.applyDiscount !== false);
    setDueDate(String(hydrated.dueDate || ""));
    setReason("");
    setError("");
  }, [hydrated?.id, editing]);

  function selectOrder(item: MockRecord) {
    setSelectedId(item.id);
    setQuery(item.reference);
    setEditing(false);
    setError("");
  }

  function updateLine(id: string, patch: Partial<QuoteLine>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function pickProduct(lineId: string, product: MockRecord) {
    if (lines.some((line) => line.id !== lineId && line.productId === product.id)) return;
    updateLine(lineId, {
      productId: product.id,
      printId: parsePricedOptions(product.printSides)[0]?.id ?? "",
      paperId: parsePricedOptions(product.paperTypes)[0]?.id ?? "",
      extraIds: [],
      quantity: requiredMinQty(product),
    });
  }

  async function apply() {
    if (!selected) return;
    const note = sanitizeReason(reason);
    if (!note) {
      setError(te("Indiquez le motif de l’avenant."));
      return;
    }
    if (!preview || preview.error) {
      setError(te(preview?.error || "Avenant impossible."));
      return;
    }
    if (avenantUnchanged(preview.previous, preview.next)) {
      setError(te("Aucun changement par rapport à la commande actuelle."));
      return;
    }
    setPending(true);
    setError("");
    try {
      const created = await applyOrderAvenant(selected.id, { reason: note, dueDate, payload });
      if (!created) setError(te("L’avenant n’a pas pu être enregistré."));
      else {
        setReason("");
        setEditing(false);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="conv-page">
      <p className="settings-hint">Choisissez une commande non terminée, consultez-la, puis modifiez produits, options, papier, quantité et échéance. Le statut se change dans le suivi des commandes.</p>
      <div className="table-toolbar">
        <label className="table-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setError(""); }}
            placeholder={te("Référence commande (CMD-260903)…")}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); setError(""); }} aria-label={te("Effacer")}><X size={15} /></button>
          )}
        </label>
      </div>
      {query.trim() && !selected && !filtered.length && (
        <p className="form-error" role="status">
          {typed && !isOpenOrder(typed)
            ? `${typed.reference} est déjà expédiée : plus d’avenant possible.`
            : `Aucune commande en cours ne correspond à « ${normalizeQuoteRef(query) || query} ».`}
        </p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="conv-layout">
        <section className="data-section conv-list-panel">
          <div className="section-title">
            <div>
              <span className="panel-kicker">Suivi</span>
              <h2>Commandes</h2>
            </div>
            <span>{filtered.length}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <span><PencilLine size={25} /></span>
              <h3>Aucune commande en cours</h3>
              <p>Les avenants concernent les commandes pas encore expédiées.</p>
              <Link className="button button-secondary" href="/admin/devis-commandes/statuts-commandes">Voir le suivi</Link>
            </div>
          ) : (
            <ul className="conv-list">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={item.id === selected?.id ? "is-active" : ""}
                    onClick={() => selectOrder(item)}
                  >
                    <strong>{item.reference}</strong>
                    <span>{item.client || item.name}</span>
                    <small>{money(Number(item.amount) || 0)}</small>
                    <em className={`status-badge status-${statusTone(item.status)}`}><i />{item.status}</em>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="data-section conv-detail-panel">
          {selected && hydrated && editing && preview ? (
            <OrderAmendForm
              order={hydrated}
              preview={preview}
              reason={reason}
              dueDate={dueDate}
              lines={lines}
              applyDiscount={applyDiscount}
              catalogue={catalogue}
              pending={pending}
              money={money}
              onReason={setReason}
              onDueDate={setDueDate}
              onDiscount={setApplyDiscount}
              onChangeLine={updateLine}
              onPick={pickProduct}
              onAdd={() => setLines((current) => [...current, newQuoteLine()])}
              onRemove={(id) => setLines((current) => current.length > 1 ? current.filter((line) => line.id !== id) : current)}
              onCancel={() => { setEditing(false); setError(""); }}
              onApply={apply}
            />
          ) : selected && hydrated ? (
            <OrderConsult
              order={selected}
              hydrated={hydrated}
              money={money}
              block={block}
              onEdit={() => { setEditing(true); setError(""); }}
            />
          ) : (
            <div className="empty-state">
              <span><Search size={25} /></span>
              <h3>Détail de la commande</h3>
              <p>Saisissez une référence valide ou cliquez une commande dans la liste pour l’afficher, puis la modifier.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function OrderConsult({
  order,
  hydrated,
  money,
  block,
  onEdit,
}: {
  order: MockRecord;
  hydrated: MockRecord;
  money: (amount: number) => string;
  block: string;
  onEdit: () => void;
}) {
  const { records, settings } = useApp();
  const clients = records["fiches-clients"] ?? [];
  const catalogue = records.catalogue ?? [];
  const snap = inspectQuote(hydrated, clients, catalogue, settings);
  const history = parseOrderHistory(order.orderHistory);
  const due = order.dueDate
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${order.dueDate}T12:00:00`))
    : "—";

  return (
    <>
      <div className="section-title">
        <div>
          <span className="panel-kicker">{order.reference}</span>
          <h2>{order.name}</h2>
        </div>
        <span className={`status-badge status-${statusTone(order.status)}`}><i />{order.status}</span>
      </div>
      <article className="quote-client-card">
        <div>
          <strong>{snap.client?.name || order.client || "Client inconnu"}</strong>
          <span>{snap.client ? clientAddress(snap.client) || "Adresse non renseignée" : "Fiche client introuvable"}</span>
        </div>
        <dl>
          <div><dt>Téléphone</dt><dd>{snap.client?.phone || "—"}</dd></div>
          <div><dt>E-mail</dt><dd>{snap.client?.email || "—"}</dd></div>
          <div><dt>Remise</dt><dd>{snap.rebate > 0 ? `${snap.rebate} %${snap.discountOn ? " appliquée" : " non appliquée"}` : "Aucune"}</dd></div>
          <div><dt>Quantité</dt><dd>{qtyFmt.format(Number(order.quantity) || 0)}</dd></div>
          <div><dt>Échéance</dt><dd>{due}</dd></div>
          {order.quoteRef ? <div><dt>Devis source</dt><dd>{String(order.quoteRef)}</dd></div> : null}
        </dl>
      </article>
      <ul className="quote-detail-lines conv-lines">
        {snap.rows.map((item, index) => (
          <li key={item.line.id}>
            <div>
              <strong>{item.designation}</strong>
              <small>{qtyFmt.format(item.line.quantity)} ex. · PU {money(item.breakdown.unitPrice)}</small>
            </div>
            <b>{money(snap.discountOn ? (snap.totals.nets[index] ?? item.total) : item.total)}</b>
          </li>
        ))}
        {snap.discountOn && snap.totals.discountAmount > 0 && (
          <li className="is-discount">
            <span>Remise client {snap.rebate} %</span>
            <b>− {money(snap.totals.discountAmount)}</b>
          </li>
        )}
        <li className="conv-total">
          <span>Total</span>
          <b>{money(Number(order.amount) || snap.totals.total)}</b>
        </li>
      </ul>
      <HistoryList entries={history} money={money} />
      {block && <p className="settings-hint">{block}</p>}
      <div className="heading-actions conv-actions">
        <button type="button" className="button button-primary" disabled={Boolean(block)} onClick={onEdit}>
          <PencilLine size={16} /> Modifier la commande
        </button>
      </div>
    </>
  );
}

function OrderAmendForm({
  order,
  preview,
  reason,
  dueDate,
  lines,
  applyDiscount,
  catalogue,
  pending,
  money,
  onReason,
  onDueDate,
  onDiscount,
  onChangeLine,
  onPick,
  onAdd,
  onRemove,
  onCancel,
  onApply,
}: {
  order: MockRecord;
  preview: ReturnType<typeof previewOrderAvenant>;
  reason: string;
  dueDate: string;
  lines: QuoteLine[];
  applyDiscount: boolean;
  catalogue: MockRecord[];
  pending: boolean;
  money: (amount: number) => string;
  onReason: (value: string) => void;
  onDueDate: (value: string) => void;
  onDiscount: (value: boolean) => void;
  onChangeLine: (id: string, patch: Partial<QuoteLine>) => void;
  onPick: (lineId: string, product: MockRecord) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const { records, te } = useApp();
  const clients = records["fiches-clients"] ?? [];
  const client = clients.find((item) => item.id === String(order.clientId || parseQuotePayload(order.quotePayload)?.clientId || ""))
    ?? clients.find((item) => item.name === order.client);
  const rebate = Number(client?.discount) || 0;
  const history = parseOrderHistory(order.orderHistory);
  const resolved = preview.snap?.resolved ?? [];
  const totals = preview.snap?.totals;
  const discountOn = Boolean(applyDiscount && rebate > 0);
  const dirty = !preview.error && !avenantUnchanged(preview.previous, preview.next);

  return (
    <>
      <div className="section-title">
        <div>
          <span className="panel-kicker">{order.reference}</span>
          <h2>{order.name}</h2>
        </div>
        <span className={`status-badge status-${statusTone(order.status)}`}><i />{order.status}</span>
      </div>
      {client && (
        <article className="quote-client-card">
          <div>
            <strong>{client.name}</strong>
            <span>{client.phone || te("Sans téléphone")}</span>
          </div>
          <DiscountToggle
            rebate={rebate}
            apply={applyDiscount}
            savings={Math.round((totals?.subtotal ?? 0) * (rebate / 100))}
            money={money}
            onChange={onDiscount}
          />
        </article>
      )}
      <HistoryList entries={history} money={money} />
      <h3 className="ave-form-title">{te("Modifier la commande")}</h3>
      <label className="field field-wide">
        <span>{te("Motif de l’avenant")} <b>*</b></span>
        <textarea value={reason} onChange={(event) => onReason(event.target.value)} rows={3} maxLength={400} placeholder={te("Ex. pelliculage mat à la place du vernis, même BAT.")} />
      </label>
      <label className="field">
        <span>{te("Échéance")}</span>
        <input type="date" value={dueDate} onChange={(event) => onDueDate(event.target.value)} />
      </label>
      {lines.map((line, index) => (
        <QuoteProductCard
          key={line.id}
          index={index}
          line={line}
          catalogue={catalogue}
          resolved={resolved[index] ?? null}
          money={money}
          canRemove={lines.length > 1}
          applyDiscount={discountOn}
          rebate={rebate}
          netTotal={totals?.nets[index] ?? resolved[index]?.total ?? 0}
          lineDiscount={Math.max(0, (resolved[index]?.total ?? 0) - (totals?.nets[index] ?? resolved[index]?.total ?? 0))}
          lineLabel="Produit"
          excludeProductIds={lines.filter((item) => item.id !== line.id).map((item) => item.productId).filter(Boolean)}
          onChange={(patch) => onChangeLine(line.id, patch)}
          onPick={(product) => onPick(line.id, product)}
          onRemove={() => onRemove(line.id)}
        />
      ))}
      {catalogue.some((item) => item.status !== "Archivé" && !lines.some((line) => line.productId === item.id)) && (
        <button type="button" className="add-row-button" onClick={onAdd}>
          <Plus size={16} /> {te("Ajouter un produit")}
        </button>
      )}
      <dl className="ave-delta">
        <div><dt>{te("Ancien montant")}</dt><dd>{money(preview.previous.amount)}</dd></div>
        <div><dt>{te("Nouveau montant")}</dt><dd>{money(preview.next.amount)}</dd></div>
        <div><dt>{te("Écart")}</dt><dd>{preview.delta >= 0 ? "+" : "−"} {money(Math.abs(preview.delta))}</dd></div>
      </dl>
      {preview.error && <p className="form-error">{te(preview.error)}</p>}
      <div className="heading-actions conv-actions">
        <button type="button" className="button button-secondary" disabled={pending} onClick={onCancel}>
          {te("Annuler")}
        </button>
        <button type="button" className="button button-primary" disabled={pending || !dirty || Boolean(preview.error)} onClick={onApply}>
          {pending ? <><LoaderCircle className="spin" size={16} /> {te("Enregistrement…")}</> : <><Check size={16} /> {te("Enregistrer l’avenant")}</>}
        </button>
      </div>
    </>
  );
}

export function HistoryList({ entries, money }: { entries: ReturnType<typeof parseOrderHistory>; money: (amount: number) => string }) {
  const { te } = useApp();
  if (!entries.length) return null;
  return (
    <div className="ave-history">
      <span className="panel-kicker">{te("Historique des avenants")}</span>
      <ol>
        {entries.slice().reverse().map((entry) => (
          <li key={entry.id}>
            <strong>{entry.avenantRef || te("Avenant")}</strong>
            <span>{entry.at} · {entry.reason}</span>
            <small>
              {qtyFmt.format(entry.previous.quantity)} ex. → {qtyFmt.format(entry.next.quantity)} ex.
              {canonicalQuotePayload(entry.previous.quotePayload) !== canonicalQuotePayload(entry.next.quotePayload) ? " · produits / options" : ""}
              {entry.previous.dueDate !== entry.next.dueDate ? ` · échéance ${entry.previous.dueDate || "—"} → ${entry.next.dueDate || "—"}` : ""}
              {" · "}{money(entry.previous.amount)} → {money(entry.next.amount)}
            </small>
          </li>
        ))}
      </ol>
    </div>
  );
}
