"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  adminNavGroups,
  isChildActive,
  type AdminNavGroup,
} from "@/components/layout/admin-nav-links";
import { cn } from "@/lib/utils";

export function AdminHubSubnav({ hubId }: { hubId: AdminNavGroup["id"] }) {
  const pathname = usePathname();
  const group = adminNavGroups.find((g) => g.id === hubId);
  if (!group || group.children.length === 0) return null;

  return (
    <nav
      aria-label={`${group.label}: secciones`}
      className="flex w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1"
    >
      {group.children.map(({ href, label }) => {
        const active = isChildActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "min-h-11 shrink-0 touch-manipulation rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors sm:flex-1",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
