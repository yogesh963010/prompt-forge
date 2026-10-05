import { AlertCircle, Loader2, Plus, Trash2, X } from "lucide-react";
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
import type { PromptSystem } from "@/services";

interface CreatePromptSystemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  createName: string;
  setCreateName: (name: string) => void;
  createDescription: string;
  setCreateDescription: (desc: string) => void;
  createInstructions: string;
  setCreateInstructions: (inst: string) => void;
  createVariables: {name: string, type: string}[];
  setCreateVariables: (vars: {name: string, type: string}[]) => void;
  creating: boolean;
  createError: string | null;
  onSubmit: () => void;
  title?: string;
  description?: string;
  submitText?: string;
}

export function CreatePromptSystemDialog({
  open,
  onOpenChange,
  createName,
  setCreateName,
  createDescription,
  setCreateDescription,
  createInstructions,
  setCreateInstructions,
  createVariables,
  setCreateVariables,
  creating,
  createError,
  onSubmit,
  title,
  description,
  submitText,
}: CreatePromptSystemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title || "New Assistant"}</DialogTitle>
          <DialogDescription>
            {description || "Create a new Assistant in your workspace."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="space-y-3.5"
        >
          {createError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Name *</label>
            <Input
              placeholder="e.g. Technical Blog Writer"
              className="bg-card/70"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              disabled={creating}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Description *</label>
            <Input
              placeholder="e.g. High-authority technical tutorials"
              className="bg-card/70"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              disabled={creating}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Initial Instructions *</label>
            <Textarea
              placeholder="You are an expert technical writer..."
              className="bg-card/70 text-xs min-h-[90px] font-mono"
              value={createInstructions}
              onChange={(e) => setCreateInstructions(e.target.value)}
              disabled={creating}
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium">Variable Definitions</label>
              <div className="flex items-center gap-2">
                {createVariables.some(v => !v.name.trim()) && (
                  <span className="text-[10px] text-destructive font-medium">First fill the value</span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setCreateVariables([...createVariables, { name: "", type: "text" }])}
                  disabled={creating || createVariables.some(v => !v.name.trim())}
                >
                  <Plus className="size-3 mr-1" /> Add Variable
                </Button>
              </div>
            </div>
            <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1">
              {createVariables.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Variable Name (e.g. prospect_name)"
                    className="bg-card/70 h-8 text-xs flex-1"
                    value={v.name}
                    onChange={(e) => {
                      const newVars = [...createVariables];
                      newVars[i].name = e.target.value;
                      setCreateVariables(newVars);
                    }}
                    disabled={creating}
                  />
                  <select
                    className="bg-card/70 h-8 text-xs flex-1 rounded-md border border-input px-3 py-1 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={v.type || "text"}
                    onChange={(e) => {
                      const newVars = [...createVariables];
                      newVars[i].type = e.target.value;
                      setCreateVariables(newVars);
                    }}
                    disabled={creating}
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/20 shrink-0"
                    onClick={() => {
                      const newVars = createVariables.filter((_, idx) => idx !== i);
                      setCreateVariables(newVars);
                    }}
                    disabled={creating}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:space-x-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !createName.trim() || !createDescription.trim() || !createInstructions.trim()}>
              {creating ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 size-3.5" />
                  {submitText || "Create Assistant"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeletePromptSystemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  system: PromptSystem | null;
  deleting: boolean;
  deleteError: string | null;
  onConfirm: () => void;
}

export function DeletePromptSystemDialog({
  open,
  onOpenChange,
  system,
  deleting,
  deleteError,
  onConfirm,
}: DeletePromptSystemDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-5" />
            Delete Assistant
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold text-foreground">“{system?.name}”</span>?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {deleteError && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{deleteError}</span>
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
                Delete
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
