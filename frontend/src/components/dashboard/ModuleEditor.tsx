import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Code2,
  FileCode2,
  ListPlus,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import React, { useMemo, useState } from "react";
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
import type { PromptModule, VariableDefinition } from "@/services";
import { ExampleItem } from "./EditorTabs";
import {
  DeleteVariableDialog,
  VariableCard,
  VariableModal,
} from "./VariablesSection";

interface ModuleEditorProps {
  module: PromptModule | null;
  moduleId: number | null;
  isNew: boolean;
  saving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  onSave: (payload: {
    name: string;
    description: string;
    instructions: string;
    variables: VariableDefinition[];
    input_context: string[];
    output_contract: string;
    examples: Array<{ title?: string; input: string; output: string }>;
  }) => void;
  onDelete?: () => void;
  onBack: () => void;
}

type ModuleTab = "overview" | "instructions" | "variables" | "context" | "contract" | "examples";

export function ModuleEditor({
  module,
  isNew,
  saving,
  saveError,
  saveSuccess,
  onSave,
  onDelete,
  onBack,
}: ModuleEditorProps) {
  const [activeTab, setActiveTab] = useState<ModuleTab>("instructions");

  // Editable fields
  const [name, setName] = useState(module?.name || "");
  const [description, setDescription] = useState(module?.description || "");
  const [instructions, setInstructions] = useState(module?.instructions || "");
  const [variables, setVariables] = useState<VariableDefinition[]>(() => {
    if (Array.isArray(module?.variables)) {
      return module.variables as VariableDefinition[];
    }
    return [];
  });

  // Input context state (array of strings)
  const [inputContext, setInputContext] = useState<string[]>(() => {
    if (Array.isArray(module?.input_context)) {
      return module.input_context.map(String);
    }
    if (module?.input_context && typeof module.input_context === "object") {
      return Object.keys(module.input_context);
    }
    return ["parent_variables", "previous_module_output"];
  });
  const [newContextKey, setNewContextKey] = useState("");

  // Output contract state
  const [outputContract, setOutputContract] = useState<string>(() => {
    if (typeof module?.output_contract === "string") return module.output_contract;
    if (module?.output_contract && typeof module.output_contract === "object") {
      return JSON.stringify(module.output_contract, null, 2);
    }
    return "";
  });

  // Examples state
  const [examples, setExamples] = useState<
    Array<{ title?: string; input: string; output: string }>
  >(() => {
    if (Array.isArray(module?.examples)) {
      return module.examples.map((ex) => {
        const exObj = typeof ex === "object" && ex !== null ? (ex as Record<string, unknown>) : null;
        return {
          title: typeof exObj?.title === "string" ? exObj.title : undefined,
          input:
            typeof exObj?.input === "string"
              ? exObj.input
              : exObj?.input
                ? JSON.stringify(exObj.input, null, 2)
                : typeof ex === "string"
                  ? ex
                  : "",
          output:
            typeof exObj?.output === "string"
              ? exObj.output
              : exObj?.output
                ? JSON.stringify(exObj.output, null, 2)
                : "",
        };
      });
    }
    return [];
  });

  // Example Dialog state
  const [exampleModalOpen, setExampleModalOpen] = useState(false);
  const [exampleEditIdx, setExampleEditIdx] = useState<number | null>(null);
  const [exTitle, setExTitle] = useState("");
  const [exInput, setExInput] = useState("");
  const [exOutput, setExOutput] = useState("");

  // Variable Dialog state (reusing exact same structure)
  const [variableModalOpen, setVariableModalOpen] = useState(false);
  const [variableModalMode, setVariableModalMode] = useState<"add" | "edit">("add");
  const [editingVarIndex, setEditingVarIndex] = useState<number | null>(null);
  const [varName, setVarName] = useState("");
  const [varLabel, setVarLabel] = useState("");
  const [varType, setVarType] = useState("text");
  const [varRequired, setVarRequired] = useState(true);
  const [varDefault, setVarDefault] = useState("");
  const [varDescription, setVarDescription] = useState("");
  const [varError, setVarError] = useState<string | null>(null);

  // Variable delete dialog
  const [deleteVarDialogOpen, setDeleteVarDialogOpen] = useState(false);
  const [varToDelete, setVarToDelete] = useState<VariableDefinition | null>(null);

  // Variable detection from instructions
  const detectedVariables = useMemo(() => {
    if (!instructions) return [];
    const matches = instructions.match(/\{([a-zA-Z0-9_]+)\}/g);
    if (!matches) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const m of matches) {
      const clean = m.slice(1, -1);
      if (!seen.has(clean)) {
        seen.add(clean);
        result.append ? result.append(clean) : result.push(clean);
      }
    }
    return result;
  }, [instructions]);

  const configuredNames = useMemo(() => {
    return new Set(variables.map((v) => v.name));
  }, [variables]);

  const missingVariables = useMemo(() => {
    return detectedVariables.filter((d) => !configuredNames.has(d));
  }, [detectedVariables, configuredNames]);

  // Context preset toggles
  const standardContexts = [
    { key: "parent_variables", label: "Parent Variables", desc: "Access variables defined in the Prompt System" },
    { key: "parent_instructions", label: "Parent Instructions", desc: "Access the overarching prompt instructions" },
    { key: "previous_module_output", label: "Previous Module Output", desc: "Receive the result from the previous module" },
    { key: "user_input", label: "User Input", desc: "Direct input provided by end-user at runtime" },
  ];

  const toggleContext = (key: string) => {
    if (inputContext.includes(key)) {
      setInputContext(inputContext.filter((k) => k !== key));
    } else {
      setInputContext([...inputContext, key]);
    }
  };

  const addCustomContext = () => {
    const trimmed = newContextKey.trim();
    if (!trimmed) return;
    if (!inputContext.includes(trimmed)) {
      setInputContext([...inputContext, trimmed]);
    }
    setNewContextKey("");
  };

  const removeContext = (key: string) => {
    setInputContext(inputContext.filter((k) => k !== key));
  };

  // Variable Management handlers
  const handleOpenAddVariable = (prefillName?: string) => {
    setVariableModalMode("add");
    setEditingVarIndex(null);
    setVarName(prefillName || "");
    setVarLabel(prefillName ? prefillName.charAt(0).toUpperCase() + prefillName.slice(1) : "");
    setVarType("text");
    setVarRequired(true);
    setVarDefault("");
    setVarDescription("");
    setVarError(null);
    setVariableModalOpen(true);
  };

  const handleOpenEditVariable = (v: VariableDefinition, idx: number) => {
    setVariableModalMode("edit");
    setEditingVarIndex(idx);
    setVarName(v.name);
    setVarLabel(v.label || v.name);
    setVarType(v.type || "text");
    setVarRequired(v.required ?? true);
    setVarDefault(v.default !== undefined && v.default !== null ? String(v.default) : "");
    setVarDescription(v.description || "");
    setVarError(null);
    setVariableModalOpen(true);
  };

  const handleSaveVariable = () => {
    const trimmedName = varName.trim();
    if (!trimmedName) {
      setVarError("Variable name cannot be empty.");
      return;
    }
    if (trimmedName.includes(" ")) {
      setVarError("Variable name cannot contain spaces.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedName)) {
      setVarError("Variable name can only contain letters, numbers, and underscores.");
      return;
    }

    // Check duplicate
    const isDuplicate = variables.some(
      (v, idx) => v.name === trimmedName && (variableModalMode === "add" || idx !== editingVarIndex)
    );
    if (isDuplicate) {
      setVarError(`Variable "${trimmedName}" already exists in this module.`);
      return;
    }

    const newDef: VariableDefinition = {
      name: trimmedName,
      label: varLabel.trim() || trimmedName,
      type: varType,
      required: varRequired,
      default: varDefault.trim() !== "" ? varDefault : undefined,
      description: varDescription.trim() || undefined,
    };

    if (variableModalMode === "add") {
      setVariables([...variables, newDef]);
    } else if (editingVarIndex !== null && editingVarIndex >= 0) {
      const next = [...variables];
      next[editingVarIndex] = newDef;
      setVariables(next);
    }

    setVariableModalOpen(false);
  };

  const handleDeleteVariable = () => {
    if (!varToDelete) return;
    setVariables(variables.filter((v) => v.name !== varToDelete.name));
    setDeleteVarDialogOpen(false);
    setVarToDelete(null);
  };

  // Example handlers
  const handleOpenAddExample = () => {
    setExampleEditIdx(null);
    setExTitle("");
    setExInput("");
    setExOutput("");
    setExampleModalOpen(true);
  };

  const handleOpenEditExample = (idx: number) => {
    const item = examples[idx];
    setExampleEditIdx(idx);
    setExTitle(item.title || `Example ${idx + 1}`);
    setExInput(item.input);
    setExOutput(item.output);
    setExampleModalOpen(true);
  };

  const handleDeleteExample = (idx: number) => {
    setExamples(examples.filter((_, i) => i !== idx));
  };

  const handleSaveExample = () => {
    const item = {
      title: exTitle.trim() || undefined,
      input: exInput,
      output: exOutput,
    };
    if (exampleEditIdx !== null && exampleEditIdx >= 0) {
      const next = [...examples];
      next[exampleEditIdx] = item;
      setExamples(next);
    } else {
      setExamples([...examples, item]);
    }
    setExampleModalOpen(false);
  };

  // Save Module
  const handleFormSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim()) {
      setActiveTab("overview");
      return;
    }

    onSave({
      name: name.trim(),
      description: description.trim(),
      instructions,
      variables,
      input_context: inputContext,
      output_contract: outputContract,
      examples,
    });
  };

  return (
    <div className="pf-fade mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-1.5 size-4" /> Back to Modules
          </Button>
          <div className="h-4 w-px bg-border/60" />
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-md bg-accent text-accent-foreground">
              <Boxes className="size-4" />
            </div>
            <h1 className="text-base font-semibold">
              {isNew ? "Create Prompt Module" : name || "Edit Module"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isNew && onDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="mr-1.5 size-3.5" /> Delete Module
            </Button>
          )}
          <Button size="sm" onClick={() => handleFormSubmit()} disabled={saving || !name.trim()}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving...
              </>
            ) : isNew ? (
              "Create Module"
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>

      {/* Save Success / Error banners */}
      {saveSuccess && (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-xs font-medium text-success">
          <CheckCircle2 className="size-4" />
          <span>Module saved successfully.</span>
        </div>
      )}
      {saveError && (
        <div className="mt-4 flex items-center gap-2 rounded-md bg-destructive/15 px-3 py-2 text-xs font-medium text-destructive">
          <AlertCircle className="size-4" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="mt-5 flex flex-wrap gap-1 border-b border-border/60 pb-2">
        <Button
          variant={activeTab === "instructions" ? "secondary" : "ghost"}
          size="sm"
          className="text-xs"
          onClick={() => setActiveTab("instructions")}
        >
          Instructions
        </Button>
        <Button
          variant={activeTab === "variables" ? "secondary" : "ghost"}
          size="sm"
          className="text-xs"
          onClick={() => setActiveTab("variables")}
        >
          Variables ({variables.length})
        </Button>
        <Button
          variant={activeTab === "context" ? "secondary" : "ghost"}
          size="sm"
          className="text-xs"
          onClick={() => setActiveTab("context")}
        >
          Input Context ({inputContext.length})
        </Button>
        <Button
          variant={activeTab === "contract" ? "secondary" : "ghost"}
          size="sm"
          className="text-xs"
          onClick={() => setActiveTab("contract")}
        >
          Output Contract
        </Button>
        <Button
          variant={activeTab === "examples" ? "secondary" : "ghost"}
          size="sm"
          className="text-xs"
          onClick={() => setActiveTab("examples")}
        >
          Examples ({examples.length})
        </Button>
        <Button
          variant={activeTab === "overview" ? "secondary" : "ghost"}
          size="sm"
          className="text-xs"
          onClick={() => setActiveTab("overview")}
        >
          Settings
        </Button>
      </div>

      {/* TAB: Instructions */}
      {activeTab === "instructions" && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60">
            <h2 className="text-sm font-semibold">Module Instructions</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Define the specialized prompt instructions executed by this module. Use{" "}
              <code className="text-primary font-mono">&#123;variable_name&#125;</code> for parameters.
            </p>

            <Textarea
              className="mt-3 min-h-72 font-mono text-xs leading-relaxed"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Research {topic} and summarize key findings, trade-offs, and architecture..."
            />

            {/* Variable detection in instructions */}
            <div className="mt-3 rounded-md bg-muted/40 p-3 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <span className="font-semibold">Detected in Instructions:</span>
                {detectedVariables.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {detectedVariables.map((v) => (
                      <code
                        key={v}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-primary"
                      >
                        &#123;{v}&#125;
                      </code>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground text-[11px]">
                    No &#123;variables&#125; detected yet.
                  </span>
                )}
              </div>

              {missingVariables.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-destructive">
                  <span>Used in instructions but missing from module variables:</span>
                  {missingVariables.map((mv) => (
                    <Button
                      key={mv}
                      variant="outline"
                      size="sm"
                      className="h-6 gap-1 px-1.5 text-[10px] text-destructive hover:bg-card border-destructive/30"
                      onClick={() => handleOpenAddVariable(mv)}
                    >
                      <Plus className="size-2.5" /> Add &#123;{mv}&#125;
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Variables */}
      {activeTab === "variables" && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Module Variables</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Define parameters expected by this module during compilation and execution.
              </p>
            </div>
            <Button size="sm" onClick={() => handleOpenAddVariable()}>
              <Plus className="mr-1.5 size-3.5" /> Add Variable
            </Button>
          </div>

          {variables.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-card/25 p-8 text-center">
              <p className="text-xs text-muted-foreground">
                No variables defined for this module yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => handleOpenAddVariable()}
              >
                <Plus className="mr-1.5 size-3.5" /> Add First Variable
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {variables.map((v, idx) => (
                <VariableCard
                  key={v.name}
                  variable={v}
                  onEdit={() => handleOpenEditVariable(v, idx)}
                  onDelete={() => {
                    setVarToDelete(v);
                    setDeleteVarDialogOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: Input Context */}
      {activeTab === "context" && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60">
            <h2 className="text-sm font-semibold">Input Context Boundaries</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Explicitly specify what external context and upstream inputs this module is allowed to
              receive.
            </p>

            {/* Standard preset toggles */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {standardContexts.map(({ key, label, desc }) => {
                const isSelected = inputContext.includes(key);
                return (
                  <div
                    key={key}
                    onClick={() => toggleContext(key)}
                    className={`cursor-pointer rounded-lg p-3 ring-1 transition ${
                      isSelected
                        ? "bg-primary/10 ring-primary/60"
                        : "bg-muted/30 ring-border/50 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{label}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isSelected ? "Active" : "Excluded"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Custom context keys */}
            <div className="mt-5 border-t border-border/60 pt-4">
              <span className="mb-1 block text-xs font-medium">Custom Context Inputs</span>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Add specific input keys expected by this module (e.g. <code>topic</code>,{" "}
                <code>user_goal</code>).
              </p>

              <div className="flex gap-2">
                <Input
                  className="max-w-xs text-xs font-mono"
                  placeholder="e.g. topic"
                  value={newContextKey}
                  onChange={(e) => setNewContextKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomContext();
                    }
                  }}
                />
                <Button size="sm" variant="outline" onClick={addCustomContext}>
                  <Plus className="mr-1 size-3" /> Add Context
                </Button>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {inputContext.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-xs"
                  >
                    <span>{c}</span>
                    <button
                      type="button"
                      onClick={() => removeContext(c)}
                      className="text-muted-foreground hover:text-destructive"
                      title={`Remove ${c}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Output Contract */}
      {activeTab === "contract" && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60">
            <h2 className="text-sm font-semibold">Output Contract</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Define the schema or specification of the expected output returned by this module
              (e.g. concise findings, JSON payload, or structured Markdown).
            </p>

            <Textarea
              className="mt-3 min-h-60 font-mono text-xs leading-relaxed"
              value={outputContract}
              onChange={(e) => setOutputContract(e.target.value)}
              placeholder="Return concise research findings with clear headings, bullet points, and citations."
            />
          </div>
        </div>
      )}

      {/* TAB: Examples */}
      {activeTab === "examples" && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Input / Output Examples</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Provide sample inputs and corresponding expected module outputs.
              </p>
            </div>
            <Button size="sm" onClick={handleOpenAddExample}>
              <Plus className="mr-1.5 size-3.5" /> Add Example
            </Button>
          </div>

          {examples.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/80 bg-card/25 p-8 text-center">
              <p className="text-xs text-muted-foreground">
                No examples added to this module yet.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleOpenAddExample}
              >
                <Plus className="mr-1.5 size-3.5" /> Add First Example
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {examples.map((ex, idx) => (
                <ExampleItem
                  key={idx}
                  title={ex.title || `Example ${idx + 1}`}
                  input={ex.input}
                  output={ex.output}
                  onEdit={() => handleOpenEditExample(idx)}
                  onDelete={() => handleDeleteExample(idx)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: Settings & Overview */}
      {activeTab === "overview" && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60">
            <h2 className="text-sm font-semibold">Basic Information</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Module name and high-level description.
            </p>

            <div className="mt-4 space-y-3 max-w-xl">
              <div>
                <label className="mb-1 block text-xs font-medium">Module Name *</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Research, Critic, Summarizer"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">Description</label>
                <Textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Researches a given topic and creates a fact checklist."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Variable Modal */}
      <VariableModal
        open={variableModalOpen}
        onOpenChange={setVariableModalOpen}
        mode={variableModalMode}
        varName={varName}
        setVarName={setVarName}
        varLabel={varLabel}
        setVarLabel={setVarLabel}
        varType={varType}
        setVarType={setVarType}
        varRequired={varRequired}
        setVarRequired={setVarRequired}
        varDefault={varDefault}
        setVarDefault={setVarDefault}
        varDescription={varDescription}
        setVarDescription={setVarDescription}
        saving={false}
        error={varError}
        onSubmit={handleSaveVariable}
      />

      {/* Delete Variable Dialog */}
      <DeleteVariableDialog
        open={deleteVarDialogOpen}
        onOpenChange={setDeleteVarDialogOpen}
        variable={varToDelete}
        deleting={false}
        error={null}
        onConfirm={handleDeleteVariable}
      />

      {/* Example Modal */}
      <Dialog open={exampleModalOpen} onOpenChange={setExampleModalOpen}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {exampleEditIdx !== null ? "Edit Example" : "Add Example"}
            </DialogTitle>
            <DialogDescription>
              Demonstrate module input structure and ideal returned output.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1 text-xs">
            <div>
              <label className="font-medium text-foreground">Title (optional)</label>
              <Input
                className="mt-1"
                placeholder="e.g. AI agents research"
                value={exTitle}
                onChange={(e) => setExTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="font-medium text-foreground">Input</label>
              <Textarea
                className="mt-1 font-mono text-xs"
                rows={3}
                placeholder="e.g. AI agents"
                value={exInput}
                onChange={(e) => setExInput(e.target.value)}
              />
            </div>
            <div>
              <label className="font-medium text-foreground">Output</label>
              <Textarea
                className="mt-1 font-mono text-xs"
                rows={3}
                placeholder="e.g. Research findings about AI agents"
                value={exOutput}
                onChange={(e) => setExOutput(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExampleModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveExample}>
              {exampleEditIdx !== null ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
