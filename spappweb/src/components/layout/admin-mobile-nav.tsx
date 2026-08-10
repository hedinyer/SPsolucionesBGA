"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { logoutAdminAction } from "@/lib/actions/auth-actions";
import {
  isChildActive,
  isGroupActive,
  navGroupsForAdminScope,
} from "@/components/layout/admin-nav-links";
import { ScopedReferralLink } from "@/components/layout/scoped-referral-link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const headerBtnClass =
  "inline-flex size-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted active:bg-muted";

const MENU_TOGGLE_ID = "admin-mobile-menu-toggle";

export function AdminMobileNav({
  hideEquipo = false,
  referralScope = null,
}: {
  hideEquipo?: boolean;
  referralScope?: string | null;
}) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLInputElement>(null);
  const navGroups = navGroupsForAdminScope(hideEquipo);

  function closeMenu() {
    if (menuRef.current) menuRef.current.checked = false;
  }

  useEffect(() => {
    closeMenu();
  }, [pathname]);

  useEffect(() => {
    const checkbox = menuRef.current;
    if (!checkbox) return;

    function syncScrollLock() {
      if (!checkbox) return;
      const locked = checkbox.checked;
      document.body.style.overflow = locked ? "hidden" : "";
      document.documentElement.style.overflow = locked ? "hidden" : "";
    }

    syncScrollLock();
    checkbox.addEventListener("change", syncScrollLock);
    return () => {
      checkbox.removeEventListener("change", syncScrollLock);
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, []);

  return (
    <>
      <input
        ref={menuRef}
        id={MENU_TOGGLE_ID}
        type="checkbox"
        className="peer sr-only"
        aria-hidden="true"
      />

      <header className="fixed inset-x-0 top-0 z-50 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 lg:hidden safe-area-top">
        <div className="relative flex h-14 items-center justify-between px-4">
          <label
            htmlFor={MENU_TOGGLE_ID}
            className={headerBtnClass}
            aria-label="Abrir menú"
          >
            <Menu className="pointer-events-none size-5" />
          </label>

          <p className="pointer-events-none text-sm font-semibold">SP Admin</p>

          <form action={logoutAdminAction}>
            <button
              type="submit"
              className={cn(headerBtnClass, "text-muted-foreground")}
              aria-label="Cerrar sesión"
            >
              <LogOut className="pointer-events-none size-5" />
            </button>
          </form>
        </div>
      </header>

      <div
        className="fixed inset-0 z-50 hidden peer-checked:block lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
      >
        <label
          htmlFor={MENU_TOGGLE_ID}
          className="absolute inset-0 cursor-pointer touch-manipulation bg-foreground/20"
          aria-label="Cerrar menú"
        />
        <aside className="pointer-events-auto absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl safe-area-top">
          <div className="flex items-center justify-between border-b border-sidebar-border px-5 py-4">
            <div>
              <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                SP Admin
              </p>
              <p className="text-sm text-sidebar-foreground">Panel interno</p>
            </div>
            <label
              htmlFor={MENU_TOGGLE_ID}
              className={headerBtnClass}
              aria-label="Cerrar menú"
            >
              <X className="pointer-events-none size-5" />
            </label>
          </div>
          <ScrollArea className="flex-1">
            <nav className="flex flex-col gap-4 p-3">
              {navGroups.map((group) => {
                const Icon = group.icon;
                const groupActive = isGroupActive(pathname, group);
                const hasChildren = group.children.length > 0;

                if (!hasChildren) {
                  return (
                    <Link
                      key={group.id}
                      href={group.href}
                      onClick={closeMenu}
                      className={cn(
                        "flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                        groupActive
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon className="size-4" strokeWidth={1.75} />
                      {group.label}
                    </Link>
                  );
                }

                return (
                  <div key={group.id} className="flex flex-col gap-1">
                    <p className="flex items-center gap-2 px-3 py-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                      <Icon className="size-3.5" strokeWidth={1.75} />
                      {group.label}
                    </p>
                    {group.children.map(({ href, label, icon: ChildIcon }) => {
                      const active = isChildActive(pathname, href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={closeMenu}
                          className={cn(
                            "flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                            active
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <ChildIcon className="size-4" strokeWidth={1.75} />
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </ScrollArea>
          <Separator />
          <div className="flex flex-col gap-3 p-3 safe-area-bottom">
            {referralScope ? (
              <ScopedReferralLink referralScope={referralScope} />
            ) : null}
            <form action={logoutAdminAction}>
              <Button
                type="submit"
                variant="ghost"
                className="min-h-11 w-full touch-manipulation justify-start gap-3 text-muted-foreground"
              >
                <LogOut className="size-4" strokeWidth={1.75} />
                Salir
              </Button>
            </form>
          </div>
        </aside>
      </div>
    </>
  );
}
