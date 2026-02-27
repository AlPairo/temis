import { useMemo } from "react";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import { usePermission } from "../hooks/usePermission";
import { FRONTEND_TEXT } from "../text";

type ManagedUser = {
  id: string;
  name: string;
  role: "basic" | "supervisor" | "admin";
  materias: string[];
  quota: number;
};

const seedUsers: ManagedUser[] = FRONTEND_TEXT.userManagement.seedUsers.map((user) => ({
  ...user,
  materias: [...user.materias]
}));

export default function UserManagement() {
  const canEdit = usePermission("users", "edit");
  const canEditPermissions = usePermission("permissions", "edit");
  const users = useMemo(() => seedUsers, []);
  const text = FRONTEND_TEXT.userManagement;

  return (
    <div className="space-y-3 rounded-lg border border-[var(--color-border-subtle)] bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-ink)]">{text.title}</h4>
          <p className="text-xs text-[var(--color-ink-soft)]">{text.subtitle}</p>
        </div>
        {canEdit ? (
          <Button size="sm" variant="outline">
            {text.newUser}
          </Button>
        ) : (
          <Badge tone="neutral" label={text.readOnly} />
        )}
      </div>
      <div className="divide-y divide-[var(--color-border-subtle)]">
        {users.map((u) => (
          <div key={u.id} className="flex items-center justify-between py-2 text-sm">
            <div>
              <div className="font-medium text-[var(--color-ink)]">{u.name}</div>
              <div className="text-xs text-[var(--color-ink-soft)]">
                {text.materiasPrefix}
                {u.materias.join(", ") || text.materiasEmpty}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="accent" label={u.role} />
              {canEdit ? (
                <Button size="sm" variant="ghost">
                  {text.edit}
                </Button>
              ) : null}
              {canEditPermissions ? (
                <Button size="sm" variant="ghost">
                  {text.permissions}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
