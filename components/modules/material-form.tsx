"use client";

import { useMemo, useState } from "react";
import { Check, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { formatAmount, type CompanySettings } from "@/lib/company-settings";
import { materialStockStatus, materialStockValue } from "@/lib/materials";
import { useApp } from "@/components/providers/app-provider";
import type { FeatureDefinition, MockRecord } from "@/lib/types";

function parseMoney(raw: string) {
  const value = Number(String(raw).replace(",", "."));
  return Number.isFinite(value) ? value : NaN;
}

export function MaterialForm({
  feature,
  record,
  pending,
  onClose,
  onSubmit,
}: {
  feature: FeatureDefinition;
  record?: MockRecord;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string | number>) => Promise<void>;
}) {
  const { te } = useApp();
  const [error, setError] = useState("");
  const [name, setName] = useState(String(record?.name ?? ""));
  const [type, setType] = useState(String(record?.type ?? "Papier"));
  const [unit, setUnit] = useState(String(record?.unit ?? "rame"));
  const [buyPrice, setBuyPrice] = useState(String(record?.buyPrice ?? ""));
  const [sellPrice, setSellPrice] = useState(String(record?.sellPrice ?? ""));
  const [alertQty, setAlertQty] = useState(String(record?.alertQty ?? "0"));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const label = name.trim();
    if (!label) {
      setError(te("Le libellé est obligatoire."));
      return;
    }
    if (!type.trim()) {
      setError(te("Choisissez ou créez un type de matière."));
      return;
    }
    if (!unit.trim()) {
      setError(te("Choisissez ou créez une unité."));
      return;
    }
    const buy = parseMoney(buyPrice);
    const sell = parseMoney(sellPrice);
    const alert = parseMoney(alertQty);
    if (!Number.isFinite(buy) || buy < 0) {
      setError(te("Saisissez un prix d’achat valide."));
      return;
    }
    if (!Number.isFinite(sell) || sell < 0) {
      setError(te("Saisissez un prix de vente valide."));
      return;
    }
    if (!Number.isFinite(alert) || alert < 0) {
      setError(te("La quantité d’alerte ne peut pas être négative."));
      return;
    }
    setError("");
    await onSubmit({
      name: label,
      type: type.trim(),
      unit: unit.trim(),
      buyPrice: buy,
      sellPrice: sell,
      quantity: 0,
      alertQty: alert,
      value: 0,
      status: materialStockStatus(0, alert),
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{record ? te("Modification") : te("Création")}</span>
            <h2 id="record-modal-title">{record ? te("Modifier la matière") : feature.createLabel}</h2>
          </div>
          <button onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field field-wide">
              <span>{te("Libellé")}<b> *</b></span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={te("Ex. Couché brillant 135 g — 70×100")} />
            </label>
            <ManagedListField
              label="Type"
              hint="Papier, encre, plaque… Ajoutez un type s’il n’existe pas."
              kind="type"
              value={type}
              onChange={setType}
              required
            />
            <ManagedListField
              label="Unité"
              hint="Rame, kg, plaque… Ajoutez une unité au besoin."
              kind="unit"
              value={unit}
              onChange={setUnit}
              required
            />
            <label className="field">
              <span>{te("Prix d’achat")}<b> *</b></span>
              <input type="number" min={0} step="1" value={buyPrice} onChange={(event) => setBuyPrice(event.target.value)} />
            </label>
            <label className="field">
              <span>{te("Prix de vente")}<b> *</b></span>
              <input type="number" min={0} step="1" value={sellPrice} onChange={(event) => setSellPrice(event.target.value)} />
            </label>
            <label className="field">
              <span>{te("Stock")}</span>
              <input type="number" value="0" disabled readOnly title={te("Le stock n’est pas saisi ici")} />
            </label>
            <label className="field">
              <span>{te("Quantité d’alerte")}<b> *</b></span>
              <input type="number" min={0} step="1" value={alertQty} onChange={(event) => setAlertQty(event.target.value)} />
            </label>
          </div>
          <p className="settings-hint">{te("Le stock reste à 0 sur cette fiche : il n’est pas modifié ici. Le statut se calcule d’après le stock et la quantité d’alerte.")}</p>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>{te("Annuler")}</button>
            <button className="button button-primary" disabled={pending}>
              {pending ? <><LoaderCircle className="spin" size={17} /> {te("Enregistrement…")}</> : <><Check size={17} /> {te("Enregistrer")}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManagedListField({
  label,
  hint,
  kind,
  value,
  onChange,
  required,
}: {
  label: string;
  hint: string;
  kind: "type" | "unit";
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
}) {
  const {
    materialTypes, materialUnits,
    addMaterialType, renameMaterialType, deleteMaterialType,
    addMaterialUnit, renameMaterialUnit, deleteMaterialUnit, te,
  } = useApp();
  const options = kind === "type" ? materialTypes : materialUnits;
  const add = kind === "type" ? addMaterialType : addMaterialUnit;
  const rename = kind === "type" ? renameMaterialType : renameMaterialUnit;
  const remove = kind === "type" ? deleteMaterialType : deleteMaterialUnit;
  const [mode, setMode] = useState<"idle" | "add" | "edit">("idle");
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState("");
  const list = useMemo(() => [...new Set([...options, ...(value ? [value] : [])])], [options, value]);
  const canDelete = list.length > 1;

  function closeEditor() {
    setMode("idle");
    setDraft("");
    setLocalError("");
  }

  function save() {
    const labelValue = draft.trim();
    if (!labelValue) {
      setLocalError(te(kind === "type" ? "Saisissez un type." : "Saisissez une unité."));
      return;
    }
    if (mode === "edit") {
      onChange(rename(value, labelValue));
    } else {
      add(labelValue);
      onChange(labelValue);
    }
    closeEditor();
  }

  function drop() {
    if (!canDelete) return;
    const fallback = remove(value);
    onChange(fallback || "");
    closeEditor();
  }

  return (
    <div className="field">
      <span>{te(label)}{required && <b> *</b>}</span>
      <div className="family-select-row">
        <select value={value} onChange={(event) => { onChange(event.target.value); closeEditor(); }}>
          {list.map((item) => <option key={item}>{item}</option>)}
        </select>
        <button type="button" className="icon-button" title={te(kind === "type" ? "Ajouter un type" : "Ajouter une unité")} onClick={() => { setMode("add"); setDraft(""); setLocalError(""); }}><Plus size={17} /></button>
        <button type="button" className="icon-button" title={te("Renommer")} disabled={!value} onClick={() => { setMode("edit"); setDraft(value); setLocalError(""); }}><Pencil size={16} /></button>
        <button type="button" className="icon-button danger" title={canDelete ? te("Supprimer") : te("Au moins une valeur est requise")} disabled={!canDelete} onClick={drop}><Trash2 size={16} /></button>
      </div>
      <small className="settings-hint" style={{ margin: "6px 0 0" }}>{te(hint)}</small>
      {mode !== "idle" && (
        <div className="inline-add">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); save(); } }}
            placeholder={te(mode === "edit" ? "Nouveau nom" : kind === "type" ? "Nouveau type (ex. Carton)" : "Nouvelle unité (ex. palette)")}
          />
          <button type="button" className="button button-primary" onClick={save}>{mode === "edit" ? te("Enregistrer") : te("Ajouter")}</button>
          <button type="button" className="button button-secondary" onClick={closeEditor}>{te("Annuler")}</button>
        </div>
      )}
      {localError && <div className="form-error" role="alert">{localError}</div>}
    </div>
  );
}

