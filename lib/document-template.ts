import type { MockRecord } from "@/lib/types";

export type DocAlign = "left" | "center" | "right";
export type DocBlockType = "logo" | "title" | "text" | "table" | "line";

export type DocBlock = {
  id: string;
  type: DocBlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  content: string;
  src: string;
  align: DocAlign;
  fontSize: number;
  color: string;
  rows: string[][];
};

export const A4_WIDTH = 794;
export const A4_HEIGHT = 1123;

export const NANOPRINT_LOGO =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="32" height="32" fill="#08a6c9"/><rect x="32" width="32" height="32" fill="#d90a74"/><rect y="32" width="32" height="32" fill="#e9b918"/><rect x="32" y="32" width="32" height="32" fill="#181a18"/></svg>`,
  );

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeCssColor(value: string) {
  const color = String(value || "").trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) return color;
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(color)) return color;
  return "#181a18";
}

function safeImageSrc(src: string) {
  const value = String(src || "").trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml)(?:;charset=[^;,]*)?(;base64)?,/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {
    /* ignore invalid URLs */
  }
  return NANOPRINT_LOGO;
}

export function newDocBlock(type: DocBlockType, patch: Partial<DocBlock> = {}): DocBlock {
  const presets: Record<DocBlockType, Partial<DocBlock>> = {
    logo: { x: 6, y: 5, w: 14, h: 9, src: NANOPRINT_LOGO, content: "Logo" },
    title: { x: 22, y: 5, w: 72, h: 8, content: "Document", fontSize: 26, align: "left" },
    text: { x: 6, y: 18, w: 88, h: 10, content: "Texte du document", fontSize: 13 },
    table: {
      x: 6, y: 36, w: 88, h: 22, fontSize: 12,
      rows: [
        ["Désignation", "Qté", "PU", "Montant"],
        ["Ligne 1", "1", "0", "0"],
        ["Ligne 2", "1", "0", "0"],
      ],
    },
    line: { x: 6, y: 16, w: 88, h: 2, color: "#08a6c9" },
  };
  return {
    id: crypto.randomUUID(),
    type,
    x: 6,
    y: 8,
    w: 40,
    h: 8,
    content: "",
    src: "",
    align: "left",
    fontSize: 13,
    color: "#181a18",
    rows: [],
    ...presets[type],
    ...patch,
  };
}

export function defaultDocumentLayout(title: string): DocBlock[] {
  return [
    newDocBlock("logo"),
    newDocBlock("title", { content: title || "Nouveau document" }),
    newDocBlock("text", {
      y: 16,
      h: 8,
      content: "NanoPrint — Hann Bel-Air, Dakar\nTél. +221 33 800 00 00 · contact@nanoprint.sn",
      fontSize: 11,
      color: "#77776f",
    }),
    newDocBlock("line", { y: 26 }),
    newDocBlock("text", {
      y: 29,
      h: 6,
      content: "Client : {{client}}\nRéférence : {{ref}} · Date : {{date}}",
      fontSize: 12,
    }),
    newDocBlock("table", { y: 38 }),
    newDocBlock("text", {
      y: 78,
      h: 12,
      content: "Offre valable 30 jours. Acompte 40 % à la commande. TVA 18 %.\nNINEA 0065432 2A2 · IBAN SN08 SN010 01001 0123456789 12.",
      fontSize: 11,
      color: "#77776f",
    }),
  ];
}

export function parseDocumentLayout(raw: string | number | undefined): DocBlock[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const row = item as Partial<DocBlock>;
      const type: DocBlockType = ["logo", "title", "text", "table", "line"].includes(String(row.type))
        ? (row.type as DocBlockType)
        : "text";
      return {
        id: String(row.id || crypto.randomUUID()),
        type,
        x: Number(row.x) || 0,
        y: Number(row.y) || 0,
        w: Math.max(4, Number(row.w) || 20),
        h: Math.max(2, Number(row.h) || 6),
        content: String(row.content ?? ""),
        src: String(row.src ?? ""),
        align: row.align === "center" || row.align === "right" ? row.align : "left",
        fontSize: Math.min(72, Math.max(8, Number(row.fontSize) || 13)),
        color: safeCssColor(String(row.color || "#181a18")),
        rows: Array.isArray(row.rows) ? row.rows.map((line) => (Array.isArray(line) ? line.map((cell) => String(cell)) : [])) : [],
      };
    });
  } catch {
    return [];
  }
}

export function stringifyDocumentLayout(blocks: DocBlock[]) {
  return JSON.stringify(blocks);
}

function blockHtml(block: DocBlock) {
  const color = safeCssColor(block.color);
  const box = `position:absolute;left:${Number(block.x) || 0}%;top:${Number(block.y) || 0}%;width:${Number(block.w) || 20}%;height:${Number(block.h) || 6}%;overflow:hidden;box-sizing:border-box;text-align:${block.align};color:${color};font-size:${block.fontSize}px;line-height:1.35;background:transparent;`;
  if (block.type === "logo") {
    const src = safeImageSrc(block.src || NANOPRINT_LOGO);
    return `<div style="${box}"><img src="${escapeHtml(src)}" alt="Logo" style="width:100%;height:100%;object-fit:contain;object-position:${block.align} center;background:transparent;display:block;"/></div>`;
  }
  if (block.type === "line") {
    return `<div style="${box}display:flex;align-items:center;"><i style="display:block;width:100%;height:3px;background:${color};"></i></div>`;
  }
  if (block.type === "table") {
    const rows = block.rows.length ? block.rows : [["", ""]];
    const body = rows.map((line, index) => {
      const cells = line.map((cell) => `<td style="border:1px solid #dedbd2;padding:6px 8px;${index === 0 ? "font-weight:700;background:#f6f5f1;" : ""}">${escapeHtml(cell)}</td>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<div style="${box}"><table style="width:100%;border-collapse:collapse;font-size:${block.fontSize}px;">${body}</table></div>`;
  }
  const tag = block.type === "title" ? "h1" : "p";
  const extra = block.type === "title" ? "margin:0;width:100%;display:block;font-family:Arial,sans-serif;letter-spacing:-.03em;" : "margin:0;width:100%;display:block;white-space:pre-wrap;";
  return `<div style="${box}"><${tag} style="${extra}font-size:${block.fontSize}px;text-align:${block.align};color:${color};">${escapeHtml(block.content).replaceAll("\n", "<br/>")}</${tag}></div>`;
}

