export type AppRole = "basic" | "supervisor" | "admin";

export type SessionPermissionAction = "read" | "rename" | "delete" | "view_deleted";

export interface AuthenticatedUser {
  userId: string;
  role: AppRole;
}

export interface SessionPermissionSet {
  read: boolean;
  rename: boolean;
  delete: boolean;
  view_deleted: boolean;
}

