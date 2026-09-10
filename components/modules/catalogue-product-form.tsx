"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import {
  catalogueKindOf,
  composeProductTitle,
  newPricedOption,
  newProductMaterial,
  newQuantityTier,
  parsePricedOptions,
  parseProductMaterials,
  stringifyPricedOptions,
  stringifyProductMaterials,
  stringifyQuantityTiers,
  type CatalogueKind,
  type PricedOption,
  type ProductMaterial,
} from "@/lib/catalogue";
import { useApp } from "@/components/providers/app-provider";
import type { FeatureDefinition, MockRecord } from "@/lib/types";

function optionsFromRecord(record: MockRecord | undefined, key: string, fallback: PricedOption[]) {
  const parsed = parsePricedOptions(record?.[key]);
  return parsed.length ? parsed.map((item) => ({ ...item, id: item.id || crypto.randomUUID() })) : fallback;
}

export function CatalogueProductForm({
  feature,
  record,
  defaultKind = "Produit",
  pending,
  onClose,
  onSubmit,
}: {
  feature: FeatureDefinition;
  record?: MockRecord;
  defaultKind?: CatalogueKind;
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string | number>) => Promise<void>;
}) {
  const { catalogueFamilies, addCatalogueFamily, records, te } = useApp();
  const materials = records.matieres ?? [];
  const [error, setError] = useState("");
  const [kind, setKind] = useState<CatalogueKind>(() => (record ? catalogueKindOf(record) : defaultKind));
  const [family, setFamily] = useState(String(record?.family ?? catalogueFamilies[0] ?? ""));
  const [composition, setComposition] = useState<ProductMaterial[]>(() =>
    parseProductMaterials(record?.composition).map((item) => ({ ...item, id: item.id || crypto.randomUUID() })),
  );
  const [designation, setDesignation] = useState(() => {
    if (record?.designation) return String(record.designation);
    const parts = [record?.format, record?.grammage ? `${record.grammage} g` : "", record?.colors].filter(Boolean);
    return parts.join(" · ");
  });
  const [minQuantity, setMinQuantity] = useState(String(record?.minQuantity ?? 100));
  const [basePrice, setBasePrice] = useState(String(record?.basePrice ?? 0));
  const [status, setStatus] = useState(record?.status ?? feature.statuses[0]);
  const [printSides, setPrintSides] = useState<PricedOption[]>(() =>
    optionsFromRecord(record, "printSides", [newPricedOption("Recto seul", 0), newPricedOption("Recto-verso", 0)]),
  );
  const [paperTypes, setPaperTypes] = useState<PricedOption[]>(() =>
    optionsFromRecord(record, "paperTypes", [newPricedOption("Couché brillant", 0)]),
  );
  const [extraOptions, setExtraOptions] = useState<PricedOption[]>(() =>
    optionsFromRecord(record, "extraOptions", [newPricedOption()]),
  );
  const [addingFamily, setAddingFamily] = useState(false);
  const [newFamily, setNewFamily] = useState("");

  const productTitle = useMemo(
    () => composeProductTitle(family, designation),
    [family, designation],
  );

  function updateRow(list: PricedOption[], setList: (next: PricedOption[]) => void, id: string, patch: Partial<PricedOption>) {
    setList(list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addFamily() {
    const label = newFamily.trim();
    if (!label) {
      setError(te("Saisissez un nom de famille."));
      return;
    }
    addCatalogueFamily(label);
    setFamily(label);
    setNewFamily("");
    setAddingFamily(false);
    setError("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!family.trim()) {
      setError(te("Choisissez ou créez une famille."));
      return;
    }
    if (!designation.trim()) {
      setError(te("Saisissez la désignation complète."));
      return;
    }
    const sides = printSides.filter((item) => item.label.trim());
    const papers = paperTypes.filter((item) => item.label.trim());
    if (kind === "Produit" && !sides.length) {
      setError(te("Ajoutez au moins un nombre de côtés imprimés (libellé + prix)."));
      return;
    }
    if (kind === "Produit" && !papers.length) {
      setError(te("Ajoutez au moins un type de papier (libellé + prix)."));
      return;
    }
    const bom = composition.filter((item) => item.label.trim() && item.quantity > 0);
    const qty = Number(minQuantity);
    if (!qty || qty < 1) {
      setError(te("La quantité minimum doit être d’au moins 1."));
      return;
    }
    const price = Number(basePrice);
    if (Number.isNaN(price) || price < 0) {
      setError(te("Saisissez un prix de base."));
      return;
    }
    await onSubmit({
      name: productTitle,
      productKind: kind,
      family: family.trim(),
      designation: designation.trim(),
      minQuantity: qty,
      basePrice: price,
      printSides: kind === "Produit" ? stringifyPricedOptions(sides) : "[]",
      paperTypes: kind === "Produit" ? stringifyPricedOptions(papers) : "[]",
      extraOptions: kind === "Produit" ? stringifyPricedOptions(extraOptions) : "[]",
      composition: stringifyProductMaterials(bom),
      status,
      ...(record ? {} : { priceGrid: stringifyQuantityTiers([newQuantityTier(qty, price)]) }),
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="record-modal-title">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{record ? te("Modification") : te("Création")}</span>
            <h2 id="record-modal-title">
              {record
                ? kind === "Prestation" ? te("Modifier la prestation") : te("Modifier le produit")
                : kind === "Prestation" ? te("Nouvelle prestation") : feature.createLabel}
            </h2>
          </div>
          <button onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <fieldset className="type-radios">
            <legend>{te("Type")}<b> *</b></legend>
            <label>
              <input type="radio" name="productKind" checked={kind === "Produit"} onChange={() => setKind("Produit")} />
              {te("Produit")}
            </label>
            <label>
              <input type="radio" name="productKind" checked={kind === "Prestation"} onChange={() => setKind("Prestation")} />
              {te("Prestation")}
            </label>
          </fieldset>

          <div className="computed-title">
            <span>{te("Intitulé produit")}</span>
            <strong>{productTitle || te("Famille · désignation complète")}</strong>
            <small>{te("Généré automatiquement à partir de la famille et de la désignation complète.")}</small>
          </div>

          <div className="form-grid">
            <div className="field">
              <span>{te("Famille")}<b> *</b></span>
              <div className="family-select-row">
                <select value={family} onChange={(event) => setFamily(event.target.value)}>
                  {catalogueFamilies.map((item) => <option key={item}>{item}</option>)}
                </select>
                <button type="button" className="icon-button" title={te("Ajouter une famille")} onClick={() => setAddingFamily(true)}><Plus size={17} /></button>
              </div>
              {addingFamily && (
                <div className="inline-add">
                  <input
                    value={newFamily}
                    onChange={(event) => setNewFamily(event.target.value)}
                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addFamily(); } }}
                    placeholder={te("Nouvelle famille (ex. Marque-pages)")}
                  />
                  <button type="button" className="button button-primary" onClick={addFamily}>{te("Ajouter")}</button>
                  <button type="button" className="button button-secondary" onClick={() => { setAddingFamily(false); setNewFamily(""); }}>{te("Annuler")}</button>
                </div>
              )}
            </div>
            <label className="field">
              <span>{te("Prix de base")}<b> *</b></span>
              <input type="number" min={0} value={basePrice} onChange={(event) => setBasePrice(event.target.value)} />
            </label>
            <label className="field field-wide">
              <span>{te("Désignation complète")}<b> *</b></span>
              <input
                value={designation}
                onChange={(event) => setDesignation(event.target.value)}
                placeholder={te("Ex. 85×55 mm · 350 g · Quadri R/V")}
              />
            </label>
            <label className="field">
              <span>{te("Quantité minimum")}<b> *</b></span>
              <input type="number" min={1} value={minQuantity} onChange={(event) => setMinQuantity(event.target.value)} />
            </label>
            <label className="field">
              <span>{te("Statut")}</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {feature.statuses.map((item) => <option key={item} value={item}>{te(item)}</option>)}
              </select>
            </label>
          </div>

          {kind === "Produit" && (
            <>
              <PricedOptionList
                title="Nombre de côtés imprimés"
                hint="Libellé + prix unitaire (ex. Recto seul, Recto-verso)."
                rows={printSides}
                onChange={setPrintSides}
                onAdd={() => setPrintSides([...printSides, newPricedOption()])}
                onUpdate={(id, patch) => updateRow(printSides, setPrintSides, id, patch)}
              />
              <PricedOptionList
                title="Type de papier"
                hint="Support proposé pour ce produit, avec un supplément éventuel."
                rows={paperTypes}
                onChange={setPaperTypes}
                onAdd={() => setPaperTypes([...paperTypes, newPricedOption()])}
                onUpdate={(id, patch) => updateRow(paperTypes, setPaperTypes, id, patch)}
              />
              <PricedOptionList
                title="Options supplémentaires"
                hint="Finitions, façonnage, extras — chaque ligne a un libellé et un prix."
                rows={extraOptions}
                onChange={setExtraOptions}
                onAdd={() => setExtraOptions([...extraOptions, newPricedOption()])}
                onUpdate={(id, patch) => updateRow(extraOptions, setExtraOptions, id, patch)}
                optional
              />
            </>
          )}

          <ProductMaterialsList
            rows={composition}
            materials={materials}
            onChange={setComposition}
          />

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

function PricedOptionList({
  title,
  hint,
  rows,
  onChange,
  onAdd,
  onUpdate,
  optional = false,
}: {
  title: string;
  hint: string;
  rows: PricedOption[];
  onChange: (next: PricedOption[]) => void;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<PricedOption>) => void;
  optional?: boolean;
}) {
  const { te } = useApp();
  return (
    <fieldset className="priced-list">
      <legend>
        {te(title)}{!optional && <b> *</b>}
        <small>{te(hint)}</small>
      </legend>
      {rows.map((row, index) => (
        <div className="priced-row" key={row.id}>
          <label>
            <span>{te("Libellé")}</span>
            <input
              aria-label={`${te(title)} ${te("Libellé")} ${index + 1}`}
              placeholder={te("Ex. Recto-verso")}
              value={row.label}
              onChange={(event) => onUpdate(row.id, { label: event.target.value })}
            />
          </label>
          <label>
            <span>{te("Prix")}</span>
            <input
              type="number"
              min={0}
              aria-label={`${te(title)} ${te("Prix")} ${index + 1}`}
              value={row.price}
              onChange={(event) => onUpdate(row.id, { price: Number(event.target.value) || 0 })}
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={te("Retirer cette ligne")}
            disabled={rows.length <= 1}
            onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button type="button" className="add-row-button" onClick={onAdd}>
        <Plus size={15} /> {te("Ajouter un champ")}
      </button>
    </fieldset>
  );
}

function ProductMaterialsList({
  rows,
  materials,
  onChange,
}: {
  rows: ProductMaterial[];
  materials: MockRecord[];
  onChange: (next: ProductMaterial[]) => void;
}) {
  const { te } = useApp();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const used = new Set(rows.map((item) => item.materialId));
  const needle = query.trim().toLocaleLowerCase("fr");
  const suggestions = materials.filter((item) => {
    if (used.has(item.id)) return false;
    if (!needle) return true;
    return [item.name, item.reference, item.unit, item.type].some((value) =>
      String(value || "").toLocaleLowerCase("fr").includes(needle),
    );
  });

  function pick(material: MockRecord) {
    onChange([...rows, newProductMaterial(material)]);
    setQuery("");
    setOpen(false);
  }

  return (
    <fieldset className="priced-list">
      <legend>
        {te("Matières premières")}
        <small>{te("Facultatif — libellé, quantité et unité des matières utilisées.")}</small>
      </legend>
      {rows.length === 0 && (
        <p className="settings-hint">{te("Aucune matière pour l’instant. Recherchez-en une ci-dessous.")}</p>
      )}
      {rows.map((row, index) => (
        <div className="priced-row bom-row" key={row.id}>
          <label>
            <span>{te("Libellé")}</span>
            <input aria-label={`Matière libellé ${index + 1}`} value={row.label} readOnly />
          </label>
          <label>
            <span>{te("Quantité")}</span>
            <input
              type="number"
              min={0}
              step="any"
              aria-label={`Matière quantité ${index + 1}`}
              value={row.quantity}
              onChange={(event) => {
                const quantity = Number(event.target.value) || 0;
                onChange(rows.map((item) => (item.id === row.id ? { ...item, quantity } : item)));
              }}
            />
          </label>
          <label>
            <span>{te("Unité")}</span>
            <input aria-label={`Matière unité ${index + 1}`} value={row.unit} readOnly />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={te("Retirer cette matière")}
            onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {materials.length === 0 ? (
        <p className="settings-hint">
          {te("Le catalogue matières est vide.")}{" "}
          <Link href="/admin/configuration/matieres">{te("Ouvrir les matières")}</Link>
        </p>
      ) : (
        <div className="field">
          <span>{te("Ajouter une matière")}</span>
          <div className="seg-autocomplete">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 180)}
              placeholder={te("Rechercher une matière première…")}
              autoComplete="off"
              spellCheck={false}
            />
            {open && (
              <ul className="seg-suggest">
                {suggestions.length === 0 ? (
                  <li className="muted">{te("Aucune matière correspondante.")}</li>
                ) : suggestions.map((item) => (
                  <li key={item.id}>
                    <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => pick(item)}>
                      <strong>{item.name}</strong>
                      <small>{item.unit} · {item.type}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </fieldset>
  );
}
