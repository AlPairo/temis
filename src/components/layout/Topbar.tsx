import Button from "../ui/Button";
import Avatar from "../ui/Avatar";
import { useUserStore } from "../../state/user-store";
import { FRONTEND_TEXT } from "../../text";

type TopbarProps = {
  onSignOut?: () => void;
  onOpenUserPanel?: () => void;
};

export default function Topbar({ onSignOut, onOpenUserPanel }: TopbarProps) {
  const { user } = useUserStore();
  const topbarText = FRONTEND_TEXT.topbar;

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] bg-white px-3 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="text-xs sm:text-sm text-[var(--color-ink-soft)]">{topbarText.welcomeEyebrow}</p>
        <div className="truncate text-base font-semibold text-[var(--color-ink)] sm:text-xl">
          {topbarText.welcomePrefix}
          {user.name}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onOpenUserPanel}
          aria-label={topbarText.openUserPanelAriaLabel}
          className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          <Avatar name={user.name} />
        </button>
        <Button variant="ghost" size="sm" onClick={onSignOut} className="px-2 sm:px-3">
          {topbarText.signOut}
        </Button>
      </div>
    </header>
  );
}
