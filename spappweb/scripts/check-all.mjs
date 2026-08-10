import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const checks = [
  "src/lib/contracts/hoja-vida.check.ts",
  "src/lib/contracts/contrato.check.ts",
  "src/lib/pipeline/pipeline.check.ts",
  "src/lib/pipeline/mora-utils.check.ts",
  "src/lib/admin/titularidad.check.ts",
  "src/lib/garaje/stock-segunda.check.ts",
  "src/lib/payments/primer-pago-progress.check.ts",
];

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", file],
      { cwd: root, stdio: "inherit", shell: false },
    );
    child.on("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${file} exited ${code}`));
    });
    child.on("error", reject);
  });
}

const results = await Promise.allSettled(checks.map(run));
const failed = results.filter((r) => r.status === "rejected");
if (failed.length > 0) {
  process.exit(1);
}

console.log("check:all OK");
