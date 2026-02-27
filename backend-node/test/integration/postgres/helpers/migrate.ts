import { applyBackendAppEnvForTestDb } from "./db-env.js";

export async function applyBackendMigrationsToTestDb(): Promise<string[]> {
  applyBackendAppEnvForTestDb();

  const postgresModule = await import("../../../../src/clients/postgres.js");
  postgresModule.resetPostgresClientForTests();

  try {
    const migrationModule = await import("../../../../src/migrations/run-migrations.js");
    return await migrationModule.runMigrations();
  } finally {
    await postgresModule.shutdownPostgresClient().catch(() => undefined);
    postgresModule.resetPostgresClientForTests();
  }
}

