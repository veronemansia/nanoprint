"use client";

import { useMemo, useState } from "react";
import { Check, LoaderCircle, Pencil, Plus, RotateCcw, Search, Trash2, TriangleAlert, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import {
  defaultCompanySettings,
  newTax,
  type TaxSetting,
} from "@/lib/company-settings";

const rateFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

export function Taxes() {
  const { settings, saveSettings, user, te } = useApp();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [modal, setModal] = useState<{ type: "create" | "edit"; item?: TaxSetting } | { type: "delete"; item: TaxSetting } | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return settings.taxes.filter((item) => {
      if (!needle) return true;
      return [item.label, item.code, item.note, item.rate].some((value) =>
        String(value ?? "").toLocaleLowerCase("fr").includes(needle),
      );
    });
  }, [query, settings.taxes]);

  async function persist(taxes: TaxSetting[]) {
    setPending(true);
    try {
      await saveSettings({ ...settings, taxes });
    } finally {
      setPending(false);
    }
  }

  async function saveTax(item: TaxSetting) {
    const taxes = settings.taxes.some((row) => row.id === item.id)
      ? settings.taxes.map((row) => (row.id === item.id ? item : row))
      : [...settings.taxes, item];
    await persist(taxes);
    setModal(null);
  }

  async function toggleActive(item: TaxSetting) {
    await persist(settings.taxes.map((row) => (row.id === item.id ? { ...row, active: !row.active } : row)));
  }

  async function removeTax(id: string) {
    await persist(settings.taxes.filter((row) => row.id !== id));
    setModal(null);
  }

  async function restoreDefaults() {
    await persist(defaultCompanySettings.taxes);
  }

  const canDelete = user?.role === "Administrateur";

  return (
    <section className="data-section">
      <div className="table-toolbar">
        <label className="table-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={te("Rechercher une taxe…")}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label={te("Effacer la recherche")}><X size={15} /></button>
          )}
        </label>
        <div className="toolbar-actions">
          <span className="settings-hint" style={{ margin: 0 }}>
            {filtered.length} taxe{filtered.length > 1 ? "s" : ""}
          </span>
          <button className="icon-button" title={te("Restaurer les taxes de démonstration")} onClick={() => void restoreDefaults()}>
            <RotateCcw size={17} />
          </button>
          <button className="button button-primary" type="button" onClick={() => setModal({ type: "create" })}>
            <Plus size={17} /> {te("Nouvelle taxe")}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <span><Search size={25} /></span>
          <h3>{te("Aucune taxe")}</h3>
          <p>{te("Ajoutez la TVA ou une taxe parafiscale. Seules les taxes actives s’appliquent aux devis et factures.")}</p>
          <div>
            {query ? (
              <button className="button button-secondary" type="button" onClick={() => setQuery("")}>{te("Effacer la recherche")}</button>
            ) : null}
            <button className="button button-primary" type="button" onClick={() => setModal({ type: "create" })}>
              <Plus size={16} /> {te("Nouvelle taxe")}
            </button>
          </div>
        </div>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{te("Libellé")}</th>
                <th>{te("Code")}</th>
                <th>{te("Pourcentage")}</th>
                <th>{te("Activation")}</th>
                <th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.label}</strong>
                    {item.note ? <small className="supply-stock">{item.note}</small> : null}
                  </td>
                  <td>{item.code || "—"}</td>
                  <td>{rateFmt.format(item.rate)} %</td>
                  <td>
                    <TaxActiveSwitch
                      active={item.active}
                      disabled={pending}
                      label={item.label}
                      onToggle={() => void toggleActive(item)}
                    />
                  </td>
                  <td>
                    <div className="settings-row-actions">
                      <button type="button" className="icon-button" aria-label={`Modifier ${item.label}`} onClick={() => setModal({ type: "edit", item })}>
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-button danger"
                        aria-label={`Supprimer ${item.label}`}
                        disabled={!canDelete}
                        title={canDelete ? undefined : te("Réservé aux administrateurs")}
                        onClick={() => setModal({ type: "delete", item })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(modal?.type === "create" || modal?.type === "edit") && (
        <TaxForm
          item={modal.type === "edit" ? modal.item : undefined}
          pending={pending}
          onClose={() => setModal(null)}
          onSubmit={saveTax}
        />
      )}

      {modal?.type === "delete" && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <div className="modal modal-small" role="alertdialog" aria-modal="true">
            <span className="danger-icon"><TriangleAlert size={24} /></span>
            <h2>{te("Supprimer")} {modal.item.label} ?</h2>
            <p>{te("La taxe sera retirée. Vous pourrez la recréer ensuite. Les documents déjà édités ne changent pas.")}</p>
            <div className="modal-actions">
              <button className="button button-secondary" type="button" onClick={() => setModal(null)}>{te("Annuler")}</button>
              <button className="button button-danger" type="button" disabled={pending} onClick={() => void removeTax(modal.item.id)}>
                {pending ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />} {te("Supprimer")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TaxActiveSwitch({
  active,
  disabled,
  label,
  onToggle,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  const { te } = useApp();
  return (
    <button
      type="button"
      className={`stock-kind-switch ${active ? "is-on" : ""}`}
      role="switch"
      aria-checked={active}
      aria-label={`Activer ou désactiver ${label}`}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className={!active ? "is-current" : ""}>{te("Inactive")}</span>
      <span className="quote-switch" aria-hidden="true"><i /></span>
      <span className={active ? "is-current" : ""}>{te("Active")}</span>
    </button>
  );
}

function TaxForm({
  item,
  pending,
  onClose,
  onSubmit,
}: {
  item?: TaxSetting;
  pending: boolean;
  onClose: () => void;
  onSubmit: (item: TaxSetting) => Promise<void>;
}) {
  const [label, setLabel] = useState(item?.label ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [rate, setRate] = useState(String(item?.rate ?? 18));
  const [note, setNote] = useState(item?.note ?? "");
  const [active, setActive] = useState(item?.active ?? true);
  const [error, setError] = useState("");
  const { te } = useApp();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim()) {
      setError(te("Le libellé est obligatoire."));
      return;
    }
    const parsed = Number(String(rate).replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(te("Saisissez un pourcentage valide."));
      return;
    }
    setError("");
    await onSubmit({
      ...(item ?? newTax()),
      label: label.trim(),
      code: code.trim(),
      rate: parsed,
      note: note.trim(),
      active,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tax-modal-title">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{item ? te("Modification") : te("Création")}</span>
            <h2 id="tax-modal-title">{item ? te("Modifier la taxe") : te("Nouvelle taxe")}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <label className="field">
              <span>{te("Libellé")}<b> *</b></span>
              <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="TVA" autoFocus />
            </label>
            <label className="field">
              <span>{te("Code")}</span>
              <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="TVA" />
            </label>
            <label className="field">
              <span>{te("Pourcentage")}<b> *</b></span>
              <input value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" placeholder="18" />
            </label>
            <label className="field">
              <span>{te("Précision")}</span>
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={te("Facultatif — ex. Taxe sur la valeur ajoutée")} />
            </label>
          </div>

          <div className="tax-active-field">
            <span>{te("Activation")}</span>
            <TaxActiveSwitch
              active={active}
              label={label.trim() || "cette taxe"}
              onToggle={() => setActive((current) => !current)}
            />
            <small>{te("Seules les taxes actives s’appliquent aux devis et factures.")}</small>
          </div>

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
