"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Printer, Search, Shuffle, X } from "lucide-react";
import { QuoteOutputDialog } from "@/components/modules/price-calculator";
import { useApp } from "@/components/providers/app-provider";
import { formatAmount } from "@/lib/company-settings";
import { clientAddress, inspectQuote, qtyFmt } from "@/lib/price-calculator";
import { renderQuoteHtml } from "@/lib/quote-document";
import type { CompanySettings } from "@/lib/company-settings";
import {
  buildConvertedOrder,
  conversionBlockReason,
  findCalculatorQuote,
  normalizeQuoteRef,
  orderForQuote,
} from "@/lib/quote-conversion";

function quoteSheetFromSnap(
  snap: NonNullable<ReturnType<typeof inspectQuote>>,
  settings: CompanySettings,
  number: string,
) {
  if (!snap.client) return "";
  return renderQuoteHtml({
    kind: "chiffrage",
    number,
    client: snap.client,
    settings,
    lines: snap.rows.map((item) => ({
      designation: item.designation,
      quantity: item.line.quantity,
      unitPrice: item.breakdown.unitPrice,
      total: item.total,
    })),
    discount: snap.totals.discountAmount,
    rebate: snap.totals.rebate,
  });
}

function statusTone(status: string) {
  if (/converti|conforme|validé/i.test(status)) return "green";
  if (/brouillon|attente/i.test(status)) return "yellow";
  return "cyan";
}