export function renderDocumentHtml(blocks: DocBlock[], title = "") {
  const inner = blocks.map(blockHtml).join("");
  return `<div class="np-a4" data-title="${escapeHtml(title)}" style="position:relative;width:210mm;height:297mm;margin:0 auto;background:#fff;color:#181a18;font-family:Arial,Helvetica,sans-serif;overflow:hidden;">${inner}</div>`;
}

export type QuoteTemplateData = {
  client: string;
  phone: string;
  address: string;
  email: string;
  ref: string;
  date: string;
  amount: string;
  lines: { designation: string; quantity: string; unit: string; total: string }[];
};

function applyPlaceholders(value: string, data: QuoteTemplateData) {
  return value
    .replaceAll("{{client}}", data.client)
    .replaceAll("{{phone}}", data.phone)
    .replaceAll("{{address}}", data.address)
    .replaceAll("{{email}}", data.email)
    .replaceAll("{{ref}}", data.ref)
    .replaceAll("{{date}}", data.date)
    .replaceAll("{{amount}}", data.amount);
}

export function listOutputTemplates(docs: MockRecord[]) {
  return (docs ?? []).filter((item) => {
    if (item.status === "Archivé") return false;
    if (item.status !== "Publié") return false;
    const layout = parseDocumentLayout(item.layout);
    return layout.length > 0;
  });
}

export function getOutputTemplate(docs: MockRecord[], id: string) {
  const safeId = String(id || "").trim();
  if (!safeId) return undefined;
  return listOutputTemplates(docs).find((item) => item.id === safeId);
}

