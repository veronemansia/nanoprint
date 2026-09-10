"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileDown, LoaderCircle, Percent, Plus, Printer, Trash2, X } from "lucide-react";
import { ClientForm, clientKindOf } from "@/components/modules/client-form";
import { useApp } from "@/components/providers/app-provider";
import { parsePricedOptions } from "@/lib/catalogue";
import { formatAmount, type CompanySettings } from "@/lib/company-settings";
import { printQuoteHtml, wrapDocumentPreview } from "@/lib/document-template";
import { renderQuoteHtml, type QuoteDocKind } from "@/lib/quote-document";
import {
  clientAddress,
  computeQuoteTotals,
  newQuoteLine,
  parseQuotePayload,
  quoteLinesReady,
  requiredMinQty,
  resolveQuoteLine,
  stringifyQuotePayload,
  qtyFmt,
  type QuoteLine,
  type QuotePayload,
  type ResolvedQuoteLine,
} from "@/lib/price-calculator";
import type { MockRecord } from "@/lib/types";

const CLIENT_STATUSES = ["Actif", "Prospect", "Inactif"];

export type QuoteFormMode = "calculateur" | "devis-multi";

function quoteSheetHtml(input: {
  kind: QuoteDocKind;
  number: string;
  client: MockRecord;
  settings: CompanySettings;
  rows: ResolvedQuoteLine[];
  discount: number;
  rebate: number;
}) {
  return renderQuoteHtml({
    kind: input.kind,
    number: input.number,
    client: input.client,
    settings: input.settings,
    lines: input.rows.map((item) => ({
      designation: item.designation,
      quantity: item.line.quantity,
      unitPrice: item.breakdown.unitPrice,
      total: item.total,
    })),
    discount: input.discount,
    rebate: input.rebate,
  });
}

function hydrate(record?: MockRecord): QuotePayload {
  return parseQuotePayload(record?.quotePayload) ?? {
    clientId: String(record?.clientId || ""),
    applyDiscount: true,
    lines: [newQuoteLine()],
  };
}

