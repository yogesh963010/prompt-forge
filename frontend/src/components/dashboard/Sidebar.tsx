import { BookOpen, Boxes, FileText, Home, LogOut, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarProps {
  open: boolean;
  user: { email?: string; name?: string } | null;
  systemCount: number;
  moduleCount?: number;
  currentScreen?: "library" | "editor" | "modules" | "module-editor";
  onClose: () => void;
  onHome: () => void;
  onEditor: () => void;
  onModules?: () => void;
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
  onLogout,
}: SidebarProps) {
  const isPromptSystemsActive = currentScreen === "library" || currentScreen === "editor";
  const isModulesActive = currentScreen === "modules" || currentScreen === "module-editor";

  const links = [
    { label: "Home", icon: Home, action: onHome, active: currentScreen === "library" },
    { label: "Prompt Systems", icon: BookOpen, action: onEditor, active: isPromptSystemsActive, count: systemCount },
    { label: "Modules", icon: Boxes, action: onModules, active: isModulesActive, count: moduleCount },
    { label: "Templates", icon: FileText },
    { label: "Settings", icon: Settings },
  ];

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-border/60 bg-sidebar/90 px-3 py-5 backdrop-blur-xl transition-transform md:sticky md:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      <div className="flex items-center gap-2.5 px-2">
        <div className="grid size-8 place-items-center rounded-lg bg-foreground text-[10px] font-bold text-background">
          PF
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold">PromptForge</div>
          <div className="font-mono text-[9px] uppercase text-muted-foreground">
            Prompt studio
          </div>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto md:hidden" onClick={onClose}>
          <X />
        </Button>
      </div>

      <nav className="mt-7 space-y-0.5">
        {links.map(({ label, icon: Icon, action, active, count }) => (
          <Button
            key={label}
            variant={active ? "secondary" : "ghost"}
            className="w-full justify-start px-3 font-normal"
            onClick={action}
          >
            <Icon />
            {label}
            {count !== undefined && count > 0 && (
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {count}
              </span>
            )}
          </Button>
        ))}
      </nav>

      {/* User profile & Workspace stats */}
      <div className="mt-auto space-y-2">
        {user && (
          <div className="flex items-center justify-between rounded-lg bg-card/60 px-3 py-2 ring-1 ring-border/60">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                {user.name ? user.name[0].toUpperCase() : user.email ? user.email[0].toUpperCase() : "U"}
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
