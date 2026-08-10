import { test, expect } from "@playwright/test";

const DRAFT_FORM = {
  nombre_completo: "Maria Fernanda Lopez Garcia",
  tipo_identificacion: "cc",
  numero_identificacion: "1234567890",
  fecha_nacimiento: "15/03/1990",
  celular: "3001234567",
  direccion: "Calle 10",
  barrio: "Centro",
  correo: "maria@test.co",
  trabaja_empresa: true,
  nombre_empresa: "Empresa SA",
  telefono_empresa: "",
  direccion_empresa: "",
  independiente: null,
  habilidad: "",
  estado_civil: "soltero",
  nombre_conyuge: "",
  celular_conyuge: "",
  referencias: [
    { nombre: "Ana Maria Gomez", celular: "3009876543" },
    { nombre: "Pedro Luis Diaz", celular: "3011111111" },
  ],
};

test.describe("resiliencia hoja de vida", () => {
  test("restaura borrador tras recargar", async ({ page }) => {
    await page.goto("/hojadevida");
    await page.evaluate(
      ({ form }) => {
        sessionStorage.setItem(
          "hojadevida-upload-folder",
          "pending/e2e-test-folder",
        );
        sessionStorage.setItem(
          "hojadevida-draft",
          JSON.stringify({
            uploadFolder: "pending/e2e-test-folder",
            resumeStep: "hoja",
            photoUrls: {
              documentFrontUrl: "https://example.com/front.jpg",
              documentBackUrl: "https://example.com/back.jpg",
              selfieUrl: "https://example.com/selfie.jpg",
            },
            form,
            formStepIndex: 0,
          }),
        );
      },
      { form: DRAFT_FORM },
    );

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Tu nombre completo" }),
    ).toBeVisible();
    await expect(
      page.locator('input[autocomplete="name"]'),
    ).toHaveValue("Maria Fernanda Lopez Garcia");
  });

  test("muestra error de conexión y conserva borrador al fallar envío", async ({
    page,
  }) => {
    let postCount = 0;
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.url().includes("hojadevida")) {
        postCount++;
        if (postCount <= 3) {
          await route.abort("failed");
          return;
        }
      }
      await route.continue();
    });

    await page.goto("/hojadevida");
    await page.evaluate(
      ({ form }) => {
        sessionStorage.setItem(
          "hojadevida-upload-folder",
          "pending/e2e-submit-test",
        );
        sessionStorage.setItem(
          "hojadevida-draft",
          JSON.stringify({
            uploadFolder: "pending/e2e-submit-test",
            resumeStep: "hoja",
            photoUrls: {
              documentFrontUrl: "https://example.com/front.jpg",
              documentBackUrl: "https://example.com/back.jpg",
              selfieUrl: "https://example.com/selfie.jpg",
            },
            form,
            formStepIndex: 12,
          }),
        );
      },
      { form: DRAFT_FORM },
    );

    await page.reload();
    await page.getByRole("button", { name: /Enviar mi solicitud/i }).click();

    await expect(
      page.getByText(/Sin conexión estable|Tus datos están guardados/i),
    ).toBeVisible({ timeout: 20_000 });

    const draft = await page.evaluate(() =>
      sessionStorage.getItem("hojadevida-draft"),
    );
    expect(draft).toContain("Maria Fernanda Lopez Garcia");
  });
});
