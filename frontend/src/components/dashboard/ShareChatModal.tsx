import { useEffect, useState, useCallback } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  MessageSquare,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { conversationsService, type SharingStatus } from "@/services";

interface ShareChatModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: number | null;
  chatTitle?: string | null;
}

export function ShareChatModal({
  open,
  onOpenChange,
  conversationId,
  chatTitle,
}: ShareChatModalProps) {
  const [status, setStatus] = useState<SharingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await conversationsService.getSharingStatus(conversationId);
      setStatus(data);
    } catch (err: any) {
      setError(err.message || "Failed to load sharing settings.");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (open && conversationId) {
      fetchStatus();
    }
  }, [open, conversationId, fetchStatus]);

  const handleUpdateVisibility = async (visibility: string) => {
    if (!conversationId || updating) return;
    setUpdating(true);
    setError(null);
    try {
      const res = await conversationsService.updateSharingStatus(conversationId, visibility);
      setStatus(res);
    } catch (err: any) {
      setError(err.message || "Failed to update sharing settings.");
    } finally {
      setUpdating(false);
    }
  };

  const copyShareLink = async () => {
    if (!status?.share_token) return;
    const fullUrl = `${window.location.origin}/shared/chat/${status.share_token}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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

  const isPublic = status?.visibility === "public_link";
  const fullShareUrl = status?.share_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/shared/chat/${status.share_token}`
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-5 text-primary" />
            Share Chat
          </DialogTitle>
          <DialogDescription>
            {chatTitle ? `Share "${chatTitle}"` : "Share this conversation via a read-only secure link."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin text-primary" />
            <span className="text-xs">Loading sharing settings...</span>
          </div>
        ) : (
          <div className="space-y-4 py-2 text-xs">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/15 text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Access Mode Toggle */}
            <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">Access</p>
                  <p className="text-[11px] text-muted-foreground">
                    {isPublic ? "Anyone with the link can view this chat transcript" : "Only you can access this chat"}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold ${
                    isPublic
                      ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                      : "bg-muted text-muted-foreground border border-border/50"
                  }`}
                >
                  {isPublic ? <Globe className="size-3" /> : <Lock className="size-3" />}
                  {isPublic ? "Shared" : "Private"}
                </span>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant={!isPublic ? "default" : "outline"}
                  className="flex-1 h-8 text-xs font-semibold gap-1.5"
                  onClick={() => handleUpdateVisibility("private")}
                  disabled={updating || !isPublic}
                >
                  <Lock className="size-3.5" />
                  Private
                </Button>
                <Button
                  size="sm"
                  variant={isPublic ? "default" : "outline"}
                  className="flex-1 h-8 text-xs font-semibold gap-1.5"
                  onClick={() => handleUpdateVisibility("public_link")}
                  disabled={updating || isPublic}
                >
                  <Globe className="size-3.5" />
                  Public Link
                </Button>
              </div>
            </div>

            {/* Share Link Details */}
            {isPublic && (
              <div className="space-y-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5">
                <p className="font-semibold text-foreground">Share Link</p>
                <div className="flex items-center gap-1.5">
                  <input
                    readOnly
                    value={fullShareUrl}
                    className="flex-1 rounded-md border border-border/80 bg-background px-2.5 py-1.5 font-mono text-[11px] text-foreground select-all focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1 px-3 text-xs shrink-0"
                    onClick={copyShareLink}
                  >
                    {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <a
                    href={fullShareUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <ExternalLink className="size-3" />
                    Open Shared Chat
                  </a>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleUpdateVisibility("private")}
                    disabled={updating}
                  >
                    <XCircle className="size-3 mr-1" />
                    Revoke Share
                  </Button>
                </div>
              </div>
            )}

            {/* Privacy notice */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 text-[11px] text-muted-foreground border border-border/40">
              <ShieldCheck className="size-4 shrink-0 text-emerald-500 mt-0.5" />
              <span>
                <strong>Privacy Protected:</strong> Sharing this chat only exposes the transcript of this single chat.
                Your other chats, documents, API keys, and assistant configuration remain completely private.
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