export function PriceCalculatorForm({
  record,
  pending,
  onClose,
  onSubmit,
  mode = "calculateur",
}: {
  record?: MockRecord;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string | number>) => Promise<void>;
  mode?: QuoteFormMode;
}) {
  const isMulti = mode === "devis-multi";
  const { records, createRecord, settings, te, t } = useApp();
  const clients = records["fiches-clients"] ?? [];
  const catalogue = records.catalogue ?? [];
  const initial = hydrate(record);
  const [step, setStep] = useState<1 | 2>(record ? 2 : 1);
  const [clientId, setClientId] = useState(initial.clientId);
  const [applyDiscount, setApplyDiscount] = useState(initial.applyDiscount);
  const [lines, setLines] = useState<QuoteLine[]>(initial.lines.length ? initial.lines : [newQuoteLine()]);
  const [clientQuery, setClientQuery] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [error, setError] = useState("");
  const [outputHtml, setOutputHtml] = useState("");

  const client = clients.find((item) => item.id === clientId);
  const rebate = Number(client?.discount) || 0;
  const resolved = useMemo(() => lines.map((line) => resolveQuoteLine(line, catalogue)), [lines, catalogue]);
  const discountOn = Boolean(client && applyDiscount && rebate > 0);
  const totals = computeQuoteTotals(
    resolved.map((item) => ({ total: item?.total ?? 0 })),
    rebate,
    discountOn,
  );
  const ready = Boolean(client) && quoteLinesReady(resolved);
  const money = (value: number) => formatAmount(value, settings);

  const clientSuggestions = useMemo(() => {
    const needle = clientQuery.trim().toLocaleLowerCase("fr");
    return clients
      .filter((item) => {
        if (!needle) return true;
        return [item.name, item.phone, item.email, item.reference, item.legalName, item.contact].some((value) =>
          String(value || "").toLocaleLowerCase("fr").includes(needle),
        );
      })
      .slice(0, 8);
  }, [clients, clientQuery]);

  function pickClient(next: MockRecord) {
    setClientId(next.id);
    setClientQuery("");
    setClientOpen(false);
    setError("");
  }

  function updateLine(id: string, patch: Partial<QuoteLine>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  function pickProduct(lineId: string, product: MockRecord) {
    if (!isMulti && lines.some((line) => line.id !== lineId && line.productId === product.id)) return;
    const printId = parsePricedOptions(product.printSides)[0]?.id ?? "";
    const paperId = parsePricedOptions(product.paperTypes)[0]?.id ?? "";
    updateLine(lineId, {
      productId: product.id,
      printId,
      paperId,
      extraIds: [],
      quantity: requiredMinQty(product),
    });
  }

  function duplicateLine(line: QuoteLine) {
    const copy: QuoteLine = { ...line, id: crypto.randomUUID(), extraIds: [...line.extraIds] };
    setLines((current) => {
      const index = current.findIndex((item) => item.id === line.id);
      const next = [...current];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function values() {
    const first = resolved.find(Boolean);
    const qty = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
    const summaries = resolved.map((item, index) => {
      if (!item) return "";
      const net = totals.nets[index] ?? item.total;
      return `${item.designation} · ${qtyFmt.format(item.line.quantity)} ex. · ${money(net)}`;
    });
    const title = isMulti
      ? `${first?.product.name || "Devis"} — ${lines.length} option${lines.length > 1 ? "s" : ""} — ${client?.name || ""}`.trim()
      : [first?.product.name, client?.name].filter(Boolean).join(" — ") || "Chiffrage";
    return {
      name: title,
      client: String(client?.name || ""),
      clientId: client?.id || "",
      quantity: qty,
      amount: totals.total,
      status: isMulti ? String(record?.status || "Brouillon") : "Calculé",
      optionA: summaries[0] || "",
      optionB: summaries[1] || "",
      optionC: summaries[2] || "",
      quotePayload: stringifyQuotePayload({ clientId: client?.id || "", applyDiscount, lines }),
    };
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!client) {
      setError(te("Sélectionnez ou créez un client pour continuer."));
      setStep(1);
      return;
    }
    if (!ready) {
      setError(te("Complétez le produit, les options obligatoires et la quantité avant d’enregistrer."));
      setStep(2);
      return;
    }
    setError("");
    await onSubmit(values());
  }

  function openOutput() {
    if (!client || !ready) {
      setError(te(isMulti ? "Le devis n’est pas encore complet." : "Le chiffrage n’est pas encore complet."));
      return;
    }
    setOutputHtml(quoteSheetHtml({
      kind: isMulti ? "devis" : "chiffrage",
      number: String(record?.reference || (isMulti ? "DEV-BROUILLON" : "CHF-BROUILLON")),
      client,
      settings,
      rows: resolved.filter((item): item is NonNullable<typeof item> => Boolean(item)),
      discount: totals.discountAmount,
      rebate: totals.rebate,
    }));
    setError("");
  }

  return (
    <div className="modal-backdrop quote-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-xl quote-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{record ? te("Modification") : isMulti ? te("Nouveau devis") : te("Nouveau chiffrage")}</span>
            <h2>{record ? record.reference : isMulti ? te("Devis multi-options") : te("Calculateur de prix")}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>

        <ol className="quote-steps">
          <li className={step === 1 ? "active" : client ? "done" : ""}>
            <button type="button" onClick={() => setStep(1)}>
              <i>1</i>
              <span>{te("Client")}<small>{te("Fiche, coordonnées, remise")}</small></span>
            </button>
          </li>
          <li className={step === 2 ? "active" : ""}>
            <button type="button" disabled={!client} onClick={() => client && setStep(2)}>
              <i>2</i>
              <span>{te("Produits")}<small>{te(isMulti ? "Même produit possible, options différentes" : "Catalogue, grille, quantité")}</small></span>
            </button>
          </li>
        </ol>

        <form onSubmit={save} className="quote-form">
          <div className="quote-scroll">
          {step === 1 && (
            <div className="quote-step-body">
              {!client && (
                <>
                  <label className="field field-wide">
                    <span>{te("Client")}<b> *</b></span>
                    <div className="seg-autocomplete">
                      <input
                        value={clientQuery}
                        onChange={(event) => {
                          setClientQuery(event.target.value);
                          setClientOpen(true);
                        }}
                        onFocus={() => setClientOpen(true)}
                        onBlur={() => window.setTimeout(() => setClientOpen(false), 180)}
                        placeholder={te("Rechercher un client (nom, téléphone, référence)…")}
                        autoComplete="off"
                        autoFocus
                      />
                      {clientOpen && (
                        <ul className="seg-suggest">
                          {clientSuggestions.length === 0 ? (
                            <li className="muted">{te("Aucun client correspondant.")}</li>
                          ) : clientSuggestions.map((item) => (
                            <li key={item.id}>
                              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => pickClient(item)}>
                                <strong>{item.name}</strong>
                                <small>{te(clientKindOf(item))} · {item.phone || te("Sans téléphone")}</small>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </label>
                  <p className="quote-hint">
                    {te("Le client n’existe pas ?")}{" "}
                    <button type="button" className="text-link" onClick={() => setShowClientForm(true)}>{te("Créer un particulier ou une entreprise")}</button>
                  </p>
                </>
              )}

              {client && (
                <div className="quote-client-card">
                  <div>
                    <strong>{client.name}</strong>
                    <span>{te(clientKindOf(client))} · {client.reference}</span>
                  </div>
                  <dl>
                    <div><dt>{te("Téléphone")}</dt><dd>{client.phone || "—"}</dd></div>
                    <div><dt>{te("Adresse")}</dt><dd>{clientAddress(client) || "—"}</dd></div>
                    <div><dt>{te("E-mail")}</dt><dd>{client.email || "—"}</dd></div>
                  </dl>
                  <DiscountToggle
                    rebate={rebate}
                    apply={applyDiscount}
                    savings={0}
                    money={money}
                    onChange={setApplyDiscount}
                  />
                  <button type="button" className="button button-secondary" onClick={() => { setClientId(""); setClientQuery(""); setClientOpen(true); }}>{te("Changer de client")}</button>
                </div>
              )}
            </div>
          )}

          {step === 2 && client && (
            <div className="quote-step-body">
              <div className="quote-client-strip">
                <div>
                  <strong>{client.name}</strong>
                  <span>{[client.phone, clientAddress(client)].filter(Boolean).join(" · ")}</span>
                </div>
                <DiscountToggle
                  rebate={rebate}
                  apply={applyDiscount}
                  savings={Math.round(totals.subtotal * (rebate / 100))}
                  money={money}
                  onChange={setApplyDiscount}
                />
              </div>
              {lines.map((line, index) => (
                <QuoteProductCard
                  key={line.id}
                  index={index}
                  line={line}
                  catalogue={catalogue}
                  resolved={resolved[index]}
                  money={money}
                  canRemove={lines.length > 1}
                  applyDiscount={discountOn}
                  rebate={rebate}
                  netTotal={totals.nets[index] ?? resolved[index]?.total ?? 0}
                  lineDiscount={Math.max(0, (resolved[index]?.total ?? 0) - (totals.nets[index] ?? resolved[index]?.total ?? 0))}
                  lineLabel={isMulti ? te("Option") : te("Produit")}
                  excludeProductIds={isMulti ? [] : lines.filter((item) => item.id !== line.id).map((item) => item.productId).filter(Boolean)}
                  onChange={(patch) => updateLine(line.id, patch)}
                  onPick={(product) => pickProduct(line.id, product)}
                  onDuplicate={isMulti ? () => duplicateLine(line) : undefined}
                  onRemove={() => setLines((current) => current.filter((item) => item.id !== line.id))}
                />
              ))}
              <button type="button" className="add-row-button" onClick={() => setLines((current) => [...current, newQuoteLine()])}>
                <Plus size={16} /> {isMulti ? te("Ajouter une option") : te("Ajouter un produit")}
              </button>
              {isMulti && (
                <p className="quote-hint">{te("Reprenez le même produit autant de fois que nécessaire, en changeant quantité, papier ou finitions.")}</p>
              )}

              <div className="quote-totals">
                <div><span>{te("Sous-total")}</span><b>{money(totals.subtotal)}</b></div>
                {rebate > 0 && applyDiscount && totals.discountAmount > 0 && (
                  <div><span>{t("conv.rebateLine", "Remise client {n} %", { n: totals.rebate })}</span><b>− {money(totals.discountAmount)}</b></div>
                )}
                {rebate > 0 && !applyDiscount && (
                  <div className="quote-totals-muted"><span>{t("quote.rebateOff", "Remise {n} % non appliquée", { n: rebate })}</span><b>{money(Math.round(totals.subtotal * (rebate / 100)))}</b></div>
                )}
                <div className="quote-grand"><span>{te("Total")}</span><strong>{money(totals.total)}</strong></div>
              </div>
            </div>
          )}

          </div>

          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions quote-actions">
            {step === 2 && <button type="button" className="button button-secondary" onClick={() => setStep(1)}>{te("Retour")}</button>}
            <button type="button" className="button button-secondary" onClick={onClose}>{te("Annuler")}</button>
            {step === 1 ? (
              <button type="button" className="button button-primary" disabled={!client} onClick={() => setStep(2)}>
                {te("Continuer")}
              </button>
            ) : (
              <>
                {ready && (
                  <button type="button" className="button button-secondary" onClick={openOutput}>
                    <Printer size={17} /> {te("Imprimer / PDF")}
                  </button>
                )}
                <button className="button button-primary" disabled={pending || !ready}>
                  {pending ? <><LoaderCircle className="spin" size={17} /> {te("Enregistrement…")}</> : <><Check size={17} /> {te("Enregistrer")}</>}
                </button>
              </>
            )}
          </div>
        </form>
      </div>

      {showClientForm && (
        <ClientForm
          pending={creatingClient}
          statuses={CLIENT_STATUSES}
          onClose={() => setShowClientForm(false)}
          onSubmit={async (next) => {
            setCreatingClient(true);
            try {
              const created = await createRecord("fiches-clients", next);
              pickClient(created);
              setShowClientForm(false);
            } finally {
              setCreatingClient(false);
            }
          }}
        />
      )}

      {outputHtml && (
        <QuoteOutputDialog
          html={outputHtml}
          documentTitle={String(record?.reference || (isMulti ? "Devis" : "Chiffrage"))}
          onClose={() => setOutputHtml("")}
        />
      )}
    </div>
  );
}

export function DiscountToggle({
  rebate,
  apply,
  savings,
  money,
  onChange,
}: {
  rebate: number;
  apply: boolean;
  savings: number;
  money: (value: number) => string;
  onChange: (next: boolean) => void;
}) {
  const { te, t } = useApp();
  if (rebate <= 0) {
    return (
      <div className="quote-discount is-empty">
        <span className="quote-discount-icon"><Percent size={18} /></span>
        <span>
          <strong>{te("Aucune remise client")}</strong>
          <small>{te("Cette fiche n’a pas de pourcentage de remise.")}</small>
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`quote-discount ${apply ? "is-on" : ""}`}
      role="switch"
      aria-checked={apply}
      onClick={() => onChange(!apply)}
    >
      <span className="quote-switch" aria-hidden="true"><i /></span>
      <span>
        <strong>{t("quote.rebateOn", "Remise client {n} %", { n: rebate })}</strong>
        <small>
          {apply
            ? (savings > 0 ? t("quote.appliedSave", "Appliquée · − {amount} sur ce chiffrage", { amount: money(savings) }) : te("Appliquée sur le total des produits"))
            : (savings > 0 ? t("quote.possibleSave", "Inactive · économie possible {amount}", { amount: money(savings) }) : te("Cliquez pour l’appliquer au chiffrage"))}
        </small>
      </span>
    </button>
  );
}

export function QuoteProductCard({
  index,
  line,
  catalogue,
  resolved,
  money,
  canRemove,
  applyDiscount,
  rebate,
  netTotal,
  lineDiscount,
  lineLabel,
  excludeProductIds,
  onChange,
  onPick,
  onDuplicate,
  onRemove,
}: {
  index: number;
  line: QuoteLine;
  catalogue: MockRecord[];
  resolved: ReturnType<typeof resolveQuoteLine>;
  money: (value: number) => string;
  canRemove: boolean;
  applyDiscount: boolean;
  rebate: number;
  netTotal: number;
  lineDiscount: number;
  lineLabel: string;
  excludeProductIds: string[];
  onChange: (patch: Partial<QuoteLine>) => void;
  onPick: (product: MockRecord) => void;
  onDuplicate?: () => void;
  onRemove: () => void;
}) {
  const { te, t } = useApp();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const product = resolved?.product;
  const suggestions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    const blocked = new Set(excludeProductIds);
    return catalogue
      .filter((item) => item.status !== "Archivé")
      .filter((item) => !blocked.has(item.id))
      .filter((item) => {
        if (!needle) return true;
        return [item.name, item.family, item.designation, item.reference].some((value) =>
          String(value || "").toLocaleLowerCase("fr").includes(needle),
        );
      })
      .slice(0, 8);
  }, [catalogue, query, excludeProductIds]);

  return (
    <article className="quote-product">
      <header>
        <strong>{lineLabel} {index + 1}</strong>
        <div className="quote-product-tools">
          {onDuplicate && product && (
            <button type="button" className="icon-button" onClick={onDuplicate} aria-label={te("Dupliquer cette option")} title={te("Dupliquer avec d’autres options")}>
              <Copy size={16} />
            </button>
          )}
          {canRemove && (
            <button type="button" className="icon-button" onClick={onRemove} aria-label={`Retirer ${lineLabel.toLowerCase()} ${index + 1}`}><Trash2 size={16} /></button>
          )}
        </div>
      </header>
      <div className="field field-wide">
        <span>{te("Produit")}<b> *</b></span>
        {product ? (
          <div className="quote-picked">
            <strong>{product.name}</strong>
            <button type="button" className="button button-secondary" onClick={() => { onChange({ productId: "", printId: "", paperId: "", extraIds: [], quantity: 0 }); setQuery(""); setOpen(true); }}>{te("Changer")}</button>
          </div>
        ) : (
          <div className="seg-autocomplete">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 180)}
              placeholder={te("Saisir un produit, ex. flyers…")}
              autoComplete="off"
            />
            {open && (
              <ul className="seg-suggest">
                {suggestions.length === 0 ? (
                  <li className="muted">{te("Aucun produit du catalogue.")}</li>
                ) : suggestions.map((item) => (
                  <li key={item.id}>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onPick(item); setQuery(""); setOpen(false); }}>
                      <strong>{item.name}</strong>
                      <small>{item.family} · min. {qtyFmt.format(requiredMinQty(item))} ex.</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {resolved && product && (
        <div className="quote-product-body">
          <div className="quote-product-main">
            <dl className="quote-meta">
              <div><dt>{te("Famille")}</dt><dd>{product.family || "—"}</dd></div>
              <div><dt>{te("Prix de base")}</dt><dd>{money(Number(product.basePrice) || 0)}</dd></div>
              <div className="wide"><dt>{te("Désignation complète")}</dt><dd>{product.designation || "—"}</dd></div>
              <div><dt>{te("Quantité minimum")}</dt><dd>{qtyFmt.format(resolved.requiredMin)} ex.</dd></div>
              <div><dt>{te("Statut")}</dt><dd>{te(product.status)}</dd></div>
            </dl>

            {resolved.prints.length > 0 && (
              <fieldset className="quote-options">
                <legend>{te("Nombre de côtés imprimés")}<b> *</b></legend>
                {resolved.prints.map((item) => (
                  <label key={item.id} className={line.printId === item.id ? "is-picked" : ""}>
                    <input
                      type="radio"
                      name={`print-${line.id}`}
                      checked={line.printId === item.id}
                      onChange={() => onChange({ printId: item.id })}
                    />
                    <span>{item.label}</span>
                    <b>{money(item.price)}</b>
                  </label>
                ))}
              </fieldset>
            )}

            {resolved.papers.length > 0 && (
              <fieldset className="quote-options">
                <legend>{te("Type de papier")}<b> *</b></legend>
                {resolved.papers.map((item) => (
                  <label key={item.id} className={line.paperId === item.id ? "is-picked" : ""}>
                    <input
                      type="radio"
                      name={`paper-${line.id}`}
                      checked={line.paperId === item.id}
                      onChange={() => onChange({ paperId: item.id })}
                    />
                    <span>{item.label}</span>
                    <b>{money(item.price)}</b>
                  </label>
                ))}
              </fieldset>
            )}

            {resolved.extraOptions.length > 0 && (
              <fieldset className="quote-options">
                <legend>{te("Options supplémentaires")}</legend>
                {resolved.extraOptions.map((item) => {
                  const checked = line.extraIds.includes(item.id);
                  return (
                    <label key={item.id} className={checked ? "is-picked" : ""}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onChange({
                          extraIds: checked
                            ? line.extraIds.filter((id) => id !== item.id)
                            : [...line.extraIds, item.id],
                        })}
                      />
                      <span>{item.label}</span>
                      <b>{money(item.price)}</b>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </div>

          <aside className="quote-product-side">
            <div className="quote-grid-card">
              <strong>{te("Grille tarifaire")}</strong>
              {resolved.breakdown.hasGrid ? (
                <ul>
                  {resolved.breakdown.tiers.map((tier) => {
                    const active = resolved.breakdown.matched?.quantity === tier.quantity;
                    return (
                      <li key={`${tier.quantity}-${tier.amount}`} className={active ? "is-active" : ""}>
                        <span>{t("quote.fromQty", "À partir de {qty} ex.", { qty: qtyFmt.format(tier.quantity) })}</span>
                        <b>{money(tier.amount)}</b>
                        <small>{money(tier.quantity ? tier.amount / tier.quantity : 0)} / ex.</small>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>{te("Aucune grille : le prix de base est proratisé selon la quantité minimum.")}</p>
              )}
            </div>

            <label className="field">
              <span>{te("Quantité commandée")}<b> *</b></span>
              <input
                inputMode="numeric"
                min={resolved.requiredMin}
                value={line.quantity || ""}
                onChange={(event) => onChange({ quantity: Number(event.target.value.replace(/\s/g, "").replace(",", ".")) || 0 })}
              />
              <small className="quote-qty-help">{t("quote.minHelp", "Minimum {qty} ex. (produit + premier palier).", { qty: qtyFmt.format(resolved.requiredMin) })}</small>
            </label>

            {resolved.warning && <p className="quote-warn">{resolved.warning}</p>}
            {resolved.hint && !resolved.warning && <p className="quote-hint-ok">{resolved.hint}</p>}

            <dl className="quote-breakdown">
              <div><dt>{te("Impression (grille)")}</dt><dd>{money(resolved.breakdown.job)}</dd></div>
              {resolved.paper && <div><dt>Papier · {resolved.paper.label}</dt><dd>{money(resolved.breakdown.paperAmount)}</dd></div>}
              {resolved.breakdown.extrasDetail.map((item) => (
                <div key={item.label}><dt>{item.label}</dt><dd>{money(item.amount)}</dd></div>
              ))}
              {resolved.breakdown.unitPrice > 0 && (
                <div>
                  <dt>{te("Prix unitaire palier")}</dt>
                  <dd>
                    {applyDiscount && rebate > 0
                      ? money(resolved.breakdown.unitPrice * (1 - rebate / 100))
                      : money(resolved.breakdown.unitPrice)}
                  </dd>
                </div>
              )}
              {applyDiscount && lineDiscount > 0 && (
                <>
                  <div><dt>Sous-total ligne</dt><dd>{money(resolved.total)}</dd></div>
                  <div className="is-discount"><dt>Remise client {rebate} %</dt><dd>− {money(lineDiscount)}</dd></div>
                </>
              )}
              <div className="quote-line-total"><dt>Montant de la ligne</dt><dd>{money(applyDiscount ? netTotal : resolved.total)}</dd></div>
            </dl>
          </aside>
        </div>
      )}
    </article>
  );
}

export function QuoteOutputDialog({
  html,
  documentTitle,
  hint,
  onClose,
}: {
  html: string;
  documentTitle: string;
  hint?: string;
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
    printQuoteHtml(html, asPdf ? `${documentTitle}.pdf` : documentTitle);
  }

  return (
    <div className="modal-backdrop designer-preview-backdrop quote-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="quote-output is-invoice" role="dialog" aria-modal="true" aria-labelledby="quote-output-title">
        <div className="designer-preview-head">
          <div>
            <span className="panel-kicker">{te("Document A4")}</span>
            <h2 id="quote-output-title">{documentTitle}</h2>
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
        <p className="quote-pdf-hint">{hint || te("Aperçu A4 aux couleurs NanoPrint. Pour le PDF, choisissez « Enregistrer au format PDF » dans la boîte d’impression.")}</p>
        <div className="quote-output-body">
          <div className="quote-output-preview">
            <iframe className="quote-output-frame" title={`Aperçu ${documentTitle}`} sandbox="" srcDoc={wrapDocumentPreview(html)} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuoteDetail({ record, kind = "chiffrage" }: { record: MockRecord; kind?: QuoteDocKind }) {
  const { records, settings } = useApp();
  const [outputHtml, setOutputHtml] = useState("");
  const clients = records["fiches-clients"] ?? [];
  const catalogue = records.catalogue ?? [];
  const payload = parseQuotePayload(record.quotePayload);
  const client = clients.find((item) => item.id === String(payload?.clientId || record.clientId || ""))
    ?? clients.find((item) => item.name === record.client);
  const resolved = (payload?.lines ?? []).map((line) => resolveQuoteLine(line, catalogue));
  const rebate = Number(client?.discount) || 0;
  const discountOn = Boolean(payload?.applyDiscount && rebate > 0);
  const totals = computeQuoteTotals(
    resolved.map((item) => ({ total: item?.total ?? 0 })),
    rebate,
    discountOn,
  );

  function openOutput() {
    if (!client) return;
    const rows = resolved.filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (!rows.length) return;
    setOutputHtml(quoteSheetHtml({
      kind,
      number: record.reference,
      client,
      settings,
      rows,
      discount: totals.discountAmount,
      rebate: totals.rebate,
    }));
  }

  return (
    <>
      <dl>
        <div><dt>Référence</dt><dd>{record.reference}</dd></div>
        <div><dt>Client</dt><dd>{client?.name || record.client || "—"}</dd></div>
        <div><dt>Téléphone</dt><dd>{client?.phone || "—"}</dd></div>
        <div><dt>Quantité</dt><dd>{new Intl.NumberFormat("fr-FR").format(Number(record.quantity) || 0)}</dd></div>
        <div><dt>Montant</dt><dd>{formatAmount(Number(record.amount) || totals.total, settings)}</dd></div>
      </dl>
      {resolved.some(Boolean) && (
        <ul className="quote-detail-lines">
          {resolved.map((item, index) => item && (
            <li key={item.line.id}>
              <span>{item.designation}</span>
              <b>{formatAmount(discountOn ? (totals.nets[index] ?? item.total) : item.total, settings)}</b>
            </li>
          ))}
        </ul>
      )}
      {client && quoteLinesReady(resolved) && (
        <button type="button" className="button button-secondary" onClick={openOutput}>
          <Printer size={16} /> Imprimer / PDF
        </button>
      )}
      {outputHtml && (
        <QuoteOutputDialog
          html={outputHtml}
          documentTitle={record.reference}
          onClose={() => setOutputHtml("")}
        />
      )}
    </>
  );
}
