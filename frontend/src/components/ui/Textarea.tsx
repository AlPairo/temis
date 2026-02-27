import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = forwardRef<HTMLTextAreaElement, Props>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full min-h-[120px] rounded-md border border-[var(--color-border)] bg-white px-3 py-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] shadow-sm focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 transition",
      className
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";

export default Textarea;
