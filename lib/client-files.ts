import { normalizeQuoteRef } from "@/lib/quote-conversion";
import type { MockRecord } from "@/lib/types";

export const CLIENT_FILE_ACCEPT = ".pdf,.ai,.indd,.psd,.tif,.tiff,.jpg,.jpeg,.png,.zip,.eps";
export const CLIENT_FILE_MAX_BYTES = 80 * 1024 * 1024;

const DB_NAME = "nanoprint.client-files.v1";
const STORE = "blobs";

export function filesForOrder(files: MockRecord[], order: MockRecord) {
  const orderId = String(order.id);
  const orderRef = normalizeQuoteRef(order.reference);
  return files.filter((item) => {
    if (String(item.orderId || "") === orderId) return true;
    return Boolean(orderRef && normalizeQuoteRef(String(item.order || "")) === orderRef);
  });
}

export function fileLabelForOrder(files: MockRecord[], order: MockRecord) {
  const rows = filesForOrder(files, order);
  if (!rows.length) return "Aucun fichier";
  if (rows.some((item) => Number(item.version) > 1 || item.status === "Versionné")) return "Versionné";
  return "Reçu";
}

export function formatFromName(name: string) {
  const ext = name.trim().split(".").pop()?.toLocaleLowerCase("fr") || "";
  if (ext === "pdf") return "PDF";
  if (ext === "ai") return "AI";
  if (ext === "indd") return "INDD";
  if (ext === "psd") return "PSD";
  if (ext === "tif" || ext === "tiff") return "TIFF";
  if (ext === "jpg" || ext === "jpeg") return "JPEG";
  if (ext === "png") return "PNG";
  if (ext === "zip") return "ZIP";
  if (ext === "eps") return "EPS";
  return ext ? ext.toUpperCase() : "Fichier";
}

export function formatFileSize(bytes: number) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} Ko`;
  if (size < 1024 * 1024 * 1024) return `${Math.round(size / (1024 * 102.4)) / 10} Mo`;
  return `${Math.round(size / (1024 * 1024 * 102.4)) / 10} Go`;
}

export function sameFileName(left: string, right: string) {
  return left.trim().toLocaleLowerCase("fr") === right.trim().toLocaleLowerCase("fr");
}

export function findOrderFileByName(files: MockRecord[], order: MockRecord, name: string) {
  return filesForOrder(files, order).find((item) => sameFileName(String(item.name || ""), name));
}

export function nextClientFileReference(files: MockRecord[], order: MockRecord) {
  const stamp = String(order.reference || "").replace(/^CMD-/i, "") || String(Date.now()).slice(-6);
  const prefix = `FIC-${stamp}-`;
  const taken = new Set(files.map((item) => normalizeQuoteRef(item.reference)));
  for (let index = 1; index < 100; index += 1) {
    const reference = `${prefix}${String(index).padStart(2, "0")}`;
    if (!taken.has(normalizeQuoteRef(reference))) return reference;
  }
  return `FIC-${String(Date.now()).slice(-8)}`;
}

export function sanitizeClientFiles(list: FileList | File[]) {
  const files = Array.from(list).filter((file) => file && file.size >= 0 && file.name.trim());
  if (!files.length) return { error: "Choisissez au moins un fichier.", files: [] as File[] };
  const oversized = files.find((file) => file.size > CLIENT_FILE_MAX_BYTES);
  if (oversized) {
    return {
      error: `${oversized.name} dépasse ${formatFileSize(CLIENT_FILE_MAX_BYTES)}.`,
      files: [] as File[],
    };
  }
  return { error: "", files };
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB"));
  });
}

function idbRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB"));
  });
}

export async function putClientFileBlob(id: string, blob: Blob) {
  const db = await openDb();
  try {
    await idbRequest(db.transaction(STORE, "readwrite").objectStore(STORE).put(blob, id));
  } finally {
    db.close();
  }
}

export async function getClientFileBlob(id: string) {
  const db = await openDb();
  try {
    const value = await idbRequest(db.transaction(STORE, "readonly").objectStore(STORE).get(id));
    return value instanceof Blob ? value : undefined;
  } finally {
    db.close();
  }
}

export async function deleteClientFileBlob(id: string) {
  const db = await openDb();
  try {
    await idbRequest(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}

export async function clearClientFileBlobs() {
  const db = await openDb();
  try {
    await idbRequest(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
  } finally {
    db.close();
  }
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name || "fichier";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
