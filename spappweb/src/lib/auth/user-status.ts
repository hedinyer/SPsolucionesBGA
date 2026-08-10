export type UserStatus = "normal" | "admin" | "visitador";

export const USER_STATUS = {
  normal: "normal",
  admin: "admin",
  visitador: "visitador",
} as const satisfies Record<string, UserStatus>;

export function isAdminStatus(status: string | null | undefined): status is "admin" {
  return status === USER_STATUS.admin;
}

export function isVisitadorStatus(
  status: string | null | undefined,
): status is "visitador" {
  return status === USER_STATUS.visitador;
}

export function adminAccessDeniedMessage(status: string | null | undefined): string {
  if (status === USER_STATUS.normal) {
    return "Esta cuenta es de cliente. Solo usuarios con status admin pueden entrar.";
  }
  if (status === USER_STATUS.visitador) {
    return "Esta cuenta es de visitador. Usa el portal en /visitador/login.";
  }
  return "No tienes permisos de administrador.";
}
