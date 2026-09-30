/**
 * PromptForge Run Modal
 * Implements Branch 17: Prompt Run 3-step workflow:
 * Step 1: Variables & Context (Collect & validate Module & Parent runtime values)
 * Step 2: Preview (Inspect fully resolved prompt compiled by existing Composer)
 * Step 3: Destination (ChatGPT, Claude, Other Provider, Copy Prompt)
 */
import React, { useState, useEffect, useMemo } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Layers,
  Loader2,
  RotateCcw,
  Sparkles,
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
import {
  moduleReferenceService,
  providerService,
  runService,
  type ModuleReference,
  type VariableDefinition,
} from "@/services";

interface PromptRunModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  promptSystemId: number | null;
  promptSystemName?: string;
  variables?: VariableDefinition[] | unknown;
  initialModuleId?: number | null;
}

function parseVariableList(raw: unknown): VariableDefinition[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((v) => {
      if (typeof v === "object" && v !== null && "name" in v) {
        return v as VariableDefinition;
      }
      if (typeof v === "string") {
        return { name: v, label: v, type: "text", required: true };
      }
      return { name: String(v), type: "text", required: true };
    });
  }
  if (typeof raw === "object" && raw !== null) {
    return Object.entries(raw as Record<string, unknown>).map(([key, val]) => {
      if (typeof val === "object" && val !== null) {
        return {
          name: key,
          ...(val as Record<string, unknown>),
        } as VariableDefinition;
      }
      return { name: key, label: key, type: "text", required: true };
    });
  }
  return [];
}

