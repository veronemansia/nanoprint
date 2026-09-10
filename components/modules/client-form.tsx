"use client";

import { useState } from "react";
import { Check, LoaderCircle, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import type { MockRecord } from "@/lib/types";

export type ClientKind = "Particulier" | "Entreprise";

export function clientKindOf(record?: MockRecord): ClientKind {
  return record?.clientType === "Particulier" ? "Particulier" : "Entreprise";
}

export function ClientForm({
  record,
  pending,
  statuses,
  onClose,
  onSubmit,
}: {
  record?: MockRecord;
  pending: boolean;
  statuses: string[];
  onClose: () => void;
  onSubmit: (values: Record<string, string | number>) => Promise<void>;
}) {
  const [kind, setKind] = useState<ClientKind>(clientKindOf(record));
  const [name, setName] = useState(String(record?.name ?? ""));
  const [legalName, setLegalName] = useState(String(record?.legalName ?? ""));
  const [legalForm, setLegalForm] = useState(String(record?.legalForm ?? ""));
  const [ninea, setNinea] = useState(String(record?.ninea ?? ""));
  const [rccm, setRccm] = useState(String(record?.rccm ?? ""));
  const [contact, setContact] = useState(String(record?.contact ?? ""));
  const [email, setEmail] = useState(String(record?.email ?? ""));
  const [phone, setPhone] = useState(String(record?.phone ?? ""));
  const [website, setWebsite] = useState(String(record?.website ?? ""));
  const [address, setAddress] = useState(String(record?.address ?? ""));
  const [city, setCity] = useState(String(record?.city ?? ""));
  const [country, setCountry] = useState(String(record?.country ?? "Sénégal"));
  const [discount, setDiscount] = useState(String(record?.discount ?? ""));
  const [notes, setNotes] = useState(String(record?.notes ?? ""));
  const [status, setStatus] = useState(record?.status ?? statuses[0]);
  const { te } = useApp();
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const label = name.trim();
    if (!label) {
      setError(te(kind === "Particulier" ? "Le nom complet est obligatoire." : "Le nom commercial est obligatoire."));
      return;
    }
    if (!phone.trim()) {
      setError(te("Le téléphone est obligatoire."));
      return;
    }
    if (!address.trim()) {
      setError(te("L’adresse est obligatoire."));
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(te("Saisissez un e-mail valide, ou laissez le champ vide."));
      return;
    }
    if (kind === "Entreprise" && !contact.trim()) {
      setError(te("Le contact principal est obligatoire."));
      return;
    }
    const rebate = discount.trim() === "" ? 0 : Number(String(discount).replace(",", "."));
    if (!Number.isFinite(rebate) || rebate < 0 || rebate > 100) {
      setError(te("La remise éventuelle doit être un pourcentage entre 0 et 100."));
      return;
    }
    setError("");
    await onSubmit({
      clientType: kind,
      name: label,
      legalName: kind === "Entreprise" ? legalName.trim() : "",
      legalForm: kind === "Entreprise" ? legalForm.trim() : "",
      ninea: kind === "Entreprise" ? ninea.trim() : "",
      rccm: kind === "Entreprise" ? rccm.trim() : "",
      website: kind === "Entreprise" ? website.trim() : "",
      contact: kind === "Entreprise" ? contact.trim() : label,
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      country: country.trim(),
      discount: rebate,
      notes: notes.trim(),
      sector: String(record?.sector ?? ""),
      status,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{record ? te("Modification") : te("Création")}</span>
            <h2>{record ? record.name : te("Nouveau client")}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <fieldset className="type-radios">
            <legend>{te("Type de client")}<b> *</b></legend>
            <label>
              <input type="radio" name="clientType" checked={kind === "Particulier"} onChange={() => setKind("Particulier")} />
              {te("Particulier")}
            </label>
            <label>
              <input type="radio" name="clientType" checked={kind === "Entreprise"} onChange={() => setKind("Entreprise")} />
              {te("Entreprise")}
            </label>
          </fieldset>

          <div className="form-grid">
            {kind === "Particulier" ? (
              <>
                <label className="field field-wide">
                  <span>{te("Nom complet")}<b> *</b></span>
                  <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
                </label>
                <label className="field">
                  <span>{te("Téléphone")}<b> *</b></span>
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} />
                </label>
                <label className="field">
                  <span>{te("E-mail")}</span>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={te("Facultatif")} />
                </label>
                <label className="field field-wide">
                  <span>{te("Adresse")}<b> *</b></span>
                  <input value={address} onChange={(event) => setAddress(event.target.value)} />
                </label>
                <label className="field">
                  <span>{te("Ville")}</span>
                  <input value={city} onChange={(event) => setCity(event.target.value)} />
                </label>
                <label className="field">
                  <span>{te("Pays")}</span>
                  <input value={country} onChange={(event) => setCountry(event.target.value)} />
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  <span>{te("Nom commercial")}<b> *</b></span>
                  <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
                </label>
                <label className="field">
                  <span>{te("Raison sociale")}</span>
                  <input value={legalName} onChange={(event) => setLegalName(event.target.value)} />
                </label>
                <label className="field">
                  <span>{te("Forme juridique")}</span>
                  <input value={legalForm} onChange={(event) => setLegalForm(event.target.value)} placeholder="SARL, SA, GIE…" />
                </label>
                <label className="field">
                  <span>{te("Contact principal")}<b> *</b></span>
                  <input value={contact} onChange={(event) => setContact(event.target.value)} />
                </label>
                <label className="field">
                  <span>NINEA</span>
                  <input value={ninea} onChange={(event) => setNinea(event.target.value)} />
                </label>
                <label className="field">
                  <span>RCCM</span>
                  <input value={rccm} onChange={(event) => setRccm(event.target.value)} />
                </label>
                <label className="field">
                  <span>{te("Téléphone")}<b> *</b></span>
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} />
                </label>
                <label className="field">
                  <span>{te("E-mail")}</span>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={te("Facultatif")} />
                </label>
                <label className="field field-wide">
                  <span>{te("Adresse")}<b> *</b></span>
                  <input value={address} onChange={(event) => setAddress(event.target.value)} />
                </label>
                <label className="field">
                  <span>{te("Ville")}</span>
                  <input value={city} onChange={(event) => setCity(event.target.value)} />
                </label>
                <label className="field">
                  <span>{te("Pays")}</span>
                  <input value={country} onChange={(event) => setCountry(event.target.value)} />
                </label>
                <label className="field field-wide">
                  <span>{te("Site web")}</span>
                  <input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} placeholder="https://" />
                </label>
              </>
            )}
            <label className="field">
              <span>{te("Remise éventuelle (%)")}</span>
              <input inputMode="decimal" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0" />
            </label>
            <label className="field">
              <span>{te("Statut")}</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {statuses.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="field field-wide">
              <span>{te("Note interne")}</span>
              <textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={te("Visible uniquement en interne")} />
            </label>
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

export function ClientDetail({ record }: { record: MockRecord }) {
  const { te } = useApp();
  const kind = clientKindOf(record);
  const rebate = Number(record.discount) || 0;
  return (
    <dl>
      <div><dt>{te("Référence")}</dt><dd>{record.reference}</dd></div>
      <div><dt>{te("Type")}</dt><dd>{te(kind)}</dd></div>
      {kind === "Particulier" ? (
        <div><dt>{te("Nom complet")}</dt><dd>{record.name}</dd></div>
      ) : (
        <>
          <div><dt>{te("Nom commercial")}</dt><dd>{record.name}</dd></div>
          <div><dt>{te("Raison sociale")}</dt><dd>{record.legalName || "—"}</dd></div>
          <div><dt>{te("Forme juridique")}</dt><dd>{record.legalForm || "—"}</dd></div>
          <div><dt>{te("Contact principal")}</dt><dd>{record.contact || "—"}</dd></div>
          <div><dt>NINEA</dt><dd>{record.ninea || "—"}</dd></div>
          <div><dt>RCCM</dt><dd>{record.rccm || "—"}</dd></div>
          <div><dt>{te("Site web")}</dt><dd>{record.website || "—"}</dd></div>
        </>
      )}
      <div><dt>{te("Téléphone")}</dt><dd>{record.phone || "—"}</dd></div>
      <div><dt>{te("E-mail")}</dt><dd>{record.email || "—"}</dd></div>
      <div><dt>{te("Adresse")}</dt><dd>{[record.address, record.city, record.country].filter(Boolean).join(", ") || "—"}</dd></div>
      <div><dt>{te("Remise éventuelle")}</dt><dd>{rebate > 0 ? `${rebate} %` : te("Aucune")}</dd></div>
      <div><dt>{te("Note interne")}</dt><dd>{record.notes || "—"}</dd></div>
    </dl>
  );
}
