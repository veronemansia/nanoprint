"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { QuoteDetail } from "@/components/modules/price-calculator";
import { HistoryList } from "@/components/modules/order-avenants";
import { useApp } from "@/components/providers/app-provider";
import { formatAmount } from "@/lib/company-settings";
import { parseOrderHistory } from "@/lib/order-avenant";
import { hydrateOrderRecord, ORDER_STATUSES, sanitizeOrderStatus } from "@/lib/quote-conversion";
import type { MockRecord } from "@/lib/types";

export function OrderDetail({ record }: { record: MockRecord }) {
  const { records, settings, updateRecord, te, locale } = useApp();
  const live = (records["statuts-commandes"] ?? []).find((item) => item.id === record.id) ?? record;
  const hydrated = hydrateOrderRecord(live, records.calculateur ?? []);
  const [status, setStatus] = useState(live.status);
  const [pending, setPending] = useState(false);
  const allowed = sanitizeOrderStatus(status);
  const dirty = allowed !== "" && allowed !== live.status;
  const money = (amount: number) => formatAmount(amount, settings);
  const history = parseOrderHistory(live.orderHistory);

  useEffect(() => {
    setStatus(live.status);
  }, [live.status]);

  async function saveStatus() {
    if (!allowed || !dirty) return;
    setPending(true);
    try {
      await updateRecord("statuts-commandes", live.id, { status: allowed });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <QuoteDetail record={hydrated} />
      <dl>
        {live.quoteRef ? <div><dt>{te("Devis source")}</dt><dd>{String(live.quoteRef)}</dd></div> : null}
        <div>
          <dt>{te("Échéance")}</dt>
          <dd>
            {live.dueDate
              ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale === "es" ? "es-ES" : "fr-FR", { dateStyle: "medium" }).format(new Date(`${live.dueDate}T12:00:00`))
              : "—"}
          </dd>
        </div>
      </dl>
      <HistoryList entries={history} money={money} />
      <label className="field order-status-field">
        <span>{te("Statut")}</span>
        <select value={sanitizeOrderStatus(status) || live.status} onChange={(event) => setStatus(event.target.value)}>
          {ORDER_STATUSES.map((item) => <option key={item} value={item}>{te(item)}</option>)}
        </select>
      </label>
      <button type="button" className="button button-primary" disabled={pending || !dirty} onClick={saveStatus}>
        {pending ? <><LoaderCircle className="spin" size={16} /> {te("Mise à jour…")}</> : <><Check size={16} /> {te("Enregistrer le statut")}</>}
      </button>
    </>
  );
}
