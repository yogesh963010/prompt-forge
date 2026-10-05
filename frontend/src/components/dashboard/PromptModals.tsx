import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";
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
          <DialogTitle>{title || "New Prompt System"}</DialogTitle>
          <DialogDescription>
            {description || "Create a new Prompt System in your workspace."}
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
            <label className="text-xs font-medium">Description</label>
            <Input
              placeholder="e.g. High-authority technical tutorials"
              className="bg-card/70"
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              disabled={creating}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Initial Instructions (optional)</label>
            <Textarea
              placeholder="You are an expert technical writer..."
              className="bg-card/70 text-xs min-h-[90px] font-mono"
              value={createInstructions}
              onChange={(e) => setCreateInstructions(e.target.value)}
              disabled={creating}
            />
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
            <Button type="submit" disabled={creating || !createName.trim()}>
              {creating ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 size-3.5" />
                  {submitText || "Create Prompt System"}
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
            Delete Prompt System
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
