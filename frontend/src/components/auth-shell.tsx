import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12 text-foreground sm:px-6 lg:px-8">
      {/* Background ambient gradient matching PromptForge design system */}
      <div className="fixed inset-0 bg-workspace" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <Link to="/" className="flex items-center gap-2.5 transition hover:opacity-90">
            <div className="grid size-10 place-items-center rounded-xl bg-foreground text-xs font-bold text-background shadow-sm">
              PF
            </div>
            <div className="text-left leading-tight">
              <div className="text-base font-semibold tracking-tight text-foreground">PromptForge</div>
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Prompt studio</div>
            </div>
          </Link>
        </div>

        {/* Auth card */}
        <div className="rounded-xl border border-border/70 bg-card/80 p-6 shadow-xl backdrop-blur-xl sm:p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {title}
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
              {subtitle}
            </p>
          </div>

          {children}

          {footer && (
            <div className="mt-6 border-t border-border/60 pt-4 text-center text-xs text-muted-foreground">
              {footer}
            </div>
          )}
        </div>

        {/* Security badge / footnote */}
        <div className="mt-6 text-center font-mono text-[10px] text-muted-foreground">
          PromptForge • Assistant & Module Architecture
        </div>
      </div>
    </div>
  );
}
