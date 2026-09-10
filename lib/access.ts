import { modules, navModules } from "@/lib/modules";
import type { ModuleId } from "@/lib/types";

export const CRUD_ACTIONS = [
  { key: "create", label: "Créer" },
  { key: "read", label: "Consulter" },
  { key: "update", label: "Modifier" },
  { key: "delete", label: "Supprimer" },
] as const;

export type CrudKey = (typeof CRUD_ACTIONS)[number]["key"];

export type ModulePermissions = Record<CrudKey, boolean>;

export type AccessRole = {
  id: string;
  name: string;
  permissions: Record<string, ModulePermissions>;
};

export function emptyPermissions(): Record<string, ModulePermissions> {
  return Object.fromEntries(
    modules.map((item) => [item.id, { create: false, read: false, update: false, delete: false }]),
  );
}

export function fullPermissions(): Record<string, ModulePermissions> {
  return Object.fromEntries(
    modules.map((item) => [item.id, { create: true, read: true, update: true, delete: true }]),
  );
}

function grant(ids: ModuleId[], patch: ModulePermissions) {
  const next = emptyPermissions();
  for (const id of ids) next[id] = { ...patch };
  return next;
}

export const defaultAccessRoles: AccessRole[] = [
  { id: "role-admin", name: "Administrateur", permissions: fullPermissions() },
  {
    id: "role-commercial",
    name: "Commercial",
    permissions: grant(
      ["clients", "devis-commandes", "facturation", "communication"],
      { create: true, read: true, update: true, delete: false },
    ),
  },
  {
    id: "role-operateur",
    name: "Opérateur",
    permissions: grant(
      ["prepress", "planification", "machines", "stocks"],
      { create: true, read: true, update: true, delete: false },
    ),
  },
  {
    id: "role-comptable",
    name: "Comptable",
    permissions: {
      ...grant(["facturation", "reporting"], { create: true, read: true, update: true, delete: false }),
      clients: { create: false, read: true, update: false, delete: false },
    },
  },
];

export function newAccessRole(name = ""): AccessRole {
  return { id: crypto.randomUUID(), name, permissions: emptyPermissions() };
}

export function generatePin() {
  return String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
}

export function summarizePermissions(role: AccessRole) {
  const rows = navModules.map((item) => role.permissions[item.id] ?? emptyPermissions()[item.id]);
  const full = rows.every((row) => row.create && row.read && row.update && row.delete);
  if (full) return "Tous les droits";
  const read = rows.filter((row) => row.read).length;
  const write = rows.filter((row) => row.create || row.update || row.delete).length;
  if (!read && !write) return "Aucun droit";
  return `${read} consultation${read > 1 ? "s" : ""} · ${write} écriture${write > 1 ? "s" : ""}`;
}

export function normalizeAccessRoles(raw: unknown): AccessRole[] {
  if (!Array.isArray(raw) || !raw.length) return defaultAccessRoles;
  const blank = emptyPermissions();
  return raw.map((item, index) => {
    const row = item as Partial<AccessRole>;
    const permissions = { ...blank };
    const source = row.permissions && typeof row.permissions === "object" ? row.permissions : {};
    for (const mod of modules) {
      const current = (source as Record<string, Partial<ModulePermissions>>)[mod.id] ?? {};
      permissions[mod.id] = {
        create: Boolean(current.create),
        read: Boolean(current.read),
        update: Boolean(current.update),
        delete: Boolean(current.delete),
      };
    }
    return {
      id: String(row.id || `role-${index}`),
      name: String(row.name || "").trim() || `Rôle ${index + 1}`,
      permissions,
    };
  });
}
