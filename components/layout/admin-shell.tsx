"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3, Bell, Boxes, CalendarRange, ChevronDown, CircleDollarSign,
  FileStack, Gauge, LogOut, Mail, Menu, PanelsTopLeft, Settings2,
  ShieldCheck, ShoppingCart, Truck, Users, UsersRound, Wrench, X,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { useApp } from "@/components/providers/app-provider";
import { localizeFeature, localizeModule } from "@/lib/i18n";
import { modules, navModules, navigationGroups } from "@/lib/modules";
import type { ModuleId } from "@/lib/types";

const iconMap: Record<ModuleId, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  configuration: Settings2,
  utilisateurs: ShieldCheck,
  clients: Users,
  "devis-commandes": FileStack,
  prepress: PanelsTopLeft,
  planification: CalendarRange,
  achats: ShoppingCart,
  stocks: Boxes,
  machines: Wrench,
  livraisons: Truck,
  facturation: CircleDollarSign,
  "ressources-humaines": UsersRound,
  communication: Mail,
  reporting: BarChart3,
};

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, user, logout, settings, t } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace("/");
  }, [ready, user, router]);

  const currentLabel = useMemo(() => {
    if (pathname === "/admin") return t("shell.overview", "Vue d’ensemble");
    const current = modules.find((module) => pathname.startsWith(`/admin/${module.id}`));
    if (!current) return t("shell.admin", "Administration");
    const slug = pathname.split("/").pop();
    const feature = current.features.find((item) => item.id === slug);
    const uiModule = localizeModule(current, t);
    const uiFeature = feature ? localizeFeature(feature, t) : null;
    return uiFeature ? `${uiModule.shortLabel} / ${uiFeature.title}` : uiModule.label;
  }, [pathname, t]);

  if (!ready || !user) {
    return (
      <div className="app-loading" role="status">
        <span className="brand-mark small"><i /><i /><i /><i /></span>
        <div className="loading-line" />
        <p>{t("common.loading", "Préparation de l’atelier numérique…")}</p>
      </div>
    );
  }

  function handleLogout() {
    logout();
    router.replace("/");
  }

  return (
    <div className="admin-app">
      {mobileOpen && <button className="sidebar-backdrop" aria-label={t("common.closeMenu", "Fermer le menu")} onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <Link href="/admin" className="brand">
            {settings.logo ? (
              <img className="brand-logo" src={settings.logo} alt="" />
            ) : (
              <span className="brand-mark"><i /><i /><i /><i /></span>
            )}
            <span><strong>{settings.tradeName || "NanoPrint"}</strong></span>
          </Link>
          <button className="mobile-close" aria-label={t("common.closeMenu", "Fermer le menu")} onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>
        <nav className="sidebar-nav" aria-label={t("shell.nav", "Navigation principale")}>
          <Link className={`nav-link dashboard-link ${pathname === "/admin" ? "active" : ""}`} href="/admin" onClick={() => setMobileOpen(false)}>
            <Gauge size={18} /><span>{t("shell.overview", "Vue d’ensemble")}</span>
          </Link>
          {navigationGroups.map((group) => {
            const items = navModules.filter((module) => module.group === group);
            if (!items.length) return null;
            return (
              <div className="nav-group" key={group}>
                <span className="nav-group-label">{t(`group.${group}`, group)}</span>
                {items.map((module) => {
                  const Icon = iconMap[module.id];
                  const active = pathname.startsWith(`/admin/${module.id}`);
                  return (
                    <Link className={`nav-link ${active ? "active" : ""}`} href={`/admin/${module.id}/${module.features[0].id}`} key={module.id} onClick={() => setMobileOpen(false)}>
                      <Icon size={17} strokeWidth={1.8} /><span>{t(`mod.${module.id}.short`, module.shortLabel)}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="production-health"><span><i /> {t("shell.workshopOnline", "Atelier en ligne")}</span><strong>0%</strong></div>
          <div className="health-bar"><i style={{ width: "0%" }} /></div>
          <small>{t("shell.machinesActive", "Aucune machine active")}</small>
        </div>
      </aside>

      <div className="admin-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label={t("common.openMenu", "Ouvrir le menu")}><Menu size={21} /></button>
            <div className="breadcrumb"><span>{t("shell.admin", "Administration")}</span><i>/</i><strong>{currentLabel}</strong></div>
          </div>
          <div className="topbar-actions">
            <LanguageSwitcher />
            <div className="popover-wrap">
              <button className="icon-button notification-button" aria-label={t("common.notifications", "Notifications")} aria-expanded={notificationsOpen} onClick={() => setNotificationsOpen((value) => !value)}>
                <Bell size={19} />
              </button>
              {notificationsOpen && (
                <div className="popover notifications-popover">
                  <div className="popover-head"><strong>{t("common.notifications", "Notifications")}</strong><button onClick={() => setNotificationsOpen(false)}>{t("common.markRead", "Tout marquer comme lu")}</button></div>
                  <div className="notification-item"><p><span>{t("notif.empty", "Aucune notification")}</span></p></div>
                </div>
              )}
            </div>
            <div className="popover-wrap">
              <button className="user-menu-button" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)}>
                <span className="avatar">{user.initials}</span>
                <span className="user-copy"><strong>{user.name}</strong><small>{user.role}</small></span>
                <ChevronDown size={15} />
              </button>
              {profileOpen && (
                <div className="popover profile-popover">
                  <div><strong>{user.name}</strong><span>{user.email}</span></div>
                  <button onClick={handleLogout}><LogOut size={16} /> {t("common.logout", "Se déconnecter")}</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="page-shell">{children}</main>
      </div>
    </div>
  );
}
