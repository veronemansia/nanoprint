"use client";

import { LOCALES, type Locale } from "@/lib/i18n";
import { useApp } from "@/components/providers/app-provider";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useApp();

  return (
    <label className={`lang-switch ${className}`.trim()}>
      <span className="sr-only">{t("lang.label", "Langue")}</span>
      <select
        value={locale}
        aria-label={t("lang.label", "Langue")}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {LOCALES.map((item) => (
          <option key={item.id} value={item.id} title={item.native}>
            {item.short}
          </option>
        ))}
      </select>
    </label>
  );
}
