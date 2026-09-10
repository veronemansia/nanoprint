"use client";

import { useState } from "react";
import { Check, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import {
  newQuantityTier,
  parseQuantityTiers,
  stringifyQuantityTiers,
  type QuantityTier,
} from "@/lib/catalogue";
import { useApp } from "@/components/providers/app-provider";
import type { MockRecord } from "@/lib/types";

function tiersFromRecord(record: MockRecord): QuantityTier[] {
  const parsed = parseQuantityTiers(record.priceGrid).map((item) => ({
    ...item,
    id: item.id || crypto.randomUUID(),
  }));
  if (parsed.length) return parsed;
  return [newQuantityTier(Number(record.minQuantity) || 100, Number(record.basePrice) || 0)];
}

export function TarifGridForm({
  record,
  pending,
  onClose,
  onSubmit,
}: {
  record: MockRecord;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string | number>) => Promise<void>;
}) {
  const { te } = useApp();
  const [error, setError] = useState("");
  const [tiers, setTiers] = useState<QuantityTier[]>(() => tiersFromRecord(record));

  function updateRow(id: string, patch: Partial<QuantityTier>) {
    setTiers((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const valid = tiers.filter((item) => Number(item.quantity) > 0);
    if (!valid.length) {
      setError(te("Ajoutez au moins un palier (quantité + montant)."));
      return;
    }
    if (valid.some((item) => Number(item.amount) < 0)) {
      setError(te("Les montants ne peuvent pas être négatifs."));
      return;
    }
    await onSubmit({ priceGrid: stringifyQuantityTiers(valid) });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="tarif-modal-title">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{te("Grille tarifaire")}</span>
            <h2 id="tarif-modal-title">{record.name}</h2>
          </div>
          <button onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="computed-title">
            <span>{record.reference}</span>
            <strong>{record.family}</strong>
            <small>{record.designation || te("Cliquez sur + pour ajouter un palier de quantité.")}</small>
          </div>

          <fieldset className="priced-list">
            <legend>
              {te("Paliers de quantité")}<b> *</b>
              <small>{te("Pour une quantité donnée, le montant correspondant. Ajoutez d’autres lignes avec +.")}</small>
            </legend>
            {tiers.map((row, index) => (
              <div className="priced-row" key={row.id}>
                <label>
                  <span>{te("Pour (quantité)")}</span>
                  <input
                    type="number"
                    min={1}
                    aria-label={`Quantité palier ${index + 1}`}
                    value={row.quantity || ""}
                    onChange={(event) => updateRow(row.id, { quantity: Number(event.target.value) || 0 })}
                  />
                </label>
                <label>
                  <span>{te("Le montant est")}</span>
                  <input
                    type="number"
                    min={0}
                    aria-label={`Montant palier ${index + 1}`}
                    value={row.amount}
                    onChange={(event) => updateRow(row.id, { amount: Number(event.target.value) || 0 })}
                  />
                </label>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={te("Retirer ce palier")}
                  disabled={tiers.length <= 1}
                  onClick={() => setTiers((current) => current.filter((item) => item.id !== row.id))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
            <button type="button" className="add-row-button" onClick={() => setTiers((current) => [...current, newQuantityTier()])}>
              <Plus size={15} /> {te("Ajouter un palier")}
            </button>
          </fieldset>

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
