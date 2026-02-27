import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-strong)] focus-visible:outline-[var(--color-accent)]",
        ghost:
          "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-border-subtle)] focus-visible:outline-[var(--color-accent)]",
        outline:
          "border border-[var(--color-border)] text-[var(--color-ink)] bg-white hover:border-[var(--color-accent)] focus-visible:outline-[var(--color-accent)]"
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-5 text-base"
      },
      tone: {
        default: "",
        danger: "bg-[var(--color-danger)] text-white hover:bg-[#9b2c2c]"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      tone: "default"
    }
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, tone, ...props }, ref) => (
  <button ref={ref} className={cn(buttonStyles({ variant, size, tone }), className)} {...props} />
));

Button.displayName = "Button";

export default Button;
