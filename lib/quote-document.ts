import { amountInWords, computeBillingTotals, formatBillingDate, moneyLabel, type BillingLine } from "@/lib/billing";
import { clientAddress } from "@/lib/price-calculator";
import { NANOPRINT_LOGO } from "@/lib/document-template";
import type { CompanySettings } from "@/lib/company-settings";
import type { MockRecord } from "@/lib/types";

export type QuoteDocKind = "chiffrage" | "devis";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeLogo(src: string) {
  const value = String(src || "").trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml)(?:;charset=[^;,]*)?(;base64)?,/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    /* ignore */
  }
  return NANOPRINT_LOGO;
}

const CSS = `
@page { size: A4; margin: 0; }
.np-a4 {
  position: relative;
  width: 210mm;
  height: 297mm;
  margin: 0 auto;
  background: #fff;
  color: #171717;
  font-family: "Saira", "Segoe UI", Arial, sans-serif;
  overflow: hidden;
  box-sizing: border-box;
}
.np-inv { padding: 14mm 16mm 16mm; height: 100%; display: flex; flex-direction: column; box-sizing: border-box; }
.np-inv * { box-sizing: border-box; }
.np-inv-bar { display: flex; gap: 0; height: 6px; margin: 0 -16mm 12mm; }
.np-inv-bar i { flex: 1; display: block; }
.np-inv-head { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 18px; align-items: start; margin-bottom: 18px; }
.np-inv-brand { display: flex; gap: 14px; align-items: center; }
.np-inv-brand img { width: 58px; height: 58px; object-fit: contain; border-radius: 10px; background: #f6f4ee; }
.np-inv-brand strong { display: block; font-family: "Saira Condensed", "Segoe UI", sans-serif; font-size: 28px; letter-spacing: -0.04em; line-height: 1; }
.np-inv-brand span { display: block; color: #6b6a64; font-size: 12px; margin-top: 4px; }
.np-inv-meta { text-align: right; }
.np-inv-meta em { display: inline-block; font-style: normal; font-family: "Saira Condensed", "Segoe UI", sans-serif; font-size: 34px; letter-spacing: 0.08em; color: #08a6c9; line-height: 1; }
.np-inv-meta b { display: block; font-size: 18px; margin-top: 6px; }
.np-inv-meta small { display: block; color: #6b6a64; font-size: 12px; margin-top: 4px; }
.np-inv-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.np-inv-card { border: 1px solid #e6e2d8; border-radius: 12px; padding: 12px 14px; background: #fbfaf6; }
.np-inv-card .k { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #8a887f; font-weight: 700; }
.np-inv-card strong { display: block; margin-top: 4px; font-size: 15px; }
.np-inv-card p { margin: 4px 0 0; color: #5c5b55; font-size: 12px; line-height: 1.45; }
.np-inv table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.np-inv thead th { text-align: left; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #fff; background: #181a18; padding: 9px 10px; }
.np-inv thead th:nth-child(2), .np-inv thead th:nth-child(3), .np-inv thead th:nth-child(4),
.np-inv tbody td:nth-child(2), .np-inv tbody td:nth-child(3), .np-inv tbody td:nth-child(4) { text-align: right; }
.np-inv tbody td { padding: 10px; border-bottom: 1px solid #eeeae1; vertical-align: top; }
.np-inv tbody tr:nth-child(even) td { background: #faf9f5; }
.np-inv-foot { margin-top: auto; display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 16px; padding-top: 16px; }
.np-inv-words { font-size: 12px; color: #5c5b55; line-height: 1.45; }
.np-inv-words b { color: #171717; }
.np-inv-bank { margin-top: 10px; font-size: 11px; color: #6b6a64; line-height: 1.5; }
.np-inv-tot { background: #181a18; color: #fff; border-radius: 14px; padding: 14px 16px; }
.np-inv-tot div { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin: 5px 0; color: #c9c6bb; }
.np-inv-tot .is-total { margin-top: 8px; padding-top: 8px; border-top: 1px solid #333; color: #fff; font-size: 16px; font-weight: 700; }
.np-inv-mark { position: absolute; right: 16mm; bottom: 10mm; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #b7b3a8; }
`;

function companyBlock(settings: CompanySettings) {
  return [
    settings.legalName || settings.tradeName,
    [settings.address, settings.city, settings.country].filter(Boolean).join(", "),
    [settings.phone, settings.email].filter(Boolean).join(" · "),
    settings.ninea ? `NINEA ${settings.ninea}` : "",
    settings.rccm ? `RCCM ${settings.rccm}` : "",
  ].filter(Boolean).map(escapeHtml).join("<br/>");
}

