import { Plus, RefreshCw, Pencil, Trash2 } from "lucide-react";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import { cn } from "../utils/cn";
import type { SessionListParams, SessionSummary } from "../services/sessions";
import { useUserStore } from "../state/user-store";
import { FRONTEND_TEXT, formatDeleteSessionAriaLabel, formatSessionTurnsLabel } from "../text";

type SessionListProps = {
  activeSessionId: string | null;
  sessions?: SessionSummary[];
  isFetching?: boolean;
  filters: Required<Pick<SessionListParams, "includeDeleted" | "scope">>;
  onChangeFilters: (next: Required<Pick<SessionListParams, "includeDeleted" | "scope">>) => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  onRenameSession: (sessionId: string, title: string) => void | Promise<void>;
  onDeleteSession: (sessionId: string) => void | Promise<void>;
};

export default function SessionList({
  activeSessionId,
  sessions,
  isFetching,
  filters,
  onChangeFilters,
  onRefresh,
  onSelect,
  onCreateNew,
  onRenameSession,
  onDeleteSession
}: SessionListProps) {
  const role = useUserStore((s) => s.user.role);
  const canSwitchScope = role === "supervisor" || role === "admin";
  const canViewDeletedFilter = role === "supervisor" || role === "admin";
  const text = FRONTEND_TEXT.sessionList;

  return (
    <aside className="flex h-full min-h-0 flex-col gap-3 border-b border-[var(--color-border-subtle)] bg-[#f6f8fb] p-3 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between gap-2">
        <h3 style={{ fontFamily: "var(--font-body)", letterSpacing: "normal" }} className="text-sm font-semibold text-[var(--color-ink)]">
          {text.heading}
        </h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" aria-label={text.refreshAriaLabel} onClick={onRefresh}>
            <RefreshCw size={16} className={cn(isFetching && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={onCreateNew} aria-label={text.newSessionAriaLabel}>
            <Plus size={16} /> {text.newSessionButton}
          </Button>
        </div>
      </div>

      {canSwitchScope ? (
        <label className="grid gap-1 text-xs text-[var(--color-ink-soft)]">
          <span>{text.scopeLabel}</span>
          <select
            className="h-9 rounded-md border border-[var(--color-border)] bg-white px-2 text-sm text-[var(--color-ink)]"
            value={filters.scope}
            onChange={(e) =>
              onChangeFilters({
                ...filters,
                scope: e.target.value === "visible" ? "visible" : "mine"
              })
            }
          >
            <option value="mine">{text.scopeMine}</option>
            <option value="visible">{text.scopeVisible}</option>
          </select>
        </label>
      ) : null}

      {canViewDeletedFilter ? (
        <label className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)]">
          <input
            type="checkbox"
            checked={filters.includeDeleted}
            onChange={(e) => onChangeFilters({ ...filters, includeDeleted: e.target.checked })}
          />
          <span>{text.showDeleted}</span>
        </label>
      ) : null}

      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
        {sessions?.map((session) => {
          const displayTitle =
            session.title?.trim() || session.last_message?.trim() || FRONTEND_TEXT.appHome.fallbackSessionTitle;
          return (
            <div
              key={session.session_id}
              className={cn(
                "w-full rounded-lg border border-[var(--color-border-subtle)] bg-white px-3 py-2 text-left transition hover:border-[var(--color-accent)]",
                activeSessionId === session.session_id && "border-[var(--color-accent)] shadow-sm",
                session.is_deleted && "opacity-85"
              )}
            >
              <button type="button" onClick={() => onSelect(session.session_id)} className="w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[var(--color-ink)]">{displayTitle}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {session.is_deleted ? <Badge tone="neutral" label={text.deletedBadge} /> : null}
                    <Badge tone="accent" label={formatSessionTurnsLabel(session.turns)} />
                  </div>
                </div>
              </button>

              {session.can_rename || session.can_delete ? (
                <div className="mt-2 flex justify-end gap-1">
                  {session.can_rename ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2"
                      onClick={(event) => {
                        event.stopPropagation();
                        const nextTitle = window.prompt(text.renamePromptTitle, session.title ?? displayTitle);
                        if (!nextTitle || !nextTitle.trim()) return;
                        void onRenameSession(session.session_id, nextTitle.trim());
                      }}
                    >
                      <Pencil size={14} />
                    </Button>
                  ) : null}
                  {session.can_delete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 !text-red-600 hover:!bg-red-50"
                      aria-label={formatDeleteSessionAriaLabel(displayTitle)}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (!window.confirm(text.deleteConfirm)) return;
                        void onDeleteSession(session.session_id);
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {!sessions?.length && <p className="text-sm text-[var(--color-ink-soft)]">{text.emptyState}</p>}
      </div>
    </aside>
  );
}
