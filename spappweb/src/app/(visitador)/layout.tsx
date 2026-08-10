import Link from "next/link";
import type { Metadata } from "next";
import {
  getVisitadorSession,
  hasVisitadorAccess,
} from "@/lib/auth/visitador-session";
import { VisitadorLogoutButton } from "@/components/visitador/visitador-logout-button";

export const metadata: Metadata = {
  title: "Portal Visitador",
  description: "Visitas domiciliarias asignadas",
};

export default async function VisitadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getVisitadorSession();
  const isLoggedIn = hasVisitadorAccess(session);

  return (
    <div className="min-h-dvh bg-muted/30 text-foreground">
      {isLoggedIn && (
        <header className="safe-area-top border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
          <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
            <Link
              href="/visitador/mis-visitas"
              className="min-h-11 content-center font-heading text-lg font-semibold"
            >
              Mis visitas
            </Link>
            <VisitadorLogoutButton />
          </div>
        </header>
      )}
      <main className="mx-auto max-w-lg px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