function clientBlock(client: MockRecord) {
  return [
    escapeHtml(String(client.name || "")),
    escapeHtml(clientAddress(client) || "Adresse non renseignée"),
    escapeHtml([client.phone, client.email].filter(Boolean).join(" · ") || "—"),
  ].join("<br/>");
}

function lineRows(lines: BillingLine[], settings: CompanySettings) {
  const qty = new Intl.NumberFormat("fr-FR");
  if (!lines.length) return `<tr><td colspan="4">Aucune ligne.</td></tr>`;
  return lines.map((line) => `
    <tr>
      <td>${escapeHtml(line.designation)}</td>
      <td>${escapeHtml(qty.format(line.quantity))}</td>
      <td>${escapeHtml(moneyLabel(line.unitPrice, settings))}</td>
      <td>${escapeHtml(moneyLabel(line.total, settings))}</td>
    </tr>
  `).join("");
}

export function renderQuoteHtml(input: {
  kind: QuoteDocKind;
  number: string;
  client: MockRecord;
  settings: CompanySettings;
  lines: BillingLine[];
  discount: number;
  rebate?: number;
  date?: string;
}) {
  const settings = input.settings;
  const totals = computeBillingTotals(input.lines, input.discount, settings);
  const logo = safeLogo(settings.logo || NANOPRINT_LOGO);
  const title = input.kind === "devis" ? "DEVIS" : "CHIFFRAGE";
  const noun = input.kind === "devis" ? "le présent devis" : "le présent chiffrage";
  const taxRows = totals.taxes.map((tax) => `
    <div><span>${escapeHtml(tax.label)} ${tax.rate} %</span><span>${escapeHtml(moneyLabel(tax.amount, settings))}</span></div>
  `).join("");

  return `
  <div class="np-a4" data-title="${escapeHtml(input.number)}">
    <style>${CSS}</style>
    <article class="np-inv">
      <div class="np-inv-bar" aria-hidden="true"><i style="background:#08a6c9"></i><i style="background:#d90a74"></i><i style="background:#e9b918"></i><i style="background:#181a18"></i></div>
      <header class="np-inv-head">
        <div class="np-inv-brand">
          <img src="${escapeHtml(logo)}" alt=""/>
          <div>
            <strong>${escapeHtml(settings.tradeName || "NanoPrint")}</strong>
            <span>${companyBlock(settings)}</span>
          </div>
        </div>
        <div class="np-inv-meta">
          <em>${title}</em>
          <b>${escapeHtml(input.number)}</b>
          <small>${escapeHtml(formatBillingDate(input.date))}</small>
        </div>
      </header>
      <section class="np-inv-cards">
        <div class="np-inv-card">
          <div class="k">Client</div>
          <strong>${escapeHtml(String(input.client.name || "Client"))}</strong>
          <p>${clientBlock(input.client)}</p>
        </div>
        <div class="np-inv-card">
          <div class="k">Offre</div>
          <strong>${escapeHtml(input.number)}</strong>
          <p>Valable 30 jours.<br/>Acompte 40 % à la commande.</p>
        </div>
      </section>
      <table>
        <thead>
          <tr><th>Désignation</th><th>Qté</th><th>Prix unitaire</th><th>Montant</th></tr>
        </thead>
        <tbody>${lineRows(input.lines, settings)}</tbody>
      </table>
      <footer class="np-inv-foot">
        <div>
          <p class="np-inv-words">Arrêté ${noun} à la somme de <b>${escapeHtml(amountInWords(totals.total))}</b>.</p>
          <p class="np-inv-bank">
            ${escapeHtml(settings.bank || "")}${settings.bank ? "<br/>" : ""}
            ${settings.iban ? `IBAN ${escapeHtml(settings.iban)}` : ""}
            <br/>Document établi selon les taxes actives. Les montants sont en francs CFA.
          </p>
        </div>
        <div class="np-inv-tot">
          <div><span>Sous-total</span><span>${escapeHtml(moneyLabel(totals.subtotal, settings))}</span></div>
          ${totals.discount > 0 ? `<div><span>Remise${input.rebate ? ` ${input.rebate} %` : ""}</span><span>− ${escapeHtml(moneyLabel(totals.discount, settings))}</span></div>` : ""}
          ${taxRows}
          <div class="is-total"><span>Total TTC</span><span>${escapeHtml(moneyLabel(totals.total, settings))}</span></div>
        </div>
      </footer>
      <div class="np-inv-mark">${escapeHtml(settings.tradeName || "NanoPrint")} · A4</div>
    </article>
  </div>`;
}
