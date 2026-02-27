import { cn } from "../../utils/cn";
import { type PropsWithChildren } from "react";

type CardProps = PropsWithChildren<{
  title?: string;
  className?: string;
  actions?: React.ReactNode;
}>;

export default function Card({ title, actions, className, children }: CardProps) {
  return (
    <section className={cn("surface-card p-4 md:p-6", className)}>
      {title ? (
        <header className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  );
}
