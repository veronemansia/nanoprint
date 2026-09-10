"use client";

import { useMemo, useState } from "react";
import { Check, Dices, LoaderCircle, Pencil, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import {
  CRUD_ACTIONS,
  emptyPermissions,
  generatePin,
  newAccessRole,
  summarizePermissions,
  type AccessRole,
  type CrudKey,
  type ModulePermissions,
} from "@/lib/access";
import { navModules } from "@/lib/modules";
import type { MockRecord } from "@/lib/types";

export function UserForm({
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
  const { accessRoles, te } = useApp();
  const [name, setName] = useState(String(record?.name ?? ""));
  const [email, setEmail] = useState(String(record?.email ?? ""));
  const [phone, setPhone] = useState(String(record?.phone ?? ""));
  const [address, setAddress] = useState(String(record?.address ?? ""));
  const [roleId, setRoleId] = useState(String(record?.roleId || accessRoles.find((item) => item.name === record?.role)?.id || accessRoles[0]?.id || ""));
  const [status, setStatus] = useState(record?.status ?? statuses[0]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [generated, setGenerated] = useState("");
  const [error, setError] = useState("");

  function fillPin() {
    const pin = generatePin();
    setPassword(pin);
    setConfirm(pin);
    setGenerated(pin);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const label = name.trim();
    if (!label) {
      setError(te("Le nom complet est obligatoire."));
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(te("Saisissez un e-mail valide, ou laissez le champ vide."));
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
    const role = accessRoles.find((item) => item.id === roleId) ?? accessRoles[0];
    if (!role) {
      setError(te("Créez d’abord un rôle, puis affectez-le à l’utilisateur."));
      return;
    }
    if (!record && !password) {
      setError(te("Saisissez un mot de passe ou générez-en un."));
      return;
    }
    if (password && password !== confirm) {
      setError(te("Le mot de passe et sa confirmation ne correspondent pas."));
      return;
    }
    setError("");
    const values: Record<string, string | number> = {
      name: label,
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      role: role.name,
      roleId: role.id,
      status,
    };
    if (password) values.password = password;
    await onSubmit(values);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{record ? te("Modification") : te("Création")}</span>
            <h2>{record ? record.name : te("Nouvel utilisateur")}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field">
              <span>{te("Nom complet")}<b> *</b></span>
              <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </label>
            <label className="field">
              <span>{te("E-mail")}</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={te("Facultatif")} />
            </label>
            <label className="field">
              <span>{te("Téléphone")}<b> *</b></span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
            <label className="field">
              <span>{te("Rôle")}<b> *</b></span>
              <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
                {accessRoles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="field field-wide">
              <span>{te("Adresse")}<b> *</b></span>
              <textarea rows={2} value={address} onChange={(event) => setAddress(event.target.value)} />
            </label>
            <label className="field">
              <span>{te("Mot de passe")}{record ? "" : <b> *</b>}</span>
              <span className="input-wrap">
                <input type="text" autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setGenerated(""); }} placeholder={record ? te("Laisser vide pour conserver") : ""} />
              </span>
            </label>
            <label className="field">
              <span>{te("Confirmation")}{record ? "" : <b> *</b>}</span>
              <input type="text" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </label>
            <div className="field field-wide">
              <button type="button" className="add-row-button" onClick={fillPin}><Dices size={15} /> {te("Générer un mot de passe à 4 chiffres")}</button>
              {generated && <p className="settings-hint">{te("Mot de passe généré")} : <strong>{generated}</strong> — {te("communiquez-le à l’utilisateur.")}</p>}
            </div>
            <label className="field">
              <span>{te("Statut")}</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {statuses.map((item) => <option key={item} value={item}>{te(item)}</option>)}
              </select>
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

export function UserDetail({ record }: { record: MockRecord }) {
  const { te } = useApp();
  return (
    <dl>
      <div><dt>{te("Référence")}</dt><dd>{record.reference}</dd></div>
      <div><dt>{te("Nom complet")}</dt><dd>{record.name}</dd></div>
      <div><dt>{te("E-mail")}</dt><dd>{record.email || "—"}</dd></div>
      <div><dt>{te("Téléphone")}</dt><dd>{record.phone || "—"}</dd></div>
      <div><dt>{te("Adresse")}</dt><dd>{record.address || "—"}</dd></div>
      <div><dt>{te("Rôle")}</dt><dd>{record.role || "—"}</dd></div>
      <div><dt>{te("Mot de passe")}</dt><dd>{record.password ? te("Défini") : "—"}</dd></div>
    </dl>
  );
}

function permissionSummary(
  role: AccessRole,
  te: (text: string) => string,
  t: (key: string, fallback: string, vars?: Record<string, string | number>) => string,
) {
  const raw = summarizePermissions(role);
  if (raw === "Tous les droits" || raw === "Aucun droit") return te(raw);
  const rows = navModules.map((item) => role.permissions[item.id] ?? emptyPermissions()[item.id]);
  const read = rows.filter((row) => row.read).length;
  const write = rows.filter((row) => row.create || row.update || row.delete).length;
  return t("role.permMix", "{read} consultation{readS} · {write} écriture{writeS}", {
    read,
    write,
    readS: read > 1 ? "s" : "",
    writeS: write > 1 ? "s" : "",
  });
}

export function RolePanel() {
  const { accessRoles, saveRole, deleteRole, te, t } = useApp();
  const [modal, setModal] = useState<{ type: "form"; role?: AccessRole } | { type: "delete"; role: AccessRole } | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <section className="data-section">
      <div className="panel-head" style={{ marginBottom: 14 }}>
        <div>
          <span className="panel-kicker">{te("Droits")}</span>
          <h2>{te("Rôles")}</h2>
        </div>
        <button type="button" className="button button-primary" onClick={() => setModal({ type: "form" })}><Plus size={16} /> {te("Nouveau rôle")}</button>
      </div>
      <p className="settings-hint">{te("Créez d’abord un rôle (libellé + actions CRUD de la barre latérale), puis affectez-le aux utilisateurs.")}</p>
      {accessRoles.length === 0 ? (
        <div className="empty-state">
          <h3>{te("Aucun rôle")}</h3>
          <p>{te("Ajoutez un premier rôle pour pouvoir créer des utilisateurs.")}</p>
          <button className="button button-primary" type="button" onClick={() => setModal({ type: "form" })}><Plus size={16} /> {te("Nouveau rôle")}</button>
        </div>
      ) : (
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th>{te("Libellé")}</th>
                <th>{te("Droits")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accessRoles.map((role) => (
                <tr key={role.id}>
                  <td><strong>{role.name}</strong></td>
                  <td>{permissionSummary(role, te, t)}</td>
                  <td className="settings-row-actions">
                    <button type="button" className="icon-button" aria-label={`${te("Modifier")} ${role.name}`} onClick={() => setModal({ type: "form", role })}><Pencil size={15} /></button>
                    <button type="button" className="icon-button danger" aria-label={`${te("Supprimer")} ${role.name}`} disabled={accessRoles.length <= 1} onClick={() => setModal({ type: "delete", role })}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal?.type === "form" && (
        <RoleForm
          role={modal.role}
          pending={pending}
          onClose={() => setModal(null)}
          onSubmit={async (next) => {
            setPending(true);
            try {
              await saveRole(next);
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
            <h2>{t("role.deleteConfirm", "Supprimer {name} ?", { name: modal.role.name })}</h2>
            <p>{te("Les utilisateurs qui avaient ce rôle recevront le premier rôle restant.")}</p>
            <div className="modal-actions">
              <button className="button button-secondary" type="button" onClick={() => setModal(null)}>{te("Annuler")}</button>
              <button className="button button-danger" type="button" disabled={pending} onClick={async () => {
                setPending(true);
                try {
                  await deleteRole(modal.role.id);
                  setModal(null);
                } finally {
                  setPending(false);
                }
              }}>
                <Trash2 size={17} /> {te("Supprimer")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function RoleForm({
  role,
  pending,
  onClose,
  onSubmit,
}: {
  role?: AccessRole;
  pending: boolean;
  onClose: () => void;
  onSubmit: (role: AccessRole) => Promise<void>;
}) {
  const { te, t } = useApp();
  const [name, setName] = useState(role?.name ?? "");
  const [permissions, setPermissions] = useState<Record<string, ModulePermissions>>(
    () => ({ ...emptyPermissions(), ...(role?.permissions ?? {}) }),
  );
  const [error, setError] = useState("");

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof navModules>();
    for (const item of navModules) {
      const list = groups.get(item.group) ?? [];
      list.push(item);
      groups.set(item.group, list);
    }
    return [...groups.entries()];
  }, []);

  function patch(moduleId: string, key: CrudKey, value: boolean) {
    setPermissions((current) => ({
      ...current,
      [moduleId]: { ...(current[moduleId] ?? emptyPermissions()[moduleId]), [key]: value },
    }));
  }

  function toggleRow(moduleId: string, value: boolean) {
    setPermissions((current) => ({
      ...current,
      [moduleId]: { create: value, read: value, update: value, delete: value },
    }));
  }

  function setAll(value: boolean) {
    setPermissions(value
      ? {
          ...emptyPermissions(),
          ...Object.fromEntries(navModules.map((item) => [item.id, { create: true, read: true, update: true, delete: true }])),
        }
      : emptyPermissions());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(te("Le libellé du rôle est obligatoire."));
      return;
    }
    setError("");
    await onSubmit({
      ...(role ?? newAccessRole()),
      name: name.trim(),
      permissions,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{te("Rôle")}</span>
            <h2>{role ? te("Modifier le rôle") : te("Nouveau rôle")}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <label className="field">
            <span>{te("Libellé")}<b> *</b></span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={te("Ex. Chef d’atelier")} autoFocus />
          </label>
          <div className="perm-toolbar">
            <span>{te("Actions CRUD des modules de la barre latérale")}</span>
            <div>
              <button type="button" className="text-link" onClick={() => setAll(true)}>{te("Tout autoriser")}</button>
              <button type="button" className="text-link" onClick={() => setAll(false)}>{te("Tout retirer")}</button>
            </div>
          </div>
          <div className="perm-wrap">
            {grouped.map(([group, items]) => (
              <table className="perm-table" key={group}>
                <thead>
                  <tr>
                    <th>{t(`group.${group}`, group)}</th>
                    {CRUD_ACTIONS.map((action) => <th key={action.key}>{te(action.label)}</th>)}
                    <th>{te("Tout")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const row = permissions[item.id] ?? { create: false, read: false, update: false, delete: false };
                    const allOn = row.create && row.read && row.update && row.delete;
                    return (
                      <tr key={item.id}>
                        <td>{t(`mod.${item.id}.short`, item.shortLabel)}</td>
                        {CRUD_ACTIONS.map((action) => (
                          <td key={action.key}>
                            <input
                              type="checkbox"
                              checked={row[action.key]}
                              onChange={(event) => patch(item.id, action.key, event.target.checked)}
                              aria-label={`${te(action.label)} — ${t(`mod.${item.id}.short`, item.shortLabel)}`}
                            />
                          </td>
                        ))}
                        <td>
                          <input type="checkbox" checked={allOn} onChange={(event) => toggleRow(item.id, event.target.checked)} aria-label={`${te("Toutes les actions")} — ${t(`mod.${item.id}.short`, item.shortLabel)}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}
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
