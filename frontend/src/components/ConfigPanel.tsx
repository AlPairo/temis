import { useState } from "react";
import { Calendar, PlusCircle } from "lucide-react";
import Card from "./ui/Card";
import Input from "./ui/Input";
import Badge from "./ui/Badge";
import Tag from "./ui/Tag";
import Button from "./ui/Button";
import Separator from "./ui/Separator";
import { useUserStore } from "../state/user-store";
import { usePermission } from "../hooks/usePermission";
import { FRONTEND_TEXT } from "../text";

export default function ConfigPanel() {
  const { user, setRole, setName, setMaterias, setQuota } = useUserStore();
  const canEditConfig = usePermission("config", "edit");
  const canEditUsers = usePermission("users", "edit");
  const canEditPermissions = usePermission("permissions", "edit");
  const text = FRONTEND_TEXT.configPanel;

  const [materiaInput, setMateriaInput] = useState("");
  const [quota, setQuotaState] = useState(user.quota ?? 0);

  const addMateria = () => {
    if (!materiaInput.trim()) return;
    const next = [...(user.materias ?? []), materiaInput.trim()];
    setMaterias(next);
    setMateriaInput("");
  };

  const removeMateria = (m: string) => {
    const next = (user.materias ?? []).filter((x) => x !== m);
    setMaterias(next);
  };

  return (
    <aside className="flex h-full w-full flex-col gap-4 overflow-y-auto bg-[#f7f9fc] p-4">
      <Card title={text.cards.userConfig}>
        <div className="space-y-2 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-[var(--color-ink-soft)]">{text.fields.role}</span>
            <select
              className="h-10 rounded-md border border-[var(--color-border)] bg-white px-3 text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              value={user.role}
              onChange={(e) => setRole(e.target.value as any)}
            >
              <option value="basic">{text.roleOptions.basic}</option>
              <option value="supervisor">{text.roleOptions.supervisor}</option>
              <option value="admin">{text.roleOptions.admin}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[var(--color-ink-soft)]">{text.fields.name}</span>
            <Input value={user.name} disabled={!canEditConfig} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="flex items-center gap-2 text-[var(--color-ink-soft)]">
            <Calendar size={16} />
            <span>
              {text.fields.dateAccessPrefix}
              {user.dateAccess?.from ?? text.fields.dateAccessNoRestrictions} →{" "}
              {user.dateAccess?.to ?? text.fields.dateAccessUnlimited}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--color-ink-soft)]">{text.fields.quotaRemaining}</span>
            <Badge tone={quota > 20 ? "success" : "danger"} label={`${quota} ${text.quotaSuffix}`} />
          </div>
          {canEditConfig ? (
            <input
              type="range"
              min={0}
              max={200}
              value={quota}
              onChange={(e) => {
                const val = Number(e.target.value);
                setQuotaState(val);
                setQuota(val);
              }}
              className="w-full accent-[var(--color-accent)]"
            />
          ) : null}
        </div>
      </Card>

      <Card title={text.cards.materias}>
        <div className="mb-3 flex flex-wrap gap-2">
          {(user.materias ?? []).map((m) => (
            <Tag key={m} label={m} onRemove={canEditConfig ? () => removeMateria(m) : undefined} />
          ))}
          {!user.materias?.length && <p className="text-sm text-[var(--color-ink-soft)]">{text.materiasEmpty}</p>}
        </div>
        {canEditConfig ? (
          <div className="flex gap-2">
            <Input placeholder={text.addMateriaPlaceholder} value={materiaInput} onChange={(e) => setMateriaInput(e.target.value)} />
            <Button variant="outline" onClick={addMateria}>
              <PlusCircle size={16} />
            </Button>
          </div>
        ) : null}
      </Card>

      <Card title={text.cards.usersAndPermissions}>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-[var(--color-ink)] font-medium">{text.permissions.userManagementTitle}</span>
            {canEditUsers ? (
              <Badge tone="accent" label={text.permissions.supervisorPlus} />
            ) : (
              <Badge tone="neutral" label={text.permissions.readOnly} />
            )}
          </div>
          <p className="text-[var(--color-ink-soft)]">{text.permissions.summary}</p>
          <Separator />
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip label={text.permissions.chips[0]} allowed={canEditUsers} />
            <Chip label={text.permissions.chips[1]} allowed={canEditUsers} />
            <Chip label={text.permissions.chips[2]} allowed={canEditUsers} />
            <Chip label={text.permissions.chips[3]} allowed={canEditPermissions} />
            <Chip label={text.permissions.chips[4]} allowed={canEditPermissions} />
            <Chip label={text.permissions.chips[5]} allowed={canEditUsers} />
          </div>
        </div>
      </Card>
    </aside>
  );
}

function Chip({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <span
      className={
        allowed
          ? "rounded-full bg-[#e8ecf5] px-3 py-1 text-[var(--color-accent)]"
          : "rounded-full bg-[#f0f2f6] px-3 py-1 text-[var(--color-ink-soft)] line-through decoration-[var(--color-border)]"
      }
    >
      {label}
    </span>
  );
}