export function findQuoteTemplate(docs: MockRecord[]) {
  const list = listOutputTemplates(docs);
  const match = (needle: string) =>
    list.find((item) => String(item.name || "").toLocaleLowerCase("fr").includes(needle));
  return (
    list.find((item) => String(item.name || "").trim().toLocaleLowerCase("fr") === "devis test")
    ?? match("devis test")
    ?? list.find((item) => String(item.name || "").toLocaleLowerCase("fr").includes("devis"))
    ?? list[0]
  );
}

export function fillQuoteLayout(blocks: DocBlock[], data: QuoteTemplateData): DocBlock[] {
  return blocks.map((block) => {
    if (block.type === "text" || block.type === "title") {
      return { ...block, content: applyPlaceholders(block.content, data) };
    }
    if (block.type === "table") {
      const header = block.rows[0]?.length ? block.rows[0] : ["Désignation", "Qté", "PU", "Montant"];
      const cols = Math.max(header.length, 4);
      const pad = (row: string[]) => {
        const next = [...row];
        while (next.length < cols) next.push("");
        return next.slice(0, cols);
      };
      const body = data.lines.map((line) => pad([line.designation, line.quantity, line.unit, line.total]));
      body.push(pad(["Total", "", "", data.amount]));
      return { ...block, rows: [pad(header), ...body] };
    }
    return block;
  });
}

export function fillQuoteHtml(template: MockRecord, data: QuoteTemplateData) {
  const blocks = fillQuoteLayout(parseDocumentLayout(template.layout), data);
  return renderDocumentHtml(blocks, String(template.name || "Document"));
}

function safePrintTitle(title: string) {
  return escapeHtml(String(title || "Document").replace(/[\u0000-\u001f]/g, "").slice(0, 120));
}

const DOCUMENT_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/><link href="https://fonts.googleapis.com/css2?family=Saira:wght@400;600;700&family=Saira+Condensed:wght@600;700&display=swap" rel="stylesheet"/>`;

export function wrapDocumentPreview(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/>${DOCUMENT_FONTS}<style>html,body{margin:0;background:#eceae3}body{padding:16px 8px}.np-a4{box-shadow:0 18px 50px rgba(0,0,0,.16)}</style></head><body>${html}</body></html>`;
}

export function printQuoteHtml(html: string, title = "Document") {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("sandbox", "allow-modals allow-popups allow-same-origin");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  const heading = safePrintTitle(title);
  const page = `<!doctype html><html><head><meta charset="utf-8"/><title>${heading}</title>${DOCUMENT_FONTS}<style>@page{size:A4;margin:0}body{margin:0;background:#fff}</style></head><body>${html}</body></html>`;
  const run = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1500);
  };
  frame.addEventListener("load", () => {
    const images = Array.from(frame.contentDocument?.images ?? []);
    if (!images.length) {
      window.setTimeout(run, 200);
      return;
    }
    let left = images.length;
    const tick = () => {
      left -= 1;
      if (!left) window.setTimeout(run, 120);
    };
    images.forEach((image) => {
      if (image.complete) tick();
      else {
        image.addEventListener("load", tick);
        image.addEventListener("error", tick);
      }
    });
  }, { once: true });
  document.body.appendChild(frame);
  frame.srcdoc = page;
}

function templateRecord(
  id: string,
  reference: string,
  name: string,
  status: string,
  updatedAt: string,
  blocks: DocBlock[],
): MockRecord {
  return {
    id,
    reference,
    name,
    status,
    updatedAt,
    layout: stringifyDocumentLayout(blocks),
    html: renderDocumentHtml(blocks, name),
  };
}

const t0 = "03 sept. 2026";
const t1 = "02 sept. 2026";
const t2 = "01 sept. 2026";
const t3 = "28 août 2026";

