import { Pool, type PoolClient } from "pg";
import { config } from "../config/index.js";

type HealthStatus = "ok" | "error";

export interface PostgresSingleton {
  pool: Pool;
  healthCheck: () => Promise<{ status: HealthStatus; details?: string }>;
}

const STARTUP_RETRIES = 3;
const STARTUP_RETRY_DELAY_MS = 250;
const CONNECT_TIMEOUT_MS = 5000;
const USE_MOCK_CLIENTS = process.env.MOCK_INFRA_CLIENTS === "1";

let singleton: PostgresSingleton | null = null;
let initPromise: Promise<PostgresSingleton> | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= STARTUP_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < STARTUP_RETRIES) {
        await delay(STARTUP_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError;
}

async function initialize(): Promise<PostgresSingleton> {
  if (USE_MOCK_CLIENTS) {
    const mockPool = {
      async query(queryText: string) {
        if (!/^\s*select\s+1/i.test(queryText)) {
          throw new Error("Mock Postgres only supports SELECT 1 in TASK_05 verification mode.");
        }
        return { rows: [{ "?column?": 1 }] };
      },
      async end() {
        return;
      }
    } as unknown as Pool;

    console.info("[clients/postgres] initialized singleton (mock)");
    return {
      pool: mockPool,
      async healthCheck() {
        return { status: "ok" };
      }
    };
  }

  const pool = new Pool({
    connectionString: config.POSTGRES_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS
  });

  await withRetries(async () => {
    await pool.query("SELECT 1");
  });

  console.info("[clients/postgres] initialized singleton");

  return {
    pool,
    async healthCheck() {
      try {
        await pool.query("SELECT 1");
        return { status: "ok" };
      } catch (error) {
        const details = error instanceof Error ? error.message : "unknown error";
        return { status: "error", details };
      }
    }
  };
}

export async function getPostgresClient(): Promise<PostgresSingleton> {
  if (singleton) {
    return singleton;
  }

  if (!initPromise) {
    initPromise = initialize();
  }

  singleton = await initPromise;
  return singleton;
}

export async function shutdownPostgresClient(): Promise<void> {
  if (!singleton) {
    return;
  }

  await singleton.pool.end();
  singleton = null;
  initPromise = null;
  console.info("[clients/postgres] shutdown complete");
}

export async function closePostgresPool(): Promise<void> {
  await shutdownPostgresClient();
}

export function getPostgresPool(): Pool {
  if (!singleton) {
    throw new Error("Postgres client is not initialized. Call getPostgresClient() before using the pool.");
  }
  return singleton.pool;
}

export async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const { pool } = await getPostgresClient();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function resetPostgresClientForTests(): void {
  singleton = null;
  initPromise = null;
}