export function MaterialDetail({ record, settings }: { record: MockRecord; settings: CompanySettings }) {
  const { te, locale } = useApp();
  const money = (amount: number) => formatAmount(amount, settings);
  const qty = new Intl.NumberFormat(locale === "en" ? "en-GB" : locale === "es" ? "es-ES" : "fr-FR");
  const stock = Number(record.quantity) || 0;
  const alert = Number(record.alertQty) || 0;
  const buy = Number(record.buyPrice) || 0;

  return (
    <dl>
      <div><dt>{te("Référence")}</dt><dd>{record.reference}</dd></div>
      <div><dt>{te("Libellé")}</dt><dd>{record.name}</dd></div>
      <div><dt>{te("Type")}</dt><dd>{record.type || "—"}</dd></div>
      <div><dt>{te("Unité")}</dt><dd>{record.unit || "—"}</dd></div>
      <div><dt>{te("Prix d’achat")}</dt><dd>{money(buy)}</dd></div>
      <div><dt>{te("Prix de vente")}</dt><dd>{money(Number(record.sellPrice) || 0)}</dd></div>
      <div><dt>{te("Stock")}</dt><dd>{qty.format(stock)} {record.unit || ""}</dd></div>
      <div><dt>{te("Quantité d’alerte")}</dt><dd>{qty.format(alert)} {record.unit || ""}</dd></div>
      <div><dt>{te("Valeur du stock")}</dt><dd>{money(Number(record.value) || materialStockValue(stock, buy))}</dd></div>
    </dl>
  );
}
