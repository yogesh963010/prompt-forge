import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  Trash2,
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  moduleReferenceService,
  moduleService,
  type ModuleReference,
  type PromptModule,
} from "@/services";
import { PREDEFINED_MODULES, type PredefinedModule } from "@/data/predefinedModules";

interface SystemModulesSectionProps {
  promptSystemId: number | null;
  onNavigateToModules?: () => void;
}

export function SystemModulesSection({
  promptSystemId,
  onNavigateToModules,
}: SystemModulesSectionProps) {
  const [references, setReferences] = useState<ModuleReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Available modules for attachment
  const [availableModules, setAvailableModules] = useState<PromptModule[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  // Add Module Dialog State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [inputMappingEntries, setInputMappingEntries] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [outputMappingEntries, setOutputMappingEntries] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Configure Dialog State
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [refToConfigure, setRefToConfigure] = useState<ModuleReference | null>(null);
  const [configInputEntries, setConfigInputEntries] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [configOutputEntries, setConfigOutputEntries] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [configJsonMode, setConfigJsonMode] = useState(false);
  const [configRawInputJson, setConfigRawInputJson] = useState("");
  const [configRawOutputJson, setConfigRawOutputJson] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Remove Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [refToRemove, setRefToRemove] = useState<ModuleReference | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Toggling state tracker
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Clear success notification after 4s
  useEffect(() => {
    if (!actionSuccess) return;
    const timer = setTimeout(() => setActionSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [actionSuccess]);

  // Load attached module references
  const loadReferences = useCallback(async () => {
    if (!promptSystemId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await moduleReferenceService.list(promptSystemId);
      setReferences(data);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || "Failed to load attached modules.");
    } finally {
      setLoading(false);
    }
  }, [promptSystemId]);

  useEffect(() => {
    loadReferences();
  }, [loadReferences]);

  // Load available modules when Add Modal opens
  const openAddModal = async () => {
    setAddError(null);
    setSelectedModuleId(null);
    setInputMappingEntries([{ key: "", value: "" }]);
    setOutputMappingEntries([{ key: "", value: "" }]);
    setAddModalOpen(true);
    setLoadingAvailable(true);
    try {
      const modules = await moduleService.list();
      setAvailableModules(modules);
      if (modules.length > 0) {
        setSelectedModuleId(modules[0].id);
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setAddError(apiErr.message || "Failed to load available modules.");
    } finally {
      setLoadingAvailable(false);
    }
  };

  // Quick preset helper for Add Modal input context
  const addPresetContext = (contextType: string) => {
    setInputMappingEntries((prev) => {
      // Don't add duplicate keys
      if (prev.some((e) => e.key === contextType)) return prev;
      const filtered = prev.filter((e) => e.key.trim() !== "");
      return [...filtered, { key: contextType, value: contextType }];
    });
  };

  // Handle Add Module submission
  const handleAttachModule = async () => {
    if (!promptSystemId) return;
    if (!selectedModuleId) {
      setAddError("Please select a module to attach.");
      return;
    }

    setAdding(true);
    setAddError(null);

    // Build input_mapping dict
    const input_mapping: Record<string, string> = {};
    for (const entry of inputMappingEntries) {
      if (entry.key.trim()) {
        input_mapping[entry.key.trim()] = entry.value.trim();
      }
    }

    // Build output_mapping dict
    const output_mapping: Record<string, string> = {};
    for (const entry of outputMappingEntries) {
      if (entry.key.trim()) {
        output_mapping[entry.key.trim()] = entry.value.trim();
      }
    }

    try {
      await moduleReferenceService.attach(promptSystemId, {
        module_id: selectedModuleId,
        input_mapping,
        output_mapping,
        enabled: true,
      });
      setAddModalOpen(false);
      setActionSuccess("Module added to Prompt System.");
      await loadReferences();
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 409) {
        setAddError("This Prompt Module is already attached to this Prompt System.");
      } else {
        setAddError(apiErr.message || "Failed to attach module to Prompt System.");
      }
    } finally {
      setAdding(false);
    }
  };

  const handleAttachPredefined = async (tpl: PredefinedModule) => {
    if (!promptSystemId) return;
    setAdding(true);
    setAddError(null);
    try {
      const created = await moduleService.create({
        name: tpl.name,
        description: tpl.description,
        instructions: tpl.instructions,
        variables: tpl.variables,
        input_context: tpl.input_context,
        output_contract: tpl.output_contract,
        examples: tpl.examples,
      });

      await moduleReferenceService.attach(promptSystemId, {
        module_id: created.id,
        input_mapping: {},
        output_mapping: {},
        enabled: true,
      });

      setAddModalOpen(false);
      setActionSuccess(`Added "${tpl.name}" to Prompt System.`);
      await loadReferences();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setAddError(apiErr.message || "Failed to add predefined module.");
    } finally {
      setAdding(false);
    }
  };

  // Toggle module reference enabled / disabled
  const handleToggleEnabled = async (ref: ModuleReference) => {
    if (!promptSystemId) return;
    setTogglingId(ref.id);
    const newEnabled = !ref.enabled;
    try {
      const updated = await moduleReferenceService.update(promptSystemId, ref.id, {
        enabled: newEnabled,
      });
      setReferences((prev) => prev.map((item) => (item.id === ref.id ? updated : item)));
      setActionSuccess(
        `${ref.module_name || "Module"} ${newEnabled ? "enabled" : "disabled"}.`
      );
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || "Failed to update module status.");
    } finally {
      setTogglingId(null);
    }
  };

  // Open Configure Modal
  const openConfigureModal = (ref: ModuleReference) => {
    setRefToConfigure(ref);
    setConfigError(null);
    setConfigJsonMode(false);

    // Parse input_mapping
    const inMap = (ref.input_mapping as Record<string, unknown>) || {};
    const inEntries: Array<{ key: string; value: string }> = Object.entries(inMap).map(
      ([k, v]) => ({
        key: k,
        value: typeof v === "string" ? v : JSON.stringify(v),
      })
    );
    if (inEntries.length === 0) inEntries.push({ key: "", value: "" });
    setConfigInputEntries(inEntries);
    setConfigRawInputJson(JSON.stringify(inMap, null, 2));

    // Parse output_mapping
    const outMap = (ref.output_mapping as Record<string, unknown>) || {};
    const outEntries: Array<{ key: string; value: string }> = Object.entries(outMap).map(
      ([k, v]) => ({
        key: k,
        value: typeof v === "string" ? v : JSON.stringify(v),
      })
    );
    if (outEntries.length === 0) outEntries.push({ key: "", value: "" });
    setConfigOutputEntries(outEntries);
    setConfigRawOutputJson(JSON.stringify(outMap, null, 2));

    setConfigModalOpen(true);
  };

  // Save Configure changes
  const handleSaveConfigure = async () => {
    if (!promptSystemId || !refToConfigure) return;
    setConfigSaving(true);
    setConfigError(null);

    let finalInputMapping: Record<string, unknown> = {};
    let finalOutputMapping: Record<string, unknown> = {};

    try {
      if (configJsonMode) {
        if (configRawInputJson.trim()) {
          const parsed = JSON.parse(configRawInputJson);
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("Input mapping must be a valid JSON object.");
          }
          finalInputMapping = parsed;
        }
        if (configRawOutputJson.trim()) {
          const parsed = JSON.parse(configRawOutputJson);
          if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
            throw new Error("Output mapping must be a valid JSON object.");
          }
          finalOutputMapping = parsed;
        }
      } else {
        for (const entry of configInputEntries) {
          if (entry.key.trim()) {
            finalInputMapping[entry.key.trim()] = entry.value.trim();
          }
        }
        for (const entry of configOutputEntries) {
          if (entry.key.trim()) {
            finalOutputMapping[entry.key.trim()] = entry.value.trim();
          }
        }
      }

      const updated = await moduleReferenceService.update(
        promptSystemId,
        refToConfigure.id,
        {
          input_mapping: finalInputMapping,
          output_mapping: finalOutputMapping,
        }
      );
      setReferences((prev) =>
        prev.map((item) => (item.id === refToConfigure.id ? updated : item))
      );
      setConfigModalOpen(false);
      setActionSuccess("Module mappings updated successfully.");
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setConfigError(apiErr.message || "Failed to save module configuration.");
    } finally {
      setConfigSaving(false);
    }
  };

  // Open Remove Dialog
  const openRemoveDialog = (ref: ModuleReference) => {
    setRefToRemove(ref);
    setRemoveError(null);
    setDeleteDialogOpen(true);
  };

  // Confirm removal of module reference
  const handleConfirmRemove = async () => {
    if (!promptSystemId || !refToRemove) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await moduleReferenceService.remove(promptSystemId, refToRemove.id);
      setReferences((prev) => prev.filter((item) => item.id !== refToRemove.id));
      setDeleteDialogOpen(false);
      setActionSuccess("Module removed from Prompt System.");
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setRemoveError(apiErr.message || "Failed to remove module reference.");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Add Module button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Attached Prompt Modules</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Configure reusable prompt blocks, input context boundaries, and output mappings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadReferences}
            disabled={loading}
            title="Refresh attached modules"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openAddModal}>
            <Plus className="mr-1.5 size-3.5" /> Add Module
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-xs font-medium text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/15 px-3 py-2 text-xs font-medium text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Module References List */}
      {loading && references.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg bg-card/40 ring-1 ring-border/60">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="ml-2 text-xs text-muted-foreground">Loading modules...</span>
        </div>
      ) : references.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/80 bg-card/25 p-8 text-center">
          <div className="mx-auto grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Boxes className="size-5" />
          </div>
          <h3 className="mt-3 text-sm font-medium">No Modules Attached</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Attach Prompt Modules like Research, Critic, or Summarizer to this system with defined
            input context and output contracts.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button size="sm" onClick={openAddModal}>
              <Plus className="mr-1.5 size-3.5" /> Add Module
            </Button>
            {onNavigateToModules && (
              <Button size="sm" variant="outline" onClick={onNavigateToModules}>
                Manage Prompt Library
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
          {references.map((ref) => {
            const inMap = (ref.input_mapping as Record<string, unknown>) || {};
            const outMap = (ref.output_mapping as Record<string, unknown>) || {};
            const inEntries = Object.entries(inMap);
            const outEntries = Object.entries(outMap);
            const isToggling = togglingId === ref.id;

            return (
              <div
                key={ref.id}
                className={`rounded-lg p-4 ring-1 transition ${
                  ref.enabled
                    ? "bg-card/65 ring-border/70 hover:bg-card/85"
                    : "bg-muted/30 opacity-75 ring-border/40"
                }`}
              >
                {/* Module title & enabled switch */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-8 place-items-center rounded-md bg-accent text-accent-foreground">
                      <Boxes className="size-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold">
                        {ref.module_name || `Module #${ref.module_id}`}
                      </h4>
                      <span
                        className={`inline-block font-mono text-[10px] uppercase ${
                          ref.enabled ? "text-success font-medium" : "text-muted-foreground"
                        }`}
                      >
                        {ref.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isToggling && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                    <Switch
                      checked={ref.enabled}
                      onCheckedChange={() => handleToggleEnabled(ref)}
                      disabled={isToggling}
                      aria-label={`Toggle ${ref.module_name || "Module"}`}
                    />
                  </div>
                </div>

                {/* Mappings overview */}
                <div className="mt-3.5 space-y-2 rounded-md bg-muted/40 p-2.5 text-xs">
                  {/* Input Mapping */}
                  <div>
                    <span className="font-mono text-[10px] uppercase text-muted-foreground block mb-1">
                      Input Mapping
                    </span>
                    {inEntries.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {inEntries.map(([k, v]) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 rounded bg-background/80 px-2 py-0.5 font-mono text-[11px]"
                          >
                            <span className="text-muted-foreground">{k}</span>
                            <ArrowRight className="size-2.5 text-muted-foreground" />
                            <span className="font-medium text-primary">{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        Default context
                      </span>
                    )}
                  </div>

                  {/* Output Mapping */}
                  <div className="border-t border-border/40 pt-1.5">
                    <span className="font-mono text-[10px] uppercase text-muted-foreground block mb-1">
                      Output Mapping
                    </span>
                    {outEntries.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {outEntries.map(([k, v]) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 rounded bg-background/80 px-2 py-0.5 font-mono text-[11px]"
                          >
                            <span className="text-muted-foreground">{k}</span>
                            <ArrowRight className="size-2.5 text-muted-foreground" />
                            <span className="font-medium text-foreground">{String(v)}</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        No output mapping
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-border/40 pt-2.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => openConfigureModal(ref)}
                  >
                    <Settings className="mr-1.5 size-3" /> Configure
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => openRemoveDialog(ref)}
                    title="Remove module reference"
                  >
                    <Trash2 className="mr-1.5 size-3" /> Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* DIALOG: Add Module to Prompt System */}
      {/* ========================================================= */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent className="border-border bg-popover sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Module to Prompt System</DialogTitle>
            <DialogDescription>
              Link a Prompt Module from your library. The underlying module remains reusable across
              systems.
            </DialogDescription>
          </DialogHeader>

          {addError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{addError}</span>
            </div>
          )}

          {loadingAvailable ? (
            <div className="flex h-36 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
              <span className="ml-2 text-xs text-muted-foreground">Loading modules...</span>
            </div>
          ) : availableModules.length === 0 ? (
            <div className="py-4 space-y-3 text-xs">
              <p className="text-muted-foreground text-center">
                No custom Prompt Modules found. You can attach one of these predefined starter presets directly:
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {PREDEFINED_MODULES.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="flex items-center justify-between rounded-lg border border-border/70 bg-card/70 p-2.5 hover:bg-card/90"
                  >
                    <div>
                      <div className="font-semibold text-foreground text-xs">{tpl.name}</div>
                      <div className="text-[10px] text-muted-foreground line-clamp-1">{tpl.description}</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleAttachPredefined(tpl)}
                      disabled={adding}
                      className="h-7 text-xs shrink-0"
                    >
                      {adding ? <Loader2 className="size-3 animate-spin" /> : "+ Attach"}
                    </Button>
                  </div>
                ))}
              </div>
              {onNavigateToModules && (
                <div className="text-center pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      setAddModalOpen(false);
                      onNavigateToModules();
                    }}
                  >
                    Go to Module Library
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4 py-1 text-xs">
              {/* Select Module */}
              <div>
                <label className="mb-1 block font-medium">Select Module *</label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  value={selectedModuleId ?? ""}
                  onChange={(e) => setSelectedModuleId(Number(e.target.value))}
                >
                  {availableModules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} {m.description ? `— ${m.description}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Context Presets */}
              <div>
                <span className="mb-1.5 block font-medium">Input Context Shortcuts</span>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => addPresetContext("parent_variables")}
                  >
                    + Parent Variables
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => addPresetContext("parent_instructions")}
                  >
                    + Parent Instructions
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => addPresetContext("previous_module_output")}
                  >
                    + Previous Module Output
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => addPresetContext("user_input")}
                  >
                    + User Input
                  </Button>
                </div>
              </div>

              {/* Input Mapping rows */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">Input Mapping (System context → Module input)</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() =>
                      setInputMappingEntries((prev) => [...prev, { key: "", value: "" }])
                    }
                  >
                    + Add field
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {inputMappingEntries.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder="Source / System Key (e.g. topic)"
                        value={entry.key}
                        onChange={(e) => {
                          const next = [...inputMappingEntries];
                          next[idx].key = e.target.value;
                          setInputMappingEntries(next);
                        }}
                        className="h-8 text-xs font-mono"
                      />
                      <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="Module Input (e.g. topic)"
                        value={entry.value}
                        onChange={(e) => {
                          const next = [...inputMappingEntries];
                          next[idx].value = e.target.value;
                          setInputMappingEntries(next);
                        }}
                        className="h-8 text-xs font-mono"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setInputMappingEntries((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Output Mapping rows */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">Output Mapping (Module output → System context)</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() =>
                      setOutputMappingEntries((prev) => [...prev, { key: "", value: "" }])
                    }
                  >
                    + Add field
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {outputMappingEntries.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder="Module Output (e.g. research)"
                        value={entry.key}
                        onChange={(e) => {
                          const next = [...outputMappingEntries];
                          next[idx].key = e.target.value;
                          setOutputMappingEntries(next);
                        }}
                        className="h-8 text-xs font-mono"
                      />
                      <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="System Output Key (e.g. research_output)"
                        value={entry.value}
                        onChange={(e) => {
                          const next = [...outputMappingEntries];
                          next[idx].value = e.target.value;
                          setOutputMappingEntries(next);
                        }}
                        className="h-8 text-xs font-mono"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setOutputMappingEntries((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAttachModule}
              disabled={adding || loadingAvailable || availableModules.length === 0}
            >
              {adding ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Adding...
                </>
              ) : (
                "Add Module"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* DIALOG: Configure Module Reference Mappings */}
      {/* ========================================================= */}
      <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
        <DialogContent className="border-border bg-popover sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure Module Mappings</DialogTitle>
            <DialogDescription>
              Configure boundary inputs and outputs for{" "}
              <span className="font-semibold text-foreground">
                {refToConfigure?.module_name || "Module"}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          {configError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{configError}</span>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-border/40 pb-2">
            <span className="text-xs text-muted-foreground">Mode:</span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[11px]"
              onClick={() => setConfigJsonMode(!configJsonMode)}
            >
              {configJsonMode ? "Switch to Form Mode" : "Switch to JSON Mode"}
            </Button>
          </div>

          {configJsonMode ? (
            <div className="space-y-3 py-1 text-xs">
              <div>
                <label className="font-medium">Input Mapping (JSON)</label>
                <Textarea
                  rows={4}
                  className="mt-1 font-mono text-xs"
                  value={configRawInputJson}
                  onChange={(e) => setConfigRawInputJson(e.target.value)}
                  placeholder={`{\n  "topic": "topic"\n}`}
                />
              </div>
              <div>
                <label className="font-medium">Output Mapping (JSON)</label>
                <Textarea
                  rows={4}
                  className="mt-1 font-mono text-xs"
                  value={configRawOutputJson}
                  onChange={(e) => setConfigRawOutputJson(e.target.value)}
                  placeholder={`{\n  "research": "research_output"\n}`}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-1 text-xs">
              {/* Input mappings list */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium">Input Mapping (System context → Module input)</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() =>
                      setConfigInputEntries((prev) => [...prev, { key: "", value: "" }])
                    }
                  >
                    + Add field
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {configInputEntries.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder="Source / System Key"
                        value={entry.key}
                        onChange={(e) => {
                          const next = [...configInputEntries];
                          next[idx].key = e.target.value;
                          setConfigInputEntries(next);
                        }}
                        className="h-8 text-xs font-mono"
                      />
                      <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="Module Input Key"
                        value={entry.value}
                        onChange={(e) => {
                          const next = [...configInputEntries];
                          next[idx].value = e.target.value;
                          setConfigInputEntries(next);
                        }}
                        className="h-8 text-xs font-mono"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setConfigInputEntries((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Output mappings list */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium">Output Mapping (Module output → System context)</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() =>
                      setConfigOutputEntries((prev) => [...prev, { key: "", value: "" }])
                    }
                  >
                    + Add field
                  </Button>
                </div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {configOutputEntries.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder="Module Output Key"
                        value={entry.key}
                        onChange={(e) => {
                          const next = [...configOutputEntries];
                          next[idx].key = e.target.value;
                          setConfigOutputEntries(next);
                        }}
                        className="h-8 text-xs font-mono"
                      />
                      <ArrowRight className="size-3 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="System Output Key"
                        value={entry.value}
                        onChange={(e) => {
                          const next = [...configOutputEntries];
                          next[idx].value = e.target.value;
                          setConfigOutputEntries(next);
                        }}
                        className="h-8 text-xs font-mono"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setConfigOutputEntries((prev) => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfigModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveConfigure} disabled={configSaving}>
              {configSaving ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving...
                </>
              ) : (
                "Save Configuration"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================= */}
      {/* DIALOG: Confirm Remove Module Reference */}
      {/* ========================================================= */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Module Reference</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-semibold text-foreground">
                {refToRemove?.module_name || "this module"}
              </span>{" "}
              from this Prompt System?
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            <p>
              <strong>Important:</strong> This only detaches the reference from this Prompt System.
              The underlying Prompt Module will <strong>NOT</strong> be deleted and remains in your
              library.
            </p>
          </div>

          {removeError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{removeError}</span>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmRemove}
              disabled={removing}
            >
              {removing ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Removing...
                </>
              ) : (
                "Remove Module"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
