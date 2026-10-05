import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  Copy,
  Edit2,
  FileCode2,
  Filter,
  Globe,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Variable,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PromptSystem } from "@/services";
import { formatRelativeTime } from "./types";

interface SystemCardProps {
  item: PromptSystem;
  onOpen: () => void;
  onDelete: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDuplicate?: () => void;
  onRun?: () => void;
}

export function SystemCard({ item, onOpen, onDelete, onArchive, onUnarchive, onDuplicate, onRun }: SystemCardProps) {
  const varCount = Array.isArray(item.variables) ? item.variables.length : 0;
  const modCount = Array.isArray(item.modules) ? item.modules.length : 0;

  return (
    <div
      onClick={onRun || onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (onRun) {
            onRun();
          } else {
            onOpen();
          }
        }
      }}
      className="group relative flex flex-col justify-between rounded-2xl glass-card card-glow p-5 text-left ring-1 ring-border/60 transition-all duration-300 hover:ring-primary/40 hover:shadow-xl hover:shadow-primary/5 cursor-pointer"
    >
      <div>
        {/* Top Header inside card */}
        <div className="flex items-start gap-3.5">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-primary/20 via-primary/10 to-amber-500/10 text-primary ring-1 ring-primary/25 shadow-xs transition-transform duration-200 group-hover:scale-105">
            <FileCode2 className="size-5.5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                {item.name}
              </h3>

              {item.visibility === "public_link" && (
                <span
                  className="ml-auto inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 font-mono text-[9px] font-medium text-blue-600 dark:text-blue-400 border border-blue-500/20"
                  title="Shared via public link"
                >
                  <Globe className="size-2.5" /> Public
                </span>
              )}

              <span
                className={`${item.visibility === "public_link" ? "" : "ml-auto "}inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold ${!item.archived
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-muted text-muted-foreground border border-border/40"
                  }`}
              >
                {!item.archived && <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                {!item.archived ? "Active" : "Archived"}
              </span>
            </div>

            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {item.description || "No description provided. Click to configure instructions and variables."}
            </p>
          </div>
        </div>

        {/* Feature Pills */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {varCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium text-primary border border-primary/20">
              <Variable className="size-2.5" />
              {varCount} {varCount === 1 ? "var" : "vars"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              0 vars
            </span>
          )}

          {modCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
              <Boxes className="size-2.5" />
              {modCount} {modCount === 1 ? "sub assistant" : "sub assistants"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              Core system
            </span>
          )}
        </div>
      </div>

      {/* Card Actions Bottom Strip */}
      <div className="mt-5 border-t border-border/50 pt-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {onRun && (
              <Button
                variant="outline"
                size="sm"
                className="h-7.5 gap-1.5 rounded-lg border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary shadow-xs hover:bg-primary hover:text-primary-foreground transition-all duration-200"
                title="Open Assistant Chat"
                onClick={(e) => {
                  e.stopPropagation();
                  onRun();
                }}
              >
                <Play className="size-3 fill-current" />
                <span>Chat</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="size-7.5 rounded-lg text-muted-foreground hover:bg-card hover:text-primary transition-colors"
              title="Edit System Instructions"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
            >
              <Edit2 className="size-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            {onDuplicate && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7.5 rounded-lg text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
                title="Duplicate Prompt System"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate();
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            )}

            {item.archived ? (
              onUnarchive && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7.5 rounded-lg text-muted-foreground hover:text-primary transition-colors"
                  title="Unarchive Prompt System"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnarchive();
                  }}
                >
                  <ArchiveRestore className="size-3.5" />
                </Button>
              )
            ) : (
              onArchive && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  title="Archive Prompt System"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive();
                  }}
                >
                  <Archive className="size-3.5" />
                </Button>
              )
            )}

            <Button
              variant="ghost"
              size="icon"
              className="size-7.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              title="Delete Prompt System"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {/* Footer timestamp & version */}
        <div className="mt-2.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground/80">
          <span>v{item.version}.0</span>
          <div className="flex items-center gap-1">
            <span>{formatRelativeTime(item.updated_at)}</span>
            <ChevronRight className="size-3 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface PromptLibraryProps {
  search: string;
  setSearch: (value: string) => void;
  systems: PromptSystem[];
  filtered: PromptSystem[];
  filterOpen: boolean;
  setFilterOpen: (value: boolean) => void;
  statusFilter: "All" | "Active" | "Draft";
  setStatusFilter: (value: "All" | "Active" | "Draft") => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (id: number) => void;
  onNew: () => void;
  onDelete: (system: PromptSystem) => void;
  onArchive?: (id: number) => void;
  onUnarchive?: (id: number) => void;
  onDuplicate?: (id: number) => void;
  onRun?: (system: PromptSystem) => void;
}

