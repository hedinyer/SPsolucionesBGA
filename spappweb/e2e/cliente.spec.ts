import { test, expect } from "@playwright/test";

test.describe("flujo cliente", () => {
  test("hoja de vida carga y arranca el wizard", async ({ page }) => {
    await page.goto("/hojadevida");
    await expect(
      page.getByRole("heading", { name: "Solicitud de crédito para moto" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Empezar →" }).click();
    await expect(
      page.getByRole("heading", { name: "Foto del frente de tu cédula" }),
    ).toBeVisible();
  });

  test("contrato responde con enlace inválido", async ({ page }) => {
    await page.goto("/contrato/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("Enlace no válido")).toBeVisible();
  });

  test("contrato de prueba carga si E2E_CONTRACT_ID está configurado", async ({
    page,
  }) => {
    const contractId = process.env.E2E_CONTRACT_ID;
    test.skip(!contractId, "E2E_CONTRACT_ID no configurado");

    await page.goto(`/contrato/${contractId}`);
    await expect(page.getByText("Contrato de Renting")).toBeVisible({
      timeout: 15_000,
    });
  });
});
