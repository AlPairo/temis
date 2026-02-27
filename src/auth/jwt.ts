import crypto from "node:crypto";
import type { AppRole, AuthenticatedUser } from "./types.js";

interface JwtHeader {
  alg?: string;
  typ?: string;
}

interface JwtPayload {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  [key: string]: unknown;
}

export class JwtAuthError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "JwtAuthError";
    this.statusCode = statusCode;
  }
}

const ROLE_VALUES = new Set<AppRole>(["basic", "supervisor", "admin"]);

type JwtEnv = Record<string, string | undefined>;

export interface VerifyJwtOptions {
  now?: () => number;
  env?: JwtEnv;
}

const parseBooleanFlag = (value: string | undefined): boolean => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const base64UrlDecode = (value: string): string => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(paddingLength), "base64").toString("utf8");
};

const base64UrlEncodeBuffer = (value: Buffer): string =>
  value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const safeJsonParse = <T>(raw: string, label: string): T => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new JwtAuthError(`Invalid JWT ${label}`);
  }
};

const timingSafeEqualText = (a: string, b: string): boolean => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const ensureHs256Signature = (signingInput: string, signaturePart: string, secret: string): void => {
  const expected = base64UrlEncodeBuffer(crypto.createHmac("sha256", secret).update(signingInput).digest());
  if (!timingSafeEqualText(signaturePart, expected)) {
    throw new JwtAuthError("Invalid JWT signature");
  }
};

const ensureAudience = (payload: JwtPayload, expectedAudience: string): void => {
  if (!expectedAudience.trim()) {
    return;
  }

  const aud = payload.aud;
  if (typeof aud === "string") {
    if (aud !== expectedAudience) {
      throw new JwtAuthError("Invalid JWT audience");
    }
    return;
  }

  if (Array.isArray(aud)) {
    if (!aud.includes(expectedAudience)) {
      throw new JwtAuthError("Invalid JWT audience");
    }
    return;
  }

  throw new JwtAuthError("JWT audience claim missing");
};

const ensureIssuer = (payload: JwtPayload, expectedIssuer: string): void => {
  if (!expectedIssuer.trim()) {
    return;
  }
  if (payload.iss !== expectedIssuer) {
    throw new JwtAuthError("Invalid JWT issuer");
  }
};

const ensureTimeWindow = (payload: JwtPayload, now: () => number = Date.now): void => {
  const nowSeconds = Math.floor(now() / 1000);
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds) {
    throw new JwtAuthError("JWT not yet valid");
  }
  if (typeof payload.exp === "number" && payload.exp <= nowSeconds) {
    throw new JwtAuthError("JWT expired");
  }
};

const resolveConfiguredRoleClaim = (env: JwtEnv = process.env): string => env.AUTH_JWT_ROLE_CLAIM?.trim() || "role";

const resolveJwtSecret = (env: JwtEnv = process.env): string | null => {
  const secret = env.AUTH_JWT_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
};

export const isJwtAuthEnabled = (env: JwtEnv = process.env): boolean => resolveJwtSecret(env) !== null;

export const isJwtAuthRequired = (env: JwtEnv = process.env): boolean => {
  if (!isJwtAuthEnabled(env)) {
    return false;
  }
  return !parseBooleanFlag(env.AUTH_JWT_OPTIONAL);
};

const parseRole = (value: unknown): AppRole => {
  if (typeof value !== "string" || !ROLE_VALUES.has(value as AppRole)) {
    throw new JwtAuthError("JWT role claim is missing or invalid", 403);
  }
  return value as AppRole;
};

export function verifyJwtAndExtractUser(token: string, options?: VerifyJwtOptions): AuthenticatedUser {
  const env = options?.env ?? process.env;
  const secret = resolveJwtSecret(env);
  if (!secret) {
    throw new JwtAuthError("JWT auth is not configured", 500);
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new JwtAuthError("Invalid JWT format");
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  const header = safeJsonParse<JwtHeader>(base64UrlDecode(headerPart), "header");
  const payload = safeJsonParse<JwtPayload>(base64UrlDecode(payloadPart), "payload");

  if (header.alg !== "HS256") {
    throw new JwtAuthError(`Unsupported JWT alg '${header.alg ?? "unknown"}'`);
  }

  ensureHs256Signature(`${headerPart}.${payloadPart}`, signaturePart, secret);
  ensureTimeWindow(payload, options?.now);
  ensureIssuer(payload, env.AUTH_JWT_ISSUER?.trim() ?? "");
  ensureAudience(payload, env.AUTH_JWT_AUDIENCE?.trim() ?? "");

  const userId = typeof payload.sub === "string" && payload.sub.trim().length > 0 ? payload.sub.trim() : null;
  if (!userId) {
    throw new JwtAuthError("JWT sub claim is missing");
  }

  const roleClaim = resolveConfiguredRoleClaim(env);
  const role = parseRole(payload[roleClaim]);

  return {
    userId,
    role
  };
}
