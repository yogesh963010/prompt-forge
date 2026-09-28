import { AlertCircle, Boxes, Edit2, FileCode2, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import React from "react";
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
import type { VariableDefinition } from "@/services";
import { PromptTestsSection } from "./PromptTestsSection";
import { SystemModulesSection } from "./SystemModulesSection";

export function Panel({
  title,
  description,
  action,
  onAction,
  children,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        {action && (
          <Button variant="outline" size="sm" onClick={onAction}>
            <Plus /> {action}
          </Button>
        )}
      </div>
      <div className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60">{children}</div>
    </div>
  );
}

export function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="mb-1.5 block text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

export function ModuleItem({
  name,
  description,
  enabled,
}: {
  name: string;
  description: string;
  enabled: boolean;
}) {
  return (
    <div className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60">
      <div className="flex items-center justify-between">
        <div className="grid size-8 place-items-center rounded-md bg-accent">
          <Boxes className="size-4" />
        </div>
        <Switch defaultChecked={enabled} aria-label={`Toggle ${name}`} />
      </div>
      <h3 className="mt-4 text-sm font-semibold">{name}</h3>
      <p className="mt-1 min-h-10 text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
      <Button variant="outline" size="sm" className="mt-4 w-full">
        Configure
      </Button>
    </div>
  );
}

export function ExampleItem({
  title,
  input,
  output,
  onEdit,
  onDelete,
}: {
  title: string;
  input: string;
  output: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-border/60">
      <div className="flex items-center justify-between border-b border-border/60 bg-card/60 px-4 py-2 text-xs font-semibold">
        <span>{title}</span>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-1">
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={onEdit}
              >
                <Edit2 className="mr-1 size-3" /> Edit
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-destructive"
                title="Delete example"
                onClick={onDelete}
              >
                <Trash2 className="size-3" />
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="grid gap-px bg-border/60 sm:grid-cols-2">
        <div className="bg-card/45 p-4">
          <span className="font-mono text-[10px] uppercase text-muted-foreground">Input</span>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
            {input || "(none)"}
          </pre>
        </div>
        <div className="bg-card/45 p-4">
          <span className="font-mono text-[10px] uppercase text-muted-foreground">Output</span>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">
            {output || "(none)"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TestItem({
  name,
  variables,
  expected,
}: {
  name: string;
  variables: string;
  expected: string;
}) {
  return (
    <div className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{name}</h3>
        <span className="rounded-md bg-success-soft px-2 py-0.5 font-mono text-[10px] text-success">
          Ready
        </span>
        <Button size="sm" className="ml-auto">
          Run Test
        </Button>
      </div>
      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">Variables</span>
          <p className="mt-1">{variables}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Expected Behavior</span>
          <p className="mt-1">{expected}</p>
        </div>
      </div>
    </div>
  );
}

// Tab: Overview
export function OverviewTab({
  editName,
  setEditName,
  editDescription,
  setEditDescription,
  saving,
  onSave,
  onDelete,
}: {
  editName: string;
  setEditName: (v: string) => void;
  editDescription: string;
  setEditDescription: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <Panel
      title="Overview"
      description="Basic details and configuration for this Prompt System."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="Prompt System Name"
          />
        </Field>
        <Field label="Optional Icon">
          <Button variant="outline" className="w-full justify-start">
            <FileCode2 className="mr-2 size-4" /> Technical
          </Button>
        </Field>
        <Field label="Description" wide>
          <Textarea
            rows={4}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Explain the purpose of this Prompt System..."
          />
        </Field>
        <div className="sm:col-span-2 flex items-center justify-between border-t border-border/60 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="mr-1.5 size-3.5" /> Delete Prompt System
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving || !editName.trim()}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

// Tab: Instructions
export function InstructionsTab({
  editName,
  editInstructions,
  setEditInstructions,
  saving,
  onSave,
}: {
  editName: string;
  editInstructions: string;
  setEditInstructions: (v: string) => void;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <Panel
      title="Core Instructions"
      description="Define the role, approach, and boundaries for this Prompt System. Use {variable_name} syntax for variables."
    >
      <Textarea
        className="min-h-80 font-mono text-xs leading-relaxed"
        value={editInstructions}
        onChange={(e) => setEditInstructions(e.target.value)}
        placeholder="You are an expert assistant. Write an article about {topic} for {audience}..."
      />
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          Tip: Reference variables with single curly braces like <code className="text-primary font-mono">&#123;variable&#125;</code>.
        </span>
        <Button size="sm" onClick={onSave} disabled={saving || !editName.trim()}>
          {saving ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving...
            </>
          ) : (
            "Save Instructions"
          )}
        </Button>
      </div>
    </Panel>
  );
}

// Tab: Modules
export function ModulesTab({
  promptSystemId,
  onNavigateToModules,
}: {
  editModules?: unknown[];
  promptSystemId?: number | null;
  onNavigateToModules?: () => void;
}) {
  return (
    <Panel
      title="Prompt Modules"
      description="Attach and configure reusable prompt modules with defined boundary inputs and outputs."
    >
      <SystemModulesSection
        promptSystemId={promptSystemId ?? null}
        onNavigateToModules={onNavigateToModules}
      />
    </Panel>
  );
}

// Tab: Examples
export function ExamplesTab({
  editExamples,
  setEditExamples,
  saving,
  onSave,
}: {
  editExamples: unknown[];
  setEditExamples?: (val: unknown[]) => void;
  saving?: boolean;
  onSave?: () => void;
}) {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editIndex, setEditIndex] = React.useState<number | null>(null);
  const [exTitle, setExTitle] = React.useState("");
  const [exInput, setExInput] = React.useState("");
  const [exOutput, setExOutput] = React.useState("");

  const handleOpenAdd = () => {
    setEditIndex(null);
    setExTitle("");
    setExInput("");
    setExOutput("");
    setModalOpen(true);
  };

  const handleOpenEdit = (idx: number) => {
    const item = editExamples[idx];
    const exObj = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null;
    setEditIndex(idx);
    setExTitle(typeof exObj?.title === "string" ? exObj.title : `Example ${idx + 1}`);
    setExInput(
      typeof exObj?.input === "string"
        ? exObj.input
        : exObj?.input
          ? JSON.stringify(exObj.input, null, 2)
          : typeof item === "string"
            ? item
            : ""
    );
    setExOutput(
      typeof exObj?.output === "string"
        ? exObj.output
        : exObj?.output
          ? JSON.stringify(exObj.output, null, 2)
          : ""
    );
    setModalOpen(true);
  };

  const handleDelete = (idx: number) => {
    if (!setEditExamples) return;
    const next = [...editExamples];
    next.splice(idx, 1);
    setEditExamples(next);
  };

  const handleSaveModal = () => {
    if (!setEditExamples) return;
    const next = [...editExamples];
    const newEx = {
      title: exTitle.trim() || undefined,
      input: exInput,
      output: exOutput,
    };
    if (editIndex !== null && editIndex >= 0) {
      next[editIndex] = newEx;
    } else {
      next.push(newEx);
    }
    setEditExamples(next);
    setModalOpen(false);
  };

  return (
    <>
      <Panel
        title="Input / Output Examples"
        description="Demonstrate the response pattern and structure you expect."
        action={setEditExamples ? "Add Example" : undefined}
        onAction={handleOpenAdd}
      >
        <div className="space-y-3">
          {editExamples && editExamples.length > 0 ? (
            editExamples.map((ex, idx) => {
              const exObj = typeof ex === "object" && ex !== null ? (ex as { title?: string; input?: unknown; output?: unknown }) : null;
              const inputStr = typeof exObj?.input === "string" ? exObj.input : (exObj?.input ? JSON.stringify(exObj.input, null, 2) : (typeof ex === "string" ? ex : ""));
              const outputStr = typeof exObj?.output === "string" ? exObj.output : (exObj?.output ? JSON.stringify(exObj.output, null, 2) : "");
              return (
                <ExampleItem
                  key={idx}
                  title={exObj?.title || `Example ${idx + 1}`}
                  input={inputStr}
                  output={outputStr}
                  onEdit={setEditExamples ? () => handleOpenEdit(idx) : undefined}
                  onDelete={setEditExamples ? () => handleDelete(idx) : undefined}
                />
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-border/80 py-8 text-center">
              <p className="text-xs text-muted-foreground">
                No examples added yet. Examples help align model responses with your expected format.
              </p>
              {setEditExamples && (
                <Button size="sm" variant="outline" className="mt-3 gap-1.5 text-xs" onClick={handleOpenAdd}>
                  <Plus className="size-3.5" /> Add First Example
                </Button>
              )}
            </div>
          )}
        </div>

        {onSave && (
          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={onSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving...
                </>
              ) : (
                "Save Examples"
              )}
            </Button>
          </div>
        )}
      </Panel>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editIndex !== null ? "Edit Example" : "Add Example"}</DialogTitle>
            <DialogDescription>
              Demonstrate input structure and corresponding ideal output.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="font-medium text-foreground">Title (optional)</label>
              <Input
                className="mt-1"
                placeholder="e.g. Technical blog post"
                value={exTitle}
                onChange={(e) => setExTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="font-medium text-foreground">Input</label>
              <Textarea
                className="mt-1 font-mono text-xs"
                rows={4}
                placeholder="e.g. topic = 'tokio'\naudience = 'engineers'"
                value={exInput}
                onChange={(e) => setExInput(e.target.value)}
              />
            </div>
            <div>
              <label className="font-medium text-foreground">Output</label>
              <Textarea
                className="mt-1 font-mono text-xs"
                rows={4}
                placeholder="e.g. Expected assistant response format"
                value={exOutput}
                onChange={(e) => setExOutput(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveModal}>
              {editIndex !== null ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Tab: Output
export function OutputTab({
  editName,
  editOutputFormat,
  setEditOutputFormat,
  saving,
  onSave,
}: {
  editName: string;
  editOutputFormat: unknown;
  setEditOutputFormat: (val: unknown) => void;
  saving: boolean;
  onSave: () => void;
}) {
  const detectType = (val: unknown): "text" | "object" | "list" => {
    if (Array.isArray(val)) return "list";
    if (typeof val === "object" && val !== null) return "object";
    return "text";
  };

  const [outputType, setOutputType] = React.useState<"text" | "object" | "list">(() =>
    detectType(editOutputFormat)
  );

  const [content, setContent] = React.useState<string>(() => {
    if (typeof editOutputFormat === "string") return editOutputFormat;
    if (editOutputFormat && typeof editOutputFormat === "object") {
      return JSON.stringify(editOutputFormat, null, 2);
    }
    return "Return clean Markdown.\n\n- Start with a three-bullet summary\n- Use descriptive H2 and H3 headings\n- Include runnable code blocks where useful\n- Target 1,000–1,400 words\n- End with practical next steps";
  });

  const [validationError, setValidationError] = React.useState<string | null>(null);

  // Sync content and type when external editOutputFormat changes
  React.useEffect(() => {
    const detected = detectType(editOutputFormat);
    setOutputType(detected);
    if (typeof editOutputFormat === "string") {
      setContent(editOutputFormat);
    } else if (editOutputFormat && typeof editOutputFormat === "object") {
      setContent(JSON.stringify(editOutputFormat, null, 2));
    }
  }, [editOutputFormat]);

  const handleTypeChange = (newType: "text" | "object" | "list") => {
    setOutputType(newType);
    setValidationError(null);
    if (newType === "object") {
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
          return;
        }
      } catch {
        // fallback to sample object
      }
      setContent('{\n  "name": "yogesh"\n}');
    } else if (newType === "list") {
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return;
        }
      } catch {
        // fallback to sample list
      }
      setContent('[\n  "summary",\n  "headings",\n  "code"\n]');
    } else {
      if (content.trim().startsWith("{") || content.trim().startsWith("[")) {
        setContent(
          "Return clean Markdown.\n\n- Start with a three-bullet summary\n- Use descriptive H2 and H3 headings\n- Include runnable code blocks where useful\n- Target 1,000–1,400 words\n- End with practical next steps"
        );
      }
    }
  };

  const handleSave = () => {
    setValidationError(null);
    if (outputType === "object") {
      try {
        const parsed = JSON.parse(content);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setValidationError(
            'Output format must be a valid JSON Object (e.g. { "name": "yogesh" }).'
          );
          return;
        }
        setEditOutputFormat(parsed);
      } catch (err: unknown) {
        setValidationError("Invalid JSON syntax. Please check braces, quotes, and commas.");
        return;
      }
    } else if (outputType === "list") {
      try {
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) {
          setValidationError(
            'Output format must be a valid JSON List (e.g. [ "summary", "headings", "code" ]).'
          );
          return;
        }
        setEditOutputFormat(parsed);
      } catch (err: unknown) {
        setValidationError("Invalid JSON syntax. Please check brackets, quotes, and commas.");
        return;
      }
    } else {
      setEditOutputFormat(content);
    }

    onSave();
  };

  return (
    <Panel
      title="Output Format"
      description="Define the expected structure and format for final model responses."
    >
      <div className="space-y-4">
        {/* Type Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium">Format Type:</span>
          <div className="flex items-center rounded-lg bg-muted/60 p-0.5 ring-1 ring-border/60">
            <button
              type="button"
              onClick={() => handleTypeChange("text")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                outputType === "text"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Text
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange("object")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                outputType === "object"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Object
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange("list")}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                outputType === "list"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              List
            </button>
          </div>

          <span className="text-[11px] text-muted-foreground">
            {outputType === "text" && "Plain string or Markdown instructions."}
            {outputType === "object" && "Valid JSON object dictionary (e.g. { ... })."}
            {outputType === "list" && "Valid JSON array list (e.g. [ ... ])."}
          </span>
        </div>

        {/* Validation error banner */}
        {validationError && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Content Editor */}
        <div>
          <label className="mb-1.5 block text-xs font-medium">
            {outputType === "text"
              ? "Content Instructions"
              : outputType === "object"
                ? "JSON Object Schema / Specification"
                : "JSON List Specification"}
          </label>
          <Textarea
            className="min-h-80 font-mono text-xs leading-relaxed"
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder={
              outputType === "text"
                ? "Return clean Markdown..."
                : outputType === "object"
                  ? '{\n  "name": "yogesh"\n}'
                  : '[\n  "summary",\n  "headings",\n  "code"\n]'
            }
          />
        </div>

        {/* Save button */}
        <div className="flex items-center justify-between border-t border-border/60 pt-3">
          <span className="text-[11px] text-muted-foreground">
            {outputType !== "text" && "JSON syntax is automatically validated before saving."}
          </span>
          <Button size="sm" onClick={handleSave} disabled={saving || !editName.trim()}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving...
              </>
            ) : (
              "Save Output Format"
            )}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

// Tab: Tests
export function TestsTab({
  promptSystemId,
  systemVariables = [],
}: {
  promptSystemId?: number | null;
  systemVariables?: VariableDefinition[];
}) {
  return (
    <PromptTestsSection
      promptSystemId={promptSystemId ?? null}
      systemVariables={systemVariables}
    />
  );
}

// Tab: Versions
export function VersionsTab() {
  return (
    <Panel
      title="Versions"
      description="Review and restore earlier Prompt System revisions."
    >
      <div className="overflow-hidden rounded-lg ring-1 ring-border/60">
        {[
          ["v1.0", "Current version", "Active deployment revision"],
        ].map(([version, date, note]) => (
          <div
            key={version}
            className="grid gap-2 border-b border-border/60 bg-card/50 p-4 last:border-0 sm:grid-cols-[60px_130px_1fr_auto] sm:items-center"
          >
            <span className="font-mono text-xs font-semibold">{version}</span>
            <span className="text-xs text-muted-foreground">{date}</span>
            <span className="text-sm">{note}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm">
                View
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
