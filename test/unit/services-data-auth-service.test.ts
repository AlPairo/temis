import type { FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "../../src/auth/types.js";

const mocks = vi.hoisted(() => ({
  getPostgresClient: vi.fn(),
  logWarn: vi.fn(),
  isJwtAuthEnabled: vi.fn(),
  isJwtAuthRequired: vi.fn(),
  verifyJwtAndExtractUser: vi.fn()
}));

vi.mock("../../src/clients/postgres.js", () => ({
  getPostgresClient: mocks.getPostgresClient
}));

vi.mock("../../src/observability/logger.js", () => ({
  logWarn: mocks.logWarn
}));

vi.mock("../../src/auth/jwt.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/auth/jwt.js")>("../../src/auth/jwt.js");
  return {
    ...actual,
    isJwtAuthEnabled: mocks.isJwtAuthEnabled,
    isJwtAuthRequired: mocks.isJwtAuthRequired,
    verifyJwtAndExtractUser: mocks.verifyJwtAndExtractUser
  };
});

import {
  JwtAuthError,
  buildSessionViewerScope,
  canViewerDeleteOwnSession,
  canViewerRenameOwnSession,
  canViewerUseDeletedFilter,
  isOwner,
  requireAuthenticatedUser,
  resolveAuthenticatedUser,
  resolveVisibleUserIds
} from "../../src/auth/service.js";

const requestWithAuth = (authorization?: unknown) =>
  ({
    headers: authorization === undefined ? {} : { authorization }
  }) as FastifyRequest;

const mockPool = (rows: unknown[], options?: { rowCount?: number }) => {
  const query = vi.fn().mockResolvedValue({
    rows,
    rowCount: options?.rowCount
  });

  mocks.getPostgresClient.mockResolvedValue({ pool: { query } });
  return query;
};

