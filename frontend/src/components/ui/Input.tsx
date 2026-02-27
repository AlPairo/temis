import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type Props = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, Props>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-10 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] shadow-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 transition",
      className
    )}
    {...props}
  />
));

Input.displayName = "Input";

export default Input;
