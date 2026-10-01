import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  Check,
  Clock,
  Copy,
  FileText,
  History,
  Loader2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { historyService, type PromptRunHistoryItem } from "@/services";
import { formatDateTime, DeleteHistoryDialog } from "./PromptHistoryLibrary";

interface PromptHistoryDetailProps {
  historyId: number;
  onBack: () => void;
  onDeleted?: (id: number) => void;
}

export function PromptHistoryDetail({
  historyId,
  onBack,
  onDeleted,
}: PromptHistoryDetailProps) {
  const [item, setItem] = useState<PromptRunHistoryItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await historyService.getHistoryById(historyId);
      setItem(data);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || "Failed to load history record.");
    } finally {
      setLoading(false);
    }
  }, [historyId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleCopyPrompt = async () => {
    if (!item?.final_prompt) return;
    try {
      await navigator.clipboard.writeText(item.final_prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = item.final_prompt;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConfirmDelete = async () => {
    if (!item) return;
    setDeleting(true);
    try {
      await historyService.deleteHistory(item.id);
      setDeleteOpen(false);
      if (onDeleted) {
        onDeleted(item.id);
      } else {
        onBack();
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || "Failed to delete history record.");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm">Loading history details...</p>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <h2 className="mt-3 text-base font-semibold text-foreground">
            {error || "Prompt History record not found"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The requested prompt history record could not be loaded or was removed.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="mr-1.5 size-3.5" /> Back to History
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const runtimeVars = item.runtime_variables && typeof item.runtime_variables === "object"
    ? Object.entries(item.runtime_variables)
    : [];

  return (
    <div className="pf-fade mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back button & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/60 pb-5">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" />
          Back to History
        </Button>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={handleCopyPrompt}
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-success" />
                Prompt Copied
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                Copy Prompt
              </>
            )}
          </Button>

          <Button
            size="sm"
            variant="destructive"
            className="gap-1.5 text-xs"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Snapshot Header info */}
      <div className="mt-6 rounded-xl border border-border/60 bg-card/60 p-6 shadow-sm ring-1 ring-border/40">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase text-primary">Prompt Run Snapshot</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              {item.prompt_system_name}
            </h1>
            {item.module_name && (
              <div className="mt-2 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 font-mono text-xs text-secondary-foreground border border-border/60">
                  <Boxes className="size-3.5" />
                  Module: {item.module_name}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/40 px-3 py-1.5 font-mono text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            <span>{formatDateTime(item.created_at)}</span>
          </div>
        </div>

        {/* Runtime Variables (for reference only) */}
        {runtimeVars.length > 0 && (
          <div className="mt-6 border-t border-border/60 pt-5">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Runtime Variables
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {runtimeVars.map(([key, val]) => (
                <div
                  key={key}
                  className="rounded-lg border border-border/50 bg-background/60 p-2.5 font-mono text-xs"
                >
                  <span className="text-muted-foreground">{key}:</span>{" "}
                  <span className="font-semibold text-foreground">
                    {typeof val === "object" ? JSON.stringify(val) : String(val ?? "")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Final Prompt Section */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Final Prompt</h2>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleCopyPrompt}
          >
            {copied ? (
              <>
                <Check className="size-3 text-success" />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3" />
                Copy
              </>
            )}
          </Button>
        </div>

        <div className="relative mt-3">
          <pre className="min-h-[200px] max-h-[600px] overflow-auto rounded-xl border border-border/60 bg-muted/30 p-5 font-mono text-xs leading-relaxed text-foreground shadow-inner whitespace-pre-wrap select-text">
            {item.final_prompt}
          </pre>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteHistoryDialog
        open={deleteOpen}
        item={item}
        deleting={deleting}
        onOpenChange={setDeleteOpen}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
