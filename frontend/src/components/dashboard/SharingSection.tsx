import { Check, Copy, ExternalLink, Globe, Link2, Loader2, Lock, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { sharingService, type SharingStatus } from "@/services";

interface SharingSectionProps {
  promptSystemId: number | null;
}

export function SharingSection({ promptSystemId }: SharingSectionProps) {
  const [status, setStatus] = useState<SharingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!promptSystemId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await sharingService.getStatus(promptSystemId);
      setStatus(data);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || "Failed to load sharing status.");
    } finally {
      setLoading(false);
    }
  }, [promptSystemId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleToggleVisibility = async (newVisibility: string) => {
    if (!promptSystemId || updating) return;
    setUpdating(true);
    setError(null);
    try {
      const data = await sharingService.updateVisibility(promptSystemId, newVisibility);
      setStatus(data);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || "Failed to update sharing settings.");
    } finally {
      setUpdating(false);
    }
  };

  const copyShareLink = async () => {
    if (!status?.share_url) return;
    const fullUrl = `${window.location.origin}/shared/${status.share_token}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = fullUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" />
        <span className="text-sm">Loading sharing settings...</span>
      </div>
    );
  }

  const isPublic = status?.visibility === "public_link";

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Sharing</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Control who can access this Prompt System.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={fetchStatus}
          disabled={loading}
        >
          <RefreshCw className="size-3" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/15 px-3 py-2 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-lg bg-card/55 p-5 ring-1 ring-border/60">
        <h3 className="text-sm font-semibold text-foreground">Visibility</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose who can view and use this Prompt System.
        </p>

        <div className="mt-4 space-y-3">
          {/* Private option */}
          <button
            onClick={() => handleToggleVisibility("private")}
            disabled={updating}
            className={`flex w-full cursor-pointer items-start gap-3 rounded-lg border p-4 text-left transition-all ${
              !isPublic
                ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                : "border-border/60 hover:border-border hover:bg-card/80"
            }`}
          >
            <div
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                !isPublic ? "border-primary bg-primary" : "border-muted-foreground/40"
              }`}
            >
              {!isPublic && (
                <div className="size-2 rounded-full bg-primary-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Private</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Only you can access this Prompt System.
              </p>
            </div>
          </button>

          {/* Public link option */}
          <button
            onClick={() => handleToggleVisibility("public_link")}
            disabled={updating}
            className={`flex w-full cursor-pointer items-start gap-3 rounded-lg border p-4 text-left transition-all ${
              isPublic
                ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                : "border-border/60 hover:border-border hover:bg-card/80"
            }`}
          >
            <div
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                isPublic ? "border-primary bg-primary" : "border-muted-foreground/40"
              }`}
            >
              {isPublic && (
                <div className="size-2 rounded-full bg-primary-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Globe className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Anyone with the link</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Anyone with the share link can view and use this Prompt System.
              </p>
            </div>
          </button>
        </div>

        {updating && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Updating sharing settings...
          </div>
        )}

        {/* Share link section */}
        {isPublic && status?.share_token && (
          <div className="mt-5 rounded-lg border border-border/60 bg-background/50 p-4">
            <div className="flex items-center gap-2">
              <Link2 className="size-4 text-primary" />
              <h4 className="text-sm font-medium text-foreground">Share Link</h4>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Share this link with anyone you want to give access to.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center rounded-md border border-border/60 bg-muted/50 px-3 py-2">
                <code className="truncate text-xs text-foreground">
                  {window.location.origin}/shared/{status.share_token}
                </code>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={copyShareLink}
              >
                {copied ? (
                  <>
                    <Check className="size-3.5 text-success" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" />
                    Copy Link
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => window.open(`${window.location.origin}/shared/${status.share_token}`, "_blank")}
                title="Open shared page in new tab"
              >
                <ExternalLink className="size-3.5" />
                Open
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
