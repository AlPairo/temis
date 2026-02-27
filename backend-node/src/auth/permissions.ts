import type { AppRole, SessionPermissionAction, SessionPermissionSet } from "./types.js";

const SESSION_PERMISSIONS_BY_ROLE: Record<AppRole, SessionPermissionSet> = {
  basic: {
    read: true,
    rename: true,
    delete: true,
    view_deleted: false
  },
  supervisor: {
    read: true,
    rename: true,
    delete: true,
    view_deleted: true
  },
  admin: {
    read: true,
    rename: true,
    delete: true,
    view_deleted: true
  }
};

export const getSessionPermissionsForRole = (role: AppRole): SessionPermissionSet => SESSION_PERMISSIONS_BY_ROLE[role];

export const canSession = (role: AppRole, action: SessionPermissionAction): boolean =>
  SESSION_PERMISSIONS_BY_ROLE[role][action];

