import type { FastifyRequest } from "fastify";
import { getPostgresClient } from "../clients/postgres.js";
import { logWarn } from "../observability/logger.js";
import { canSession, getSessionPermissionsForRole } from "./permissions.js";
import { JwtAuthError, isJwtAuthEnabled, isJwtAuthRequired, verifyJwtAndExtractUser } from "./jwt.js";
import type { AppRole, AuthenticatedUser } from "./types.js";

export interface SessionViewerScope {
  viewer: AuthenticatedUser | null;
  visibleUserIds: string[] | null;
  includeDeleted: boolean;
}

const resolveAuthorizationHeader = (request: FastifyRequest): string | null => {
  const raw = request.headers.authorization;
  if (typeof raw !== "string") {
    return null;
  }
  return raw.trim() || null;
};

const extractBearerToken = (authorization: string | null): string | null => {
  if (!authorization) {
    return null;
  }
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

async function upsertUserRole(user: AuthenticatedUser): Promise<AuthenticatedUser> {
  const { pool } = await getPostgresClient();
  const result = await pool.query<{ id: string; role: AppRole }>(
    `
      INSERT INTO users (id, role)
      VALUES ($1, $2)
      ON CONFLICT (id) DO UPDATE
      SET role = users.role,
          updated_at = NOW()
      RETURNING id, role
    `,
    [user.userId, user.role]
  );

  const row = result.rows[0];
  if (!row) {
    return user;
  }

  const resolvedUserId = row.id ?? user.userId;
  const resolvedRole = row.role ?? user.role;

  if (row.role && row.role !== user.role) {
    logWarn(
      "auth.jwt.role_claim_mismatch",
      { requestId: null },
      {
        user_id: user.userId,
        jwt_role: user.role,
        db_role: row.role
      }
    );
  }

  return {
    userId: resolvedUserId,
    role: resolvedRole
  };
}

export async function resolveAuthenticatedUser(request: FastifyRequest): Promise<AuthenticatedUser | null> {
  if (!isJwtAuthEnabled()) {
    return null;
  }

  const token = extractBearerToken(resolveAuthorizationHeader(request));
  if (!token) {
    if (isJwtAuthRequired()) {
      throw new JwtAuthError("Missing bearer token");
    }
    return null;
  }

  const parsed = verifyJwtAndExtractUser(token);
  return upsertUserRole(parsed);
}

export async function requireAuthenticatedUser(request: FastifyRequest): Promise<AuthenticatedUser> {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    throw new JwtAuthError("Authentication required");
  }
  return user;
}

export async function resolveVisibleUserIds(viewer: AuthenticatedUser): Promise<string[] | null> {
  if (viewer.role === "admin") {
    return null;
  }
  if (viewer.role === "basic") {
    return [viewer.userId];
  }

  const { pool } = await getPostgresClient();
  const result = await pool.query<{ id: string }>(
    `
      WITH RECURSIVE visible_users AS (
        SELECT id
        FROM users
        WHERE id = $1
        UNION ALL
        SELECT u.id
        FROM users u
        INNER JOIN visible_users vu ON u.parent_user_id = vu.id
        WHERE COALESCE(u.is_active, TRUE) = TRUE
      )
      SELECT DISTINCT id FROM visible_users
    `,
    [viewer.userId]
  );

  const ids = result.rows.map((row) => row.id);
  if (!ids.includes(viewer.userId)) {
    ids.push(viewer.userId);
  }
  return ids;
}

export async function buildSessionViewerScope(input: {
  request: FastifyRequest;
  requestedIncludeDeleted?: boolean;
  requestedScope?: "mine" | "visible";
}): Promise<SessionViewerScope> {
  const viewer = await resolveAuthenticatedUser(input.request);
  if (!viewer) {
    return {
      viewer: null,
      visibleUserIds: null,
      includeDeleted: Boolean(input.requestedIncludeDeleted)
    };
  }

  const permissions = getSessionPermissionsForRole(viewer.role);
  const includeDeleted = Boolean(input.requestedIncludeDeleted && permissions.view_deleted);

  if (input.requestedScope === "visible" && (viewer.role === "supervisor" || viewer.role === "admin")) {
    return {
      viewer,
      visibleUserIds: await resolveVisibleUserIds(viewer),
      includeDeleted
    };
  }

  return {
    viewer,
    visibleUserIds: [viewer.userId],
    includeDeleted
  };
}

export const canViewerUseDeletedFilter = (viewer: AuthenticatedUser | null): boolean =>
  viewer ? canSession(viewer.role, "view_deleted") : false;

export const canViewerRenameOwnSession = (viewer: AuthenticatedUser | null): boolean =>
  viewer ? canSession(viewer.role, "rename") : true;

export const canViewerDeleteOwnSession = (viewer: AuthenticatedUser | null): boolean =>
  viewer ? canSession(viewer.role, "delete") : true;

export const isOwner = (viewer: AuthenticatedUser | null, ownerUserId: string | null): boolean => {
  if (!viewer) {
    return true;
  }
  return ownerUserId === viewer.userId;
};

export { JwtAuthError };
