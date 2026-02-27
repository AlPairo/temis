export const integrationTestTimeoutMs = 30_000;

export function requireIntegrationEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required integration test env var: ${name}`);
  }
  return value;
}
