import { cn } from "../../utils/cn";

type BadgeProps = {
  label: string;
  tone?: "neutral" | "success" | "danger" | "accent";
};

export default function Badge({ label, tone = "neutral" }: BadgeProps) {
  const toneClass =
    tone === "success"
      ? "bg-[#e6f4ec] text-[#256c3a]"
      : tone === "danger"
      ? "bg-[#fdeaea] text-[#9b2c2c]"
      : tone === "accent"
      ? "bg-[#e8ecf5] text-[var(--color-accent)]"
      : "bg-[#edf1f7] text-[var(--color-ink)]";
  return <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-xs font-medium", toneClass)}>{label}</span>;
}
