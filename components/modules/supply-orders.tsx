"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileDown, LoaderCircle, Printer, Trash2, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { formatAmount } from "@/lib/company-settings";
import { printQuoteHtml, wrapDocumentPreview } from "@/lib/document-template";
import { renderSupplyDeliveryHtml } from "@/lib/supply-document";
import {
  addMaterialToCart,
  materialStock,
  setCartQuantity,
  supplyBlockReason,
  supplyLineTotal,
  supplyTotals,
  type SupplyLine,
} from "@/lib/supply";
import type { MockRecord } from "@/lib/types";

const qtyFmt = new Intl.NumberFormat("fr-FR");

function DeliveryPreview({
  html,
  title,
  onClose,
}: {
  html: string;
  title: string;
  onClose: () => void;
}) {
  const { te } = useApp();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop designer-preview-backdrop quote-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="quote-output is-invoice" role="dialog" aria-modal="true" aria-labelledby="supply-bl-title">
        <div className="designer-preview-head">
          <div>
            <span className="panel-kicker">{te("Document A4")}</span>
            <h2 id="supply-bl-title">{te("Bon de livraison")} {title}</h2>
          </div>
          <div className="heading-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>{te("Fermer")}</button>
            <button type="button" className="button button-secondary" onClick={() => printQuoteHtml(html, `BL ${title}`)}>
              <Printer size={16} /> {te("Imprimer")}
            </button>
            <button type="button" className="button button-primary" onClick={() => printQuoteHtml(html, `BL-${title}.pdf`)}>
              <FileDown size={16} /> {te("Générer le PDF")}
            </button>
          </div>
        </div>
        <p className="quote-pdf-hint">{te("Imprimé de valeur de l’approvisionnement. Les prix d’achat ne sont pas modifiables.")}</p>
        <div className="quote-output-body">
          <div className="quote-output-preview">
            <iframe className="quote-output-frame" title={`Aperçu BL ${title}`} sandbox="" srcDoc={wrapDocumentPreview(html)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchSelect({
  label,
  required,
  value,
  query,
  onQuery,
  placeholder,
  items,
  emptyLabel,
  onPick,
  onClear,
}: {
  label: string;
  required?: boolean;
  value?: MockRecord;
  query: string;
  onQuery: (value: string) => void;
  placeholder: string;
  items: { item: MockRecord; hint: string }[];
  emptyLabel: string;
  onPick: (item: MockRecord) => void;
  onClear?: () => void;
}) {
  const { te } = useApp();
  const [open, setOpen] = useState(false);
  const shown = value && !open ? value.name : query;

  return (
    <label className="field">
      <span>{label}{required ? <b> *</b> : null}</span>
      <div className="seg-autocomplete">
        <input
          value={shown}
          onChange={(event) => {
            onQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 180)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        {value && (
          <button type="button" className="supply-clear" onMouseDown={(event) => event.preventDefault()} onClick={onClear} aria-label={te("Effacer")}>
            <X size={15} />
          </button>
        )}
        {open && (
          <ul className="seg-suggest">
            {items.length === 0 ? (
              <li className="muted">{emptyLabel}</li>
            ) : items.map(({ item, hint }) => (
              <li key={item.id}>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onPick(item); setOpen(false); }}>
                  <strong>{item.name}</strong>
                  <small>{hint}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </label>
  );
}

export function SupplyOrders() {
  const { records, settings, validateSupply, te, t } = useApp();
  const suppliers = records.fournisseurs ?? [];
  const materials = records.matieres ?? [];
  const [supplierId, setSupplierId] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [materialQuery, setMaterialQuery] = useState("");
  const [lines, setLines] = useState<SupplyLine[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<{ html: string; title: string } | null>(null);
  const money = (amount: number) => formatAmount(amount, settings);

  const supplier = suppliers.find((item) => item.id === supplierId);
  const cartTotals = supplyTotals(lines, settings);
  const block = supplyBlockReason(supplierId, lines, suppliers, materials);

  const supplierChoices = useMemo(() => {
    const needle = supplierQuery.trim().toLocaleLowerCase("fr");
    return suppliers
      .filter((item) => {
        if (!needle) return true;
        return [item.name, item.phone, item.email, item.reference].some((value) =>
          String(value || "").toLocaleLowerCase("fr").includes(needle),
        );
      })
      .slice(0, 12)
      .map((item) => ({
        item,
        hint: [item.phone, item.address].filter(Boolean).join(" · ") || item.reference,
      }));
  }, [suppliers, supplierQuery]);

  const materialChoices = useMemo(() => {
    const needle = materialQuery.trim().toLocaleLowerCase("fr");
    return materials
      .filter((item) => {
        if (!needle) return true;
        return [item.name, item.type, item.unit, item.reference].some((value) =>
          String(value || "").toLocaleLowerCase("fr").includes(needle),
        );
      })
      .slice(0, 12)
      .map((item) => {
        const stock = Math.max(0, Number(item.quantity) || 0);
        const unit = String(item.unit || "u");
        return {
          item,
          hint: `Stock ${qtyFmt.format(stock)} ${unit}`,
        };
      });
  }, [materials, materialQuery]);

  function stockOf(materialId: string) {
    return materialStock(materials.find((item) => item.id === materialId));
  }

  function sellPriceOf(line: SupplyLine) {
    const material = materials.find((item) => item.id === line.materialId);
    return line.sellPrice || Math.max(0, Math.round(Number(material?.sellPrice) || 0));
  }

  function pickSupplier(item: MockRecord) {
    setSupplierId(item.id);
    setSupplierQuery(item.name);
    setError("");
  }

  function pickMaterial(item: MockRecord) {
    const stock = materialStock(item);
    const existing = lines.find((line) => line.materialId === item.id);
    const unit = String(item.unit || "u");
    setMaterialQuery("");
    if (stock < 1) {
      setError(t("supply.outOfStock", "« {name} » est en rupture. Impossible de l’ajouter.", { name: item.name }));
      return;
    }
    if (existing && existing.quantity >= stock) {
      setError(t("supply.qtyMax", "La quantité ne peut pas dépasser le stock ({qty} {unit}).", { qty: qtyFmt.format(stock), unit }));
      return;
    }
    setLines((current) => addMaterialToCart(current, item));
    setError("");
  }

  function clearForm() {
    setLines([]);
    setMaterialQuery("");
    setError("");
  }

  async function validate() {
    if (block) {
      setError(te(block));
      return;
    }
    setPending(true);
    setError("");
    try {
      const created = await validateSupply({ supplierId, lines });
      if (!created) {
        setError(te("La validation a échoué."));
        return;
      }
      const party = suppliers.find((item) => item.id === supplierId);
      const createdLines = lines;
      setLines([]);
      setMaterialQuery("");
      setPreview({
        html: renderSupplyDeliveryHtml(created, party, settings, createdLines),
        title: created.reference,
      });
    } catch {
      setError(te("La validation a échoué. Réessayez."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="supply-page">
      {error && <p className="form-error" role="alert">{error}</p>}

      {!suppliers.length ? (
        <div className="empty-state">
          <h3>{te("Aucun fournisseur")}</h3>
          <p>{te("Créez d’abord une fiche fournisseur.")}</p>
          <Link className="button button-primary" href="/admin/achats/fournisseurs">{te("Ouvrir les fournisseurs")}</Link>
        </div>
      ) : !materials.length ? (
        <div className="empty-state">
          <h3>{te("Aucune matière")}</h3>
          <p>{te("Le catalogue matières est vide.")}</p>
          <Link className="button button-primary" href="/admin/configuration/matieres">{te("Ouvrir les matières")}</Link>
        </div>
      ) : (
        <section className="data-section">
          <div className="supply-pickers">
            <SearchSelect
              label={te("Fournisseur")}
              required
              value={supplier}
              query={supplierQuery}
              onQuery={(value) => {
                setSupplierQuery(value);
                if (supplier && value !== supplier.name) setSupplierId("");
              }}
              placeholder={te("Rechercher un fournisseur…")}
              items={supplierChoices}
              emptyLabel={te("Aucun fournisseur correspondant.")}
              onPick={pickSupplier}
              onClear={() => {
                setSupplierId("");
                setSupplierQuery("");
              }}
            />
            <SearchSelect
              label={te("Produit")}
              required
              query={materialQuery}
              onQuery={setMaterialQuery}
              placeholder={te("Rechercher une matière première…")}
              items={materialChoices}
              emptyLabel={te("Aucune matière correspondante.")}
              onPick={pickMaterial}
            />
          </div>

          {lines.length === 0 ? (
            <p className="settings-hint">{te("Choisissez une matière : elle s’ajoute avec le prix d’achat, le prix de vente et le stock actuel.")}</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table supply-cart">
                <thead>
                  <tr>
                    <th>{te("Matière")}</th>
                    <th>{te("PA")}</th>
                    <th>{te("PV")}</th>
                    <th>{te("Qté")}</th>
                    <th>{te("Total")}</th>
                    <th><span className="sr-only">{te("Retirer")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const stock = stockOf(line.materialId);
                    return (
                      <tr key={line.id}>
                        <td>
                          <strong>{line.label}</strong>
                          <small className="supply-stock">Stock {qtyFmt.format(stock)} {line.unit || "u"}</small>
                        </td>
                        <td className="is-muted">{money(line.unitPrice)}</td>
                        <td className="is-muted">{money(sellPriceOf(line))}</td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            max={stock}
                            step={1}
                            value={line.quantity}
                            aria-label={`Quantité ${line.label}, stock ${stock}`}
                            onChange={(event) => {
                              const next = Number(event.target.value);
                              if (next > stock) {
                                setError(t("supply.qtyMax", "La quantité ne peut pas dépasser le stock ({qty} {unit}).", { qty: qtyFmt.format(stock), unit: line.unit || "u" }));
                              } else {
                                setError("");
                              }
                              setLines((current) => setCartQuantity(current, line.id, next, stock));
                            }}
                          />
                        </td>
                        <td><b>{money(supplyLineTotal(line))}</b></td>
                        <td>
                          <button type="button" className="icon-button danger" title={te("Retirer")} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <dl className="supply-totals">
            <div className="is-total"><dt>{te("Total général")}</dt><dd>{money(cartTotals.total)}</dd></div>
          </dl>

          <div className="modal-actions" style={{ paddingTop: 8 }}>
            <button type="button" className="button button-secondary" onClick={clearForm}>{te("Vider")}</button>
            <button type="button" className="button button-primary" disabled={pending || Boolean(block)} onClick={() => void validate()}>
              {pending ? <><LoaderCircle className="spin" size={17} /> {te("Validation…")}</> : <><Printer size={17} /> {te("Valider et éditer le BL")}</>}
            </button>
          </div>
        </section>
      )}

      {preview && (
        <DeliveryPreview html={preview.html} title={preview.title} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
