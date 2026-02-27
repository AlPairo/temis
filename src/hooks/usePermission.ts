import { useMemo } from "react";
import { can } from "../constants/permissions";
import { useUserStore } from "../state/user-store";
import type { Action, Resource } from "../types/roles";

export function usePermission(resource: Resource, action: Action): boolean {
  const role = useUserStore((s) => s.user.role);
  return useMemo(() => can(role, resource, action), [role, resource, action]);
}
