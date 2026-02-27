import type { Action, Permission, Resource, Role } from "../types/roles";

export const PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  basic: [
    { resource: "chat", actions: ["read", "edit"] },
    { resource: "sessions", actions: ["read"] },
    { resource: "config", actions: ["read"] }
  ],
  supervisor: [
    { resource: "chat", actions: ["read", "edit"] },
    { resource: "sessions", actions: ["read", "edit"] },
    { resource: "config", actions: ["read", "edit"] },
    { resource: "users", actions: ["read", "edit"] }
  ],
  admin: [
    { resource: "chat", actions: ["read", "edit"] },
    { resource: "sessions", actions: ["read", "edit"] },
    { resource: "config", actions: ["read", "edit"] },
    { resource: "users", actions: ["read", "edit"] },
    { resource: "permissions", actions: ["read", "edit"] }
  ]
};

export function can(role: Role, resource: Resource, action: Action): boolean {
  const perms = PERMISSIONS_BY_ROLE[role];
  return perms.some((p) => p.resource === resource && p.actions.includes(action));
}
