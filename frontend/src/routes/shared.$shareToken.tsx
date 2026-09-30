import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  Check,
  Copy,
  FileText,
  Globe,
  Loader2,
  Play,
  Plus,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { isAuthenticated } from "@/lib/auth";
import {
  sharingService,
  type PublicSharedSystem,
  type PromptRunResponse,
} from "@/services";

export const Route = createFileRoute("/shared/$shareToken")({
  head: () => ({
    meta: [
      { title: "Shared Prompt System — PromptForge" },
      {
        name: "description",
        content: "View and use a shared Prompt System on PromptForge.",
      },
      { property: "og:title", content: "Shared Prompt System — PromptForge" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: SharedPage,
});

function SharedPage() {
  const { shareToken } = Route.useParams();
  const [system, setSystem] = useState<PublicSharedSystem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Run state
  const [runOpen, setRunOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<PromptRunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runVars, setRunVars] = useState<Record<string, string>>({});

  // Copy state
  const [copying, setCopying] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  // Clipboard copy state
  const [promptCopied, setPromptCopied] = useState(false);

  useEffect(() => {
    async function fetchSystem() {
      setLoading(true);
      setError(null);
      try {
        const data = await sharingService.getPublicSystem(shareToken);
        setSystem(data);
      } catch (err: unknown) {
        const apiErr = err as { message?: string };
        setError(apiErr.message || "Shared Prompt System not found.");
      } finally {
        setLoading(false);
      }
    }
    fetchSystem();
  }, [shareToken]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    try {
      const result = await sharingService.runSharedSystem(shareToken, {
        variables: runVars,
      });
      setRunResult(result);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setRunError(apiErr.message || "Failed to run Prompt System.");
    } finally {
      setRunning(false);
    }
  }, [shareToken, runVars]);

  const handleCopy = useCallback(async () => {
    if (!isAuthenticated()) {
      setCopyError("Please log in to create a copy of this Prompt System.");
      return;
    }
    setCopying(true);
    setCopyError(null);
    try {
      await sharingService.copySystem(shareToken);
      setCopySuccess(true);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setCopyError(apiErr.message || "Failed to copy Prompt System.");
    } finally {
      setCopying(false);
    }
  }, [shareToken]);

  const copyResolvedPrompt = async () => {
    if (!runResult) return;
    try {
      await navigator.clipboard.writeText(runResult.resolved_prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  // Extract variables from the system for the run form
  const systemVariables: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
    default?: unknown;
    description?: string;
  }> = [];
  if (system?.variables && Array.isArray(system.variables)) {
    for (const v of system.variables) {
      if (typeof v === "object" && v !== null && "name" in v) {
        const item = v as Record<string, unknown>;
        systemVariables.push({
          name: String(item.name || ""),
          label: String(item.label || item.name || ""),
          type: String(item.type || "text"),
          required: item.required !== false,
          default: item.default,
          description: item.description ? String(item.description) : undefined,
        });
      }
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="fixed inset-0 bg-workspace" aria-hidden="true" />
        <div className="relative z-10 flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm">Loading shared Prompt System...</p>
        </div>
      </div>
    );
  }

  if (error || !system) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="fixed inset-0 bg-workspace" aria-hidden="true" />
        <div className="relative z-10 mx-auto max-w-md text-center">
          <div className="rounded-lg border border-destructive/40 bg-card/80 p-8 shadow-lg backdrop-blur-sm ring-1 ring-border/60">
            <AlertCircle className="mx-auto size-10 text-destructive" />
            <h1 className="mt-4 text-xl font-semibold text-foreground">
              Not Found
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {error || "This shared Prompt System could not be found or is no longer available."}
            </p>
            <a
              href="/"
              className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ArrowLeft className="mr-1.5 size-3.5" />
              Go Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 bg-workspace" aria-hidden="true" />

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/60 bg-surface-glass backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <a href="/" className="flex items-center gap-2 text-primary transition hover:opacity-80">
            <Sparkles className="size-5" />
            <span className="text-sm font-semibold">PromptForge</span>
          </a>
          <span className="text-xs text-muted-foreground">/</span>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="size-3.5" />
            <span>Shared</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isAuthenticated() ? (
              <a
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-md border border-border/60 bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                Dashboard
              </a>
            ) : (
              <a
                href="/login"
                className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Sign In
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="pf-fade">
          {/* System header */}
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase text-primary">
                  Shared
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">
                {system.name}
              </h1>
              {system.description && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {system.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setRunOpen(!runOpen);
                  setRunResult(null);
                  setRunError(null);
                }}
              >
                <Play className="size-3.5 fill-current" />
                Use Prompt System
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleCopy}
                disabled={copying}
              >
                {copying ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Copying...
                  </>
                ) : copySuccess ? (
                  <>
                    <Check className="size-3.5 text-success" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Plus className="size-3.5" />
                    Create a Copy
                  </>
                )}
              </Button>
            </div>
          </div>

          {copyError && (
            <div className="mt-3 rounded-md bg-destructive/15 px-3 py-2 text-xs font-medium text-destructive">
              {copyError}
            </div>
          )}
          {copySuccess && (
            <div className="mt-3 rounded-md bg-success-soft px-3 py-2 text-xs font-medium text-success">
              ✓ A private copy has been added to your Prompt Systems library.{" "}
              <a href="/dashboard" className="underline hover:opacity-80">
                Go to Dashboard
              </a>
            </div>
          )}

          {/* Modules section */}
          {system.attached_modules && system.attached_modules.length > 0 && (
            <div className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <Boxes className="size-4 text-primary" />
                <h2 className="text-sm font-semibold">Modules</h2>
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                  {system.attached_modules.length}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {system.attached_modules.map((mod) => (
                  <div
                    key={mod.id}
                    className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60 transition-colors hover:bg-card/70"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-primary/70" />
                      <h3 className="text-sm font-medium text-foreground">{mod.name}</h3>
                    </div>
                    {mod.description && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                        {mod.description}
                      </p>
                    )}
                    {mod.variables && Array.isArray(mod.variables) && mod.variables.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {mod.variables.slice(0, 4).map((v: unknown) => {
                          const varItem = v as { name?: string };
                          return varItem?.name ? (
                            <span
                              key={varItem.name}
                              className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                            >
                              {`{${varItem.name}}`}
                            </span>
                          ) : null;
                        })}
                        {mod.variables.length > 4 && (
                          <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            +{mod.variables.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Run section */}
          {runOpen && (
            <div className="mt-8 rounded-lg border border-primary/30 bg-card/55 p-6 ring-1 ring-border/60">
              <h2 className="text-sm font-semibold text-foreground">Run Prompt System</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter runtime variables and execute the prompt.
              </p>

              {systemVariables.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {systemVariables.map((v) => (
                    <div key={v.name}>
                      <label className="mb-1 block text-xs font-medium text-foreground">
                        {v.label}
                        {v.required && <span className="ml-0.5 text-destructive">*</span>}
                      </label>
                      {v.description && (
                        <p className="mb-1 text-[10px] text-muted-foreground">{v.description}</p>
                      )}
                      {v.type === "multiline" ? (
                        <textarea
                          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                          rows={3}
                          placeholder={v.default ? String(v.default) : `Enter ${v.label}...`}
                          value={runVars[v.name] || ""}
                          onChange={(e) =>
                            setRunVars((prev) => ({ ...prev, [v.name]: e.target.value }))
                          }
                        />
                      ) : (
                        <input
                          type={v.type === "number" || v.type === "integer" ? "number" : "text"}
                          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
                          placeholder={v.default ? String(v.default) : `Enter ${v.label}...`}
                          value={runVars[v.name] || ""}
                          onChange={(e) =>
                            setRunVars((prev) => ({ ...prev, [v.name]: e.target.value }))
                          }
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground italic">
                  No runtime variables required.
                </p>
              )}

              <div className="mt-4 flex items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={handleRun}
                  disabled={running}
                >
                  {running ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5 fill-current" />
                      Run
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRunOpen(false);
                    setRunResult(null);
                    setRunError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>

              {runError && (
                <div className="mt-3 rounded-md bg-destructive/15 px-3 py-2 text-xs font-medium text-destructive">
                  {runError}
                </div>
              )}

              {runResult && (
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-foreground">Resolved Prompt</h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[10px]"
                      onClick={copyResolvedPrompt}
                    >
                      {promptCopied ? (
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
                  <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-preview p-4 text-xs leading-relaxed text-preview-foreground">
                    {runResult.resolved_prompt}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* System info */}
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {/* Instructions */}
            {system.instructions && (
              <div className="rounded-lg bg-card/55 p-5 ring-1 ring-border/60">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Instructions
                </h2>
                <pre className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {system.instructions}
                </pre>
              </div>
            )}

            {/* Variables */}
            {systemVariables.length > 0 && (
              <div className="rounded-lg bg-card/55 p-5 ring-1 ring-border/60">
                <h2 className="mb-3 text-sm font-semibold text-foreground">
                  Variables
                </h2>
                <div className="space-y-2">
                  {systemVariables.map((v) => (
                    <div
                      key={v.name}
                      className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2"
                    >
                      <code className="font-mono text-xs text-primary">{`{${v.name}}`}</code>
                      <span className="text-xs text-muted-foreground">
                        {v.type}
                        {v.required ? " · required" : " · optional"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
