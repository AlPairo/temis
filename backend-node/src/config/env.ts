import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export function resolveBackendRoot(cwd: string): string {
  if (path.basename(cwd) === "backend-node") {
    return cwd;
  }
  return path.join(cwd, "backend-node");
}

export function parseDotEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex <= 0) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

export interface LoadModeEnvFileOptions {
  cwd?: string;
  processEnv?: NodeJS.ProcessEnv;
  existsSync?: typeof fs.existsSync;
  readFileSync?: typeof fs.readFileSync;
}

export function loadModeEnvFile(options: LoadModeEnvFileOptions = {}): void {
  const cwd = options.cwd ?? process.cwd();
  const processEnv = options.processEnv ?? process.env;
  const existsSync = options.existsSync ?? fs.existsSync;
  const readFileSync = options.readFileSync ?? fs.readFileSync;
  const protectedKeys = new Set(
    Object.keys(processEnv).filter((key) => processEnv[key] !== undefined)
  );
  const backendRoot = resolveBackendRoot(cwd);
  const rawMode = processEnv.APP_MODE?.trim().toLowerCase();
  const explicitMode = rawMode === "local" || rawMode === "prod" ? rawMode : undefined;

  const modeCandidates = explicitMode ? [explicitMode] : ["local", "prod"];
  const pathCandidates = modeCandidates.flatMap((mode) => [
    path.join(backendRoot, `.env.${mode}`),
    path.join(cwd, `.env.${mode}`)
  ]);

  const envFilePath = pathCandidates.find((candidate) => existsSync(candidate));
  if (!envFilePath) {
    return;
  }

  const content = readFileSync(envFilePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const entry = parseDotEnvLine(line);
    if (!entry) {
      continue;
    }
    const [key, value] = entry;
    if (protectedKeys.has(key)) {
      continue;
    }
    processEnv[key] = value;
  }
}

loadModeEnvFile();

const runtimeModeSchema = z.enum(["prod", "local"]);
const booleanFlagSchema = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === "boolean") {
      return value;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  });

export const envSchema = z.object({
  APP_MODE: runtimeModeSchema.default("prod"),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_ORIGIN: z.string().min(1).default("http://localhost:5173"),
  ENABLE_INFRA_BOOTSTRAP: booleanFlagSchema.default(false),
  RUN_STARTUP_CHECKS: booleanFlagSchema.default(false),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().min(1, "OPENAI_MODEL is required"),
  OPENAI_TITLE_MODEL: z.string().min(1).default("gpt-5-nano"),
  OPENAI_RERANK_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  POSTGRES_URL: z.string().min(1, "POSTGRES_URL is required"),
  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION: z.string().min(1, "QDRANT_COLLECTION is required"),
  LOCAL_VECTOR_STORE_FILE: z.string().optional()
}).superRefine((value, ctx) => {
  if (value.APP_MODE === "prod") {
    if (!value.QDRANT_URL || value.QDRANT_URL.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["QDRANT_URL"],
        message: "QDRANT_URL is required in prod mode"
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(rawEnv: NodeJS.ProcessEnv): Env {
  const parsed = envSchema.safeParse(rawEnv);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `- ${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return {
    ...parsed.data,
    QDRANT_URL:
      parsed.data.QDRANT_URL && parsed.data.QDRANT_URL.trim().length > 0
        ? parsed.data.QDRANT_URL
        : parsed.data.APP_MODE === "local"
          ? undefined
          : parsed.data.QDRANT_URL,
    QDRANT_API_KEY:
      parsed.data.QDRANT_API_KEY && parsed.data.QDRANT_API_KEY.trim().length > 0
        ? parsed.data.QDRANT_API_KEY
        : undefined,
    LOCAL_VECTOR_STORE_FILE:
      parsed.data.LOCAL_VECTOR_STORE_FILE && parsed.data.LOCAL_VECTOR_STORE_FILE.trim().length > 0
        ? parsed.data.LOCAL_VECTOR_STORE_FILE
        : undefined
  };
}

export const env: Env = parseEnv(process.env);
