"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { useApp } from "@/components/providers/app-provider";

export function LoginForm() {
  const router = useRouter();
  const { login, ready, user, t } = useApp();
  const [email, setEmail] = useState("contact@nanoprint.sn");
  const [password, setPassword] = useState("123456");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ready && user) router.replace("/admin");
  }, [ready, user, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const loginSchema = z.object({
      email: z.string().email(t("login.emailInvalid", "Saisissez une adresse e-mail valide.")),
      password: z.string().min(6, t("login.passwordShort", "Le mot de passe doit contenir au moins 6 caractères.")),
    });
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? t("login.checkFields", "Vérifiez les informations saisies."));
      return;
    }
    setPending(true);
    try {
      await login(result.data.email, result.data.password);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed", "La connexion a échoué. Réessayez."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <div className="login-form-heading">
        <span className="eyebrow">{t("login.eyebrow", "Accès sécurisé")}</span>
        <h1>{t("login.title", "Bienvenue dans votre atelier.")}</h1>
        <p>{t("login.subtitle", "Connectez-vous pour piloter la production, les clients et la rentabilité.")}</p>
      </div>

      <label className="field">
        <span>{t("login.email", "Adresse e-mail")}</span>
        <span className="input-wrap">
          <Mail size={18} aria-hidden />
          <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@entreprise.com" />
        </span>
      </label>

      <label className="field">
        <span>{t("login.password", "Mot de passe")}</span>
        <span className="input-wrap">
          <LockKeyhole size={18} aria-hidden />
          <input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="input-action" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? t("login.hidePassword", "Masquer le mot de passe") : t("login.showPassword", "Afficher le mot de passe")}>
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </span>
      </label>

      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="login-meta">
        <label><input type="checkbox" defaultChecked /> <span>{t("login.keepSession", "Garder ma session locale")}</span></label>
        <button type="button" onClick={() => setError(t("login.forgotHint", "Compte entreprise : contact@nanoprint.sn / 123456. Administrateur : awa.diop@nanoprint.demo / demo2026."))}>{t("login.forgot", "Mot de passe oublié ?")}</button>
      </div>

      <button className="button button-primary login-submit" type="submit" disabled={pending || !ready}>
        {pending ? <><LoaderCircle className="spin" size={18} /> {t("login.connecting", "Connexion…")}</> : <>{t("login.submit", "Ouvrir NanoPrint")} <ArrowRight size={18} /></>}
      </button>

      <div className="demo-note">
        <ShieldCheck size={18} />
        <p><strong>{t("login.demoTitle", "Comptes de démonstration")}</strong><span>{t("login.demoText", "Entreprise : contact@nanoprint.sn / 123456 · Admin : awa.diop@nanoprint.demo / demo2026.")}</span></p>
      </div>
    </form>
  );
}
