import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config/index.js";

type MatchClause = {
  key?: string;
  match?: { value?: unknown };
};

type Filter = {
  must?: MatchClause[];
};

type StoredPoint = {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
};

type StoreShape = {
  collections: Record<string, StoredPoint[]>;
};

const DEFAULT_LOCAL_STORE_PATH = "data/local-vector-store.json";

function resolveStorePath(): string {
  const configured = config.LOCAL_VECTOR_STORE_FILE?.trim();
  const relative = configured && configured.length > 0 ? configured : DEFAULT_LOCAL_STORE_PATH;
  return path.isAbsolute(relative)
    ? relative
    : path.resolve(process.cwd(), relative);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function matchesFilter(payload: Record<string, unknown>, filter?: Filter): boolean {
  const must = filter?.must ?? [];
  return must.every((clause) => {
    if (!clause.key || !clause.match) {
      return true;
    }
    return payload[clause.key] === clause.match.value;
  });
}

async function readStore(filePath: string): Promise<StoreShape> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return {
      collections: parsed.collections ?? {}
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { collections: {} };
    }
    throw error;
  }
}

async function writeStore(filePath: string, store: StoreShape): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
}

export interface LocalVectorStoreClient {
  getCollections: () => Promise<{ collections: Array<{ name: string }> }>;
  collectionExists: (name: string) => Promise<boolean>;
  search: (
    collection: string,
    request: {
      vector: number[];
      limit?: number;
      filter?: Filter;
    }
  ) => Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>>;
  query: (
    collection: string,
    request: {
      vector: number[];
      limit?: number;
      filter?: Filter;
    }
  ) => Promise<{ points: Array<{ id: string; score: number; payload: Record<string, unknown> }> }>;
  upsert: (
    collection: string,
    payload: {
      points: Array<{ id: string; vector: number[]; payload?: Record<string, unknown> }>;
    }
  ) => Promise<{ status: "ok" }>;
  delete: (
    collection: string,
    payload: {
      filter?: Filter;
    }
  ) => Promise<{ status: "ok" }>;
}

export function createLocalVectorStoreClient(): LocalVectorStoreClient {
  const filePath = resolveStorePath();

  return {
    async getCollections() {
      const store = await readStore(filePath);
      return {
        collections: Object.keys(store.collections).map((name) => ({ name }))
      };
    },

    async collectionExists(name: string) {
      const store = await readStore(filePath);
      return Array.isArray(store.collections[name]);
    },

    async query(collection, request) {
      const store = await readStore(filePath);
      const points = store.collections[collection] ?? [];
      const scored = points
        .filter((point) => matchesFilter(point.payload, request.filter))
        .map((point) => ({
          id: point.id,
          score: cosineSimilarity(point.vector, request.vector),
          payload: point.payload
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(1, request.limit ?? 10));

      return { points: scored };
    },

    async search(collection, request) {
      const result = await this.query(collection, request);
      return result.points;
    },

    async upsert(collection, payload) {
      const store = await readStore(filePath);
      const current = store.collections[collection] ?? [];
      const byId = new Map(current.map((point) => [point.id, point]));

      for (const point of payload.points) {
        byId.set(point.id, {
          id: point.id,
          vector: point.vector,
          payload: point.payload ?? {}
        });
      }

      store.collections[collection] = Array.from(byId.values());
      await writeStore(filePath, store);
      return { status: "ok" };
    },

    async delete(collection, payload) {
      const store = await readStore(filePath);
      const current = store.collections[collection] ?? [];

      if (!payload.filter) {
        store.collections[collection] = [];
      } else {
        store.collections[collection] = current.filter(
          (point) => !matchesFilter(point.payload, payload.filter)
        );
      }

      await writeStore(filePath, store);
      return { status: "ok" };
    }
  };
}