describe("auth/service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isJwtAuthEnabled.mockReturnValue(false);
    mocks.isJwtAuthRequired.mockReturnValue(false);
    mocks.verifyJwtAndExtractUser.mockImplementation(() => {
      throw new Error("verifyJwtAndExtractUser not configured");
    });
  });

  describe("resolveAuthenticatedUser", () => {
    it("returns null when JWT auth is disabled", async () => {
      const user = await resolveAuthenticatedUser(requestWithAuth("Bearer token"));

      expect(user).toBeNull();
      expect(mocks.verifyJwtAndExtractUser).not.toHaveBeenCalled();
      expect(mocks.getPostgresClient).not.toHaveBeenCalled();
    });

    it("returns null when bearer token is missing and auth is optional", async () => {
      mocks.isJwtAuthEnabled.mockReturnValue(true);
      mocks.isJwtAuthRequired.mockReturnValue(false);

      await expect(resolveAuthenticatedUser(requestWithAuth("Basic abc"))).resolves.toBeNull();
    });

    it("throws when bearer token is missing and auth is required", async () => {
      mocks.isJwtAuthEnabled.mockReturnValue(true);
      mocks.isJwtAuthRequired.mockReturnValue(true);

      await expect(resolveAuthenticatedUser(requestWithAuth(undefined))).rejects.toThrowError(JwtAuthError);
      await expect(resolveAuthenticatedUser(requestWithAuth(undefined))).rejects.toThrow("Missing bearer token");
    });

    it("verifies the token, upserts the user, and logs role mismatches", async () => {
      mocks.isJwtAuthEnabled.mockReturnValue(true);
      mocks.verifyJwtAndExtractUser.mockReturnValue({ userId: "user-1", role: "basic" } satisfies AuthenticatedUser);
      const query = mockPool([{ id: "user-1", role: "admin" }]);

      const user = await resolveAuthenticatedUser(requestWithAuth("Bearer  signed-token  "));

      expect(mocks.verifyJwtAndExtractUser).toHaveBeenCalledWith("signed-token");
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][1]).toEqual(["user-1", "basic"]);
      expect(user).toEqual({ userId: "user-1", role: "admin" });
      expect(mocks.logWarn).toHaveBeenCalledWith(
        "auth.jwt.role_claim_mismatch",
        { requestId: null },
        expect.objectContaining({
          user_id: "user-1",
          jwt_role: "basic",
          db_role: "admin"
        })
      );
    });

    it("returns the parsed user when the upsert query returns no row", async () => {
      mocks.isJwtAuthEnabled.mockReturnValue(true);
      mocks.verifyJwtAndExtractUser.mockReturnValue({ userId: "user-2", role: "supervisor" } satisfies AuthenticatedUser);
      mockPool([]);

      const user = await resolveAuthenticatedUser(requestWithAuth("Bearer t"));

      expect(user).toEqual({ userId: "user-2", role: "supervisor" });
      expect(mocks.logWarn).not.toHaveBeenCalled();
    });
  });

  describe("requireAuthenticatedUser", () => {
    it("throws when no authenticated user can be resolved", async () => {
      mocks.isJwtAuthEnabled.mockReturnValue(false);

      await expect(requireAuthenticatedUser(requestWithAuth())).rejects.toThrow("Authentication required");
    });

    it("returns the authenticated user", async () => {
      mocks.isJwtAuthEnabled.mockReturnValue(true);
      mocks.verifyJwtAndExtractUser.mockReturnValue({ userId: "user-1", role: "basic" } satisfies AuthenticatedUser);
      mockPool([{ id: "user-1", role: "basic" }]);

      await expect(requireAuthenticatedUser(requestWithAuth("Bearer ok"))).resolves.toEqual({
        userId: "user-1",
        role: "basic"
      });
    });
  });

  describe("resolveVisibleUserIds", () => {
    it("returns null for admins", async () => {
      await expect(resolveVisibleUserIds({ userId: "admin-1", role: "admin" })).resolves.toBeNull();
      expect(mocks.getPostgresClient).not.toHaveBeenCalled();
    });

    it("returns self for basic users", async () => {
      await expect(resolveVisibleUserIds({ userId: "user-1", role: "basic" })).resolves.toEqual(["user-1"]);
      expect(mocks.getPostgresClient).not.toHaveBeenCalled();
    });

    it("queries visible users for supervisors and ensures self is included", async () => {
      const query = mockPool([{ id: "child-1" }, { id: "child-2" }]);

      const ids = await resolveVisibleUserIds({ userId: "sup-1", role: "supervisor" });

      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][1]).toEqual(["sup-1"]);
      expect(ids).toEqual(["child-1", "child-2", "sup-1"]);
    });
  });

  describe("buildSessionViewerScope", () => {
    it("returns anonymous scope when no viewer is authenticated", async () => {
      mocks.isJwtAuthEnabled.mockReturnValue(false);

      const scope = await buildSessionViewerScope({
        request: requestWithAuth(),
        requestedIncludeDeleted: true
      });

      expect(scope).toEqual({
        viewer: null,
        visibleUserIds: null,
        includeDeleted: true
      });
    });

    it("limits basic users to their own sessions and denies deleted filter", async () => {
      mocks.isJwtAuthEnabled.mockReturnValue(true);
      mocks.verifyJwtAndExtractUser.mockReturnValue({ userId: "user-1", role: "basic" } satisfies AuthenticatedUser);
      mockPool([{ id: "user-1", role: "basic" }]);

      const scope = await buildSessionViewerScope({
        request: requestWithAuth("Bearer t"),
        requestedIncludeDeleted: true,
        requestedScope: "visible"
      });

      expect(scope).toEqual({
        viewer: { userId: "user-1", role: "basic" },
        visibleUserIds: ["user-1"],
        includeDeleted: false
      });
    });

    it("uses visible scope for supervisors and allows deleted filter", async () => {
      mocks.isJwtAuthEnabled.mockReturnValue(true);
      mocks.verifyJwtAndExtractUser.mockReturnValue({ userId: "sup-1", role: "supervisor" } satisfies AuthenticatedUser);
      const query = mockPool([{ id: "sup-1" }, { id: "child-1" }]);

      const scope = await buildSessionViewerScope({
        request: requestWithAuth("Bearer t"),
        requestedIncludeDeleted: true,
        requestedScope: "visible"
      });

      expect(query).toHaveBeenCalled();
      expect(scope).toEqual({
        viewer: { userId: "sup-1", role: "supervisor" },
        visibleUserIds: ["sup-1", "child-1"],
        includeDeleted: true
      });
    });

    it("uses visible scope for admins and returns null visibleUserIds", async () => {
      mocks.isJwtAuthEnabled.mockReturnValue(true);
      mocks.verifyJwtAndExtractUser.mockReturnValue({ userId: "admin-1", role: "admin" } satisfies AuthenticatedUser);
      mockPool([{ id: "admin-1", role: "admin" }]);

      const scope = await buildSessionViewerScope({
        request: requestWithAuth("Bearer t"),
        requestedScope: "visible"
      });

      expect(scope).toEqual({
        viewer: { userId: "admin-1", role: "admin" },
        visibleUserIds: null,
        includeDeleted: false
      });
    });
  });

  describe("viewer helpers", () => {
    it("computes permissions and ownership helpers", () => {
      expect(canViewerUseDeletedFilter(null)).toBe(false);
      expect(canViewerUseDeletedFilter({ userId: "s1", role: "supervisor" })).toBe(true);

      expect(canViewerRenameOwnSession(null)).toBe(true);
      expect(canViewerRenameOwnSession({ userId: "u1", role: "basic" })).toBe(true);

      expect(canViewerDeleteOwnSession(null)).toBe(true);
      expect(canViewerDeleteOwnSession({ userId: "u1", role: "basic" })).toBe(true);

      expect(isOwner(null, "owner-1")).toBe(true);
      expect(isOwner({ userId: "u1", role: "basic" }, "u1")).toBe(true);
      expect(isOwner({ userId: "u1", role: "basic" }, "u2")).toBe(false);
    });
  });
});
