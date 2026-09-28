import {
  AlertCircle,
  Boxes,
  Braces,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  Edit2,
  FileText,
  Layers,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  previewService,
  type StructuredModule,
  type StructuredPrompt,
  type VariableDefinition,
} from "@/services";

/**
 * Compact preview widget displayed in the Prompt Editor sidebar.
 */
export function PromptPreview({
  compact = false,
  instructions,
  variables,
  modules,
  outputFormat,
}: {
  compact?: boolean;
  instructions?: string;
  variables?: VariableDefinition[];
  modules?: unknown[];
  outputFormat?: unknown;
}) {
  return (
    <div
      className={`rounded-lg bg-preview p-4 font-mono text-xs leading-relaxed text-preview-foreground ${
        compact ? "text-[11px]" : ""
      }`}
    >
      <p className="text-preview-muted"># Core Instructions</p>
      <p className="mt-1 whitespace-pre-wrap">
        {instructions || "Write precise, structured technical content."}
      </p>

      <p className="mt-4 text-preview-muted"># Variables</p>
      <p className="mt-1">
        {variables && variables.length > 0
          ? variables.map((v) => `${v.name}${v.required ? " (required)" : ""}`).join("\n")
          : "None defined"}
      </p>

      <p className="mt-4 text-preview-muted"># Prompt Modules</p>
      <p className="mt-1">
        {modules && modules.length > 0
          ? modules
              .map((m) =>
                typeof m === "string"
                  ? m
                  : (m as { name?: string })?.name || JSON.stringify(m)
              )
              .join("\n")
          : "Standard composition"}
      </p>

      <p className="mt-4 text-preview-muted"># Output Requirements</p>
      <p className="mt-1 whitespace-pre-wrap">
        {typeof outputFormat === "string"
          ? outputFormat
          : outputFormat && typeof outputFormat === "object" && Object.keys(outputFormat).length > 0
            ? JSON.stringify(outputFormat, null, 2)
            : "Markdown · Clean headings · Runnable examples"}
      </p>
    </div>
  );
}

interface PromptPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promptSystemId?: number | null;
  instructions?: string;
  variables?: VariableDefinition[];
  modules?: unknown[];
  outputFormat?: unknown;
  copied?: boolean;
  onCopy?: () => void;
}

/**
 * Dedicated Prompt Preview Dialog (Branch 14)
 * Provides:
 * 1. Raw prompt view
 * 2. Structured prompt view
 * 3. Copy button (copies raw or temporarily edited prompt)
 * 4. Edit before Run (in-memory preview edit without mutating permanent PromptSystem)
 */
