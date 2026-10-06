import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  MessageSquare,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isAuthenticated } from "@/lib/auth";
import {
  conversationsService,
  type PublicSharedChat,
} from "@/services";

export const Route = createFileRoute("/shared/chat/$shareToken")({
  head: () => ({
    meta: [
      { title: "Shared Chat — PromptForge" },
      {
        name: "description",
        content: "View a shared conversation transcript on PromptForge.",
      },
      { property: "og:title", content: "Shared Chat — PromptForge" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: SharedChatPage,
});

function SharedChatPage() {
  const { shareToken } = Route.useParams();
  const navigate = useNavigate();
  const [chat, setChat] = useState<PublicSharedChat | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Copy assistant state
  const [copying, setCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const fetchChat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await conversationsService.getPublicSharedChat(shareToken);
      setChat(data);
    } catch (err: any) {
      setError(err.message || "Shared chat not found or access has been revoked.");
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  useEffect(() => {
    fetchChat();
  }, [fetchChat]);

  const handleCopyAssistant = async () => {
    if (!isAuthenticated()) {
      navigate({ to: "/login" });
      return;
    }
    setCopying(true);
    setCopyError(null);
    try {
      await conversationsService.copyAssistantFromSharedChat(shareToken);
      setCopySuccess(true);
      setTimeout(() => {
        navigate({ to: "/dashboard" });
      }, 1500);
    } catch (err: any) {
      setCopyError(err.message || "Failed to copy Assistant.");
    } finally {
      setCopying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">Loading shared conversation...</p>
      </div>
    );
  }

  if (error || !chat) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background text-foreground">
        <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive mb-4">
            <Lock className="size-6" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Chat Unavailable</h2>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            {error || "This shared chat link is invalid or has been revoked by the owner."}
          </p>
          <Button
            className="mt-6 w-full"
            variant="outline"
            onClick={() => navigate({ to: "/" })}
          >
            <ArrowLeft className="mr-2 size-4" /> Go to PromptForge Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-card/80 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <MessageSquare className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold truncate text-foreground">
                {chat.title || "Shared Chat"}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-blue-500 border border-blue-500/20 shrink-0">
                <Globe className="size-3" /> Shared Chat
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {chat.assistant_name ? `Assistant: ${chat.assistant_name} • ` : ""}
              Created on {new Date(chat.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {chat.prompt_system_id && (
            <Button
              size="sm"
              onClick={handleCopyAssistant}
              disabled={copying || copySuccess}
              className="gap-1.5 rounded-xl shadow-xs"
            >
              {copying ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : copySuccess ? (
                <Check className="size-3.5 text-emerald-300" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              <span>{copySuccess ? "Copied to Workspace!" : "Use / Copy Assistant"}</span>
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="rounded-xl hidden sm:inline-flex"
            onClick={() => navigate({ to: isAuthenticated() ? "/dashboard" : "/login" })}
          >
            <ExternalLink className="mr-1.5 size-3.5" />
            {isAuthenticated() ? "Dashboard" : "Log In"}
          </Button>
        </div>
      </header>

      {/* Copy notification banner */}
      {copyError && (
        <div className="bg-destructive/15 px-4 py-2 text-center text-xs text-destructive border-b border-destructive/30">
          {copyError}
        </div>
      )}

      {/* Messages Transcript */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-6">
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-center text-xs text-muted-foreground">
          This is a read-only transcript of a shared conversation. Private documents, runtime variables, and other chats are not shared.
        </div>

        {chat.messages.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <MessageSquare className="size-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No messages in this chat.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {chat.messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 ring-1 ring-primary/20">
                      <Bot className="size-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-xs ${
                      isUser
                        ? "bg-primary text-primary-foreground rounded-tr-xs"
                        : "bg-card border border-border/80 text-foreground rounded-tl-xs"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <p
                      className={`mt-2 text-[10px] ${
                        isUser ? "text-primary-foreground/70" : "text-muted-foreground"
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  {isUser && (
                    <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border/60 text-muted-foreground">
                      <UserIcon className="size-4" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
        Powered by PromptForge • Modular prompt development & testing platform
      </footer>
    </div>
  );
}
