import { test, expect } from "@playwright/test";

const visitadorUser = process.env.E2E_VISITADOR_USER;
const visitadorPass = process.env.E2E_VISITADOR_PASS;

test.describe("portal visitador", () => {
  test("página de login carga", async ({ page }) => {
    await page.goto("/visitador/login");
    await expect(page.getByText("Portal Visitador")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("login y mis visitas", async ({ page }) => {
    test.skip(
      !visitadorUser || !visitadorPass,
      "E2E_VISITADOR_USER/PASS no configurados",
    );

    await page.goto("/visitador/login");
    await page.getByLabel("Usuario").fill(visitadorUser!);
    await page.getByLabel("Contraseña").fill(visitadorPass!);
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.waitForURL("**/visitador/mis-visitas**", { timeout: 15_000 });
    await expect(page.getByText(/visitas/i)).toBeVisible();
  });
});
