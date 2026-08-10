import { logoutVisitadorAction } from "@/lib/actions/auth-actions";
import { LogOut } from "lucide-react";

export function VisitadorLogoutButton() {
  return (
    <form action={logoutVisitadorAction}>
      <button
        type="submit"
        className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center gap-1 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted active:bg-muted"
        aria-label="Cerrar sesión"
      >
        <LogOut className="pointer-events-none h-4 w-4" />
        Salir
      </button>
    </form>
  );
}
