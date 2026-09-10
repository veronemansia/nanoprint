import { historyItemIsoDate, mentionsClient } from "@/lib/client-history";
import type { MockRecord } from "@/lib/types";

export const DEFAULT_CLIENT_SECTORS = [
  "Entreprises",
  "Particuliers",
  "Écoles",
  "Restaurants",
  "Hôtels",
  "Associations",
  "Agences de communication",
  "Administrations",
];

export type ImportanceKind = "petit" | "regulier" | "gros" | "vip";
export type BehaviorKind = "souvent" | "rarement" | "inactif";
export type SegmentAxis = "secteur" | "importance" | "comportement";

export const IMPORTANCE_OPTIONS: { id: ImportanceKind; label: string; hint: string }[] = [
  { id: "petit", label: "Petits clients", hint: "Moins de 5 commandes et total inférieur à 1 000 000" },
  { id: "regulier", label: "Clients réguliers", hint: "Au moins 5 commandes, sans atteindre le seuil gros / VIP" },
  { id: "gros", label: "Gros clients", hint: "Total des commandes ≥ 1 000 000" },
  { id: "vip", label: "Clients VIP", hint: "Total des commandes ≥ 3 000 000" },
];

export const BEHAVIOR_OPTIONS: { id: BehaviorKind; label: string; hint: string }[] = [
  { id: "souvent", label: "Clients qui commandent souvent", hint: "Au moins 2 commandes sur les 90 derniers jours" },
  { id: "rarement", label: "Clients qui commandent rarement", hint: "Au moins une commande sur 6 mois, sans fréquence élevée" },
  { id: "inactif", label: "Rien commandé depuis 6 mois", hint: "Aucune commande dans les 183 derniers jours" },
];

export type ClientOrderStats = {
  count: number;
  recent90: number;
  total: number;
  lastIso: string;
};

const DAY = 86_400_000;

function daysAgo(iso: string, now: Date) {
  return (now.getTime() - new Date(`${iso}T12:00:00`).getTime()) / DAY;
}

export function clientOrderStats(orders: MockRecord[], client: MockRecord, now = new Date()): ClientOrderStats {
  const mine = orders.filter((item) => mentionsClient(item, client));
  let lastIso = "";
  let recent90 = 0;
  let total = 0;
  for (const item of mine) {
    const iso = historyItemIsoDate(item);
    if (iso && (!lastIso || iso > lastIso)) lastIso = iso;
    if (iso && daysAgo(iso, now) <= 90) recent90 += 1;
    total += Number(item.amount) || 0;
  }
  return { count: mine.length, recent90, total, lastIso };
}

export function classifyImportance(stats: ClientOrderStats): ImportanceKind {
  if (stats.total >= 3_000_000) return "vip";
  if (stats.total >= 1_000_000) return "gros";
  if (stats.count >= 5) return "regulier";
  return "petit";
}

export function classifyBehavior(stats: ClientOrderStats, now = new Date()): BehaviorKind {
  if (!stats.lastIso || daysAgo(stats.lastIso, now) > 183) return "inactif";
  if (stats.recent90 >= 2) return "souvent";
  return "rarement";
}

export function sectorOf(client: MockRecord) {
  return String(client.sector || "").trim();
}

export function importanceLabel(kind: ImportanceKind) {
  return IMPORTANCE_OPTIONS.find((item) => item.id === kind)?.label ?? kind;
}

export function behaviorLabel(kind: BehaviorKind) {
  return BEHAVIOR_OPTIONS.find((item) => item.id === kind)?.label ?? kind;
}
