import { useState, useRef, ChangeEvent, DragEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileJson,
  Loader2,
  UploadCloud,
  Layers,
  Variable,
  Bot,
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
import { promptSystemService, type PromptSystem } from "@/services";

interface ImportAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess: (system: PromptSystem) => void;
}

export function ImportAssistantModal({
  open,
  onOpenChange,
  onImportSuccess,
}: ImportAssistantModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setParsedData(null);
    setValidationError(null);
    setImporting(false);
    setIsDragging(false);
  };

  const handleFile = (selectedFile: File) => {
    setValidationError(null);
    if (!selectedFile.name.endsWith(".json")) {
      setValidationError("Please select a valid JSON configuration file (.json).");
      return;
    }
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const json = JSON.parse(text);

        if (!json || typeof json !== "object") {
          throw new Error("File content is not a valid JSON object.");
        }
        if (json.format !== "promptforge") {
          throw new Error(`Unsupported format '${json.format || "unknown"}'. Expected 'promptforge'.`);
        }
        if (json.version !== "1.0") {
          throw new Error(`Unsupported version '${json.version || "unknown"}'. Expected '1.0'.`);
        }
        if (json.type !== "assistant") {
          throw new Error(`Unsupported type '${json.type || "unknown"}'. Only 'assistant' is supported.`);
        }
        if (!json.assistant || !json.assistant.name) {
          throw new Error("Configuration is missing required assistant name.");
        }

        setParsedData(json);
      } catch (err: any) {
        setValidationError(err.message || "Failed to parse JSON file.");
        setParsedData(null);
      }
    };
    reader.onerror = () => {
      setValidationError("Failed to read file.");
      setParsedData(null);
    };
    reader.readAsText(selectedFile);
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;
    setImporting(true);
    setValidationError(null);
    try {
      const imported = await promptSystemService.importAssistant(parsedData);
      resetState();
      onOpenChange(false);
      onImportSuccess(imported);
    } catch (err: any) {
      setValidationError(err.message || "Failed to import Assistant.");
    } finally {
      setImporting(false);
    }
  };

  const variables = Array.isArray(parsedData?.variables) ? parsedData.variables : [];
  const subAssistants = Array.isArray(parsedData?.sub_assistants) ? parsedData.sub_assistants : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetState();
        onOpenChange(v);
      }}
    >
      <DialogContent className="border-border bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="size-5 text-primary" />
            Import Assistant
          </DialogTitle>
          <DialogDescription>
            Upload a PromptForge configuration JSON to recreate an Assistant with its variables and sub-assistants.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Drag & drop upload area */}
          {!parsedData ? (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center p-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-primary/10"
                  : "border-border/80 hover:border-primary/50 hover:bg-muted/40"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={onFileInputChange}
              />
              <div className="p-3 rounded-full bg-primary/10 text-primary mb-3">
                <UploadCloud className="size-6" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PromptForge JSON configuration (.json)
              </p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* File picked strip */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border/70">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                    <FileJson className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate text-foreground">
                      {file?.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {((file?.size || 0) / 1024).toFixed(1)} KB • PromptForge v1.0
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 text-muted-foreground hover:text-foreground"
                  onClick={resetState}
                  disabled={importing}
                >
                  Change File
                </Button>
              </div>

              {/* Preview Card */}
              <div className="rounded-xl border border-border/70 bg-card/60 p-4 space-y-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">Assistant Blueprint:</span>
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-500 font-medium">
                    <CheckCircle2 className="size-3.5" /> Valid Schema
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                  <div className="p-2.5 rounded-lg bg-background/60 border border-border/50">
                    <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
                      <Bot className="size-3.5 text-primary" />
                      Name
                    </div>
                    <p className="truncate font-semibold text-foreground">
                      {parsedData.assistant?.name}
                    </p>
                  </div>

                  <div className="p-2.5 rounded-lg bg-background/60 border border-border/50">
                    <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
                      <Variable className="size-3.5 text-primary" />
                      Variables
                    </div>
                    <p className="font-semibold text-foreground">
                      {variables.length} defined
                    </p>
                  </div>
                </div>

                {parsedData.assistant?.description && (
                  <p className="text-muted-foreground italic line-clamp-2">
                    "{parsedData.assistant.description}"
                  </p>
                )}

                {subAssistants.length > 0 && (
                  <div className="pt-2 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                      <Layers className="size-3.5 text-primary" />
                      <span>{subAssistants.length} Sub-Assistants included:</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {subAssistants.map((sa: any, i: number) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-mono text-foreground"
                        >
                          {sa.name || `Sub-assistant ${i + 1}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Validation or API error */}
          {validationError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/15 text-destructive text-xs">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={importing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!parsedData || importing}
            className="gap-2"
          >
            {importing && <Loader2 className="size-4 animate-spin" />}
            Confirm & Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
