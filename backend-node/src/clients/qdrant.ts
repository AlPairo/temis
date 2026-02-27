import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config/index.js";
import { createLocalVectorStoreClient } from "./local-vector-store.js";

type HealthStatus = "ok" | "error";

export interface QdrantSingleton {
  client: QdrantClient;
  healthCheck: () => Promise<{ status: HealthStatus; details?: string }>;
}

const REQUEST_TIMEOUT_MS = 5000;
const REQUEST_RETRIES = 3;
const REQUEST_RETRY_DELAY_MS = 250;
const USE_MOCK_CLIENTS = process.env.MOCK_INFRA_CLIENTS === "1";
// In local mode we support two retrieval backends:
// - Qdrant server, when QDRANT_URL is configured
// - file-backed vector store, when QDRANT_URL is omitted
const USE_LOCAL_FILE_VECTOR_STORE =
  config.APP_MODE === "local" && !config.QDRANT_URL;

let singleton: QdrantSingleton | null = null;
let initPromise: Promise<QdrantSingleton> | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= REQUEST_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_RETRIES) {
        await delay(REQUEST_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError;
}

async function initialize(): Promise<QdrantSingleton> {
  if (USE_MOCK_CLIENTS) {
    const mockClient = {
      async getCollections() {
        return { collections: [] };
      },
      async collectionExists() {
        return true;
      },
      async query() {
        return { points: [] };
      }
    } as unknown as QdrantClient;

    console.info("[clients/qdrant] initialized singleton (mock)");
    return {
      client: mockClient,
      async healthCheck() {
        return { status: "ok" };
      }
    };
  }

  if (USE_LOCAL_FILE_VECTOR_STORE) {
    const localClient = createLocalVectorStoreClient();
    console.info("[clients/qdrant] initialized singleton (local file vector store)");
    return {
      client: localClient as unknown as QdrantClient,
      async healthCheck() {
        try {
          await localClient.getCollections();
          return { status: "ok", details: "local file vector store" };
        } catch (error) {
          const details = error instanceof Error ? error.message : "unknown error";
          return { status: "error", details };
        }
      }
    };
  }

  const client = new QdrantClient({
    url: config.QDRANT_URL!,
    apiKey: config.QDRANT_API_KEY || undefined,
    timeout: REQUEST_TIMEOUT_MS
  });

  await withRetries(async () => {
    await client.getCollections();
  });

  console.info("[clients/qdrant] initialized singleton");

  return {
    client,
    async healthCheck() {
      try {
        await client.collectionExists(config.QDRANT_COLLECTION);
        return { status: "ok" };
      } catch (error) {
        const details = error instanceof Error ? error.message : "unknown error";
        return { status: "error", details };
      }
    }
  };
}

export async function getQdrantClient(): Promise<QdrantSingleton> {
  if (singleton) {
    return singleton;
  }

  if (!initPromise) {
    initPromise = initialize();
  }

  singleton = await initPromise;
  return singleton;
}

export async function shutdownQdrantClient(): Promise<void> {
  if (!singleton) {
    return;
  }

  singleton = null;
  initPromise = null;
  console.info("[clients/qdrant] shutdown complete");
}

export function resetQdrantClientForTests(): void {
  singleton = null;
  initPromise = null;
}
