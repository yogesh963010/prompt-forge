/**
 * PromptForge Run Modal
 * Implements Branch 17: Prompt Run 3-step workflow:
 * Step 1: Variables (Collect & validate runtime values)
 * Step 2: Preview (Inspect fully resolved prompt compiled by existing Composer)
 * Step 3: Destination (ChatGPT, Claude, Other Provider, Copy Prompt)
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { runService, type VariableDefinition } from "@/services";

interface PromptRunModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promptSystemId: number | null;
  promptSystemName?: string;
  variables?: VariableDefinition[] | unknown;
}

export function PromptRunModal({
  open,
  onOpenChange,
  promptSystemId,
  promptSystemName,
  variables,
}: PromptRunModalProps) {
  // Step state: 1 = Variables, 2 = Preview, 3 = Destination
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Parse variables list safely
  const configuredVars: VariableDefinition[] = useMemo(() => {
    if (!variables) return [];
    if (Array.isArray(variables)) {
      return variables.map((v) => {
        if (typeof v === "object" && v !== null && "name" in v) {
          return v as VariableDefinition;
        }
        if (typeof v === "string") {
          return { name: v, label: v, type: "text", required: true };
        }
        return { name: String(v), type: "text", required: true };
      });
    }
    if (typeof variables === "object" && variables !== null) {
      return Object.entries(variables as Record<string, unknown>).map(
        ([key, val]) => {
          if (typeof val === "object" && val !== null) {
            return {
              name: key,
              ...(val as Record<string, unknown>),
            } as VariableDefinition;
          }
          return { name: key, label: key, type: "text", required: true };
        }
      );
    }
    return [];
  }, [variables]);

  // Runtime values collected from user in Step 1
  const [runtimeValues, setRuntimeValues] = useState<Record<string, string>>({});
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Backend execution state
  const [resolving, setResolving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Resolved prompt from Composer + runtime resolution
  const [resolvedPrompt, setResolvedPrompt] = useState<string>("");
  const [isEditingResolved, setIsEditingResolved] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState<string>("");

  // Copy notification state
  const [copied, setCopied] = useState(false);
  const [destinationMessage, setDestinationMessage] = useState<string | null>(null);

  // Initialize or reset runtime values on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setServerError(null);
      setDestinationMessage(null);
      setIsEditingResolved(false);

      // Pre-fill form with default values where provided
      const initial: Record<string, string> = {};
      configuredVars.forEach((v) => {
        if (
          v.default !== undefined &&
          v.default !== null &&
          String(v.default).trim() !== ""
        ) {
          initial[v.name] = String(v.default);
        } else {
          initial[v.name] = "";
        }
      });
      setRuntimeValues(initial);
      setValidationErrors({});
    }
  }, [open, configuredVars]);

  // Handle value change for a variable
  const handleValueChange = (name: string, value: string) => {
    setRuntimeValues((prev) => ({ ...prev, [name]: value }));
    // Clear validation error when user types
    if (validationErrors[name]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Validate Step 1 client-side
  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {};

    configuredVars.forEach((v) => {
      const val = runtimeValues[v.name]?.trim() ?? "";
      const isRequired = v.required !== false;
      const displayLabel = v.label || v.name;

      if (isRequired && !val) {
        errors[v.name] = `${displayLabel} is required.`;
      } else if (val && v.type === "number") {
        if (isNaN(Number(val))) {
          errors[v.name] = `${displayLabel} must be a valid number.`;
        }
      }
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Step 1 to backend to resolve prompt
  const handleResolveAndProceed = async () => {
    if (!validateStep1()) return;

    if (!promptSystemId) {
      setServerError("Prompt System ID is required to run.");
      return;
    }

    setResolving(true);
    setServerError(null);

    try {
      // Build clean variables payload
      const payloadVars: Record<string, unknown> = {};
      configuredVars.forEach((v) => {
        const val = runtimeValues[v.name];
        if (val !== undefined && val !== "") {
          if (v.type === "number") {
            const num = Number(val);
            payloadVars[v.name] = isNaN(num) ? val : num;
          } else {
            payloadVars[v.name] = val;
          }
        }
      });

      const res = await runService.runPromptSystem(promptSystemId, {
        variables: payloadVars,
      });

      setResolvedPrompt(res.resolved_prompt);
      setEditedPrompt(res.resolved_prompt);
      setStep(2);
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string; detail?: string };
      setServerError(
        apiErr.detail || apiErr.message || "Failed to resolve prompt variables."
      );
    } finally {
      setResolving(false);
    }
  };

  // Copy resolved prompt to clipboard
  const handleCopyPrompt = async () => {
    const textToCopy = isEditingResolved ? editedPrompt : resolvedPrompt;
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback if clipboard API blocked
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  // Destination actions
  const handleSelectDestination = (destination: string) => {
    const textToCopy = isEditingResolved ? editedPrompt : resolvedPrompt;

    if (destination === "copy") {
      handleCopyPrompt();
      setDestinationMessage("Prompt copied to clipboard successfully!");
      return;
    }

    // Branch 18 prepares provider execution.
    // For Branch 17, provide clean destination state and copy to clipboard.
    if (destination === "chatgpt") {
      navigator.clipboard?.writeText(textToCopy);
      setDestinationMessage(
        "Resolved prompt copied! ChatGPT integration will connect in Branch 18."
      );
    } else if (destination === "claude") {
      navigator.clipboard?.writeText(textToCopy);
      setDestinationMessage(
        "Resolved prompt copied! Claude integration will connect in Branch 18."
      );
    } else {
      navigator.clipboard?.writeText(textToCopy);
      setDestinationMessage(
        "Resolved prompt copied! Custom provider integration connects in Branch 18."
      );
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[90vh] max-h-[850px] w-[95vw] sm:max-w-4xl md:max-w-5xl flex flex-col p-6 gap-0 border-border bg-popover shadow-2xl">
        {/* Header with Title & Step Indicator */}
        <DialogHeader className="shrink-0 pb-4 border-b border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-3 pr-6">
            <div>
              <DialogTitle className="text-lg font-semibold flex items-center gap-2">
                <Play className="size-4 text-primary fill-primary" /> Run Prompt:{" "}
                <span className="text-foreground">
                  {promptSystemName || "Prompt System"}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {step === 1 && "Step 1 of 3 — Enter runtime variables for this execution"}
                {step === 2 && "Step 2 of 3 — Preview fully resolved prompt with substituted values"}
                {step === 3 && "Step 3 of 3 — Choose prompt destination or copy to clipboard"}
              </DialogDescription>
            </div>

            {/* Step Progress Badges */}
            <div className="flex items-center gap-1.5 text-xs">
              <span
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition ${
                  step === 1
                    ? "bg-primary text-primary-foreground font-semibold"
                    : step > 1
                    ? "bg-success-soft text-success cursor-pointer"
                    : "bg-muted text-muted-foreground"
                }`}
                onClick={() => step > 1 && setStep(1)}
              >
                {step > 1 ? <Check className="size-3" /> : "1"} Variables
              </span>
              <span className="text-muted-foreground text-[10px]">/</span>
              <span
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition ${
                  step === 2
                    ? "bg-primary text-primary-foreground font-semibold"
                    : step > 2
                    ? "bg-success-soft text-success cursor-pointer"
                    : "bg-muted text-muted-foreground"
                }`}
                onClick={() => step > 2 && setStep(2)}
              >
                {step > 2 ? <Check className="size-3" /> : "2"} Preview
              </span>
              <span className="text-muted-foreground text-[10px]">/</span>
              <span
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition ${
                  step === 3
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                3 Destination
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Global Error Banner */}
        {serverError && (
          <div className="mx-6 mt-4 flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-xs font-medium text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto px-1 py-4">
          {/* STEP 1: VARIABLES FORM */}
          {step === 1 && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="rounded-lg bg-card/60 p-4 ring-1 ring-border/60">
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  Runtime Variables
                </h3>
                <p className="text-xs text-muted-foreground">
                  Provide temporary runtime values for this execution. These values
                  are not saved to the Prompt System configuration.
                </p>
              </div>

              {configuredVars.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center">
                  <Sparkles className="mx-auto size-8 text-primary/60 mb-2" />
                  <p className="text-sm font-medium text-foreground">
                    No variables configured
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    This Prompt System does not require any runtime inputs. Click
                    Next to compile and preview the prompt.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {configuredVars.map((v) => {
                    const error = validationErrors[v.name];
                    const isRequired = v.required !== false;
                    const val = runtimeValues[v.name] ?? "";

                    return (
                      <div
                        key={v.name}
                        className="rounded-lg bg-card/50 p-4 ring-1 ring-border/60 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor={`run-var-${v.name}`}
                            className="text-xs font-semibold text-foreground flex items-center gap-1.5"
                          >
                            <span>{v.label || v.name}</span>
                            {isRequired && (
                              <span className="text-destructive font-bold text-xs" title="Required">
                                *
                              </span>
                            )}
                            <code className="ml-1 text-[10px] font-mono text-primary font-normal">
                              {`{${v.name}}`}
                            </code>
                          </label>
                          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {v.type || "text"}
                          </span>
                        </div>

                        {v.description && (
                          <p className="text-[11px] text-muted-foreground">
                            {v.description}
                          </p>
                        )}

                        {/* Input Control by Variable Type */}
                        {v.type === "multiline" ? (
                          <Textarea
                            id={`run-var-${v.name}`}
                            rows={3}
                            placeholder={
                              v.default ? String(v.default) : `Enter ${v.label || v.name}...`
                            }
                            className={`bg-card text-xs font-sans ${
                              error ? "border-destructive focus-visible:ring-destructive" : ""
                            }`}
                            value={val}
                            onChange={(e) => handleValueChange(v.name, e.target.value)}
                          />
                        ) : v.type === "select" ? (
                          <select
                            id={`run-var-${v.name}`}
                            value={val}
                            onChange={(e) => handleValueChange(v.name, e.target.value)}
                            className={`w-full rounded-md border bg-card px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 ${
                              error
                                ? "border-destructive focus-visible:ring-destructive"
                                : "border-input focus-visible:ring-ring"
                            }`}
                          >
                            {!val && <option value="">Select an option...</option>}
                            {/* If variable has options array */}
                            {(v as { options?: string[] }).options &&
                            Array.isArray((v as { options?: string[] }).options) &&
                            (v as { options?: string[] }).options!.length > 0 ? (
                              (v as { options?: string[] }).options!.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))
                            ) : (
                              <>
                                {v.default && (
                                  <option value={String(v.default)}>
                                    {String(v.default)}
                                  </option>
                                )}
                                <option value="Technical">Technical</option>
                                <option value="Professional">Professional</option>
                                <option value="Casual">Casual</option>
                              </>
                            )}
                          </select>
                        ) : (
                          <Input
                            id={`run-var-${v.name}`}
                            type={v.type === "number" ? "number" : "text"}
                            placeholder={
                              v.default ? String(v.default) : `Enter ${v.label || v.name}...`
                            }
                            className={`bg-card text-xs ${
                              error ? "border-destructive focus-visible:ring-destructive" : ""
                            }`}
                            value={val}
                            onChange={(e) => handleValueChange(v.name, e.target.value)}
                          />
                        )}

                        {/* Error Message */}
                        {error && (
                          <p className="text-[11px] font-medium text-destructive flex items-center gap-1 pt-0.5">
                            <AlertCircle className="size-3 shrink-0" />
                            {error}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PREVIEW RESOLVED PROMPT */}
          {step === 2 && (
            <div className="space-y-4 max-w-4xl mx-auto h-full flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card/60 p-4 ring-1 ring-border/60">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Resolved Prompt Preview
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Composed by the existing Prompt Composer with your runtime values
                    substituted.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => {
                      if (isEditingResolved) {
                        setEditedPrompt(resolvedPrompt);
                        setIsEditingResolved(false);
                      } else {
                        setIsEditingResolved(true);
                      }
                    }}
                  >
                    {isEditingResolved ? (
                      <>
                        <RotateCcw className="size-3.5" /> Revert Edit
                      </>
                    ) : (
                      "Edit Prompt"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleCopyPrompt}
                  >
                    {copied ? (
                      <>
                        <Check className="size-3.5 text-success" />
                        <span className="text-success font-medium">Prompt copied.</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" /> Copy Prompt
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Resolved Content Display or Edit Textarea */}
              <div className="flex-1 min-h-[350px] rounded-lg border border-border/80 bg-background/90 p-4 font-mono text-xs text-foreground overflow-y-auto ring-1 ring-border/40">
                {isEditingResolved ? (
                  <Textarea
                    rows={16}
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    className="w-full h-full bg-transparent font-mono text-xs border-0 focus-visible:ring-0 resize-none p-0"
                    placeholder="Enter resolved prompt text..."
                  />
                ) : (
                  <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground select-text">
                    {editedPrompt || resolvedPrompt || "No prompt generated."}
                  </pre>
                )}
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                <span>
                  Length: {(isEditingResolved ? editedPrompt : resolvedPrompt).length}{" "}
                  characters
                </span>
                {isEditingResolved && (
                  <span className="text-primary font-medium">
                    (In-session temporary edit — original Prompt System unchanged)
                  </span>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: DESTINATION */}
          {step === 3 && (
            <div className="space-y-6 max-w-3xl mx-auto py-2">
              <div className="rounded-lg bg-card/60 p-4 ring-1 ring-border/60">
                <h3 className="text-sm font-semibold text-foreground">
                  Select Destination
                </h3>
                <p className="text-xs text-muted-foreground">
                  Choose where to send or copy your resolved prompt. Actual provider
                  API integration connects in Branch 18.
                </p>
              </div>

              {/* Destination feedback notification */}
              {destinationMessage && (
                <div className="flex items-center gap-2 rounded-md bg-success-soft p-3 text-xs font-medium text-success ring-1 ring-success/30">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{destinationMessage}</span>
                </div>
              )}

              {/* Destination Choice Cards */}
              <div className="grid gap-3 sm:grid-cols-2">
                {/* 1. Copy Prompt */}
                <button
                  type="button"
                  onClick={() => handleSelectDestination("copy")}
                  className="flex flex-col items-start p-4 rounded-xl border border-border/80 bg-card hover:bg-card/80 hover:border-primary/60 transition text-left group shadow-sm cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-primary font-semibold text-sm mb-1.5">
                    <Copy className="size-4 transition-transform group-hover:scale-110" />
                    Copy Prompt
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Copy the complete resolved prompt directly to your clipboard for
                    use anywhere.
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-[11px] text-primary font-medium">
                    <span>Copy to clipboard</span>
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
                  </div>
                </button>

                {/* 2. ChatGPT */}
                <button
                  type="button"
                  onClick={() => handleSelectDestination("chatgpt")}
                  className="flex flex-col items-start p-4 rounded-xl border border-border/80 bg-card hover:bg-card/80 hover:border-primary/60 transition text-left group shadow-sm cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-emerald-500 font-semibold text-sm mb-1.5">
                    <Bot className="size-4 transition-transform group-hover:scale-110" />
                    ChatGPT
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Send resolved prompt to OpenAI ChatGPT. Destination action prepared
                    for Branch 18.
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-[11px] text-emerald-500 font-medium">
                    <span>Prepare destination</span>
                    <ExternalLink className="size-3" />
                  </div>
                </button>

                {/* 3. Claude */}
                <button
                  type="button"
                  onClick={() => handleSelectDestination("claude")}
                  className="flex flex-col items-start p-4 rounded-xl border border-border/80 bg-card hover:bg-card/80 hover:border-primary/60 transition text-left group shadow-sm cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-amber-500 font-semibold text-sm mb-1.5">
                    <Bot className="size-4 transition-transform group-hover:scale-110" />
                    Claude
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Send resolved prompt to Anthropic Claude. Destination action prepared
                    for Branch 18.
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-[11px] text-amber-500 font-medium">
                    <span>Prepare destination</span>
                    <ExternalLink className="size-3" />
                  </div>
                </button>

                {/* 4. Other Provider */}
                <button
                  type="button"
                  onClick={() => handleSelectDestination("other")}
                  className="flex flex-col items-start p-4 rounded-xl border border-border/80 bg-card hover:bg-card/80 hover:border-primary/60 transition text-left group shadow-sm cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-primary font-semibold text-sm mb-1.5">
                    <Sparkles className="size-4 transition-transform group-hover:scale-110" />
                    Other Provider
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Custom API endpoint or external LLM destination. Ready for Branch 18.
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-[11px] text-primary font-medium">
                    <span>Prepare destination</span>
                    <ExternalLink className="size-3" />
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        <DialogFooter className="shrink-0 pt-4 border-t border-border/60 flex flex-row items-center justify-between sm:justify-between">
          <div>
            {step === 1 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={resolving}
              >
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setStep((prev) => (prev - 1) as 1 | 2)}
                disabled={resolving}
              >
                <ArrowLeft className="size-3.5" /> Back
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step === 1 && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={handleResolveAndProceed}
                disabled={resolving}
              >
                {resolving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" /> Resolving...
                  </>
                ) : (
                  <>
                    Next <ArrowRight className="size-3.5" />
                  </>
                )}
              </Button>
            )}

            {step === 2 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={handleCopyPrompt}
                >
                  {copied ? (
                    <>
                      <Check className="size-3.5 text-success" />
                      <span className="text-success font-medium">Prompt copied.</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" /> Copy
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setStep(3)}
                >
                  Next <ArrowRight className="size-3.5" />
                </Button>
              </>
            )}

            {step === 3 && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={handleClose}
              >
                Done
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
