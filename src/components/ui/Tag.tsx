import { cn } from "../../utils/cn";

type TagProps = {
  label: string;
  tone?: "default" | "accent";
  onRemove?: () => void;
};

export default function Tag({ label, tone = "default", onRemove }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        tone === "accent"
          ? "border-[var(--color-accent)] text-[var(--color-accent)]"
          : "border-[var(--color-border)] text-[var(--color-ink)]"
      )}
    >
      {label}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
