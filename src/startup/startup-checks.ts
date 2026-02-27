import { assertMigrationsCurrent } from "../migrations/check-migrations.js";

export async function runStartupChecks(): Promise<void> {
  if (process.env.RUN_STARTUP_CHECKS !== "true") {
    return;
  }

  await assertMigrationsCurrent();
}
