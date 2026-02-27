export type Role = "basic" | "supervisor" | "admin";

export type Resource = "chat" | "sessions" | "config" | "users" | "permissions";

export type Action = "read" | "edit";

export type Permission = {
  resource: Resource;
  actions: Action[];
};

export type User = {
  id: string;
  name: string;
  role: Role;
  permissions?: Permission[];
  materias?: string[];
  dateAccess?: {
    from?: string;
    to?: string;
  };
  quota?: number;
};
