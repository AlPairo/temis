import { cn } from "../../utils/cn";

type AvatarProps = {
  name: string;
  size?: "sm" | "md";
};

export default function Avatar({ name, size = "md" }: AvatarProps) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const sizeClass = size === "sm" ? "h-8 w-8 text-sm" : "h-10 w-10 text-base";
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-[var(--color-accent)] text-white font-semibold uppercase",
        sizeClass
      )}
    >
      {initials}
    </div>
  );
}
