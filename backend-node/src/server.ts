import { runStartupChecks } from "./startup/startup-checks.js";
import { buildApp } from "./app.js";
import { fileURLToPath } from "node:url";

export function resolvePort(rawPort: string | undefined): number {
  const parsed = Number.parseInt(rawPort ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3000;
}

export async function bootstrap(): Promise<void> {
  await runStartupChecks();

  const app = await buildApp();
  await app.listen({
    host: "0.0.0.0",
    port: resolvePort(process.env.PORT)
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  bootstrap().catch((error) => {
    console.error("Startup checks failed", error);
    process.exitCode = 1;
  });
}