export const documentTemplateRecords: MockRecord[] = [
  templateRecord("mod-1", "MOD-DV-01", "Devis entreprise NanoPrint", "Publié", t0, defaultDocumentLayout("DEVIS")),
  templateRecord("mod-6", "MOD-DV-TEST", "Devis test", "Publié", t0, [
    newDocBlock("logo"),
    newDocBlock("title", { content: "DEVIS TEST" }),
    newDocBlock("text", {
      y: 16,
      h: 8,
      content: "NanoPrint — Hann Bel-Air, Dakar\nTél. +221 33 800 00 00 · contact@nanoprint.sn",
      fontSize: 11,
      color: "#77776f",
    }),
    newDocBlock("line", { y: 26 }),
    newDocBlock("text", {
      y: 29,
      h: 10,
      content: "Client : {{client}}\nTél. {{phone}} · {{email}}\n{{address}}\nRéférence : {{ref}} · Date : {{date}}",
      fontSize: 12,
    }),
    newDocBlock("table", { y: 42, h: 32 }),
    newDocBlock("text", {
      y: 74,
      h: 10,
      content: "Total : {{amount}}\nOffre valable 30 jours. Acompte 40 % à la commande.",
      fontSize: 12,
    }),
  ]),
  templateRecord("mod-2", "MOD-BC-02", "Bon de commande atelier", "Publié", t1, [
    newDocBlock("logo"),
    newDocBlock("title", { content: "BON DE COMMANDE" }),
    newDocBlock("line", { y: 16, color: "#181a18" }),
    newDocBlock("text", { y: 20, content: "Atelier Hann Bel-Air · Ne pas lancer sans BAT signé.", color: "#77776f", fontSize: 12 }),
    newDocBlock("table", {
      y: 32,
      rows: [
        ["Article", "Qté", "Atelier", "Obs."],
        ["Papier couché 135 g", "12 rames", "Impression", ""],
        ["Pelliculage mat", "1", "Finition", ""],
      ],
    }),
    newDocBlock("text", { y: 78, content: "Contrôle qualité obligatoire avant expédition.", fontSize: 11, color: "#77776f" }),
  ]),
  templateRecord("mod-3", "MOD-FA-03", "Facture TTC Sénégal", "Publié", t1, [
    newDocBlock("logo", { x: 80, y: 5 }),
    newDocBlock("title", { x: 6, w: 70, content: "FACTURE" }),
    newDocBlock("text", { y: 16, content: "NanoPrint · NINEA 0065432 2A2\nHann Bel-Air, Dakar", fontSize: 11, color: "#77776f" }),
    newDocBlock("line", { y: 26 }),
    newDocBlock("table", {
      y: 32,
      rows: [
        ["Désignation", "Qté", "PU HT", "TVA", "TTC"],
        ["Prestation", "1", "0", "18 %", "0"],
      ],
    }),
    newDocBlock("text", { y: 78, content: "Paiement à 30 jours.\nIBAN SN08 SN010 01001 0123456789 12.", fontSize: 11, color: "#77776f" }),
  ]),
  templateRecord("mod-4", "MOD-BL-04", "Bon de livraison tournée Dakar", "Brouillon", t2, [
    newDocBlock("logo"),
    newDocBlock("title", { content: "BON DE LIVRAISON" }),
    newDocBlock("text", { y: 16, content: "Adresse atelier Hann Bel-Air\nContrôler les quantités à la réception.", fontSize: 12 }),
    newDocBlock("table", {
      y: 32,
      rows: [
        ["Colis", "Désignation", "Qté", "État"],
        ["1", "Livraison", "1", "À contrôler"],
      ],
    }),
    newDocBlock("text", { y: 78, content: "Réserves à formuler sous 48 h. Signature client :", fontSize: 11, color: "#77776f" }),
  ]),
  templateRecord("mod-5", "MOD-DV-05", "Devis pack agence 2025", "Archivé", t3, [
    newDocBlock("title", { x: 6, content: "DEVIS 2025 — ARCHIVÉ", color: "#77776f" }),
    newDocBlock("text", { y: 16, content: "Ancien modèle remplacé par MOD-DV-01.", fontSize: 12 }),
    newDocBlock("line", { y: 26, color: "#dedbd2" }),
    newDocBlock("table", { y: 32 }),
  ]),
];