export function PromptPreviewDialog({
  open,
  onOpenChange,
  promptSystemId,
  instructions,
  variables,
  modules,
  outputFormat,
}: PromptPreviewDialogProps) {
  const [activeTab, setActiveTab] = useState<"raw" | "structured">("raw");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Raw preview text & in-memory draft for editing
  const [rawPrompt, setRawPrompt] = useState<string>("");
  const [draftPrompt, setDraftPrompt] = useState<string>("");
  const [isEditing, setIsEditing] = useState(false);
  const [structuredData, setStructuredData] = useState<StructuredPrompt | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchPreview = useCallback(async () => {
    if (!promptSystemId) {
      // Fallback display if not persisted yet
      const fallbackRaw = instructions || "No instructions provided.";
      setRawPrompt(fallbackRaw);
      setDraftPrompt(fallbackRaw);
      setStructuredData({
        instructions: instructions || null,
        variables: variables || [],
        examples: [],
        modules: (modules || []) as StructuredModule[],
        output_requirements: outputFormat,
      });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await previewService.getPreview(promptSystemId);
      setRawPrompt(res.raw_prompt);
      setDraftPrompt(res.raw_prompt);
      setStructuredData(res.structured_prompt);
      setIsEditing(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to generate prompt preview.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [promptSystemId, instructions, variables, modules, outputFormat]);

  // Load preview whenever dialog opens
  useEffect(() => {
    if (open) {
      setActiveTab("raw");
      setIsEditing(false);
      fetchPreview();
    }
  }, [open, fetchPreview]);

  const handleCopy = () => {
    const textToCopy = isEditing ? draftPrompt : rawPrompt;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartEdit = () => {
    setDraftPrompt(rawPrompt);
    setIsEditing(true);
    setActiveTab("raw");
  };

  const handleSavePreview = () => {
    // Only updates local preview state; does NOT update the backend database
    setRawPrompt(draftPrompt);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setDraftPrompt(rawPrompt);
    setIsEditing(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[88vh] max-h-[92vh] w-[95vw] sm:max-w-5xl md:max-w-6xl flex flex-col p-6 gap-0 border-border bg-popover">
        <DialogHeader className="shrink-0 pb-3 border-b border-border/50">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> Prompt Preview
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Inspect the final assembled prompt before execution.
              </DialogDescription>
            </div>

            {/* Raw / Structured View Toggle */}
            <div className="inline-flex rounded-lg bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  if (!isEditing) setActiveTab("raw");
                }}
                disabled={isEditing}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition ${
                  activeTab === "raw"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                } ${isEditing ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <Code2 className="size-3.5" /> Raw
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!isEditing) setActiveTab("structured");
                }}
                disabled={isEditing}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition ${
                  activeTab === "structured"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                } ${isEditing ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <Layers className="size-3.5" /> Structured
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-3 min-h-0 flex flex-col">
          {loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="size-7 animate-spin text-primary" />
              <p className="text-sm font-medium">Generating preview...</p>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-center my-4">
              <AlertCircle className="mx-auto size-7 text-destructive" />
              <p className="mt-2 text-sm font-semibold text-foreground">
                Unable to generate prompt preview
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              <Button size="sm" variant="outline" className="mt-4" onClick={fetchPreview}>
                <RefreshCw className="mr-1.5 size-3.5" /> Retry
              </Button>
            </div>
          ) : activeTab === "raw" ? (
            <div className="flex-1 flex flex-col min-h-0 space-y-3">
              {/* Edit Mode Notice */}
              {isEditing ? (
                <div className="flex items-center justify-between rounded-md bg-primary-soft/40 px-3 py-2 text-xs text-primary border border-primary/20 shrink-0">
                  <div className="flex items-center gap-2">
                    <Edit2 className="size-3.5 shrink-0" />
                    <span>Editing preview prompt. Changes are temporary and do NOT update the permanent Prompt System.</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleCancelEdit}>
                      <X className="mr-1 size-3" /> Cancel
                    </Button>
                    <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSavePreview}>
                      <Check className="mr-1 size-3" /> Save Preview
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-muted-foreground px-1 shrink-0">
                  <span>Final assembled prompt ({rawPrompt.length} characters)</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={handleStartEdit}
                    >
                      <Edit2 className="size-3.5" /> Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={handleCopy}
                    >
                      {copied ? (
                        <>
                          <Check className="size-3.5 text-success" /> Copied
                        </>
                      ) : (
                        <>
                          <Clipboard className="size-3.5" /> Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Text / Textarea Container */}
              {isEditing ? (
                <div className="flex-1 flex flex-col min-h-0">
                  <Textarea
                    value={draftPrompt}
                    onChange={(e) => setDraftPrompt(e.target.value)}
                    className="flex-1 w-full min-h-[460px] font-mono text-sm leading-relaxed p-4 bg-preview text-preview-foreground border-border/80 resize-y rounded-lg shadow-inner focus-visible:ring-primary/40"
                    placeholder="Edit final prompt text..."
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground shrink-0">
                    <span>
                      {draftPrompt.length} characters · {draftPrompt.split("\n").length} lines
                    </span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                        <X className="mr-1.5 size-3.5" /> Cancel
                      </Button>
                      <Button size="sm" onClick={handleSavePreview}>
                        <Check className="mr-1.5 size-3.5" /> Save Preview
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-[460px] rounded-lg bg-preview p-4 font-mono text-sm leading-relaxed text-preview-foreground overflow-y-auto select-text border border-border/50">
                  <pre className="whitespace-pre-wrap font-mono text-sm">{rawPrompt}</pre>
                </div>
              )}
            </div>
          ) : (
            /* Structured View */
            <div className="space-y-4">
              {/* Core Instructions */}
              <div className="rounded-lg bg-card/60 p-4 ring-1 ring-border/60">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <FileText className="size-3.5" />
                  <span>SYSTEM INSTRUCTIONS</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed whitespace-pre-wrap text-foreground">
                  {structuredData?.instructions || (
                    <span className="text-muted-foreground italic">None configured</span>
                  )}
                </p>
              </div>

              {/* Variables */}
              <div className="rounded-lg bg-card/60 p-4 ring-1 ring-border/60">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Braces className="size-3.5" />
                  <span>VARIABLES / CONTEXT</span>
                </div>
                {Array.isArray(structuredData?.variables) && structuredData.variables.length > 0 ? (
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                    {structuredData.variables.map((v: any, idx: number) => {
                      const name = typeof v === "string" ? v : v.name;
                      const label = typeof v === "object" ? v.label || name : name;
                      const type = typeof v === "object" ? v.type || "text" : "text";
                      const required = typeof v === "object" ? v.required : false;
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-xs font-mono"
                        >
                          <span className="text-foreground">{label}: <code className="text-primary">{`{${name}}`}</code></span>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{type}</span>
                            {required && <span className="rounded bg-primary-soft text-primary px-1.5 py-0.5">req</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground italic">No variables configured</p>
                )}
              </div>

              {/* Examples */}
              {Array.isArray(structuredData?.examples) && structuredData.examples.length > 0 && (
                <div className="rounded-lg bg-card/60 p-4 ring-1 ring-border/60">
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <Sparkles className="size-3.5" />
                    <span>EXAMPLES ({structuredData.examples.length})</span>
                  </div>
                  <div className="mt-2.5 space-y-2.5">
                    {structuredData.examples.map((ex: any, idx: number) => {
                      const title = ex.title || `Example ${idx + 1}`;
                      const inp = ex.input || ex.input_context || ex.prompt;
                      const exp = ex.expected || ex.output || ex.response;
                      return (
                        <div key={idx} className="rounded-md bg-muted/40 p-3 text-xs space-y-1.5 border border-border/40">
                          <p className="font-semibold text-foreground">{title}</p>
                          {inp && (
                            <div>
                              <span className="text-[11px] font-semibold text-muted-foreground uppercase">Input:</span>
                              <p className="mt-0.5 whitespace-pre-wrap font-mono text-[11px]">{String(inp)}</p>
                            </div>
                          )}
                          {exp && (
                            <div>
                              <span className="text-[11px] font-semibold text-muted-foreground uppercase">Expected:</span>
                              <p className="mt-0.5 whitespace-pre-wrap font-mono text-[11px]">{String(exp)}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Modules */}
              <div className="rounded-lg bg-card/60 p-4 ring-1 ring-border/60">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Boxes className="size-3.5" />
                  <span>ENABLED MODULES ({structuredData?.modules?.length || 0})</span>
                </div>
                {Array.isArray(structuredData?.modules) && structuredData.modules.length > 0 ? (
                  <div className="mt-2.5 space-y-3">
                    {structuredData.modules.map((m, idx) => (
                      <div
                        key={idx}
                        className="rounded-md bg-muted/30 p-3.5 text-xs space-y-2 border border-border/50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">{m.name}</span>
                          <span className="rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-mono text-success">
                            enabled
                          </span>
                        </div>

                        {m.description && (
                          <p className="text-muted-foreground text-xs">{m.description}</p>
                        )}

                        {m.instructions && (
                          <div>
                            <span className="font-medium text-muted-foreground text-[11px] uppercase block">
                              Instructions:
                            </span>
                            <p className="mt-0.5 whitespace-pre-wrap font-mono text-[11px]">{m.instructions}</p>
                          </div>
                        )}

                        {m.input_context && (
                          <div>
                            <span className="font-medium text-muted-foreground text-[11px] uppercase block">
                              Input Context:
                            </span>
                            <p className="mt-0.5 font-mono text-[11px]">
                              {typeof m.input_context === "object"
                                ? JSON.stringify(m.input_context, null, 2)
                                : String(m.input_context)}
                            </p>
                          </div>
                        )}

                        {m.output_contract && (
                          <div>
                            <span className="font-medium text-muted-foreground text-[11px] uppercase block">
                              Output Contract:
                            </span>
                            <p className="mt-0.5 font-mono text-[11px]">
                              {typeof m.output_contract === "object"
                                ? JSON.stringify(m.output_contract, null, 2)
                                : String(m.output_contract)}
                            </p>
                          </div>
                        )}

                        {m.output_mapping && (
                          <div>
                            <span className="font-medium text-muted-foreground text-[11px] uppercase block">
                              Output Mapping:
                            </span>
                            <p className="mt-0.5 font-mono text-[11px]">
                              {JSON.stringify(m.output_mapping)}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground italic">No modules attached or enabled</p>
                )}
              </div>

              {/* Output Requirements */}
              <div className="rounded-lg bg-card/60 p-4 ring-1 ring-border/60">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <CheckCircle2 className="size-3.5" />
                  <span>OUTPUT REQUIREMENTS</span>
                </div>
                <div className="mt-2 text-xs font-mono">
                  {typeof structuredData?.output_requirements === "string" ? (
                    <p className="whitespace-pre-wrap">{structuredData.output_requirements}</p>
                  ) : Array.isArray(structuredData?.output_requirements) && structuredData.output_requirements.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      {structuredData.output_requirements.map((item: any, i: number) => (
                        <li key={i}>{String(item)}</li>
                      ))}
                    </ul>
                  ) : structuredData?.output_requirements &&
                    typeof structuredData.output_requirements === "object" &&
                    Object.keys(structuredData.output_requirements).length > 0 ? (
                    <pre className="whitespace-pre-wrap">{JSON.stringify(structuredData.output_requirements, null, 2)}</pre>
                  ) : (
                    <span className="text-muted-foreground italic">None configured</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="shrink-0 pt-2 border-t border-border/50 flex flex-row items-center justify-between sm:justify-between">
          <div className="flex items-center gap-2">
            {!isEditing && activeTab === "raw" && (
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check className="mr-1.5 size-3.5 text-success" /> Copied
                  </>
                ) : (
                  <>
                    <Clipboard className="mr-1.5 size-3.5" /> Copy Prompt
                  </>
                )}
              </Button>
            )}
            {isEditing && (
              <>
                <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                  <X className="mr-1.5 size-3.5" /> Cancel
                </Button>
                <Button size="sm" onClick={handleSavePreview}>
                  <Check className="mr-1.5 size-3.5" /> Save Preview
                </Button>
              </>
            )}
          </div>
          <Button
            variant={isEditing ? "ghost" : "default"}
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close Preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