export function PromptRunModal({
  open,
  onOpenChange,
  promptSystemId,
  promptSystemName,
  variables,
  initialModuleId,
}: PromptRunModalProps) {
  // Step state: 1 = Variables, 2 = Preview, 3 = Destination
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Attached modules for the prompt system
  const [attachedModules, setAttachedModules] = useState<ModuleReference[]>([]);
  const [loadingModules, setLoadingModules] = useState<boolean>(false);
  // Selected module ID (null means run full prompt system)
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);

  // Parse prompt system variables safely
  const configuredParentVars: VariableDefinition[] = useMemo(() => {
    return parseVariableList(variables);
  }, [variables]);

  // Selected module reference
  const currentModuleRef = useMemo(() => {
    if (!selectedModuleId) return null;
    return attachedModules.find((m) => m.module_id === selectedModuleId) || null;
  }, [attachedModules, selectedModuleId]);

  // Module variables for the selected module
  // Module variables for the selected module – fall back to `variables` field if API returns that
  const configuredModuleVars: VariableDefinition[] = useMemo(() => {
    if (!currentModuleRef) return [];
    const vars = currentModuleRef.module_variables ?? (currentModuleRef as any).variables;
    return parseVariableList(vars);
  }, [currentModuleRef]);

  // Module input contexts
  const currentModuleContexts = useMemo<string[]>(() => {
    if (!currentModuleRef) return [];
    if (Array.isArray(currentModuleRef.module_input_context)) {
      return currentModuleRef.module_input_context.map(String);
    }
    return [];
  }, [currentModuleRef]);

  // Context flags
  // Determine which context sections to display. By default, parent variables are shown unless the module explicitly excludes them.
  const hasParentVariablesContext =
    !selectedModuleId || currentModuleContexts.length === 0 || currentModuleContexts.includes("parent_variables");
  const hasPreviousOutputContext =
    !!selectedModuleId && currentModuleContexts.includes("previous_module_output");
  const hasUserInputContext =
    !!selectedModuleId && currentModuleContexts.includes("user_input");

  // Runtime values collected from user in Step 1
  const [runtimeParentValues, setRuntimeParentValues] = useState<Record<string, string>>({});
  const [runtimeModuleValues, setRuntimeModuleValues] = useState<Record<string, string>>({});
  const [runtimePreviousOutput, setRuntimePreviousOutput] = useState<string>("");
  const [runtimeUserInput, setRuntimeUserInput] = useState<string>("");

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

  // Load attached modules when modal opens
  useEffect(() => {
    if (open && promptSystemId) {
      setLoadingModules(true);
      moduleReferenceService
        .list(promptSystemId)
        .then((refs) => {
          const enabledRefs = refs.filter((r) => r.enabled);
          setAttachedModules(enabledRefs);
          // Choose default module if provided or if only one attached
          if (initialModuleId && enabledRefs.some((r) => r.module_id === initialModuleId)) {
            setSelectedModuleId(initialModuleId);
          } else if (enabledRefs.length === 1) {
            setSelectedModuleId(enabledRefs[0].module_id);
          } else {
            setSelectedModuleId(null);
          }
        })
        .catch((err) => {
          console.error("Failed to load modules for system:", err);
          setAttachedModules([]);
          setSelectedModuleId(null);
        })
        .finally(() => setLoadingModules(false));
    }
  }, [open, promptSystemId, initialModuleId]);

  // Initialize or reset runtime values on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setServerError(null);
      setDestinationMessage(null);
      setIsEditingResolved(false);
      setRuntimePreviousOutput("");
      setRuntimeUserInput("");

      // Pre-fill parent variables with defaults
      const initialParent: Record<string, string> = {};
      configuredParentVars.forEach((v) => {
        if (v.default !== undefined && v.default !== null && String(v.default).trim() !== "") {
          initialParent[v.name] = String(v.default);
        } else {
          initialParent[v.name] = "";
        }
      });
      setRuntimeParentValues(initialParent);
      setValidationErrors({});
    }
  }, [open, configuredParentVars]);

  // Pre-fill module variables with defaults when selected module changes
  useEffect(() => {
    const initialMod: Record<string, string> = {};
    configuredModuleVars.forEach((v) => {
      if (v.default !== undefined && v.default !== null && String(v.default).trim() !== "") {
        initialMod[v.name] = String(v.default);
      } else if (v.type === "boolean") {
        initialMod[v.name] = "false";
      } else {
        initialMod[v.name] = "";
      }
    });
    setRuntimeModuleValues(initialMod);
    setValidationErrors({});
  }, [configuredModuleVars]);

  // Value change handlers
  const handleParentValueChange = (name: string, value: string) => {
    setRuntimeParentValues((prev) => ({ ...prev, [name]: value }));
    const errKey = `parent_${name}`;
    if (validationErrors[errKey]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[errKey];
        return next;
      });
    }
  };

  const handleModuleValueChange = (name: string, value: string) => {
    setRuntimeModuleValues((prev) => ({ ...prev, [name]: value }));
    const errKey = `module_${name}`;
    if (validationErrors[errKey]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[errKey];
        return next;
      });
    }
  };

  // Validate Step 1 client-side
  const validateStep1 = (): boolean => {
    const errors: Record<string, string> = {};

    // 1. Validate Module Variables (if module selected)
    if (selectedModuleId) {
      configuredModuleVars.forEach((v) => {
        const val = runtimeModuleValues[v.name]?.trim() ?? "";
        const isRequired = v.required !== false;
        const displayLabel = v.label || v.name;

        if (isRequired && !val) {
          errors[`module_${v.name}`] = `${displayLabel} is required.`;
        } else if (val) {
          const varType = (v.type || "text").toLowerCase();
          if (varType === "integer") {
            if (!/^-?\d+$/.test(val)) {
              errors[`module_${v.name}`] = `${displayLabel} must be a valid integer.`;
            }
          } else if (varType === "number") {
            if (isNaN(Number(val))) {
              errors[`module_${v.name}`] = `${displayLabel} must be a valid number.`;
            }
          }
        }
      });
    }

    // 2. Validate Parent Variables (only if parent_variables is enabled or whole system)
    if (hasParentVariablesContext) {
      configuredParentVars.forEach((v) => {
        const val = runtimeParentValues[v.name]?.trim() ?? "";
        const isRequired = v.required !== false;
        const displayLabel = v.label || v.name;

        if (isRequired && !val) {
          errors[`parent_${v.name}`] = `${displayLabel} is required.`;
        } else if (val) {
          const varType = (v.type || "text").toLowerCase();
          if (varType === "integer") {
            if (!/^-?\d+$/.test(val)) {
              errors[`parent_${v.name}`] = `${displayLabel} must be a valid integer.`;
            }
          } else if (varType === "number") {
            if (isNaN(Number(val))) {
              errors[`parent_${v.name}`] = `${displayLabel} must be a valid number.`;
            }
          }
        }
      });
    }

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
      // Build clean parent variables payload
      const payloadParentVars: Record<string, unknown> = {};
      if (hasParentVariablesContext) {
        configuredParentVars.forEach((v) => {
          const val = runtimeParentValues[v.name];
          if (val !== undefined && val !== "") {
            const varType = (v.type || "text").toLowerCase();
            if (varType === "integer") {
              const num = parseInt(val, 10);
              payloadParentVars[v.name] = isNaN(num) ? val : num;
            } else if (varType === "number") {
              const num = Number(val);
              payloadParentVars[v.name] = isNaN(num) ? val : num;
            } else if (varType === "boolean") {
              payloadParentVars[v.name] = val === "true" || val === "1";
            } else {
              payloadParentVars[v.name] = val;
            }
          }
        });
      }

      // Build clean module variables payload
      const payloadModuleVars: Record<string, unknown> = {};
      if (selectedModuleId) {
        configuredModuleVars.forEach((v) => {
          const val = runtimeModuleValues[v.name];
          if (val !== undefined && val !== "") {
            const varType = (v.type || "text").toLowerCase();
            if (varType === "integer") {
              const num = parseInt(val, 10);
              payloadModuleVars[v.name] = isNaN(num) ? val : num;
            } else if (varType === "number") {
              const num = Number(val);
              payloadModuleVars[v.name] = isNaN(num) ? val : num;
            } else if (varType === "boolean") {
              payloadModuleVars[v.name] = val === "true" || val === "1";
            } else {
              payloadModuleVars[v.name] = val;
            }
          }
        });
      }

      const res = await runService.runPromptSystem(promptSystemId, {
        module_id: selectedModuleId,
        variables: hasParentVariablesContext ? payloadParentVars : {},
        module_variables: payloadModuleVars,
        user_input: hasUserInputContext && runtimeUserInput ? runtimeUserInput : undefined,
        previous_module_output:
          hasPreviousOutputContext && runtimePreviousOutput ? runtimePreviousOutput : undefined,
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

  // Robust clipboard copy with fallback
  const copyTextToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback below
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "-9999px";
      textArea.setAttribute("readonly", "");
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textArea);
      return success;
    } catch {
      return false;
    }
  };

  // Copy resolved prompt to clipboard in Step 2
  const handleCopyPrompt = async () => {
    const textToCopy = isEditingResolved ? editedPrompt : resolvedPrompt;
    if (!textToCopy) return;

    await copyTextToClipboard(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  // Destination actions
  const handleSelectProvider = (providerId: string, providerName: string) => {
    const textToCopy = isEditingResolved ? editedPrompt : resolvedPrompt;
    copyTextToClipboard(textToCopy);
    setDestinationMessage(`Prompt copied! Opening ${providerName}...`);

    providerService.executeAction(providerId, textToCopy).catch((err) => {
      console.debug("Provider action recorded:", err);
    });
  };

  const handleCopyDestination = async () => {
    const textToCopy = isEditingResolved ? editedPrompt : resolvedPrompt;
    await copyTextToClipboard(textToCopy);
    setCopied(true);
    setDestinationMessage("Prompt copied to clipboard!");
    setTimeout(() => setCopied(false), 2200);
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-6 overflow-hidden bg-background">
        <DialogHeader className="shrink-0 border-b border-border/60 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <span>Run: {promptSystemName || "Prompt System"}</span>
                
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Dynamic runtime execution, placeholder resolution, and provider dispatch.
              </DialogDescription>
            </div>

            {/* Stepper Navigation */}
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-medium transition ${
                  step === 1
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "bg-success-soft text-success cursor-pointer"
                }`}
                onClick={() => setStep(1)}
              >
                {step > 1 ? <Check className="size-3" /> : "1"} Runtime Inputs
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
          {/* STEP 1: VARIABLES & CONTEXT FORM */}
          {step === 1 && (
            <div className="space-y-6 max-w-3xl mx-auto">
              

              {/* SECTION: MODULE VARIABLES */}
              {selectedModuleId && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <div className="flex items-center gap-2">
                      <Layers className="size-4 text-primary" />
                      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Module Variables ({configuredModuleVars.length})
                      </h3>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Defined by {currentModuleRef?.module_name || "selected module"}
                    </span>
                  </div>

                  {configuredModuleVars.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-4 text-center">
                      <p className="text-xs text-muted-foreground">
                        This module does not define any module variables.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-1">
                      {configuredModuleVars.map((v) => {
                        const errKey = `module_${v.name}`;
                        const error = validationErrors[errKey];
                        const isRequired = v.required !== false;
                        const val = runtimeModuleValues[v.name] ?? "";
                        const varType = (v.type || "text").toLowerCase();

                        return (
                          <div
                            key={v.name}
                            className="rounded-lg bg-card/60 p-4 ring-1 ring-border/60 space-y-2 transition hover:bg-card/80"
                          >
                            <div className="flex items-center justify-between">
                              <label
                                htmlFor={`run-mod-var-${v.name}`}
                                className="text-xs font-semibold text-foreground flex items-center gap-1.5"
                              >
                                <span>{v.label || v.name}</span>
                                {isRequired && (
                                  <span
                                    className="text-destructive font-bold text-xs"
                                    title="Required"
                                  >
                                    *
                                  </span>
                                )}
                                <code className="ml-1 text-[10px] font-mono text-primary font-normal">
                                  &#123;{v.name}&#125;
                                </code>
                              </label>
                              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
                                {varType}
                              </span>
                            </div>

                            {v.description && (
                              <p className="text-[11px] text-muted-foreground">
                                {v.description}
                              </p>
                            )}

                            {/* Control by type */}
                            {varType === "multiline" ? (
                              <Textarea
                                id={`run-mod-var-${v.name}`}
                                rows={3}
                                placeholder={
                                  v.default ? String(v.default) : `Enter ${v.label || v.name}...`
                                }
                                className={`bg-card text-xs font-sans ${
                                  error ? "border-destructive focus-visible:ring-destructive" : ""
                                }`}
                                value={val}
                                onChange={(e) => handleModuleValueChange(v.name, e.target.value)}
                              />
                            ) : varType === "boolean" ? (
                              <select
                                id={`run-mod-var-${v.name}`}
                                value={val}
                                onChange={(e) => handleModuleValueChange(v.name, e.target.value)}
                                className={`w-full rounded-md border bg-card px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 ${
                                  error
                                    ? "border-destructive focus-visible:ring-destructive"
                                    : "border-input focus-visible:ring-ring"
                                }`}
                              >
                                <option value="true">True</option>
                                <option value="false">False</option>
                              </select>
                            ) : varType === "select" ? (
                              <select
                                id={`run-mod-var-${v.name}`}
                                value={val}
                                onChange={(e) => handleModuleValueChange(v.name, e.target.value)}
                                className={`w-full rounded-md border bg-card px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 ${
                                  error
                                    ? "border-destructive focus-visible:ring-destructive"
                                    : "border-input focus-visible:ring-ring"
                                }`}
                              >
                                {!val && <option value="">Select an option...</option>}
                                {(v as { options?: string[] }).options &&
                                Array.isArray((v as { options?: string[] }).options) &&
                                (v as { options?: string[] }).options!.map((opt) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                id={`run-mod-var-${v.name}`}
                                type={varType === "integer" || varType === "number" ? "number" : "text"}
                                step={varType === "integer" ? "1" : "any"}
                                placeholder={
                                  v.default ? String(v.default) : `Enter ${v.label || v.name}...`
                                }
                                className={`bg-card text-xs ${
                                  error ? "border-destructive focus-visible:ring-destructive" : ""
                                }`}
                                value={val}
                                onChange={(e) => handleModuleValueChange(v.name, e.target.value)}
                              />
                            )}

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

              {/* SECTION: PROMPT SYSTEM VARIABLES (Only if parent_variables enabled or full system) */}
              {hasParentVariablesContext && configuredParentVars.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Prompt System Variables ({configuredParentVars.length})
                      </h3>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Parent system variables required by configuration
                    </span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-1">
                    {configuredParentVars.map((v) => {
                      const errKey = `parent_${v.name}`;
                      const error = validationErrors[errKey];
                      const isRequired = v.required !== false;
                      const val = runtimeParentValues[v.name] ?? "";
                      const varType = (v.type || "text").toLowerCase();

                      return (
                        <div
                          key={v.name}
                          className="rounded-lg bg-card/60 p-4 ring-1 ring-border/60 space-y-2 transition hover:bg-card/80"
                        >
                          <div className="flex items-center justify-between">
                            <label
                              htmlFor={`run-parent-var-${v.name}`}
                              className="text-xs font-semibold text-foreground flex items-center gap-1.5"
                            >
                              <span>{v.label || v.name}</span>
                              {isRequired && (
                                <span
                                  className="text-destructive font-bold text-xs"
                                  title="Required"
                                >
                                  *
                                </span>
                              )}
                              <code className="ml-1 text-[10px] font-mono text-primary font-normal">
                                &#123;{v.name}&#125;
                              </code>
                            </label>
                            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
                              {varType}
                            </span>
                          </div>

                          {v.description && (
                            <p className="text-[11px] text-muted-foreground">
                              {v.description}
                            </p>
                          )}

                          {varType === "multiline" ? (
                            <Textarea
                              id={`run-parent-var-${v.name}`}
                              rows={3}
                              placeholder={
                                v.default ? String(v.default) : `Enter ${v.label || v.name}...`
                              }
                              className={`bg-card text-xs font-sans ${
                                error ? "border-destructive focus-visible:ring-destructive" : ""
                              }`}
                              value={val}
                              onChange={(e) => handleParentValueChange(v.name, e.target.value)}
                            />
                          ) : varType === "boolean" ? (
                            <select
                              id={`run-parent-var-${v.name}`}
                              value={val}
                              onChange={(e) => handleParentValueChange(v.name, e.target.value)}
                              className={`w-full rounded-md border bg-card px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 ${
                                error
                                  ? "border-destructive focus-visible:ring-destructive"
                                  : "border-input focus-visible:ring-ring"
                              }`}
                            >
                              <option value="true">True</option>
                              <option value="false">False</option>
                            </select>
                          ) : varType === "select" ? (
                            <select
                              id={`run-parent-var-${v.name}`}
                              value={val}
                              onChange={(e) => handleParentValueChange(v.name, e.target.value)}
                              className={`w-full rounded-md border bg-card px-3 py-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 ${
                                error
                                  ? "border-destructive focus-visible:ring-destructive"
                                  : "border-input focus-visible:ring-ring"
                              }`}
                            >
                              {!val && <option value="">Select an option...</option>}
                              {(v as { options?: string[] }).options &&
                              Array.isArray((v as { options?: string[] }).options) &&
                              (v as { options?: string[] }).options!.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              id={`run-parent-var-${v.name}`}
                              type={varType === "integer" || varType === "number" ? "number" : "text"}
                              step={varType === "integer" ? "1" : "any"}
                              placeholder={
                                v.default ? String(v.default) : `Enter ${v.label || v.name}...`
                              }
                              className={`bg-card text-xs ${
                                error ? "border-destructive focus-visible:ring-destructive" : ""
                              }`}
                              value={val}
                              onChange={(e) => handleParentValueChange(v.name, e.target.value)}
                            />
                          )}

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
                </div>
              )}

              {/* SECTION: PREVIOUS MODULE OUTPUT (If enabled by module context) */}
              {hasPreviousOutputContext && (
                <div className="space-y-2 rounded-xl bg-card/60 p-4 ring-1 ring-border/60">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="run-previous-output"
                      className="text-xs font-semibold text-foreground flex items-center gap-2"
                    >
                      <Boxes className="size-4 text-primary" />
                      <span>Previous Module Output Context</span>
                    </label>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
                      Context Input
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    This module is configured to accept output from a prior step. Provide previous output text below:
                  </p>
                  <Textarea
                    id="run-previous-output"
                    rows={4}
                    placeholder="Paste or enter the generated output from the previous pipeline module..."
                    className="bg-card text-xs font-mono"
                    value={runtimePreviousOutput}
                    onChange={(e) => setRuntimePreviousOutput(e.target.value)}
                  />
                </div>
              )}

              {/* SECTION: USER INPUT (If enabled by module context) */}
              {hasUserInputContext && (
                <div className="space-y-2 rounded-xl bg-card/60 p-4 ring-1 ring-border/60">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="run-user-input"
                      className="text-xs font-semibold text-foreground flex items-center gap-2"
                    >
                      <Sparkles className="size-4 text-primary" />
                      <span>Runtime User Input</span>
                    </label>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground uppercase">
                      Context Input
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    This module is configured to accept direct user input context at runtime:
                  </p>
                  <Textarea
                    id="run-user-input"
                    rows={3}
                    placeholder="Enter runtime user input or query..."
                    className="bg-card text-xs font-mono"
                    value={runtimeUserInput}
                    onChange={(e) => setRuntimeUserInput(e.target.value)}
                  />
                </div>
              )}

              {/* No Inputs Required Fallback */}
              {!hasParentVariablesContext &&
                configuredModuleVars.length === 0 &&
                !hasPreviousOutputContext &&
                !hasUserInputContext && (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center">
                    <Sparkles className="mx-auto size-8 text-primary/60 mb-2" />
                    <p className="text-sm font-medium text-foreground">
                      No runtime inputs required
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      The selected execution does not require any variable inputs. Click Next to compile and preview.
                    </p>
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
                    Composed by Prompt Composer with your runtime values substituted into all placeholders.
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
                  Length: {(isEditingResolved ? editedPrompt : resolvedPrompt).length} characters
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
            <div className="space-y-4 max-w-3xl mx-auto py-2">
              <div className="rounded-lg bg-card/60 p-4 ring-1 ring-border/60">
                <h3 className="text-sm font-semibold text-foreground">
                  Destination
                </h3>
                <p className="text-xs text-muted-foreground">
                  Choose a supported provider destination or copy the final prompt.
                </p>
              </div>

              {destinationMessage && (
                <div className="flex items-center gap-2 rounded-md bg-success-soft p-3 text-xs font-medium text-success ring-1 ring-success/30">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{destinationMessage}</span>
                </div>
              )}

              {/* Provider Destination Cards */}
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-2">
                {/* 1. ChatGPT */}
                <div className="flex flex-col justify-between p-4 rounded-xl border border-border/80 bg-card/70 ring-1 ring-border/50">
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">ChatGPT</h4>
                    <p className="text-xs text-muted-foreground mt-1">Open with prompt</p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="mt-4 w-full gap-1.5 text-xs"
                  >
                    <a
                      href="https://chatgpt.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleSelectProvider("chatgpt", "ChatGPT")}
                    >
                      Open ChatGPT <ExternalLink className="size-3" />
                    </a>
                  </Button>
                </div>

                {/* 2. Claude */}
                <div className="flex flex-col justify-between p-4 rounded-xl border border-border/80 bg-card/70 ring-1 ring-border/50">
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">Claude</h4>
                    <p className="text-xs text-muted-foreground mt-1">Open with prompt</p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="mt-4 w-full gap-1.5 text-xs"
                  >
                    <a
                      href="https://claude.ai/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleSelectProvider("claude", "Claude")}
                    >
                      Open Claude <ExternalLink className="size-3" />
                    </a>
                  </Button>
                </div>

                {/* 3. Groq */}
                <div className="flex flex-col justify-between p-4 rounded-xl border border-border/80 bg-card/70 ring-1 ring-border/50">
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">Groq</h4>
                    <p className="text-xs text-muted-foreground mt-1">Open with prompt</p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="mt-4 w-full gap-1.5 text-xs"
                  >
                    <a
                      href="https://groq.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleSelectProvider("groq", "Groq")}
                    >
                      Open Groq <ExternalLink className="size-3" />
                    </a>
                  </Button>
                </div>

                {/* 4. Gemini */}
                <div className="flex flex-col justify-between p-4 rounded-xl border border-border/80 bg-card/70 ring-1 ring-border/50">
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">Gemini</h4>
                    <p className="text-xs text-muted-foreground mt-1">Open with prompt</p>
                  </div>
                  <Button
                    asChild
                    size="sm"
                    className="mt-4 w-full gap-1.5 text-xs"
                  >
                    <a
                      href="https://gemini.google.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleSelectProvider("gemini", "Gemini")}
                    >
                      Open Gemini <ExternalLink className="size-3" />
                    </a>
                  </Button>
                </div>

                {/* 5. Copy Prompt */}
                <div className="flex flex-col justify-between p-4 rounded-xl border border-border/80 bg-card/70 ring-1 ring-border/50 sm:col-span-2">
                  <div>
                    <h4 className="font-semibold text-sm text-foreground">Copy Prompt</h4>
                    <p className="text-xs text-muted-foreground mt-1">Copy final prompt</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full gap-1.5 text-xs"
                    onClick={handleCopyDestination}
                  >
                    <Copy className="size-3" /> Copy
                  </Button>
                </div>
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
