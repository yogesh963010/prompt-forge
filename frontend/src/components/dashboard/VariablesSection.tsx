import { AlertCircle, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
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
import type { VariableDefinition, VariableValidationResponse } from "@/services";

interface VariableCardProps {
  variable: VariableDefinition;
  onEdit: () => void;
  onDelete: () => void;
}

export function VariableCard({ variable, onEdit, onDelete }: VariableCardProps) {
  const displayType =
    variable.type ? variable.type.charAt(0).toUpperCase() + variable.type.slice(1) : "Text";

  return (
    <div className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60 transition hover:bg-card/70">
      <div className="flex flex-wrap items-center gap-2">
        <code className="text-xs font-semibold text-primary">{`{{${variable.name}}}`}</code>
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px]">{displayType}</span>
        {variable.required && (
          <span className="rounded-md bg-primary-soft px-2 py-0.5 font-mono text-[10px] text-primary">
            Required
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onEdit}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            title="Delete variable"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
        <div>
          <span className="text-muted-foreground">Label</span>
          <p className="mt-1 font-medium">{variable.label || variable.name}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Default</span>
          <p className="mt-1 font-medium font-mono text-[11px]">
            {variable.default !== undefined && variable.default !== null && String(variable.default) !== ""
              ? String(variable.default)
              : "None"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Description</span>
          <p className="mt-1 font-medium text-muted-foreground">
            {variable.description || "None"}
          </p>
        </div>
      </div>
    </div>
  );
}

interface VariableDetectionBannerProps {
  validationResult: VariableValidationResponse | null;
  validating: boolean;
  onValidate: () => void;
  onQuickAdd: (name: string) => void;
}

export function VariableDetectionBanner({
  validationResult,
  validating,
  onValidate,
  onQuickAdd,
}: VariableDetectionBannerProps) {
  return (
    <div className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="text-xs font-semibold">Variables Validation & Detection</h3>
          {validating ? (
            <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Validating...
            </span>
          ) : validationResult ? (
            <span
              className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                validationResult.valid
                  ? "bg-success-soft text-success"
                  : "bg-destructive/15 text-destructive"
              }`}
            >
              Status: {validationResult.valid ? "Valid" : "Invalid"}
            </span>
          ) : null}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={onValidate}
          disabled={validating}
        >
          <RefreshCw className={`mr-1.5 size-3 ${validating ? "animate-spin" : ""}`} />
          Validate Variables
        </Button>
      </div>

      {validationResult ? (
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {/* Detected */}
          <div className="rounded-md bg-muted/40 p-2.5">
            <span className="font-mono text-[10px] uppercase text-muted-foreground block mb-1.5">
              Detected
            </span>
            {validationResult.detected_variables.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {validationResult.detected_variables.map((v) => (
                  <code
                    key={v}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-primary"
                  >
                    &#123;{v}&#125;
                  </code>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">None</span>
            )}
          </div>

          {/* Configured */}
          <div className="rounded-md bg-muted/40 p-2.5">
            <span className="font-mono text-[10px] uppercase text-muted-foreground block mb-1.5">
              Configured
            </span>
            {validationResult.configured_variables.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {validationResult.configured_variables.map((v) => (
                  <span
                    key={v}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                  >
                    {v}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">None</span>
            )}
          </div>

          {/* Missing */}
          <div
            className={`rounded-md p-2.5 ${
              validationResult.missing_variables.length > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-muted/40"
            }`}
          >
            <span className="font-mono text-[10px] uppercase text-muted-foreground block mb-1.5">
              Missing
            </span>
            {validationResult.missing_variables.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {validationResult.missing_variables.map((mv) => (
                  <Button
                    key={mv}
                    variant="outline"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-[10px] text-destructive hover:bg-card border-destructive/30"
                    onClick={() => onQuickAdd(mv)}
                  >
                    <Plus className="size-2.5" /> &#123;{mv}&#125;
                  </Button>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">None</span>
            )}
          </div>

          {/* Unused */}
          <div className="rounded-md bg-muted/40 p-2.5">
            <span className="font-mono text-[10px] uppercase text-muted-foreground block mb-1.5">
              Unused
            </span>
            {validationResult.unused_variables.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {validationResult.unused_variables.map((uv) => (
                  <span
                    key={uv}
                    className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {uv}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-muted-foreground">None</span>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">
          Click &ldquo;Validate Variables&rdquo; to verify configured variables against{" "}
          <code className="text-primary font-mono">&#123;variable&#125;</code> placeholders in
          instructions.
        </div>
      )}
    </div>
  );
}

interface VariableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  varName: string;
  setVarName: (name: string) => void;
  varLabel: string;
  setVarLabel: (label: string) => void;
  varType: string;
  setVarType: (type: string) => void;
  varRequired: boolean;
  setVarRequired: (req: boolean) => void;
  varDefault: string;
  setVarDefault: (val: string) => void;
  varDescription: string;
  setVarDescription: (desc: string) => void;
  saving: boolean;
  error: string | null;
  onSubmit: () => void;
}

export function VariableModal({
  open,
  onOpenChange,
  mode,
  varName,
  setVarName,
  varLabel,
  setVarLabel,
  varType,
  setVarType,
  varRequired,
  setVarRequired,
  varDefault,
  setVarDefault,
  varDescription,
  setVarDescription,
  saving,
  error,
  onSubmit,
}: VariableModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Variable" : "Edit Variable"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Define a parameter available for substitution in instructions."
              : "Update variable configuration and default values."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-3.5"
        >
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Variable Name *</label>
            <Input
              placeholder="e.g. audience_type"
              className="bg-card/70 font-mono text-xs"
              value={varName}
              onChange={(e) => setVarName(e.target.value)}
              disabled={saving}
            />
            <p className="text-[10px] text-muted-foreground">
              Used in instructions as <code>&#123;{varName.trim() || "name"}&#125;</code>. Alphanumeric and underscores only.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Display Label</label>
            <Input
              placeholder="e.g. Target Audience"
              className="bg-card/70 text-xs"
              value={varLabel}
              onChange={(e) => setVarLabel(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Type</label>
              <select
                aria-label="Variable Type"
                value={varType}
                onChange={(e) => setVarType(e.target.value)}
                className="w-full rounded-md border border-input bg-card/70 px-3 py-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={saving}
              >
                <option value="text">Text / String</option>
                <option value="number">Number</option>
                <option value="integer">Integer</option>
                <option value="boolean">Boolean</option>
                <option value="select">Select</option>
                <option value="multiline">Multiline</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Required</label>
              <div className="flex h-8 items-center gap-2">
                <Switch
                  checked={varRequired}
                  onCheckedChange={setVarRequired}
                  disabled={saving}
                  id="var-required-toggle"
                />
                <label
                  htmlFor="var-required-toggle"
                  className="cursor-pointer text-xs text-muted-foreground"
                >
                  {varRequired ? "Mandatory" : "Optional"}
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Default Value (optional)</label>
            {varType === "multiline" ? (
              <Textarea
                placeholder="Default multiline value..."
                className="bg-card/70 text-xs min-h-[60px]"
                value={varDefault}
                onChange={(e) => setVarDefault(e.target.value)}
                disabled={saving}
              />
            ) : (
              <Input
                placeholder="e.g. Technical Professionals"
                className="bg-card/70 text-xs"
                value={varDefault}
                onChange={(e) => setVarDefault(e.target.value)}
                disabled={saving}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Description (optional)</label>
            <Input
              placeholder="Provide context or guidance for this variable..."
              className="bg-card/70 text-xs"
              value={varDescription}
              onChange={(e) => setVarDescription(e.target.value)}
              disabled={saving}
            />
          </div>

          <DialogFooter className="gap-2 sm:space-x-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !varName.trim()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                mode === "add" ? "Add Variable" : "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteVariableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variable: VariableDefinition | null;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
}

export function DeleteVariableDialog({
  open,
  onOpenChange,
  variable,
  deleting,
  error,
  onConfirm,
}: DeleteVariableDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-5" />
            Delete Variable
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete variable{" "}
            <span className="font-semibold text-foreground font-mono">
              “{variable?.name}”
            </span>
            ? Any prompt referencing this variable may require updates.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter className="gap-2 sm:space-x-0 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-1.5 size-3.5" />
                Delete Variable
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface VariablesSectionProps {
  variables: VariableDefinition[];
  validationResult: VariableValidationResponse | null;
  validatingVariables: boolean;
  onValidateVariables: () => void;
  onAddVariable: (prefillName?: string) => void;
  onEditVariable: (v: VariableDefinition, index: number) => void;
  onDeleteVariable: (v: VariableDefinition) => void;
}

export function VariablesSection({
  variables,
  validationResult,
  validatingVariables,
  onValidateVariables,
  onAddVariable,
  onEditVariable,
  onDeleteVariable,
}: VariablesSectionProps) {
  return (
    <div className="space-y-4">
      {/* Variable Detection & Validation Card */}
      <VariableDetectionBanner
        validationResult={validationResult}
        validating={validatingVariables}
        onValidate={onValidateVariables}
        onQuickAdd={onAddVariable}
      />

      {/* Configured Variables Card */}
      <div>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Configured Variables</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Parameters supplied whenever this Prompt System runs.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => onAddVariable()}>
            <Plus /> Add Variable
          </Button>
        </div>
        <div className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60">
          <div className="space-y-3">
            {variables && variables.length > 0 ? (
              variables.map((v, idx) => (
                <VariableCard
                  key={`${v.name}-${idx}`}
                  variable={v}
                  onEdit={() => onEditVariable(v, idx)}
                  onDelete={() => onDeleteVariable(v)}
                />
              ))
            ) : (
              <div className="rounded-lg bg-card/40 p-8 text-center">
                <p className="text-xs text-muted-foreground">
                  No variables defined for this Prompt System.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => onAddVariable()}
                >
                  <Plus className="mr-1.5 size-3.5" /> Add First Variable
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
