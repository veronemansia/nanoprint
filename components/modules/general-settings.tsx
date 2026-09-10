"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check, Globe, Landmark, LoaderCircle, RotateCcw,
} from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import {
  activeTaxes,
  defaultCompanySettings,
  formatAmount,
  type CompanySettings,
} from "@/lib/company-settings";

export function GeneralSettings() {
  const { settings, saveSettings, resetSettings, te } = useApp();
  const [draft, setDraft] = useState<CompanySettings>(settings);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  function patch(next: Partial<CompanySettings>) {
    setDraft((current) => ({ ...current, ...next }));
  }

  async function saveCompany(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.tradeName.trim()) {
      setError(te("Le nom commercial est obligatoire."));
      return;
    }
    setError("");
    setPending(true);
    try {
      await saveSettings({
        ...settings,
        ...draft,
        currencies: settings.currencies,
        taxes: settings.taxes,
      });
    } finally {
      setPending(false);
    }
  }

  const taxes = activeTaxes(settings);
  const sample = formatAmount(1250000, settings);

  return (
    <div className="settings-layout">
      <div className="settings-stack">
        <section className="panel settings-panel">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">{te("Identité")}</span>
              <h2>{te("Entreprise")}</h2>
            </div>
            <button type="button" onClick={() => { resetSettings(); setDraft(defaultCompanySettings); }}><RotateCcw size={14} /> {te("Restaurer")}</button>
          </div>
          <form onSubmit={saveCompany}>
            <div className="settings-logo-row">
              <div className="settings-logo-preview">
                {draft.logo
                  ? <img src={draft.logo} alt={`Logo ${draft.tradeName}`} />
                  : <span>Logo</span>}
              </div>
              <label className="upload-zone">
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  try {
                    patch({ logo: await prepareCompanyLogo(file) });
                  } catch {
                    setError(te("Impossible de lire ce logo."));
                  }
                }} />
                <span>
                  <strong>{te("Importer le logo")}</strong>
                  <small>{te("PNG, JPG ou SVG. Affiché dans la barre latérale et les documents.")}</small>
                </span>
              </label>
              {draft.logo && (
                <button type="button" className="button button-secondary" onClick={() => patch({ logo: "" })}>{te("Retirer")}</button>
              )}
            </div>
            <div className="form-grid">
              <label className="field">
                <span>{te("Nom commercial")}<b> *</b></span>
                <input value={draft.tradeName} onChange={(event) => patch({ tradeName: event.target.value })} />
              </label>
              <label className="field">
                <span>{te("Raison sociale")}</span>
                <input value={draft.legalName} onChange={(event) => patch({ legalName: event.target.value })} />
              </label>
              <label className="field">
                <span>{te("Forme juridique")}</span>
                <input value={draft.legalForm} onChange={(event) => patch({ legalForm: event.target.value })} placeholder="SARL, SA…" />
              </label>
              <label className="field">
                <span>NINEA</span>
                <input value={draft.ninea} onChange={(event) => patch({ ninea: event.target.value })} />
              </label>
              <label className="field">
                <span>RCCM</span>
                <input value={draft.rccm} onChange={(event) => patch({ rccm: event.target.value })} />
              </label>
              <label className="field">
                <span>{te("Téléphone")}</span>
                <input value={draft.phone} onChange={(event) => patch({ phone: event.target.value })} />
              </label>
              <label className="field field-wide">
                <span>{te("Adresse")}</span>
                <input value={draft.address} onChange={(event) => patch({ address: event.target.value })} />
              </label>
              <label className="field">
                <span>{te("Ville")}</span>
                <input value={draft.city} onChange={(event) => patch({ city: event.target.value })} />
              </label>
              <label className="field">
                <span>{te("Pays")}</span>
                <input value={draft.country} onChange={(event) => patch({ country: event.target.value })} />
              </label>
              <label className="field">
                <span>{te("E-mail")}</span>
                <input type="email" value={draft.email} onChange={(event) => patch({ email: event.target.value })} />
              </label>
              <label className="field">
                <span>{te("Site web")}</span>
                <input type="url" value={draft.website} onChange={(event) => patch({ website: event.target.value })} placeholder="https://" />
              </label>
              <label className="field">
                <span>{te("Banque")}</span>
                <input value={draft.bank} onChange={(event) => patch({ bank: event.target.value })} />
              </label>
              <label className="field">
                <span>IBAN</span>
                <input value={draft.iban} onChange={(event) => patch({ iban: event.target.value })} />
              </label>
              <label className="field">
                <span>{te("Jours ouvrés")}</span>
                <input value={draft.workDays} onChange={(event) => patch({ workDays: event.target.value })} />
              </label>
              <label className="field">
                <span>{te("Horaires atelier")}</span>
                <input value={draft.openingHours} onChange={(event) => patch({ openingHours: event.target.value })} />
              </label>
              <label className="field field-wide">
                <span>{te("Unités de mesure (papier)")}</span>
                <input value={draft.paperUnit} onChange={(event) => patch({ paperUnit: event.target.value })} />
              </label>
            </div>
            {error && <div className="form-error" role="alert">{error}</div>}
            <div className="modal-actions">
              <button className="button button-primary" disabled={pending}>
                {pending ? <><LoaderCircle className="spin" size={17} /> {te("Enregistrement…")}</> : <><Check size={17} /> {te("Enregistrer l’entreprise")}</>}
              </button>
            </div>
          </form>
        </section>

        <section className="panel settings-panel">
          <div className="panel-head">
            <div>
              <span className="panel-kicker">{te("Fiscalité")}</span>
              <h2>{te("Taxes applicables")}</h2>
            </div>
            <Link className="button button-secondary" href="/admin/configuration/taxes">{te("Gérer les taxes")}</Link>
          </div>
          <p className="settings-hint">{te("Les taxes se gèrent dans l’onglet Taxes. Seules les taxes actives s’appliquent aux devis et factures.")}</p>
          {taxes.length === 0 ? (
            <p className="settings-empty">{te("Aucune taxe active.")}</p>
          ) : (
            <p className="settings-hint">{taxes.map((item) => `${item.label} ${item.rate} %`).join(" · ")}</p>
          )}
        </section>
      </div>

      <aside className="panel settings-preview">
        <span className="panel-kicker">{te("Aperçu")}</span>
        <div className="settings-preview-brand">
          {settings.logo ? <img src={settings.logo} alt="" /> : <span className="brand-mark"><i /><i /><i /><i /></span>}
          <div>
            <strong>{settings.tradeName || "Entreprise"}</strong>
            <small>{settings.legalName}</small>
          </div>
        </div>
        <dl>
          <div><dt>{te("Exemple de montant")}</dt><dd>{sample}</dd></div>
          <div><dt>{te("Taxes actives")}</dt><dd>{taxes.length ? taxes.map((item) => `${item.label} ${item.rate} %`).join(" · ") : te("Aucune")}</dd></div>
          <div><dt>{te("Site web")}</dt><dd>{settings.website ? <a href={settings.website} target="_blank" rel="noreferrer">{settings.website.replace(/^https?:\/\//, "")}</a> : "—"}</dd></div>
          <div><dt>{te("Contact")}</dt><dd>{[settings.phone, settings.email].filter(Boolean).join(" · ") || "—"}</dd></div>
          <div><dt>{te("Atelier")}</dt><dd>{[settings.workDays, settings.openingHours].filter(Boolean).join(" · ") || "—"}</dd></div>
        </dl>
        <p><Globe size={14} /> {settings.address ? `${settings.address}, ${settings.city}` : settings.city} {settings.country}</p>
        <p><Landmark size={14} /> {settings.bank || te("Banque non renseignée")}</p>
      </aside>

    </div>
  );
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("read"));
    reader.readAsDataURL(file);
  });
}

async function prepareCompanyLogo(file: File) {
  const dataUrl = await readDataUrl(file);
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) return dataUrl;
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error("image"));
    next.src = dataUrl;
  });
  const max = 360;
  const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight, 1));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}
