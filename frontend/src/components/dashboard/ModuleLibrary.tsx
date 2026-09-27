import {
  AlertCircle,
  Boxes,
  ChevronRight,
  Edit2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PromptModule } from "@/services";
import { formatRelativeTime } from "./types";

interface ModuleCardProps {
  module: PromptModule;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ModuleCard({ module, onOpen, onEdit, onDelete }: ModuleCardProps) {
  const varCount = Array.isArray(module.variables) ? module.variables.length : 0;
  const contextCount = Array.isArray(module.input_context)
    ? module.input_context.length
    : module.input_context && typeof module.input_context === "object"
      ? Object.keys(module.input_context).length
      : 0;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative cursor-pointer rounded-lg bg-card/55 p-4 text-left ring-1 ring-border/60 transition hover:-translate-y-0.5 hover:bg-card/75 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
          <Boxes className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{module.name}</h3>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {formatRelativeTime(module.updated_at)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {module.description || "No description provided."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {varCount} {varCount === 1 ? "var" : "vars"}
          </span>
          {contextCount > 0 && (
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {contextCount} context {contextCount === 1 ? "input" : "inputs"}
            </span>
          )}
          {module.output_contract && (
            <span className="rounded-md bg-primary-soft px-2 py-0.5 font-mono text-[10px] text-primary">
              Contract
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Edit2 className="mr-1 size-3" /> Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            title="Delete Module"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <ChevronRight className="size-4 text-muted-foreground opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
        </div>
      </div>
    </div>
  );
}

interface ModuleLibraryProps {
  modules: PromptModule[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onCreateModule: () => void;
  onOpenModule: (id: number) => void;
  onEditModule: (id: number) => void;
  onDeleteModule: (module: PromptModule) => void;
}

export function ModuleLibrary({
  modules,
  loading,
  error,
  onRefresh,
  onCreateModule,
  onOpenModule,
  onEditModule,
  onDeleteModule,
}: ModuleLibraryProps) {
  const [search, setSearch] = useState("");

  const filteredModules = useMemo(() => {
    if (!search.trim()) return modules;
    const q = search.toLowerCase();
    return modules.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))
    );
  }, [modules, search]);

  return (
    <div className="pf-fade mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Prompt Modules</h1>
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {modules.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Build and manage reusable prompt blocks with defined variables, context boundaries, and
            output contracts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh module library"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={onCreateModule}>
            <Plus className="mr-1.5 size-3.5" /> Create Module
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search prompt modules by name or description..."
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={onRefresh}>
            Retry
          </Button>
        </div>
      )}

      {/* Modules Grid */}
      <div className="mt-6">
        {loading && modules.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-xs">Loading prompt modules...</p>
          </div>
        ) : filteredModules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 bg-card/25 p-12 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground">
              <Boxes className="size-6" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">
              {search ? "No matching modules found" : "No Prompt Modules yet"}
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              {search
                ? `No modules matched your search "${search}". Try adjusting your keywords.`
                : "Create your first Prompt Module (e.g. Research, Critic, Writer) to compose into Prompt Systems."}
            </p>
            <div className="mt-6 flex justify-center">
              <Button size="sm" onClick={onCreateModule}>
                <Plus className="mr-1.5 size-3.5" /> Create Module
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredModules.map((m) => (
              <ModuleCard
                key={m.id}
                module={m}
                onOpen={() => onOpenModule(m.id)}
                onEdit={() => onEditModule(m.id)}
                onDelete={() => onDeleteModule(m)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface DeleteModuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: PromptModule | null;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
}

export function DeleteModuleDialog({
  open,
  onOpenChange,
  module,
  deleting,
  error,
  onConfirm,
}: DeleteModuleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Prompt Module</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold text-foreground">
              {module?.name || "this module"}
            </span>
            ? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={deleting}>
            {deleting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Deleting...
              </>
            ) : (
              "Delete Module"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
