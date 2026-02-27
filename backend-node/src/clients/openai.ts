import OpenAI from "openai";
import { config } from "../config/index.js";

type HealthStatus = "ok" | "error";

export interface OpenAISingleton {
  client: OpenAI;
  healthCheck: () => Promise<{ status: HealthStatus; details?: string }>;
}

const REQUEST_TIMEOUT_MS = 7000;
const REQUEST_RETRIES = 2;
const REQUEST_RETRY_DELAY_MS = 300;
const USE_MOCK_CLIENTS = process.env.MOCK_INFRA_CLIENTS === "1";

let singleton: OpenAISingleton | null = null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeoutHandle);
  }
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

function initialize(): OpenAISingleton {
  if (USE_MOCK_CLIENTS) {
    const mockClient = {
      models: {
        async retrieve() {
          return { id: config.OPENAI_MODEL };
        }
      },
      embeddings: {
        async create(input: { input: string | string[] }) {
          const values = Array.isArray(input.input) ? input.input : [input.input];
          return {
            data: values.map((_, index) => ({
              index,
              embedding: [0.01, 0.02, 0.03]
            }))
          };
        }
      },
      chat: {
        completions: {
          async create() {
            return {
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      selected_ids: ["cand_1", "cand_2", "cand_3", "cand_4", "cand_5"]
                    })
                  }
                }
              ]
            };
          }
        }
      }
    } as unknown as OpenAI;

    console.info("[clients/openai] initialized singleton (mock)");
    return {
      client: mockClient,
      async healthCheck() {
        return { status: "ok" };
      }
    };
  }

  const client = new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    maxRetries: REQUEST_RETRIES,
    timeout: REQUEST_TIMEOUT_MS
  });

  console.info("[clients/openai] initialized singleton");

  return {
    client,
    async healthCheck() {
      try {
        await withRetries(async () =>
          withTimeout(async (signal) => {
            await client.models.retrieve(config.OPENAI_MODEL, { signal });
          }, REQUEST_TIMEOUT_MS)
        );
        return { status: "ok" };
      } catch (error) {
        const details = error instanceof Error ? error.message : "unknown error";
        return { status: "error", details };
      }
    }
  };
}

export async function getOpenAIClient(): Promise<OpenAISingleton> {
  if (!singleton) {
    singleton = initialize();
  }

  return singleton;
}

export async function shutdownOpenAIClient(): Promise<void> {
  if (!singleton) {
    return;
  }

  singleton = null;
  console.info("[clients/openai] shutdown complete");
}

export function resetOpenAIClientForTests(): void {
  singleton = null;
}
