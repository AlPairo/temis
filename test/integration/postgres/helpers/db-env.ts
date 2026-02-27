import { URL } from "node:url";

const NON_TEST_DB_OVERRIDE_ENV = "ALLOW_NON_TEST_DB_FOR_INTEGRATION";

export function getTestPostgresUrl(): string {
  const value = process.env.TEST_POSTGRES_URL?.trim();
  if (!value) {
    throw new Error("Missing TEST_POSTGRES_URL for Postgres integration tests.");
  }
  return value;
}

export function getTestPostgresAdminUrl(): string {
  const value = process.env.TEST_POSTGRES_ADMIN_URL?.trim();
  if (!value) {
    throw new Error("Missing TEST_POSTGRES_ADMIN_URL for Postgres integration tests.");
  }
  return value;
}

export function getDatabaseName(connectionString: string): string {
  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.replace(/^\/+/, "").trim();
  if (!dbName) {
    throw new Error(`Could not determine database name from connection string: ${connectionString}`);
  }
  return dbName;
}

export function assertLooksLikeTestDb(connectionString: string): void {
  if (process.env[NON_TEST_DB_OVERRIDE_ENV] === "1") {
    return;
  }

  const dbName = getDatabaseName(connectionString).toLowerCase();
  if (!dbName.endsWith("_test") && !dbName.includes("test")) {
    throw new Error(
      `Refusing to run integration tests against non-test DB '${dbName}'. ` +
        `Use TEST_POSTGRES_URL pointing to a test database or set ${NON_TEST_DB_OVERRIDE_ENV}=1 to override.`
    );
  }
}

export function applyBackendAppEnvForTestDb(): void {
  const testUrl = getTestPostgresUrl();
  assertLooksLikeTestDb(testUrl);

  process.env.POSTGRES_URL = testUrl;
  process.env.APP_MODE = "local";
  process.env.OPENAI_API_KEY ??= "sk-test";
  process.env.OPENAI_MODEL ??= "gpt-4o-mini";
  process.env.QDRANT_COLLECTION ??= "integration-test";
  process.env.MOCK_INFRA_CLIENTS = "0";
  process.env.RUN_STARTUP_CHECKS = "false";
}

