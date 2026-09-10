"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, Filter, LoaderCircle, Pencil, Plus, Search, Trash2, TriangleAlert, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import {
  CONTACT_ROLES,
  companyClients,
  contactPurposes,
  contactsForCompany,
} from "@/lib/client-contacts";
import type { MockRecord } from "@/lib/types";

function contactCoords(
  person: MockRecord,
  t: (key: string, fallback: string, vars?: Record<string, string | number>) => string,
  te: (text: string) => string,
) {
  const phone = String(person.phone || "").trim();
  const email = String(person.email || "").trim();
  return [phone && t("contact.phone", "Tél. {phone}", { phone }), email].filter(Boolean).join(" · ") || te("Coordonnées à renseigner");
}

type Modal =
  | { type: "create"; company: MockRecord }
  | { type: "edit"; company: MockRecord; record: MockRecord }
  | { type: "delete"; record: MockRecord }
  | null;

export function ClientContacts() {
  const { records, createRecord, updateRecord, deleteRecord, te, t } = useApp();
  const companies = useMemo(() => companyClients(records["fiches-clients"] ?? []), [records]);
  const contacts = records["contacts-multiples"] ?? [];
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("Tous");
  const [selected, setSelected] = useState<MockRecord | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [pending, setPending] = useState(false);

  const filteredCompanies = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return companies.filter((company) => {
      const people = contactsForCompany(contacts, company);
      if (roleFilter !== "Tous" && !people.some((item) => String(item.role) === roleFilter && item.status !== "Archivé")) {
        return false;
      }
      if (!needle) return true;
      const haystack = [company.name, company.reference, ...people.map((item) => `${item.name} ${item.role}`)];
      return haystack.some((value) => String(value).toLocaleLowerCase("fr").includes(needle));
    });
  }, [companies, contacts, query, roleFilter]);

  const selectedContacts = selected ? contactsForCompany(contacts, selected) : [];
  const roleOptions = useMemo(() => {
    const fromData = contacts.map((item) => String(item.role || "").trim()).filter(Boolean);
    return [...new Set([...CONTACT_ROLES, ...fromData])];
  }, [contacts]);

  return (
    <div className="contacts-page">
      {selected ? (
        <CompanyContacts
          company={selected}
          contacts={selectedContacts}
          onBack={() => setSelected(null)}
          onAdd={() => setModal({ type: "create", company: selected })}
          onEdit={(record) => setModal({ type: "edit", company: selected, record })}
          onDelete={(record) => setModal({ type: "delete", record })}
        />
      ) : (
        <>
          <p className="settings-hint">{te("Une entreprise n’est pas une seule personne. Ouvrez une société déjà créée, puis ajoutez direction, marketing, comptabilité, livraison ou validateur BAT.")}</p>
          <div className="table-toolbar">
            <label className="table-search">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={te("Rechercher une entreprise ou un contact…")} />
              {query && <button type="button" onClick={() => setQuery("")} aria-label={te("Effacer")}><X size={15} /></button>}
            </label>
            <div className="toolbar-actions">
              <label className="filter-select">
                <Filter size={16} />
                <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="Tous">{te("Tous les rôles")}</option>
                  {roleOptions.map((role) => <option key={role}>{role}</option>)}
                </select>
              </label>
            </div>
          </div>
          {filteredCompanies.length === 0 ? (
            <div className="empty-state">
              <span><Search size={25} /></span>
              <h3>{te("Aucune entreprise")}</h3>
              <p>{te("Créez d’abord une fiche client de type Entreprise, puis revenez ajouter ses interlocuteurs.")}</p>
            </div>
          ) : (
            <div className="contacts-companies">
              {filteredCompanies.map((company) => {
                const people = contactsForCompany(contacts, company);
                const active = people.filter((item) => item.status !== "Archivé");
                return (
                  <article className="panel contacts-company" key={company.id}>
                    <div className="panel-head">
                      <div>
                        <span className="panel-kicker">{company.reference}</span>
                        <h2>{company.name}</h2>
                        <p className="settings-hint">{t(active.length > 1 ? "contact.peopleMany" : "contact.people", "{count} interlocuteur{plural}", { count: active.length, plural: active.length > 1 ? "s" : "" })}</p>
                      </div>
                    </div>
                    <ul className="contacts-preview">
                      {active.slice(0, 4).map((person) => (
                        <li key={person.id}>
                          <b>{person.role}</b>
                          <span>{person.name}</span>
                          <small>{contactCoords(person, t, te)}</small>
                        </li>
                      ))}
                      {active.length === 0 && <li className="muted">{te("Aucun contact pour l’instant.")}</li>}
                    </ul>
                    <button type="button" className="button button-secondary" onClick={() => setSelected(company)}>{te("Ouvrir les contacts")}</button>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {(modal?.type === "create" || modal?.type === "edit") && (
        <ContactForm
          company={modal.company}
          record={modal.type === "edit" ? modal.record : undefined}
          pending={pending}
          onClose={() => setModal(null)}
          onSubmit={async (values) => {
            setPending(true);
            try {
              if (modal.type === "edit") await updateRecord("contacts-multiples", modal.record.id, values);
              else await createRecord("contacts-multiples", values);
              setModal(null);
            } finally {
              setPending(false);
            }
          }}
        />
      )}
      {modal?.type === "delete" && (
        <div className="modal-backdrop">
          <div className="modal modal-small" role="alertdialog" aria-modal="true">
            <span className="danger-icon"><TriangleAlert size={24} /></span>
            <h2>{t("role.deleteConfirm", "Supprimer {name} ?", { name: modal.record.name })}</h2>
            <p>{t("contact.deleteHint", "Ce contact sera retiré de {company}. Vous pourrez en recréer un ensuite.", { company: String(modal.record.company) })}</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setModal(null)}>{te("Annuler")}</button>
              <button
                type="button"
                className="button button-danger"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  try {
                    await deleteRecord("contacts-multiples", modal.record.id);
                    setModal(null);
                  } finally {
                    setPending(false);
                  }
                }}
              >
                {pending ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />} {te("Supprimer")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CompanyContacts({
  company,
  contacts,
  onBack,
  onAdd,
  onEdit,
  onDelete,
}: {
  company: MockRecord;
  contacts: MockRecord[];
  onBack: () => void;
  onAdd: () => void;
  onEdit: (record: MockRecord) => void;
  onDelete: (record: MockRecord) => void;
}) {
  const { te, t } = useApp();
  const purposes = contactPurposes(contacts);
  const active = contacts.filter((item) => item.status !== "Archivé");

  return (
    <div className="contacts-detail">
      <div className="history-section-head">
        <button type="button" className="text-link" onClick={onBack}><ArrowLeft size={15} /> {te("Toutes les entreprises")}</button>
        <button type="button" className="button button-primary" onClick={onAdd}><Plus size={16} /> {te("Ajouter un contact")}</button>
      </div>
      <div className="drawer-title">
        <span className="record-ref">{company.reference}</span>
        <h2>{company.name}</h2>
        <p>{te("Entreprise")} · {t(active.length > 1 ? "contact.peopleMany" : "contact.people", "{count} interlocuteur{plural}", { count: active.length, plural: active.length > 1 ? "s" : "" })}</p>
      </div>
      <div className="contacts-purposes">
        <span className="panel-kicker">{te("Qui contacter, et pour quelle raison")}</span>
        <ul>
          {purposes.map((item) => (
            <li key={item.role}>
              <b>{item.purpose}</b>
              <span>{item.contact ? `${item.contact.name} — ${item.role}` : `Aucun ${item.role.toLowerCase()}`}</span>
              {item.contact && <small>{contactCoords(item.contact, t, te)}</small>}
            </li>
          ))}
        </ul>
      </div>
      <div className="contacts-list-wrap">
        <span className="panel-kicker">{te("Tous les contacts")}</span>
        {contacts.length === 0 ? (
          <p className="settings-empty">{te("Ajoutez le directeur, le marketing, la comptabilité, la livraison ou le validateur BAT.")}</p>
        ) : (
          <ul className="contacts-list">
            {contacts.map((person) => (
              <li key={person.id}>
                <div>
                  <strong>{person.name}</strong>
                  <span>{person.role}</span>
                  <small>{contactCoords(person, t, te)}</small>
                </div>
                <div className="settings-row-actions">
                  <button type="button" className="icon-button" aria-label={`Modifier ${person.name}`} onClick={() => onEdit(person)}><Pencil size={15} /></button>
                  <button type="button" className="icon-button danger" aria-label={`Supprimer ${person.name}`} onClick={() => onDelete(person)}><Trash2 size={15} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ContactForm({
  company,
  record,
  pending,
  onClose,
  onSubmit,
}: {
  company: MockRecord;
  record?: MockRecord;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string | number>) => Promise<void>;
}) {
  const { te } = useApp();
  const [name, setName] = useState(String(record?.name ?? ""));
  const [role, setRole] = useState(String(record?.role ?? ""));
  const [email, setEmail] = useState(String(record?.email ?? ""));
  const [phone, setPhone] = useState(String(record?.phone ?? ""));
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(te("Le nom de l’interlocuteur est obligatoire."));
      return;
    }
    if (!role.trim()) {
      setError(te("Le rôle est obligatoire."));
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(te("Saisissez un e-mail valide, ou laissez le champ vide."));
      return;
    }
    setError("");
    await onSubmit({
      name: name.trim(),
      company: company.name,
      companyId: company.id,
      role: role.trim(),
      email: email.trim(),
      phone: phone.trim(),
      status: "Actif",
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{company.name}</span>
            <h2>{record ? te("Modifier le contact") : te("Nouveau contact")}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>{te("Nom")}<b> *</b></span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Sarah" autoFocus />
            </label>
            <label className="field">
              <span>{te("Rôle")}<b> *</b></span>
              <input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Responsable marketing" />
            </label>
            <label className="field">
              <span>{te("Numéro de téléphone")}</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+221 77 000 00 00" />
            </label>
            <label className="field">
              <span>{te("E-mail")}</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="sarah@entreprise.sn" />
            </label>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>{te("Annuler")}</button>
            <button className="button button-primary" disabled={pending}>
              {pending ? <><LoaderCircle className="spin" size={17} /> {te("Enregistrement…")}</> : <><Check size={17} /> {te("Enregistrer")}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
