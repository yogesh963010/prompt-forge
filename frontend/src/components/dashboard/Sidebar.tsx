import { BookOpen, Bot, Boxes, Home, LogOut, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  open: boolean;
  user: { email?: string; name?: string } | null;
  systemCount: number;
  moduleCount?: number;
  currentScreen?: "library" | "editor" | "modules" | "module-editor" | "rag" | "parent_assistant";
  onClose: () => void;
  onHome: () => void;
  onEditor: () => void;
  onModules?: () => void;
  onRag?: () => void;
  onLogout: () => void;
}

export function Sidebar({
  open,
  user,
  systemCount,
  moduleCount = 0,
  currentScreen = "library",
  onClose,
  onHome,
  onEditor,
  onModules,
  onRag,
  onLogout,
}: SidebarProps) {
  const isPromptSystemsActive = currentScreen === "library" || currentScreen === "editor";
  const isModulesActive = currentScreen === "modules" || currentScreen === "module-editor";
  const isRagActive = currentScreen === "rag";

  const links = [
    { label: "Home", icon: Home, action: onHome, active: currentScreen === "library" || currentScreen === "editor", count: systemCount },
    { label: "Modules", icon: Boxes, action: onModules, active: isModulesActive, count: moduleCount },
    { label: "AI Assistant", icon: Bot, action: onRag, active: isRagActive },
  ];

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar/85 px-3.5 py-5 backdrop-blur-2xl transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 overflow-hidden ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-3 px-2 py-1">
        <div className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary via-primary/90 to-amber-500 font-bold text-primary-foreground shadow-md shadow-primary/20 ring-1 ring-white/20">
          <span className="font-mono text-xs font-black tracking-wider">PF</span>
          <div className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-background" />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold tracking-tight text-foreground">PromptForge</span>
            <span className="rounded bg-primary/10 px-1 py-0.2 font-mono text-[9px] font-semibold text-primary">PRO</span>
          </div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            AI Prompt Studio
          </div>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto md:hidden" onClick={onClose}>
          <X />
        </Button>
      </div>

      <nav className="mt-7 space-y-1">
        {links.map(({ label, icon: Icon, action, active, count }) => (
          <button
            key={label}
            onClick={action}
            className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium transition-all duration-200 ${
              active
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25 font-semibold"
                : "text-muted-foreground hover:bg-card/80 hover:text-foreground"
            }`}
          >
            <Icon className={`size-4 transition-transform duration-200 group-hover:scale-110 ${active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"}`} />
            <span>{label}</span>
            {count !== undefined && count > 0 && (
              <span className={`ml-auto font-mono text-[10px] rounded-full px-2 py-0.5 transition-colors ${
                active ? "bg-white/20 text-white" : "bg-muted text-muted-foreground group-hover:bg-muted/80"
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* User profile & Workspace stats */}
      <div className="mt-auto space-y-2">
        {user && (
          <div className="flex items-center justify-between rounded-lg bg-card/60 px-3 py-2 ring-1 ring-border/60">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                {(user.name?.[0] || user.email?.[0] || "U").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                {user.name && <div className="truncate text-xs font-medium">{user.name}</div>}
                <div className="truncate text-[10px] text-muted-foreground">{user.email}</div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={onLogout}
              title="Log out"
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        )}

        <div className="rounded-lg bg-card/60 p-3 ring-1 ring-border/60">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium">Workspace</span>
            <span className="font-mono text-muted-foreground">v2.4</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-2/3 rounded-full bg-primary" />
          </div>
          <div className="mt-2 font-mono text-[9px] uppercase text-muted-foreground">
            {systemCount} {systemCount === 1 ? "prompt system" : "prompt systems"}
          </div>
        </div>
      </div>
    </aside>
  );
}
