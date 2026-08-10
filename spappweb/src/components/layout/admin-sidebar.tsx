"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { LogOut, PanelLeft, PanelLeftClose } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "admin-sidebar-collapsed";

export function AdminSidebar({
  className,
  hideEquipo = false,
  referralScope = null,
}: {
  className?: string;
  hideEquipo?: boolean;
  referralScope?: string | null;
}) {
  const pathname = usePathname();
  const [loggingOut, startLogout] = useTransition();
  const [collapsed, setCollapsed] = useState(false);
  const navGroups = navGroupsForAdminScope(hideEquipo);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }

  function handleLogout() {
    startLogout(async () => {
      await logoutAdminAction();
    });
  }

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out",
        collapsed ? "w-16" : "w-60",
        className,
      )}
    >
      <div
        className={cn(
          "flex border-b border-sidebar-border",
          collapsed
            ? "flex-col items-center gap-2 px-2 py-4"
            : "items-start justify-between px-4 py-5",
        )}
      >
        {!collapsed ? (
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              SP Admin
            </p>
            <p className="mt-1 text-sm text-sidebar-foreground">Panel interno</p>
          </div>
        ) : (
          <p className="text-xs font-semibold text-sidebar-foreground">SP</p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menú" : "Recoger menú"}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelLeft /> : <PanelLeftClose />}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-3 p-3">
          {navGroups.map((group) => {
            const Icon = group.icon;
            const groupActive = isGroupActive(pathname, group);
            const hasChildren = group.children.length > 0;

            if (!hasChildren) {
              const linkClass = cn(
                "flex items-center rounded-lg py-2.5 text-sm transition-colors",
                collapsed ? "justify-center px-2" : "gap-3 px-3",
                groupActive
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              );

              if (!collapsed) {
                return (
                  <Link key={group.id} href={group.href} className={linkClass}>
                    <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="truncate">{group.label}</span>
                  </Link>
                );
              }

              return (
                <Tooltip key={group.id}>
                  <TooltipTrigger asChild>
                    <Link href={group.href} className={linkClass}>
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{group.label}</TooltipContent>
                </Tooltip>
              );
            }

            if (collapsed) {
              return (
                <Tooltip key={group.id}>
                  <TooltipTrigger asChild>
                    <Link
                      href={group.href}
                      className={cn(
                        "flex items-center justify-center rounded-lg px-2 py-2.5 text-sm transition-colors",
                        groupActive
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">{group.label}</TooltipContent>
                </Tooltip>
              );
            }

            return (
              <div key={group.id} className="flex flex-col gap-1">
                <Link
                  href={group.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium tracking-wider uppercase transition-colors",
                    groupActive
                      ? "text-sidebar-foreground"
                      : "text-muted-foreground hover:text-sidebar-foreground",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{group.label}</span>
                </Link>
                <div className="ml-2 flex flex-col gap-0.5 border-l border-sidebar-border pl-2">
                  {group.children.map(({ href, label, icon: ChildIcon }) => {
                    const active = isChildActive(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <ChildIcon
                          className="size-3.5 shrink-0"
                          strokeWidth={1.75}
                        />
                        <span className="truncate">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
      </ScrollArea>

      <Separator />
      <div className="flex flex-col gap-3 p-3">
        {referralScope ? (
          <ScopedReferralLink
            referralScope={referralScope}
            collapsed={collapsed}
          />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className={cn(
            "w-full text-muted-foreground",
            collapsed ? "justify-center px-2" : "justify-start gap-3",
          )}
          disabled={loggingOut}
          title={collapsed ? "Salir" : undefined}
          onClick={handleLogout}
        >
          <LogOut className="size-4 shrink-0" strokeWidth={1.75} />
          {!collapsed && (loggingOut ? "Saliendo…" : "Salir")}
        </Button>
      </div>
    </aside>
  );
}