export function QuoteConversion() {
  const router = useRouter();
  const { records, settings, convertCalculatorQuote, te, t } = useApp();
  const quotes = records.calculateur ?? [];
  const orders = records["statuts-commandes"] ?? [];
  const clients = records["fiches-clients"] ?? [];
  const catalogue = records.catalogue ?? [];
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [printJob, setPrintJob] = useState<{ html: string; title: string; goToOrders: boolean } | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return quotes.filter((item) => {
      if (!needle) return true;
      return [item.reference, item.name, item.client, item.status].some((value) =>
        String(value || "").toLocaleLowerCase("fr").includes(needle),
      );
    });
  }, [quotes, query]);

  const exact = findCalculatorQuote(quotes, query);
  const selected = quotes.find((item) => item.id === selectedId) ?? exact;

  useEffect(() => {
    if (exact && exact.id !== selectedId) setSelectedId(exact.id);
  }, [exact, selectedId]);

  const snap = selected ? inspectQuote(selected, clients, catalogue, settings) : null;
  const existingOrder = selected ? orderForQuote(orders, selected) : undefined;
  const block = selected
    ? conversionBlockReason(selected, orders, clients, catalogue, settings)
    : "";
  const money = (amount: number) => formatAmount(amount, settings);

  async function convert() {
    if (!selected) return;
    const built = buildConvertedOrder(selected, orders, clients, catalogue, settings);
    if (built.error || !built.values) {
      setError(te(built.error || "Conversion impossible."));
      return;
    }
    setPending(true);
    setError("");
    try {
      const order = await convertCalculatorQuote(selected.id);
      if (!order) {
        setError(te("La conversion a échoué. Vérifiez le statut du devis."));
        return;
      }
      if (snap?.client && snap.rows.length) {
        setPrintJob({ html: quoteSheetFromSnap(snap, settings, order.reference), title: order.reference, goToOrders: true });
        return;
      }
      router.push("/admin/devis-commandes/statuts-commandes");
    } catch {
      setError(te("La conversion a échoué. Réessayez."));
    } finally {
      setPending(false);
    }
  }

  function closePrint() {
    const go = printJob?.goToOrders;
    setPrintJob(null);
    if (go) router.push("/admin/devis-commandes/statuts-commandes");
  }

  return (
    <div className="conv-page">
      <p className="settings-hint">{te("Saisissez la référence d’un chiffrage du calculateur. Le détail s’affiche comme dans le calculateur, puis vous convertissez en commande.")}</p>
      <div className="table-toolbar">
        <label className="table-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setError("");
            }}
            placeholder={te("Référence du devis (CHF-442)…")}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); setError(""); }} aria-label={te("Effacer")}>
              <X size={15} />
            </button>
          )}
        </label>
      </div>
      {query.trim() && !exact && !filtered.length && (
        <p className="form-error" role="status">{t("conv.noMatch", "Aucun devis du calculateur ne correspond à « {ref} ».", { ref: normalizeQuoteRef(query) || query })}</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="conv-layout">
        <section className="data-section conv-list-panel">
          <div className="section-title">
            <div>
              <span className="panel-kicker">{te("Calculateur")}</span>
              <h2>{te("Devis")}</h2>
            </div>
            <span>{filtered.length}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <span><Search size={25} /></span>
              <h3>{te("Aucun devis")}</h3>
              <p>{te("Créez un chiffrage dans le calculateur, puis revenez saisir sa référence ici.")}</p>
              <Link className="button button-primary" href="/admin/devis-commandes/calculateur">{te("Ouvrir le calculateur")}</Link>
            </div>
          ) : (
            <ul className="conv-list">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={item.id === selected?.id ? "is-active" : ""}
                    onClick={() => {
                      setSelectedId(item.id);
                      setQuery(item.reference);
                      setError("");
                    }}
                  >
                    <strong>{item.reference}</strong>
                    <span>{item.client || item.name}</span>
                    <small>{money(Number(item.amount) || 0)}</small>
                    <em className={`status-badge status-${statusTone(item.status)}`}><i />{te(item.status)}</em>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="data-section conv-detail-panel">
          {!selected || !snap ? (
            <div className="empty-state">
              <span><Shuffle size={25} /></span>
              <h3>{te("Détail du devis")}</h3>
              <p>{te("Saisissez une référence valide ou cliquez un devis dans la liste pour afficher le chiffrage complet.")}</p>
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
                  <div><dt>{te("Remise")}</dt><dd>{snap.rebate > 0 ? `${snap.rebate} % ${te(snap.discountOn ? "appliquée" : "non appliquée")}` : te("Aucune")}</dd></div>
                  <div><dt>{te("Quantité")}</dt><dd>{qtyFmt.format(Number(selected.quantity) || 0)}</dd></div>
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
                    <span>{t("conv.rebateLine", "Remise client {n} %", { n: snap.rebate })}</span>
                    <b>− {money(snap.totals.discountAmount)}</b>
                  </li>
                )}
                <li className="conv-total">
                  <span>{te("Total")}</span>
                  <b>{money(snap.totals.total)}</b>
                </li>
              </ul>

              {existingOrder && (
                <p className="settings-hint">{t("conv.already", "Déjà converti vers {ref} ({status}).", { ref: existingOrder.reference, status: te(existingOrder.status) })}</p>
              )}
              {block && !existingOrder && <p className="settings-hint">{te(block)}</p>}

              <div className="heading-actions conv-actions">
                {snap.ready && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      const title = existingOrder?.reference || selected.reference;
                      const html = quoteSheetFromSnap(snap, settings, title);
                      if (html) setPrintJob({ html, title, goToOrders: false });
                    }}
                  >
                    <Printer size={16} /> {te("Imprimer / PDF")}
                  </button>
                )}
                {existingOrder ? (
                  <Link className="button button-primary" href="/admin/devis-commandes/statuts-commandes">
                    {te("Voir la commande")} <ArrowRight size={16} />
                  </Link>
                ) : (
                  <button type="button" className="button button-primary" disabled={pending || Boolean(block)} onClick={convert}>
                    {pending ? <><LoaderCircle className="spin" size={16} /> {te("Conversion…")}</> : <><Shuffle size={16} /> {te("Convertir en commande")}</>}
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {printJob && (
        <QuoteOutputDialog
          html={printJob.html}
          documentTitle={printJob.title}
          onClose={closePrint}
        />
      )}
    </div>
  );
}
