"use client";

import { useMemo, useState } from "react";
import { Check, Filter, LoaderCircle, Pencil, Plus, RotateCcw, Search, Trash2, TriangleAlert, X } from "lucide-react";
import { clientKindOf } from "@/components/modules/client-form";
import { useApp } from "@/components/providers/app-provider";
import { formatAmount } from "@/lib/company-settings";
import {
  BEHAVIOR_OPTIONS,
  IMPORTANCE_OPTIONS,
  behaviorLabel,
  classifyBehavior,
  classifyImportance,
  clientOrderStats,
  importanceLabel,
  sectorOf,
  type BehaviorKind,
  type ImportanceKind,
  type SegmentAxis,
} from "@/lib/client-segmentation";
import type { MockRecord } from "@/lib/types";

type Modal =
  | { type: "assign" }
  | { type: "sector" }
  | { type: "rename"; name: string }
  | { type: "delete"; name: string }
  | null;

export function ClientSegmentation() {
  const {
    records, settings, clientSectors, addClientSector, renameClientSector,
    deleteClientSector, assignClientsToSector, resetFeature, notify, te, t,
  } = useApp();
  const clients = records["fiches-clients"] ?? [];
  const orders = records["statuts-commandes"] ?? [];
  const now = useMemo(() => new Date(), []);
  const [axis, setAxis] = useState<SegmentAxis>("secteur");
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("Tous");
  const [bucket, setBucket] = useState("Tous");
  const [modal, setModal] = useState<Modal>(null);

  const enriched = useMemo(() => clients.map((client) => {
    const stats = clientOrderStats(orders, client, now);
    return {
      client,
      stats,
      sector: sectorOf(client),
      importance: classifyImportance(stats),
      behavior: classifyBehavior(stats, now),
    };
  }), [clients, orders, now]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return enriched.filter((row) => {
      const kind = clientKindOf(row.client);
      if (kindFilter !== "Tous" && kind !== kindFilter) return false;
      if (bucket !== "Tous") {
        if (axis === "secteur" && (row.sector || "Non affecté") !== bucket) return false;
        if (axis === "importance" && row.importance !== bucket) return false;
        if (axis === "comportement" && row.behavior !== bucket) return false;
      }
      if (!needle) return true;
      return [row.client.name, row.client.reference, row.client.clientType, row.sector].some((value) =>
        String(value || "").toLocaleLowerCase("fr").includes(needle),
      );
    });
  }, [enriched, query, kindFilter, bucket, axis]);

  const groups = useMemo(() => {
    if (axis === "secteur") {
      const labels = [...clientSectors, "Non affecté"];
      return labels.map((label) => ({
        id: label,
        title: label,
        hint: label === "Non affecté" ? te("Clients sans secteur") : te("Affectation manuelle"),
        titleLabel: label === "Non affecté" ? te("Non affecté") : label,
        items: filtered.filter((row) => (row.sector || "Non affecté") === label),
      }));
    }
    if (axis === "importance") {
      return IMPORTANCE_OPTIONS.map((option) => ({
        id: option.id,
        title: option.label,
        hint: option.hint,
        items: filtered.filter((row) => row.importance === option.id),
      }));
    }
    return BEHAVIOR_OPTIONS.map((option) => ({
      id: option.id,
      title: option.label,
      hint: option.hint,
      items: filtered.filter((row) => row.behavior === option.id),
    }));
  }, [axis, clientSectors, filtered]);

  const bucketOptions = axis === "secteur"
    ? ["Tous", ...clientSectors, "Non affecté"]
    : axis === "importance"
      ? ["Tous", ...IMPORTANCE_OPTIONS.map((item) => item.id)]
      : ["Tous", ...BEHAVIOR_OPTIONS.map((item) => item.id)];

  function bucketLabel(value: string) {
    if (value === "Tous") return te("Tous");
    if (value === "Non affecté") return te("Non affecté");
    if (axis === "importance") return te(importanceLabel(value as ImportanceKind));
    if (axis === "comportement") return te(behaviorLabel(value as BehaviorKind));
    return value;
  }

  return (
    <div className="seg-page">
      <div className="inner-tabs" role="tablist" aria-label={te("Axes de segmentation")}>
        <button type="button" role="tab" aria-selected={axis === "secteur"} className={axis === "secteur" ? "active" : ""} onClick={() => { setAxis("secteur"); setBucket("Tous"); }}>{te("Par type de client")}</button>
        <button type="button" role="tab" aria-selected={axis === "importance"} className={axis === "importance" ? "active" : ""} onClick={() => { setAxis("importance"); setBucket("Tous"); }}>{te("Par importance")}</button>
        <button type="button" role="tab" aria-selected={axis === "comportement"} className={axis === "comportement" ? "active" : ""} onClick={() => { setAxis("comportement"); setBucket("Tous"); }}>{te("Par comportement")}</button>
      </div>

      <div className="table-toolbar">
        <label className="table-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={te("Rechercher un client…")} />
          {query && <button type="button" onClick={() => setQuery("")} aria-label={te("Effacer la recherche")}><X size={15} /></button>}
        </label>
        <div className="toolbar-actions">
          <label className="filter-select">
            <Filter size={16} />
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
              <option value="Tous">{te("Tous")}</option>
              <option value="Entreprise">{te("Entreprise")}</option>
              <option value="Particulier">{te("Particulier")}</option>
            </select>
          </label>
          <label className="filter-select">
            <Filter size={16} />
            <select value={bucket} onChange={(event) => setBucket(event.target.value)}>
              {bucketOptions.map((option) => (
                <option key={option} value={option}>{bucketLabel(option)}</option>
              ))}
            </select>
          </label>
          {axis === "secteur" && (
            <>
              <button type="button" className="button button-secondary" onClick={() => setModal({ type: "sector" })}><Plus size={16} /> {te("Secteur")}</button>
              <button type="button" className="button button-primary" onClick={() => setModal({ type: "assign" })}><Plus size={16} /> {te("Affecter des clients")}</button>
            </>
          )}
          <button type="button" className="icon-button" title={te("Réinitialiser")} onClick={() => resetFeature("segmentation")}><RotateCcw size={17} /></button>
        </div>
      </div>

      {axis !== "secteur" && (
        <p className="settings-hint">
          {axis === "importance"
            ? te("Calcul automatique : VIP ≥ 3 000 000 · Gros clients ≥ 1 000 000 · Réguliers ≥ 5 commandes · sinon Petits clients.")
            : te("Calcul automatique : souvent = 2 commandes sur 90 jours · rarement = au moins une commande sur 6 mois · sinon rien commandé depuis 6 mois.")}
        </p>
      )}

      <div className="seg-groups">
        {groups.filter((group) => !query && kindFilter === "Tous" && bucket === "Tous" ? true : group.items.length > 0).map((group) => (
          <section className="panel seg-group" key={group.id}>
            <div className="panel-head">
              <div>
                <span className="panel-kicker">{t(group.items.length > 1 ? "seg.clientCountMany" : "seg.clientCount", "{count} client{plural}", { count: group.items.length, plural: group.items.length > 1 ? "s" : "" })}</span>
                <h2>{te(group.title)}</h2>
                <p className="settings-hint">{te(group.hint)}</p>
              </div>
              {axis === "secteur" && group.id !== "Non affecté" && (
                <div className="settings-row-actions">
                  <button type="button" className="icon-button" aria-label={`Renommer ${group.title}`} onClick={() => setModal({ type: "rename", name: group.title })}><Pencil size={15} /></button>
                  <button type="button" className="icon-button danger" aria-label={`Supprimer ${group.title}`} onClick={() => setModal({ type: "delete", name: group.title })}><Trash2 size={15} /></button>
                </div>
              )}
            </div>
            {group.items.length === 0 ? (
              <p className="settings-empty">{te("Aucun client dans ce groupe.")}</p>
            ) : (
              <ul className="seg-clients">
                {group.items.map((row) => (
                  <li key={row.client.id}>
                    <strong>{row.client.name}</strong>
                    <span>{te(clientKindOf(row.client))} · {row.client.reference}</span>
                    <small>
                      {t(row.stats.count > 1 ? "seg.orderCountMany" : "seg.orderCount", "{count} commande{plural} · {amount}", { count: row.stats.count, plural: row.stats.count > 1 ? "s" : "", amount: formatAmount(row.stats.total, settings) })}
                      {axis === "importance" ? ` · ${te(importanceLabel(row.importance))}` : ""}
                      {axis === "comportement" ? ` · ${te(behaviorLabel(row.behavior))}` : ""}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {modal?.type === "assign" && (
        <AssignModal
          clients={clients}
          sectors={clientSectors}
          onClose={() => setModal(null)}
          onSubmit={async (ids, sector) => {
            await assignClientsToSector(ids, sector);
            setModal(null);
          }}
        />
      )}
      {(modal?.type === "sector" || modal?.type === "rename") && (
        <SectorNameModal
          title={modal.type === "rename" ? te("Renommer le secteur") : te("Nouveau secteur")}
          initial={modal.type === "rename" ? modal.name : ""}
          existing={clientSectors}
          onClose={() => setModal(null)}
          onSubmit={(name) => {
            if (modal.type === "rename") {
              renameClientSector(modal.name, name);
              notify("Secteur modifié", t("toast.sectorRenamed", "« {from} » devient « {to} ».", { from: modal.name, to: name }));
            } else {
              addClientSector(name);
              notify("Secteur ajouté", t("toast.sectorAdded", "« {name} » est disponible pour l’affectation.", { name }));
            }
            setModal(null);
          }}
        />
      )}
      {modal?.type === "delete" && (
        <div className="modal-backdrop">
          <div className="modal modal-small" role="alertdialog" aria-modal="true">
            <span className="danger-icon"><TriangleAlert size={24} /></span>
            <h2>{t("role.deleteConfirm", "Supprimer {name} ?", { name: modal.name })}</h2>
            <p>{te("Les clients de ce secteur passeront dans « Non affecté ». Vous pourrez les réaffecter ensuite.")}</p>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setModal(null)}>{te("Annuler")}</button>
              <button type="button" className="button button-danger" onClick={() => { deleteClientSector(modal.name); notify("Secteur supprimé", t("toast.sectorDeleted", "{name} a été retiré.", { name: modal.name }), "info"); setModal(null); }}>
                <Trash2 size={17} /> {te("Supprimer")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssignModal({
  clients,
  sectors,
  onClose,
  onSubmit,
}: {
  clients: MockRecord[];
  sectors: string[];
  onClose: () => void;
  onSubmit: (ids: string[], sector: string) => Promise<void>;
}) {
  const { te } = useApp();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<MockRecord[]>([]);
  const [sector, setSector] = useState(sectors[0] ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const open = query.trim().length > 0;

  const suggestions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    if (!needle) return [];
    const selected = new Set(picked.map((item) => item.id));
    return clients.filter((client) => {
      if (selected.has(client.id)) return false;
      return [client.name, client.reference, client.clientType, client.phone].some((value) =>
        String(value || "").toLocaleLowerCase("fr").includes(needle),
      );
    }).slice(0, 8);
  }, [clients, picked, query]);

  function pick(client: MockRecord) {
    setPicked((current) => current.some((item) => item.id === client.id) ? current : [...current, client]);
    setQuery("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!picked.length) {
      setError(te("Sélectionnez au moins un particulier ou une entreprise."));
      return;
    }
    if (!sector.trim()) {
      setError(te("Choisissez un secteur d’activité."));
      return;
    }
    setError("");
    setPending(true);
    try {
      await onSubmit(picked.map((item) => item.id), sector);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{te("Affectation")}</span>
            <h2>{te("Ajouter des clients à un secteur")}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field field-wide">
              <span>{te("Clients (entreprises ou particuliers)")}<b> *</b></span>
              <div className="seg-autocomplete">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={te("Rechercher et sélectionner un ou plusieurs clients…")}
                  autoComplete="off"
                />
                {open && (
                  <ul className="seg-suggest">
                    {suggestions.length === 0 ? (
                      <li className="muted">{te("Aucun client correspondant.")}</li>
                    ) : suggestions.map((client) => (
                      <li key={client.id}>
                        <button type="button" onClick={() => pick(client)}>
                          <strong>{client.name}</strong>
                          <small>{te(clientKindOf(client))} · {client.reference}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {picked.length > 0 && (
                <div className="seg-chips">
                  {picked.map((client) => (
                    <button type="button" key={client.id} onClick={() => setPicked((current) => current.filter((item) => item.id !== client.id))}>
                      {client.name} <X size={13} />
                    </button>
                  ))}
                </div>
              )}
            </label>
            <label className="field field-wide">
              <span>{te("Secteur d’activité")}<b> *</b></span>
              <select value={sector} onChange={(event) => setSector(event.target.value)}>
                {sectors.length === 0 && <option value="">{te("Créez d’abord un secteur")}</option>}
                {sectors.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>{te("Annuler")}</button>
            <button className="button button-primary" disabled={pending}>
              {pending ? <><LoaderCircle className="spin" size={17} /> {te("Enregistrement…")}</> : <><Check size={17} /> {te("Affecter")}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SectorNameModal({
  title,
  initial,
  existing,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: string;
  existing: string[];
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const { te } = useApp();
  const [name, setName] = useState(initial);
  const [error, setError] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const label = name.trim();
    if (!label) {
      setError(te("Le libellé du secteur est obligatoire."));
      return;
    }
    const taken = existing.some((item) => item.toLocaleLowerCase("fr") === label.toLocaleLowerCase("fr") && item !== initial);
    if (taken) {
      setError(te("Ce secteur existe déjà."));
      return;
    }
    onSubmit(label);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-small" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{te("Secteur")}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <label className="field">
            <span>{te("Libellé")}<b> *</b></span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Restaurants" autoFocus />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose}>{te("Annuler")}</button>
            <button className="button button-primary"><Check size={17} /> {te("Enregistrer")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
