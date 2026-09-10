"use client";

import { CheckCircle2, Layers3, LockKeyhole, Workflow } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useApp } from "@/components/providers/app-provider";

export function LoginPage() {
  const { t } = useApp();

  return (
    <main className="login-page">
      <section className="login-showcase">
        <div className="login-brand">
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span><strong>NanoPrint</strong><small>{t("login.brandSub", "Gestion d’imprimerie")}</small></span>
        </div>
        <div className="showcase-copy">
          <span className="showcase-kicker">{t("login.kicker", "De la demande client au produit fini")}</span>
          <h2>{t("login.headline", "L’atelier, parfaitement orchestré.")}</h2>
          <p>{t("login.lead", "Une vision claire de chaque devis, chaque feuille et chaque délai. Conçue pour les équipes qui exigent précision et fluidité.")}</p>
          <ul>
            <li><CheckCircle2 size={18} /> {t("login.bullet1", "14 modules métier interconnectés")}</li>
            <li><CheckCircle2 size={18} /> {t("login.bullet2", "Pilotage temps réel de la production")}</li>
            <li><CheckCircle2 size={18} /> {t("login.bullet3", "Données de démonstration sans risque")}</li>
          </ul>
        </div>
        <div className="showcase-visual" aria-hidden>
          <div className="paper-sheet sheet-back" />
          <div className="paper-sheet sheet-front">
            <div className="sheet-cmyk"><i /><i /><i /><i /></div>
            <div className="sheet-header"><span>ORDRE DE FABRICATION</span><strong>#260903</strong></div>
            <div className="sheet-title">CATALOGUE<br />RENTRÉE 2026</div>
            <div className="sheet-grid"><span /><span /><span /><span /><span /><span /></div>
            <div className="sheet-footer"><span>HEIDELBERG XL 75</span><span>5 000 EX.</span><span>48 PAGES</span></div>
          </div>
          <span className="visual-chip chip-one"><Workflow size={15} /> {t("login.chipProd", "En production")}</span>
          <span className="visual-chip chip-two"><Layers3 size={15} /> {t("login.chipBat", "BAT validé")}</span>
          <span className="visual-chip chip-three"><LockKeyhole size={15} /> {t("login.chipLocal", "Données locales")}</span>
        </div>
        <div className="showcase-footer"><span>NANOPRINT / IMP-2026</span><span>CMYK WORKFLOW SYSTEM</span></div>
      </section>
      <section className="login-panel">
        <LanguageSwitcher className="login-lang" />
        <LoginForm />
        <p className="login-copyright">{t("login.copyright", "© 2026 NanoPrint · Plateforme de démonstration")}</p>
      </section>
    </main>
  );
}