export function PromptLibrary({
  search,
  setSearch,
  systems,
  filtered,
  filterOpen,
  setFilterOpen,
  statusFilter,
  setStatusFilter,
  loading,
  error,
  onRetry,
  onOpen,
  onNew,
  onDelete,
  onArchive,
  onUnarchive,
  onDuplicate,
  onRun,
}: PromptLibraryProps) {
  const activeCount = systems.filter((s) => !s.archived).length;
  const archivedCount = systems.filter((s) => s.archived).length;

  return (
    <div className="pf-fade mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">


      {/* SEARCH AND FILTERS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Prompt Systems by name or description..."
            className="h-11 rounded-xl bg-card/75 pl-10 pr-9 border-border/70 backdrop-blur shadow-xs text-sm focus:border-primary focus:ring-primary/20"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-1.5 rounded-xl bg-card/65 p-1 ring-1 ring-border/60 backdrop-blur shadow-xs">
          <button
            onClick={() => setStatusFilter("All")}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${statusFilter === "All"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
              }`}
          >
            All ({systems.length})
          </button>
          <button
            onClick={() => setStatusFilter("Active")}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${statusFilter === "Active"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
              }`}
          >
            Active ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter("Draft")}
            className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${statusFilter === "Draft"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
              }`}
          >
            Archived ({archivedCount})
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="size-4.5 shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onRetry} className="h-8">
            <RefreshCw className="mr-1.5 size-3.5" /> Retry
          </Button>
        </div>
      )}

      {/* SYSTEMS SECTION */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">Prompt Systems</h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary">
              {filtered.length}
            </span>
          </div>
          <span className="font-mono text-[10px] tracking-wider uppercase text-muted-foreground">
            {loading ? "FETCHING SYSTEMS..." : "READY TO RUN"}
          </span>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card/40 backdrop-blur">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-xs font-medium text-muted-foreground">Loading Prompt Systems from workspace...</p>
          </div>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => (
                <SystemCard
                  key={item.id}
                  item={item}
                  onOpen={() => onOpen(item.id)}
                  onDelete={() => onDelete(item)}
                  onArchive={onArchive ? () => onArchive(item.id) : undefined}
                  onUnarchive={onUnarchive ? () => onUnarchive(item.id) : undefined}
                  onDuplicate={onDuplicate ? () => onDuplicate(item.id) : undefined}
                  onRun={onRun ? () => onRun(item) : undefined}
                />
              ))}
            </div>

            {filtered.length === 0 && !loading && (
              <div className="rounded-3xl border border-dashed border-border/80 bg-card/40 p-12 text-center backdrop-blur">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 ring-1 ring-primary/20">
                  <FileCode2 className="size-7" />
                </div>
                <h3 className="text-base font-bold text-foreground">No Prompt Systems Found</h3>
                <p className="mt-1.5 text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                  {search
                    ? `No prompt systems match "${search}". Try adjusting your keywords.`
                    : statusFilter === "Draft"
                      ? "You don't have any archived prompt systems right now."
                      : "Create your first Prompt System to begin orchestrating prompts, modules, and assistants."}
                </p>
                {!search && (
                  <Button onClick={onNew} size="sm" className="mt-5 rounded-xl font-semibold gap-1.5">
                    <Plus className="size-3.5" /> Create Prompt System
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* RECENTLY EDITED SECTION */}
      {systems.length > 0 && (
        <section className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold tracking-tight text-foreground">Recent Activity</h2>
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Workspace History
            </span>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-md shadow-sm">
            {systems.slice(0, 5).map((item) => (
              <div
                key={item.id}
                onClick={() => onOpen(item.id)}
                role="button"
                tabIndex={0}
                className="flex w-full cursor-pointer items-center gap-3.5 border-b border-border/50 px-4 py-3.5 text-left last:border-0 hover:bg-card/90 transition-colors group"
              >
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                  <FileCode2 className="size-4" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {item.name}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.description || "Core configuration system"}
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-2">
                  <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    v{item.version}.0
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {formatRelativeTime(item.updated_at)}
                  </span>
                </div>

                <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary transition-transform" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
