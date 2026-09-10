"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Download, FolderOpen, LoaderCircle, Replace, Search, Trash2, Upload, X } from "lucide-react";
import { useApp } from "@/components/providers/app-provider";
import { formatAmount } from "@/lib/company-settings";
import { findOrderByRef } from "@/lib/billing";
import {
  CLIENT_FILE_ACCEPT,
  downloadBlob,
  fileLabelForOrder,
  filesForOrder,
  formatFileSize,
  getClientFileBlob,
} from "@/lib/client-files";
import { clientAddress, inspectQuote, qtyFmt } from "@/lib/price-calculator";
import { hydrateOrderRecord, normalizeQuoteRef } from "@/lib/quote-conversion";
import type { MockRecord } from "@/lib/types";

function statusTone(status: string) {
  if (/expédi|versionné|reçu/i.test(status)) return "green";
  if (/attente|aucun/i.test(status)) return "yellow";
  return "cyan";
}

function formatDue(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${iso}T12:00:00`));
}

export function OrderClientFiles() {
  const { records, settings, uploadOrderFiles, replaceOrderFile, deleteOrderFile, te } = useApp();
  const orders = records["statuts-commandes"] ?? [];
  const quotes = records.calculateur ?? [];
  const clients = records["fiches-clients"] ?? [];
  const catalogue = records.catalogue ?? [];
  const files = records["fichiers-clients"] ?? [];
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [replaceId, setReplaceId] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const money = (amount: number) => formatAmount(amount, settings);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return orders.filter((item) => {
      if (!needle) return true;
      return [item.reference, item.name, item.client, item.status].some((value) =>
        String(value || "").toLocaleLowerCase("fr").includes(needle),
      );
    });
  }, [orders, query]);

  const typed = findOrderByRef(orders, query);
  const selected = orders.find((item) => item.id === selectedId) ?? typed;

  useEffect(() => {
    if (typed && typed.id !== selectedId) setSelectedId(typed.id);
  }, [typed, selectedId]);

  const hydrated = selected ? hydrateOrderRecord(selected, quotes) : null;
  const snap = hydrated ? inspectQuote(hydrated, clients, catalogue, settings) : null;
  const attached = selected ? filesForOrder(files, selected) : [];

  function selectOrder(item: MockRecord) {
    setSelectedId(item.id);
    setQuery(item.reference);
    setError("");
  }

  async function onUpload(list: FileList | null) {
    if (!selected || !list?.length) return;
    setPending(true);
    setError("");
    try {
      const created = await uploadOrderFiles(selected.id, Array.from(list));
      if (!created) setError(te("Les fichiers n’ont pas pu être déposés."));
    } finally {
      setPending(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  async function onReplace(list: FileList | null) {
    const file = list?.[0];
    if (!file || !replaceId) return;
    setPending(true);
    setError("");
    try {
      const updated = await replaceOrderFile(replaceId, file);
      if (!updated) setError(te("Le fichier n’a pas pu être remplacé."));
    } finally {
      setPending(false);
      setReplaceId("");
      if (replaceRef.current) replaceRef.current.value = "";
    }
  }

  async function onDownload(item: MockRecord) {
    if (!Number(item.stored)) {
      setError(te("Ce fichier de démonstration n’est pas stocké ici. Déposez une version corrigée pour le conserver."));
      return;
    }
    const blob = await getClientFileBlob(item.id);
    if (!blob) {
      setError(te("Le contenu du fichier est introuvable. Déposez-le à nouveau."));
      return;
    }
    downloadBlob(blob, String(item.name || "fichier"));
  }

  async function onDelete(item: MockRecord) {
    setPending(true);
    setError("");
    try {
      await deleteOrderFile(item.id);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="conv-page">
      <p className="settings-hint">
        Choisissez une commande, consultez son détail, puis déposez un ou plusieurs fichiers. Vous pouvez remplacer un fichier corrigé ou le supprimer.
      </p>
      <div className="table-toolbar">
        <label className="table-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setError(""); }}
            placeholder={te("Référence commande (CMD-260903)…")}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); setError(""); }} aria-label={te("Effacer")}><X size={15} /></button>
          )}
        </label>
      </div>
      {query.trim() && !selected && !filtered.length && (
        <p className="form-error" role="status">Aucune commande ne correspond à « {normalizeQuoteRef(query) || query} ».</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}

      <input
        ref={uploadRef}
        className="is-hidden-file"
        type="file"
        multiple
        accept={CLIENT_FILE_ACCEPT}
        onChange={(event) => void onUpload(event.target.files)}
      />
      <input
        ref={replaceRef}
        className="is-hidden-file"
        type="file"
        accept={CLIENT_FILE_ACCEPT}
        onChange={(event) => void onReplace(event.target.files)}
      />

      <div className="conv-layout">
        <section className="data-section conv-list-panel">
          <div className="section-title">
            <div>
              <span className="panel-kicker">Conversion</span>
              <h2>Commandes</h2>
            </div>
            <span>{filtered.length}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <span><FolderOpen size={25} /></span>
              <h3>Aucune commande</h3>
              <p>Les commandes arrivent depuis la conversion de devis.</p>
              <Link className="button button-primary" href="/admin/devis-commandes/conversion">Convertir un devis</Link>
            </div>
          ) : (
            <ul className="conv-list">
              {filtered.map((item) => {
                const label = fileLabelForOrder(files, item);
                return (
                  <li key={item.id}>
                    <button type="button" className={item.id === selected?.id ? "is-active" : ""} onClick={() => selectOrder(item)}>
                      <strong>{item.reference}</strong>
                      <span>{item.client || item.name}</span>
                      <small>{money(Number(item.amount) || 0)} F CFA</small>
                      <em className={`status-badge status-${statusTone(label)}`}>
                        <i />
                        {label}
                      </em>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="data-section conv-detail-panel">
          {!selected || !hydrated || !snap ? (
            <div className="empty-state">
              <span><Search size={25} /></span>
              <h3>Détail de la commande</h3>
              <p>Saisissez une référence ou cliquez une commande pour consulter le dossier et déposer les fichiers.</p>
            </div>
          ) : (
            <>
              <div className="section-title">
                <div>
                  <span className="panel-kicker">{selected.reference}</span>
                  <h2>{selected.name}</h2>
                </div>
                <span className={`status-badge status-${statusTone(selected.status)}`}><i />{selected.status}</span>
              </div>
              <article className="quote-client-card">
                <div>
                  <strong>{snap.client?.name || selected.client || "Client inconnu"}</strong>
                  <span>{snap.client ? clientAddress(snap.client) || "Adresse non renseignée" : "Fiche client introuvable"}</span>
                </div>
                <dl>
                  <div><dt>Téléphone</dt><dd>{snap.client?.phone || "—"}</dd></div>
                  <div><dt>E-mail</dt><dd>{snap.client?.email || "—"}</dd></div>
                  <div><dt>Quantité</dt><dd>{qtyFmt.format(Number(selected.quantity) || 0)}</dd></div>
                  <div><dt>Échéance</dt><dd>{formatDue(String(selected.dueDate || ""))}</dd></div>
                </dl>
              </article>
              <ul className="quote-detail-lines conv-lines">
                {snap.rows.map((item, index) => (
                  <li key={item.line.id}>
                    <div>
                      <strong>{item.designation}</strong>
                      <small>{qtyFmt.format(item.line.quantity)} ex.</small>
                    </div>
                    <b>{money(snap.discountOn ? (snap.totals.nets[index] ?? item.total) : item.total)}</b>
                  </li>
                ))}
                {snap.rows.length === 0 && (
                  <li>
                    <div><strong>{selected.name}</strong><small>{qtyFmt.format(Number(selected.quantity) || 0)} ex.</small></div>
                    <b>{money(Number(selected.amount) || 0)}</b>
                  </li>
                )}
                <li className="conv-total">
                  <span>Total commande</span>
                  <b>{money(Number(selected.amount) || snap.totals.total)}</b>
                </li>
              </ul>

              <div className="section-title" style={{ marginTop: 8 }}>
                <div>
                  <span className="panel-kicker">Prépresse</span>
                  <h2>Fichiers clients</h2>
                </div>
                <span>{attached.length}</span>
              </div>
              {attached.length === 0 ? (
                <p className="settings-hint">Aucun fichier déposé pour cette commande.</p>
              ) : (
                <ul className="quote-detail-lines conv-lines file-rows">
                  {attached.map((item) => (
                    <li key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <small>
                          {item.format || "Fichier"} · v{Number(item.version) || 1} · {formatFileSize(Number(item.sizeBytes) || 0)}
                          {Number(item.stored) ? "" : " · démo"}
                        </small>
                      </div>
                      <div className="file-row-actions">
                        {Number(item.stored) > 0 && (
                          <button type="button" className="button button-secondary" disabled={pending} onClick={() => void onDownload(item)}>
                            <Download size={15} /> Télécharger
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button-secondary"
                          disabled={pending}
                          onClick={() => {
                            setReplaceId(item.id);
                            setError("");
                            replaceRef.current?.click();
                          }}
                        >
                          <Replace size={15} /> Remplacer
                        </button>
                        <button type="button" className="button button-secondary" disabled={pending} onClick={() => void onDelete(item)}>
                          <Trash2 size={15} /> Supprimer
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="heading-actions conv-actions">
                <button
                  type="button"
                  className="button button-primary"
                  disabled={pending}
                  onClick={() => uploadRef.current?.click()}
                >
                  {pending ? <><LoaderCircle className="spin" size={16} /> {te("Traitement…")}</> : <><Upload size={16} /> {te("Déposer des fichiers")}</>}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
