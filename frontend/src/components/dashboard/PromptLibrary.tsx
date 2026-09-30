import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  ChevronRight,
  FileCode2,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Play,
  Globe,
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
  onRun?: () => void;
}

export function SystemCard({ item, onOpen, onDelete, onArchive, onUnarchive, onRun }: SystemCardProps) {
  const varCount = Array.isArray(item.variables) ? item.variables.length : 0;
  const modCount = Array.isArray(item.modules) ? item.modules.length : 0;
  const tags = [
    varCount > 0 ? `${varCount} ${varCount === 1 ? "var" : "vars"}` : "Prompt System",
    modCount > 0 ? `${modCount} modules` : "Active",
  ];

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
          <FileCode2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{item.name}</h3>
            {item.visibility === "public_link" && (
              <span
                className="ml-auto inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-blue-400 border border-blue-500/20"
                title="Shared via public link"
              >
                <Globe className="size-2.5" /> Shared
              </span>
            )}
            <span
              className={`${item.visibility === "public_link" ? "" : "ml-auto "}rounded-md px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                !item.archived
                  ? "bg-success-soft text-success"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {!item.archived ? "Active" : "Archived"}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {item.description || "No description provided."}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {item.archived ? (
            onUnarchive && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground hover:text-primary opacity-70 hover:opacity-100"
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
                className="size-7 text-muted-foreground hover:text-foreground opacity-70 hover:opacity-100"
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
          {onRun && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-primary hover:text-primary hover:bg-primary-soft opacity-80 hover:opacity-100"
              title="Run Prompt System"
              onClick={(e) => {
                e.stopPropagation();
                onRun();
              }}
            >
              <Play className="size-3.5 fill-current" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive opacity-70 hover:opacity-100"
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
      <div className="mt-4 flex items-center border-t border-border/60 pt-3 font-mono text-[10px] text-muted-foreground">
        <span>v{item.version}.0</span>
        <span className="ml-auto">Edited {formatRelativeTime(item.updated_at)}</span>
        <ChevronRight className="ml-2 size-3.5 transition-transform group-hover:translate-x-0.5" />
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
  onRun,
}: PromptLibraryProps) {
  return (
    <div className="pf-fade mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase text-primary">Workspace / Library</p>
          <h1 className="mt-1 text-2xl font-semibold">Prompt Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Build and organize reusable Prompt Systems.
          </p>
        </div>
        <Button className="ml-auto hidden sm:inline-flex" onClick={onNew}>
          <Plus /> New Prompt System
        </Button>
      </div>

      <div className="relative mt-6 flex gap-2">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search Prompt Systems"
          className="h-10 bg-card/65 pl-9"
        />
        <Button
          variant={filterOpen ? "secondary" : "outline"}
          size="icon"
          className="h-10 w-10 shrink-0"
          onClick={() => setFilterOpen(!filterOpen)}
          aria-label="Filter Prompt Systems"
        >
          <Filter />
        </Button>
      </div>

      {filterOpen && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-card/55 p-3 ring-1 ring-border/60">
          <span className="text-xs font-medium">Status</span>
          <button
            onClick={() => setStatusFilter("All")}
            className={`cursor-pointer rounded-md px-2 py-0.5 text-[11px] ${
              statusFilter === "All" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter("Active")}
            className={`cursor-pointer rounded-md px-2 py-0.5 text-[11px] ${
              statusFilter === "Active" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setStatusFilter("Draft")}
            className={`cursor-pointer rounded-md px-2 py-0.5 text-[11px] ${
              statusFilter === "Draft" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground"
            }`}
          >
            Archived
          </button>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-1.5 size-3.5" /> Retry
          </Button>
        </div>
      )}

      <div className="mt-7 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Prompt Systems</h2>
        <span className="font-mono text-[10px] text-muted-foreground">
          {loading ? "LOADING..." : `${filtered.length} SYSTEMS`}
        </span>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="mt-4 flex h-48 flex-col items-center justify-center gap-3 rounded-lg bg-card/30 ring-1 ring-border/50">
          <Loader2 className="size-7 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">Loading Prompt Systems from workspace...</p>
        </div>
      ) : (
        <>
          <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <SystemCard
                key={item.id}
                item={item}
                onOpen={() => onOpen(item.id)}
                onDelete={() => onDelete(item)}
                onArchive={onArchive ? () => onArchive(item.id) : undefined}
                onUnarchive={onUnarchive ? () => onUnarchive(item.id) : undefined}
                onRun={onRun ? () => onRun(item) : undefined}
              />
            ))}
          </div>

          {filtered.length === 0 && !loading && (
            <div className="mt-3 rounded-lg bg-card/55 py-16 text-center ring-1 ring-border/60">
              <p className="text-sm text-muted-foreground">
                {search
                  ? `No Prompt Systems match “${search}”.`
                  : statusFilter === "Draft"
                    ? "No archived Prompt Systems found."
                    : statusFilter === "Active"
                      ? "No active Prompt Systems found."
                      : "No Prompt Systems found. Create your first Prompt System to get started."}
              </p>
              {!search && statusFilter !== "Draft" && (
                <Button size="sm" className="mt-4" onClick={onNew}>
                  <Plus className="mr-1.5 size-3.5" /> New Prompt System
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* Recently Edited Section */}
      {systems.length > 0 && (
        <section className="mt-9">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recently Edited</h2>
            <span className="font-mono text-[10px] text-muted-foreground">WORKSPACE ACTIVITY</span>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg bg-card/55 ring-1 ring-border/60">
            {systems.slice(0, 5).map((item) => (
              <button
                key={item.id}
                onClick={() => onOpen(item.id)}
                className="flex w-full cursor-pointer items-center gap-3 border-b border-border/60 px-4 py-3 text-left last:border-0 hover:bg-card/75"
              >
                <FileCode2 className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {item.name}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:block truncate max-w-xs">
                  {item.description || "Core configuration"}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {formatRelativeTime(item.updated_at)}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
