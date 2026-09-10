"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileDown, LoaderCircle, Printer, Receipt, Search, Wallet, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { formatAmount } from "@/lib/company-settings";
import {
  depositForOrder,
  depositSnapshot,
  findOrderByRef,
  invoiceProgress,
  moneyLabel,
  sanitizeAcompteAmount,
  sanitizePaymentAmount,
} from "@/lib/billing";
import { buildInvoiceDocument, renderInvoiceHtml } from "@/lib/invoice-document";
import { printQuoteHtml, wrapDocumentPreview } from "@/lib/document-template";
import { clientAddress, inspectQuote, qtyFmt } from "@/lib/price-calculator";
import { hydrateOrderRecord, normalizeQuoteRef } from "@/lib/quote-conversion";
import type { MockRecord } from "@/lib/types";

function statusTone(status: string) {
  if (/payé|soldé|émise|expédi/i.test(status)) return "green";
  if (/ouvert|attente|brouillon|partiel|acompte/i.test(status)) return "yellow";
  return "cyan";
}

function BillingPreview({
  html,
  title,
  hint,
  onClose,
}: {
  html: string;
  title: string;
  hint: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { te } = useApp();
  function print(asPdf: boolean) {
    printQuoteHtml(html, asPdf ? `${title}.pdf` : title);
  }

  return (
    <div className="modal-backdrop designer-preview-backdrop quote-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="quote-output is-invoice" role="dialog" aria-modal="true" aria-labelledby="invoice-output-title">
        <div className="designer-preview-head">
          <div>
            <span className="panel-kicker">{te("Document A4")}</span>
            <h2 id="invoice-output-title">{title}</h2>
          </div>
          <div className="heading-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>{te("Fermer")}</button>
            <button type="button" className="button button-secondary" onClick={() => print(false)}>
              <Printer size={16} /> {te("Imprimer")}
            </button>
            <button type="button" className="button button-primary" onClick={() => print(true)}>
              <FileDown size={16} /> {te("Générer le PDF")}
            </button>
          </div>
        </div>
        <p className="quote-pdf-hint">{hint}</p>
        <div className="quote-output-body">
          <div className="quote-output-preview">
            <iframe className="quote-output-frame" title={`Aperçu ${title}`} sandbox="" srcDoc={wrapDocumentPreview(html)} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function OrderInvoices() {
  return <OrderBilling mode="facture" />;
}

export function OrderDeposits() {
  return <OrderBilling mode="acompte" />;
}

function OrderBilling({ mode }: { mode: "facture" | "acompte" }) {
  const { records, settings, issueInvoice, recordDepositPayment, te, t } = useApp();
  const orders = records["statuts-commandes"] ?? [];
  const quotes = records.calculateur ?? [];
  const clients = records["fiches-clients"] ?? [];
  const catalogue = records.catalogue ?? [];
  const invoices = records.factures ?? [];
  const deposits = records.acomptes ?? [];
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [settlement, setSettlement] = useState<"solde" | "acompte">("solde");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [preview, setPreview] = useState<{ html: string; title: string } | null>(null);
  const money = (amount: number) => formatAmount(amount, settings);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return orders.filter((item) => {
      if (!needle) return true;
      return [item.reference, item.name, item.client, item.status].some((value) =>
        String(value || "").toLocaleLowerCase("fr").includes(needle),
      );
    });
  }, [orders, query]);

  const typed = findOrderByRef(orders, query);
  const selected = orders.find((item) => item.id === selectedId) ?? typed;

  useEffect(() => {
    if (typed && typed.id !== selectedId) setSelectedId(typed.id);
  }, [typed, selectedId]);

  const invoiceState = selected ? invoiceProgress(selected, invoices) : null;
  const deposit = selected ? depositForOrder(deposits, selected) : undefined;
  const snapshot = selected ? depositSnapshot(selected, deposit) : null;
  const hydrated = selected ? hydrateOrderRecord(selected, quotes) : null;
  const snap = hydrated ? inspectQuote(hydrated, clients, catalogue, settings) : null;

  useEffect(() => {
    if (!snapshot) return;
    setPayAmount(snapshot.remaining > 0 ? String(snapshot.remaining) : "");
    setError("");
  }, [selected?.id, snapshot?.remaining]);

  useEffect(() => {
    setSettlement("solde");
    setInvoiceAmount("");
    setError("");
  }, [selected?.id]);

  function selectOrder(item: MockRecord) {
    setSelectedId(item.id);
    setQuery(item.reference);
    setError("");
  }

  function openInvoicePreview(order: MockRecord, record: MockRecord) {
    const settlementKind = String(record.settlement || "") === "acompte" ? "acompte" as const : "solde" as const;
    const doc = buildInvoiceDocument("facture", order, quotes, clients, catalogue, settings, {
      number: record.reference,
      date: String(record.issuedAt || ""),
      settlement: settlementKind,
      billed: Number(record.amount) || 0,
      remaining: Number(record.remaining) || 0,
    });
    setPreview({ html: renderInvoiceHtml(doc), title: record.reference });
  }

  function openReceiptPreview(order: MockRecord, payment: { amount: number; receiptRef: string }, next: ReturnType<typeof depositSnapshot>) {
    const doc = buildInvoiceDocument("acompte", order, quotes, clients, catalogue, settings, {
      number: payment.receiptRef,
      date: new Date().toISOString().slice(0, 10),
      payment: payment.amount,
      paid: next.paid,
      remaining: next.remaining,
      receiptRef: payment.receiptRef,
    });
    setPreview({ html: renderInvoiceHtml(doc), title: payment.receiptRef });
  }

  async function generateInvoice() {
    if (!selected || !invoiceState) return;
    if (settlement === "acompte") {
      const check = sanitizeAcompteAmount(invoiceAmount, invoiceState.remaining);
      if (check.error) {
        setError(te(check.error));
        return;
      }
    }
    setPending(true);
    setError("");
    try {
      const created = await issueInvoice(selected.id, {
        settlement,
        amount: settlement === "acompte" ? Number(invoiceAmount) || 0 : invoiceState.remaining,
      });
      if (!created) {
        setError(te("La facture n’a pas pu être générée."));
        return;
      }
      setInvoiceAmount("");
      openInvoicePreview(selected, created);
    } finally {
      setPending(false);
    }
  }

  async function pay() {
    if (!selected || !snapshot) return;
    const check = sanitizePaymentAmount(payAmount, snapshot.remaining);
    if (check.error) {
      setError(te(check.error));
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await recordDepositPayment(selected.id, check.amount);
      if (!result) {
        setError(te("Le paiement n’a pas pu être enregistré."));
        return;
      }
      const next = depositSnapshot(selected, result.deposit);
      openReceiptPreview(selected, result.payment, next);
    } finally {
      setPending(false);
    }
  }

  const lastPayment = snapshot?.payments[snapshot.payments.length - 1];

  return (
    <div className="conv-page">
      <p className="settings-hint">
        {mode === "facture"
          ? te("Choisissez une commande, puis générez une facture de solde ou d’acompte. L’acompte exige un montant supérieur à zéro et inférieur au total restant. Aucune modification ni suppression.")
          : te("Choisissez une commande, encaissez un acompte : le payé augmente, le reste diminue. Vous pouvez imprimer le reçu de paiement.")}
      </p>
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
        <p className="form-error" role="status">{t("bill.noMatch", "Aucune commande ne correspond à « {ref} ».", { ref: normalizeQuoteRef(query) || query })}</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="conv-layout">
        <section className="data-section conv-list-panel">
          <div className="section-title">
            <div>
              <span className="panel-kicker">{te("Conversion")}</span>
              <h2>{te("Commandes")}</h2>
            </div>
            <span>{filtered.length}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <span><Receipt size={25} /></span>
              <h3>{te("Aucune commande")}</h3>
              <p>{te("Les commandes arrivent depuis la conversion de devis.")}</p>
              <Link className="button button-primary" href="/admin/devis-commandes/conversion">{te("Convertir un devis")}</Link>
            </div>
          ) : (
            <ul className="conv-list">
              {filtered.map((item) => {
                const billed = invoiceProgress(item, invoices);
                const dep = depositForOrder(deposits, item);
                const state = depositSnapshot(item, dep);
                const factureLabel = billed.hasSolde || billed.remaining <= 0
                  ? (billed.issued[0]?.reference || "Soldée")
                  : billed.billed > 0 ? "Acompte" : "À facturer";
                return (
                  <li key={item.id}>
                    <button type="button" className={item.id === selected?.id ? "is-active" : ""} onClick={() => selectOrder(item)}>
                      <strong>{item.reference}</strong>
                      <span>{item.client || item.name}</span>
                      <small>{moneyLabel(Number(item.amount) || 0, settings)}</small>
                      <em className={`status-badge status-${statusTone(mode === "facture" ? factureLabel : state.status)}`}>
                        <i />
                        {mode === "facture" ? te(factureLabel) : te(state.status)}
                      </em>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="data-section conv-detail-panel">
          {!selected || !hydrated || !snap ? (
            <div className="empty-state">
              <span><Search size={25} /></span>
              <h3>{te("Détail de la commande")}</h3>
              <p>{te("Saisissez une référence ou cliquez une commande pour la consulter.")}</p>
            </div>
          ) : (
            <>
              <div className="section-title">
                <div>
                  <span className="panel-kicker">{selected.reference}</span>
                  <h2>{selected.name}</h2>
                </div>
                <span className={`status-badge status-${statusTone(selected.status)}`}><i />{te(selected.status)}</span>
              </div>
              <article className="quote-client-card">
                <div>
                  <strong>{snap.client?.name || selected.client || te("Client inconnu")}</strong>
                  <span>{snap.client ? clientAddress(snap.client) || te("Adresse non renseignée") : te("Fiche client introuvable")}</span>
                </div>
                <dl>
                  <div><dt>{te("Téléphone")}</dt><dd>{snap.client?.phone || "—"}</dd></div>
                  <div><dt>{te("E-mail")}</dt><dd>{snap.client?.email || "—"}</dd></div>
                  <div><dt>{te("Quantité")}</dt><dd>{qtyFmt.format(Number(selected.quantity) || 0)}</dd></div>
                  <div><dt>{te("Montant commande")}</dt><dd>{moneyLabel(Number(selected.amount) || 0, settings)}</dd></div>
                </dl>
              </article>
              <ul className="quote-detail-lines conv-lines">
                {snap.rows.map((item, index) => (
                  <li key={item.line.id}>
                    <div>
                      <strong>{item.designation}</strong>
                      <small>{qtyFmt.format(item.line.quantity)} ex.</small>
                    </div>
                    <b>{money(snap.discountOn ? (snap.totals.nets[index] ?? item.total) : item.total)}</b>
                  </li>
                ))}
                {snap.rows.length === 0 && (
                  <li>
                    <div><strong>{selected.name}</strong><small>{qtyFmt.format(Number(selected.quantity) || 0)} ex.</small></div>
                    <b>{money(Number(selected.amount) || 0)}</b>
                  </li>
                )}
                <li className="conv-total">
                  <span>{te("Total commande")}</span>
                  <b>{money(Number(selected.amount) || snap.totals.total)}</b>
                </li>
              </ul>

              {mode === "facture" && invoiceState ? (
                <>
                  {invoiceState.issued.length > 0 && (
                    <ul className="quote-detail-lines conv-lines">
                      {invoiceState.issued.map((item) => (
                        <li key={item.id}>
                          <div>
                            <strong>{item.reference}</strong>
                            <small>{te(String(item.settlement || "") === "acompte" ? "Acompte" : "Solde")} · {moneyLabel(Number(item.amount) || 0, settings)}</small>
                          </div>
                          <button type="button" className="button button-secondary" onClick={() => openInvoicePreview(selected, item)}>
                            <Printer size={16} /> {te("Imprimer")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {invoiceState.remaining > 0 && !invoiceState.hasSolde ? (
                    <>
                      <fieldset className="quote-options">
                        <legend>{te("Type de facture")}<b> *</b></legend>
                        <label className={settlement === "solde" ? "is-picked" : ""}>
                          <input type="radio" name="invoice-settlement" checked={settlement === "solde"} onChange={() => { setSettlement("solde"); setError(""); }} />
                          <span>{te("Solde")}</span>
                          <b>{moneyLabel(invoiceState.remaining, settings)}</b>
                        </label>
                        <label className={settlement === "acompte" ? "is-picked" : ""}>
                          <input type="radio" name="invoice-settlement" checked={settlement === "acompte"} onChange={() => { setSettlement("acompte"); setError(""); }} />
                          <span>{te("Acompte")}</span>
                          <b>{te("Partiel")}</b>
                        </label>
                      </fieldset>
                      {settlement === "acompte" && (
                        <label className="field">
                          <span>{te("Montant de l’acompte")} <b>*</b></span>
                          <input
                            inputMode="numeric"
                            value={invoiceAmount}
                            onChange={(event) => { setInvoiceAmount(event.target.value); setError(""); }}
                            placeholder={t("bill.depositBelow", "Supérieur à 0, inférieur à {amount}", { amount: moneyLabel(invoiceState.remaining, settings) })}
                          />
                          <small className="quote-qty-help">{t("bill.depositHelp", "Le montant doit être supérieur à zéro et inférieur au total restant ({amount}).", { amount: moneyLabel(invoiceState.remaining, settings) })}</small>
                        </label>
                      )}
                      <div className="heading-actions conv-actions">
                        <button type="button" className="button button-primary" disabled={pending} onClick={generateInvoice}>
                          {pending ? <><LoaderCircle className="spin" size={16} /> {te("Génération…")}</> : <><Receipt size={16} /> {te("Générer la facture")}</>}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="settings-hint">{te("Cette commande est soldée. Vous pouvez seulement imprimer les factures déjà émises.")}</p>
                  )}
                </>
              ) : snapshot && (
                <>
                  <dl className="ave-delta">
                    <div><dt>{te("Total")}</dt><dd>{moneyLabel(snapshot.total, settings)}</dd></div>
                    <div><dt>{te("Payé")}</dt><dd>{moneyLabel(snapshot.paid, settings)}</dd></div>
                    <div><dt>{te("Reste")}</dt><dd>{moneyLabel(snapshot.remaining, settings)}</dd></div>
                  </dl>
                  {snapshot.remaining > 0 && (
                    <label className="field">
                      <span>{te("Montant à encaisser")}</span>
                      <input
                        inputMode="numeric"
                        value={payAmount}
                        onChange={(event) => setPayAmount(event.target.value)}
                        placeholder={te("Montant")}
                      />
                    </label>
                  )}
                  <div className="heading-actions conv-actions">
                    <button type="button" className="button button-primary" disabled={pending || snapshot.remaining <= 0} onClick={pay}>
                      {pending ? <><LoaderCircle className="spin" size={16} /> {te("Encaissement…")}</> : <><Wallet size={16} /> {te("Payer")}</>}
                    </button>
                    {lastPayment && (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => openReceiptPreview(selected, lastPayment, snapshot)}
                      >
                        <Printer size={16} /> {te("Imprimer le reçu")}
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      {preview && (
        <BillingPreview
          html={preview.html}
          title={preview.title}
          hint="Aperçu A4. Imprimez ou enregistrez en PDF via la boîte de dialogue d’impression."
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
