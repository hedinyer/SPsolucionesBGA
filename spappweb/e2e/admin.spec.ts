import { test, expect } from "@playwright/test";

const adminUser = process.env.E2E_ADMIN_USER;
const adminPass = process.env.E2E_ADMIN_PASS;

test.describe("panel admin", () => {
  test.beforeEach(() => {
    test.skip(!adminUser || !adminPass, "E2E_ADMIN_USER/PASS no configurados");
  });

  test("login y acceso a inventario", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Usuario").fill(adminUser!);
    await page.getByLabel("Contraseña").fill(adminPass!);
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.waitForURL(/\/(inbox|clientes|inventario)/, { timeout: 15_000 });
    await page.goto("/inventario");
    await expect(
      page.getByRole("heading", { name: "Inventario de tienda" }),
    ).toBeVisible();
  });
});
