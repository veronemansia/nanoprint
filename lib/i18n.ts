import type { FeatureDefinition, ModuleDefinition } from "@/lib/types";
import { messages } from "@/lib/i18n-messages";
import { localizeKnown } from "@/lib/i18n-known";

export { localizeKnown };

export type Locale = "fr" | "en" | "es";

export const LOCALES: { id: Locale; native: string; short: string }[] = [
  { id: "fr", native: "Français", short: "FR" },
  { id: "en", native: "English", short: "EN" },
  { id: "es", native: "Español", short: "ES" },
];

export const defaultLocale: Locale = "fr";
export const LOCALE_STORAGE = "nanoprint.locale.v1";

export function isLocale(value: unknown): value is Locale {
  return value === "fr" || value === "en" || value === "es";
}

function interpolate(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`));
}

export function translate(locale: Locale, key: string, fallback: string, vars?: Record<string, string | number>) {
  const table = locale === "fr" ? undefined : messages[locale];
  return interpolate(table?.[key] ?? fallback, vars);
}

export function localeTag(locale: Locale) {
  if (locale === "en") return "en-GB";
  if (locale === "es") return "es-ES";
  return "fr-FR";
}

export function localizeModule(module: ModuleDefinition, t: (key: string, fallback: string, vars?: Record<string, string | number>) => string): ModuleDefinition {
  return {
    ...module,
    label: t(`mod.${module.id}.label`, module.label),
    shortLabel: t(`mod.${module.id}.short`, module.shortLabel),
    description: t(`mod.${module.id}.desc`, module.description),
    features: module.features.map((feature) => localizeFeature(feature, t)),
  };
}

export function localizeFeature(feature: FeatureDefinition, t: (key: string, fallback: string, vars?: Record<string, string | number>) => string): FeatureDefinition {
  return {
    ...feature,
    title: t(`feat.${feature.id}.title`, feature.title),
    description: t(`feat.${feature.id}.desc`, feature.description),
    createLabel: t(`feat.${feature.id}.create`, feature.createLabel),
    entityName: t(`feat.${feature.id}.entity`, feature.entityName),
    entityNamePlural: t(`feat.${feature.id}.entities`, feature.entityNamePlural),
    fields: feature.fields.map((field) => ({
      ...field,
      label: t(`field.${feature.id}.${field.key}`, field.label),
    })),
  };
}

export function readStoredLocale(): Locale {
  if (typeof window === "undefined") return defaultLocale;
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE);
    return isLocale(saved) ? saved : defaultLocale;
  } catch {
    return defaultLocale;
  }
}
