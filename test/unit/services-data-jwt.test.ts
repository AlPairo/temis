import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  JwtAuthError,
  isJwtAuthEnabled,
  isJwtAuthRequired,
  verifyJwtAndExtractUser
} from "../../src/auth/jwt.js";

const base64Url = (value: string | Buffer): string =>
  Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const signJwt = (payload: Record<string, unknown>, options?: { secret?: string; header?: Record<string, unknown> }) => {
  const secret = options?.secret ?? "test-secret";
  const header = options?.header ?? { alg: "HS256", typ: "JWT" };
  const headerPart = base64Url(JSON.stringify(header));
  const payloadPart = base64Url(JSON.stringify(payload));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${signingInput}.${signature}`;
};

describe("auth/jwt", () => {
  describe("auth flags", () => {
    it("detects enablement and required mode from env", () => {
      expect(isJwtAuthEnabled({ AUTH_JWT_SECRET: undefined })).toBe(false);
      expect(isJwtAuthEnabled({ AUTH_JWT_SECRET: "   " })).toBe(false);
      expect(isJwtAuthEnabled({ AUTH_JWT_SECRET: "secret" })).toBe(true);

      expect(isJwtAuthRequired({ AUTH_JWT_SECRET: undefined })).toBe(false);
      expect(isJwtAuthRequired({ AUTH_JWT_SECRET: "secret" })).toBe(true);
      expect(isJwtAuthRequired({ AUTH_JWT_SECRET: "secret", AUTH_JWT_OPTIONAL: "YES" })).toBe(false);
      expect(isJwtAuthRequired({ AUTH_JWT_SECRET: "secret", AUTH_JWT_OPTIONAL: "off" })).toBe(true);
    });
  });

  describe("verifyJwtAndExtractUser", () => {
    it("returns user for a valid token using issuer, audience array, and custom role claim", () => {
      const env = {
        AUTH_JWT_SECRET: "test-secret",
        AUTH_JWT_ISSUER: "issuer-a",
        AUTH_JWT_AUDIENCE: "aud-2",
        AUTH_JWT_ROLE_CLAIM: "app_role"
      };
      const token = signJwt({
        sub: " user-1 ",
        iss: "issuer-a",
        aud: ["aud-1", "aud-2"],
        exp: 200,
        nbf: 50,
        app_role: "admin"
      });

      const user = verifyJwtAndExtractUser(token, { env, now: () => 100_000 });

      expect(user).toEqual({ userId: "user-1", role: "admin" });
    });

    it("throws when JWT auth is not configured", () => {
      expect(() => verifyJwtAndExtractUser("a.b.c", { env: {} })).toThrowError(JwtAuthError);
      expect(() => verifyJwtAndExtractUser("a.b.c", { env: {} })).toThrow("JWT auth is not configured");
    });

    it("rejects malformed JWT format", () => {
      expect(() => verifyJwtAndExtractUser("only.two", { env: { AUTH_JWT_SECRET: "s" } })).toThrow(
        "Invalid JWT format"
      );
    });

    it("rejects invalid JSON header", () => {
      const token = `${base64Url("not-json")}.${base64Url("{}")}.sig`;
      expect(() => verifyJwtAndExtractUser(token, { env: { AUTH_JWT_SECRET: "s" } })).toThrow("Invalid JWT header");
    });

    it("rejects invalid JSON payload", () => {
      const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const token = `${header}.${base64Url("not-json")}.sig`;
      expect(() => verifyJwtAndExtractUser(token, { env: { AUTH_JWT_SECRET: "s" } })).toThrow("Invalid JWT payload");
    });

    it("rejects unsupported algorithm", () => {
      const token = signJwt({ sub: "u1", role: "basic" }, { header: { alg: "HS512", typ: "JWT" } });
      expect(() => verifyJwtAndExtractUser(token, { env: { AUTH_JWT_SECRET: "test-secret" } })).toThrow(
        "Unsupported JWT alg 'HS512'"
      );
    });

    it("rejects invalid signature", () => {
      const token = signJwt({ sub: "u1", role: "basic" });
      const tampered = `${token.split(".").slice(0, 2).join(".")}.bad-signature`;
      expect(() => verifyJwtAndExtractUser(tampered, { env: { AUTH_JWT_SECRET: "test-secret" } })).toThrow(
        "Invalid JWT signature"
      );
    });

    it("rejects future not-before claims", () => {
      const token = signJwt({ sub: "u1", role: "basic", nbf: 200 });
      expect(() =>
        verifyJwtAndExtractUser(token, { env: { AUTH_JWT_SECRET: "test-secret" }, now: () => 100_000 })
      ).toThrow("JWT not yet valid");
    });

    it("rejects expired tokens", () => {
      const token = signJwt({ sub: "u1", role: "basic", exp: 99 });
      expect(() =>
        verifyJwtAndExtractUser(token, { env: { AUTH_JWT_SECRET: "test-secret" }, now: () => 100_000 })
      ).toThrow("JWT expired");
    });

    it("rejects issuer mismatches", () => {
      const token = signJwt({ sub: "u1", role: "basic", iss: "issuer-a" });
      expect(() =>
        verifyJwtAndExtractUser(token, {
          env: { AUTH_JWT_SECRET: "test-secret", AUTH_JWT_ISSUER: "issuer-b" }
        })
      ).toThrow("Invalid JWT issuer");
    });

    it("rejects missing audience claim when audience is configured", () => {
      const token = signJwt({ sub: "u1", role: "basic" });
      expect(() =>
        verifyJwtAndExtractUser(token, {
          env: { AUTH_JWT_SECRET: "test-secret", AUTH_JWT_AUDIENCE: "aud-1" }
        })
      ).toThrow("JWT audience claim missing");
    });

    it("rejects audience mismatches for string audience claims", () => {
      const token = signJwt({ sub: "u1", role: "basic", aud: "aud-1" });
      expect(() =>
        verifyJwtAndExtractUser(token, {
          env: { AUTH_JWT_SECRET: "test-secret", AUTH_JWT_AUDIENCE: "aud-2" }
        })
      ).toThrow("Invalid JWT audience");
    });

    it("rejects missing sub claim", () => {
      const token = signJwt({ role: "basic" });
      expect(() => verifyJwtAndExtractUser(token, { env: { AUTH_JWT_SECRET: "test-secret" } })).toThrow(
        "JWT sub claim is missing"
      );
    });

    it("rejects invalid role claim and sets 403", () => {
      const token = signJwt({ sub: "u1", role: "owner" });

      try {
        verifyJwtAndExtractUser(token, { env: { AUTH_JWT_SECRET: "test-secret" } });
        throw new Error("expected verifyJwtAndExtractUser to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(JwtAuthError);
        expect((error as JwtAuthError).message).toBe("JWT role claim is missing or invalid");
        expect((error as JwtAuthError).statusCode).toBe(403);
      }
    });
  });
});
