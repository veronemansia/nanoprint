"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Check, Heading, Image as ImageIcon,
  LoaderCircle, Minus, Plus, Table2, Trash2, Type, X,
} from "lucide-react";
import {
  A4_HEIGHT,
  A4_WIDTH,
  defaultDocumentLayout,
  newDocBlock,
  parseDocumentLayout,
  renderDocumentHtml,
  stringifyDocumentLayout,
  type DocAlign,
  type DocBlock,
  type DocBlockType,
} from "@/lib/document-template";
import { useApp } from "@/components/providers/app-provider";
import type { MockRecord } from "@/lib/types";

type DragSession = {
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  orig: DocBlock;
  el: HTMLElement;
  live?: Partial<Pick<DocBlock, "x" | "y" | "w" | "h">>;
};

export function DocumentNameModal({
  onClose,
  onDesign,
}: {
  onClose: () => void;
  onDesign: (name: string) => void;
}) {
  const { te } = useApp();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const label = name.trim();
    if (!label) {
      setError(te("Saisissez le libellé du document."));
      return;
    }
    onDesign(label);
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="doc-name-title">
        <div className="modal-head">
          <div>
            <span className="panel-kicker">{te("Nouveau modèle")}</span>
            <h2 id="doc-name-title">{te("Créer un document")}</h2>
          </div>
          <button onClick={onClose} aria-label={te("Fermer")}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <label className="field field-wide">
            <span>{te("Libellé")}<b> *</b></span>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder={te("Ex. Devis entreprise NanoPrint")} autoFocus />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button className="button button-secondary" type="button" onClick={onClose}>{te("Annuler")}</button>
            <button className="button button-primary" type="submit"><Plus size={17} /> {te("Concevoir")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DocumentPreview({
  record,
  onClose,
  onEdit,
}: {
  record: MockRecord;
  onClose: () => void;
  onEdit: () => void;
}) {
  const html = String(record.html || "");
  return (
    <div className="modal-backdrop designer-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="designer-preview" role="dialog" aria-modal="true" aria-label={`Aperçu ${record.name}`}>
        <div className="designer-preview-head">
          <div>
            <span className="panel-kicker">{record.reference}</span>
            <h2>{record.name}</h2>
          </div>
          <div className="heading-actions">
            <button className="button button-secondary" onClick={onClose}>Fermer</button>
            <button className="button button-primary" onClick={onEdit}>Concevoir</button>
          </div>
        </div>
        <div className="designer-preview-stage">
          {html ? (
            <div className="a4-html-host" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p>Aucun design enregistré. Cliquez sur Concevoir.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DocumentDesigner({
  name: initialName,
  record,
  pending,
  statuses,
  onClose,
  onSubmit,
}: {
  name: string;
  record?: MockRecord;
  pending: boolean;
  statuses: string[];
  onClose: () => void;
  onSubmit: (values: Record<string, string | number>) => Promise<void>;
}) {
  const { te } = useApp();
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState(record?.status ?? "Brouillon");
  const [blocks, setBlocks] = useState<DocBlock[]>(() => {
    const parsed = parseDocumentLayout(record?.layout);
    return parsed.length ? parsed : defaultDocumentLayout(initialName);
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragSession | null>(null);
  const selected = blocks.find((item) => item.id === selectedId) ?? null;

  const patchBlock = useCallback((id: string, patch: Partial<DocBlock>) => {
    setBlocks((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  function addBlock(type: DocBlockType) {
    const next = newDocBlock(
      type,
      type === "title" ? { content: name || "Titre" } : type === "logo" ? { src: "" } : {},
    );
    setBlocks((current) => [...current, next]);
    setSelectedId(next.id);
  }

  function removeSelected() {
    if (!selectedId) return;
    setBlocks((current) => current.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>, block: DocBlock, mode: "move" | "resize") {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(block.id);
    const el = mode === "resize" ? (event.currentTarget.parentElement as HTMLElement) : event.currentTarget;
    const session: DragSession = { id: block.id, mode, startX: event.clientX, startY: event.clientY, orig: block, el };
    drag.current = session;
    el.style.willChange = "left, top, width, height";

    let raf = 0;
    let lastX = event.clientX;
    let lastY = event.clientY;
    let scheduled = false;

    function apply() {
      scheduled = false;
      const current = drag.current;
      const page = pageRef.current;
      if (!current || !page) return;
      const rect = page.getBoundingClientRect();
      const dx = ((lastX - current.startX) / rect.width) * 100;
      const dy = ((lastY - current.startY) / rect.height) * 100;
      if (current.mode === "move") {
        const x = clamp(current.orig.x + dx, 0, 100 - current.orig.w);
        const y = clamp(current.orig.y + dy, 0, 100 - current.orig.h);
        current.el.style.left = `${x}%`;
        current.el.style.top = `${y}%`;
        current.live = { x, y };
      } else {
        const w = clamp(current.orig.w + dx, 8, 100 - current.orig.x);
        const h = clamp(current.orig.h + dy, 3, 100 - current.orig.y);
        current.el.style.width = `${w}%`;
        current.el.style.height = `${h}%`;
        current.live = { w, h };
      }
    }

    function move(next: PointerEvent) {
      lastX = next.clientX;
      lastY = next.clientY;
      if (scheduled) return;
      scheduled = true;
      raf = requestAnimationFrame(apply);
    }

    function up() {
      cancelAnimationFrame(raf);
      const current = drag.current;
      if (current) {
        current.el.style.willChange = "";
        if (current.live) patchBlock(current.id, current.live);
      }
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  async function save() {
    const label = name.trim();
    if (!label) {
      setError(te("Le libellé est obligatoire."));
      return;
    }
    if (!blocks.length) {
      setError(te("Ajoutez au moins un élément sur la page."));
      return;
    }
    setError("");
    await onSubmit({
      name: label,
      status,
      layout: stringifyDocumentLayout(blocks),
      html: renderDocumentHtml(blocks, label),
    });
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        setBlocks((current) => current.filter((item) => item.id !== selectedId));
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  return (
    <div className="designer-shell" role="dialog" aria-modal="true" aria-label={te("Concepteur A4")}>
      <header className="designer-bar">
        <div>
          <span className="panel-kicker">{record ? record.reference : te("Nouveau modèle")}</span>
          <input className="designer-title-input" value={name} onChange={(event) => setName(event.target.value)} aria-label={te("Libellé")} />
        </div>
        <div className="designer-bar-actions">
          <select aria-label={te("Statut")} value={status} onChange={(event) => setStatus(event.target.value)}>
            {statuses.map((item) => <option key={item} value={item}>{te(item)}</option>)}
          </select>
          <button className="button button-secondary" type="button" onClick={onClose}>{te("Annuler")}</button>
          <button className="button button-primary" type="button" disabled={pending} onClick={save}>
            {pending ? <><LoaderCircle className="spin" size={17} /> {te("Enregistrement…")}</> : <><Check size={17} /> {te("Valider")}</>}
          </button>
        </div>
      </header>

      <div className="designer-body">
        <aside className="designer-tools">
          <span className="panel-kicker">{te("Insérer")}</span>
          <button type="button" onClick={() => addBlock("logo")}><ImageIcon size={16} /> {te("Logo")}</button>
          <button type="button" onClick={() => addBlock("title")}><Heading size={16} /> {te("Titre")}</button>
          <button type="button" onClick={() => addBlock("text")}><Type size={16} /> {te("Texte")}</button>
          <button type="button" onClick={() => addBlock("table")}><Table2 size={16} /> {te("Tableau")}</button>
          <button type="button" onClick={() => addBlock("line")}><Minus size={16} /> {te("Ligne")}</button>
          <p>{te("Glissez les blocs sur la feuille A4. Le logo se déplace comme les autres éléments.")}</p>
        </aside>

        <div className="designer-stage">
          <div
            className="a4-page"
            ref={pageRef}
            style={{ width: A4_WIDTH, height: A4_HEIGHT }}
            onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}
          >
            {blocks.map((block) => (
              <div
                key={block.id}
                className={`doc-block${block.type === "logo" ? " is-logo" : ""}${block.id === selectedId ? " is-selected" : ""}`}
                style={{
                  left: `${block.x}%`,
                  top: `${block.y}%`,
                  width: `${block.w}%`,
                  height: `${block.h}%`,
                  textAlign: block.align,
                }}
                onPointerDown={(event) => onPointerDown(event, block, "move")}
              >
                <BlockPreview block={block} />
                {block.id === selectedId && (
                  <i className="doc-resize" onPointerDown={(event) => onPointerDown(event, block, "resize")} />
                )}
              </div>
            ))}
          </div>
        </div>

        <aside className="designer-props">
          <span className="panel-kicker">Propriétés</span>
          {!selected ? (
            <p>Sélectionnez un élément pour le modifier.</p>
          ) : (
            <BlockInspector
              key={selected.id}
              block={selected}
              onChange={(patch) => patchBlock(selected.id, patch)}
              onRemove={removeSelected}
            />
          )}
          {error && <div className="form-error" role="alert">{error}</div>}
        </aside>
      </div>
    </div>
  );
}

const BlockPreview = memo(function BlockPreview({ block }: { block: DocBlock }) {
  if (block.type === "logo") {
    return block.src
      ? <img src={block.src} alt="Logo" draggable={false} decoding="async" style={{ objectPosition: `${block.align} center` }} />
      : <span className="doc-placeholder">Logo</span>;
  }
  if (block.type === "line") {
    return <span className="doc-line" style={{ background: block.color }} />;
  }
  if (block.type === "table") {
    const rows = block.rows.length ? block.rows : [["", ""]];
    return (
      <table>
        <tbody>
          {rows.map((line, rowIndex) => (
            <tr key={rowIndex}>
              {line.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell || " "}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const Tag = block.type === "title" ? "strong" : "span";
  return (
    <Tag className="doc-rich" style={{ fontSize: block.fontSize, color: block.color, textAlign: block.align }}>
      {block.content || (block.type === "title" ? "Titre" : "Texte")}
    </Tag>
  );
});

function BlockInspector({
  block,
  onChange,
  onRemove,
}: {
  block: DocBlock;
  onChange: (patch: Partial<DocBlock>) => void;
  onRemove: () => void;
}) {
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  function setAlign(align: DocAlign) {
    onChange({ align });
  }

  function updateCell(rowIndex: number, cellIndex: number, value: string) {
    const rows = block.rows.map((line, index) =>
      index === rowIndex ? line.map((cell, current) => (current === cellIndex ? value : cell)) : line,
    );
    onChange({ rows });
  }

  function addRow() {
    const cols = block.rows[0]?.length || 3;
    onChange({ rows: [...block.rows, Array.from({ length: cols }, () => "")] });
  }

  function addCol() {
    onChange({ rows: block.rows.map((line) => [...line, ""]) });
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const prepared = await prepareLogoFile(file);
      const height = clamp(block.w * (A4_WIDTH / A4_HEIGHT) / prepared.ratio, 4, 100 - block.y);
      onChange({ src: prepared.src, h: height });
    } catch {
      setUploadError("Impossible de lire ce fichier. Utilisez un PNG, JPG ou SVG.");
    } finally {
      setUploading(false);
    }
  }

  const showAlign = block.type === "title" || block.type === "text" || block.type === "logo";
  const showSize = block.type === "title" || block.type === "text" || block.type === "table";

  return (
    <div className="designer-inspector">
      <strong>{labelFor(block.type)}</strong>
      {(block.type === "title" || block.type === "text") && (
        <label className="field">
          <span>Contenu</span>
          <textarea rows={4} value={block.content} onChange={(event) => onChange({ content: event.target.value })} />
        </label>
      )}
      {block.type === "logo" && (
        <label className="upload-zone">
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" onChange={onFile} />
          <span>
            <strong>{uploading ? "Traitement du logo…" : "Importer un logo"}</strong>
            <small>PNG, JPG ou SVG — le fond est retiré, seul le logo reste.</small>
          </span>
        </label>
      )}
      {uploadError && <div className="form-error" role="alert">{uploadError}</div>}
      {block.type === "table" && (
        <div className="designer-table-edit">
          {block.rows.map((line, rowIndex) => (
            <div className="designer-table-row" key={rowIndex}>
              {line.map((cell, cellIndex) => (
                <input
                  key={cellIndex}
                  value={cell}
                  onChange={(event) => updateCell(rowIndex, cellIndex, event.target.value)}
                  aria-label={`Cellule ${rowIndex + 1}-${cellIndex + 1}`}
                />
              ))}
            </div>
          ))}
          <div className="inline-add">
            <button type="button" className="add-row-button" onClick={addRow}><Plus size={14} /> Ligne</button>
            <button type="button" className="add-row-button" onClick={addCol}><Plus size={14} /> Colonne</button>
          </div>
        </div>
      )}
      {showSize && (
        <label className="field">
          <span>Taille du texte</span>
          <input type="number" min={8} max={48} value={block.fontSize} onChange={(event) => onChange({ fontSize: Number(event.target.value) || 13 })} />
        </label>
      )}
      {showAlign && (
        <div className="align-switch" role="group" aria-label="Alignement du texte">
          <button type="button" className={block.align === "left" ? "active" : ""} onClick={() => setAlign("left")} aria-label="Aligner à gauche"><AlignLeft size={15} /></button>
          <button type="button" className={block.align === "center" ? "active" : ""} onClick={() => setAlign("center")} aria-label="Centrer"><AlignCenter size={15} /></button>
          <button type="button" className={block.align === "right" ? "active" : ""} onClick={() => setAlign("right")} aria-label="Aligner à droite"><AlignRight size={15} /></button>
        </div>
      )}
      <button type="button" className="button button-secondary" onClick={onRemove}><Trash2 size={15} /> Supprimer l’élément</button>
    </div>
  );
}

function labelFor(type: DocBlockType) {
  if (type === "logo") return "Logo";
  if (type === "title") return "Titre";
  if (type === "table") return "Tableau";
  if (type === "line") return "Ligne";
  return "Texte";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("read"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image"));
    image.src = src;
  });
}

async function prepareLogoFile(file: File) {
  if (!file.type.startsWith("image/") && !file.name.toLowerCase().endsWith(".svg")) {
    throw new Error("type");
  }

  const dataUrl = await readDataUrl(file);
  const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
  if (isSvg) {
    const image = await loadImage(dataUrl);
    return { src: dataUrl, ratio: Math.max(0.2, (image.naturalWidth || 1) / (image.naturalHeight || 1)) };
  }

  const image = await loadImage(dataUrl);
  let max = 480;
  let src = "";
  let ratio = 1;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight, 1));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const before = document.createElement("canvas");
    before.width = width;
    before.height = height;
    const beforeCtx = before.getContext("2d");
    beforeCtx?.drawImage(canvas, 0, 0);
    knockOutBackground(ctx, width, height);
    let trimmed = trimCanvas(ctx, width, height);
    if (trimmed.width * trimmed.height < width * height * 0.04 && beforeCtx) {
      trimmed = before;
    }
    src = trimmed.toDataURL("image/png");
    ratio = Math.max(0.2, trimmed.width / Math.max(1, trimmed.height));
    if (src.length <= 420_000) break;
    max = Math.round(max * 0.65);
  }

  return { src, ratio };
}

function knockOutBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const corners = [
    pixelAt(data, width, 0, 0),
    pixelAt(data, width, width - 1, 0),
    pixelAt(data, width, 0, height - 1),
    pixelAt(data, width, width - 1, height - 1),
  ];
  const opaqueCorners = corners.filter((pixel) => pixel.a > 40);
  if (opaqueCorners.length < 3) {
    ctx.putImageData(image, 0, 0);
    return;
  }
  const bg = {
    r: Math.round(opaqueCorners.reduce((sum, pixel) => sum + pixel.r, 0) / opaqueCorners.length),
    g: Math.round(opaqueCorners.reduce((sum, pixel) => sum + pixel.g, 0) / opaqueCorners.length),
    b: Math.round(opaqueCorners.reduce((sum, pixel) => sum + pixel.b, 0) / opaqueCorners.length),
  };
  const lum = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
  const spread = Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b);
  if (lum < 228 || spread > 22) {
    ctx.putImageData(image, 0, 0);
    return;
  }
  if (edgeMatchRatio(data, width, height, bg) < 0.55) {
    ctx.putImageData(image, 0, 0);
    return;
  }

  const threshold = 42;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const dist = colorDist(data[i], data[i + 1], data[i + 2], bg.r, bg.g, bg.b);
    if (dist < threshold) {
      data[i + 3] = Math.round(data[i + 3] * (dist / threshold));
    }
  }
  ctx.putImageData(image, 0, 0);
}

function trimCanvas(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  let top = 0;
  let left = 0;
  let right = width - 1;
  let bottom = height - 1;
  let found = false;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        top = y;
        found = true;
        break;
      }
    }
    if (found) break;
  }
  found = false;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        bottom = y;
        found = true;
        break;
      }
    }
    if (found) break;
  }
  found = false;
  for (let x = 0; x < width; x += 1) {
    for (let y = top; y <= bottom; y += 1) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        left = x;
        found = true;
        break;
      }
    }
    if (found) break;
  }
  found = false;
  for (let x = width - 1; x >= 0; x -= 1) {
    for (let y = top; y <= bottom; y += 1) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        right = x;
        found = true;
        break;
      }
    }
    if (found) break;
  }

  const tw = Math.max(1, right - left + 1);
  const th = Math.max(1, bottom - top + 1);
  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  const next = out.getContext("2d");
  if (!next) return ctx.canvas;
  next.clearRect(0, 0, tw, th);
  next.drawImage(ctx.canvas, left, top, tw, th, 0, 0, tw, th);
  return out;
}

function pixelAt(data: Uint8ClampedArray, width: number, x: number, y: number) {
  const i = (y * width + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
}

function colorDist(r: number, g: number, b: number, r2: number, g2: number, b2: number) {
  return Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2);
}

function edgeMatchRatio(data: Uint8ClampedArray, width: number, height: number, bg: { r: number; g: number; b: number }) {
  let match = 0;
  let total = 0;
  const check = (x: number, y: number) => {
    const pixel = pixelAt(data, width, x, y);
    total += 1;
    if (pixel.a < 40 || colorDist(pixel.r, pixel.g, pixel.b, bg.r, bg.g, bg.b) < 42) match += 1;
  };
  for (let x = 0; x < width; x += 1) {
    check(x, 0);
    check(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    check(0, y);
    check(width - 1, y);
  }
  return total ? match / total : 0;
}
