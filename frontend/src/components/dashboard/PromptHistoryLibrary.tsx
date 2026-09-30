import {
  AlertCircle,
  Boxes,
  ChevronRight,
  Clock,
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PromptRunHistoryItem } from "@/services";

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return "Recently";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Recently";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "Recently";
  }
}

interface DeleteHistoryDialogProps {
  open: boolean;
  item: PromptRunHistoryItem | null;
  deleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteHistoryDialog({
  open,
  item,
  deleting,
  onOpenChange,
  onConfirm,
}: DeleteHistoryDialogProps) {
  if (!open || !item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-md rounded-lg border border-border/80 bg-card p-6 shadow-xl ring-1 ring-border/60">
        <h3 className="text-base font-semibold text-foreground">Delete this history item?</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Are you sure you want to delete this prompt history record for{" "}
          <span className="font-semibold text-foreground">{item.prompt_system_name}</span>?
          This action only deletes the saved snapshot and will not modify or delete the Prompt System.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={deleting}
            className="gap-1.5"
          >
            {deleting && <Loader2 className="size-3.5 animate-spin" />}
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

interface PromptHistoryLibraryProps {
  historyItems: PromptRunHistoryItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenDetail: (id: number) => void;
  onDelete: (id: number) => void;
}

export function PromptHistoryLibrary({
  historyItems,
  loading,
  error,
  onRefresh,
  onOpenDetail,
  onDelete,
}: PromptHistoryLibraryProps) {
  const [search, setSearch] = useState("");
  const [itemToDelete, setItemToDelete] = useState<PromptRunHistoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return historyItems;
    const query = search.toLowerCase();
    return historyItems.filter(
      (item) =>
        item.prompt_system_name.toLowerCase().includes(query) ||
        (item.module_name && item.module_name.toLowerCase().includes(query)) ||
        item.final_prompt.toLowerCase().includes(query)
    );
  }, [historyItems, search]);

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setDeleting(true);
    try {
      await onDelete(itemToDelete.id);
      setItemToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="pf-fade mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight text-foreground">History</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Your previously generated prompts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      {historyItems.length > 0 && (
        <div className="mt-6 flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search history by system, module, or prompt text..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 text-xs"
            />
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {filtered.length} of {historyItems.length} {historyItems.length === 1 ? "run" : "runs"}
          </span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm">Loading prompt history...</p>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-center">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <h2 className="mt-3 text-base font-semibold text-foreground">{error}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Failed to retrieve prompt history. Please check your connection and try again.
          </p>
          <Button size="sm" onClick={onRefresh} className="mt-4">
            <RefreshCw className="mr-1.5 size-3.5" /> Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && historyItems.length === 0 && (
        <div className="mt-12 rounded-xl border border-dashed border-border/80 bg-card/40 p-12 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <History className="size-6" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-foreground">No prompt history yet.</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Run a prompt to see your generated prompts here.
          </p>
        </div>
      )}

      {/* No search matches */}
      {!loading && !error && historyItems.length > 0 && filtered.length === 0 && (
        <div className="mt-12 p-8 text-center text-muted-foreground">
          <p className="text-sm">No history records match "{search}".</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSearch("")}
            className="mt-2 text-xs text-primary"
          >
            Clear Search
          </Button>
        </div>
      )}

      {/* History cards list */}
      {!loading && !error && filtered.length > 0 && (
        <div className="mt-6 space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => onOpenDetail(item.id)}
              className="group cursor-pointer rounded-lg border border-border/60 bg-card/50 p-4 transition-all hover:border-border hover:bg-card/80 hover:shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {item.prompt_system_name}
                    </h3>
                    {item.module_name && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-secondary/80 px-2 py-0.5 font-mono text-[10px] text-secondary-foreground border border-border/40">
                        <Boxes className="size-3" />
                        {item.module_name}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                    <Clock className="size-3" />
                    <span>{formatDateTime(item.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => onOpenDetail(item.id)}
                  >
                    View Prompt
                    <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive opacity-70 hover:opacity-100"
                    title="Delete history item"
                    onClick={() => setItemToDelete(item)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Truncated final prompt preview */}
              <div className="mt-3 rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed text-muted-foreground/90 line-clamp-3 border border-border/40 whitespace-pre-wrap select-none">
                {item.final_prompt}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Delete Dialog */}
      <DeleteHistoryDialog
        open={itemToDelete !== null}
        item={itemToDelete}
        deleting={deleting}
        onOpenChange={(open) => {
          if (!open && !deleting) setItemToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
