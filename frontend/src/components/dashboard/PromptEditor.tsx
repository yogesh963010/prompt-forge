import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  PromptSystem,
  VariableDefinition,
  VariableValidationResponse,
} from "@/services";
import {
  ExamplesTab,
  InstructionsTab,
  ModulesTab,
  OutputTab,
  OverviewTab,
  TestsTab,
  VersionsTab,
} from "./EditorTabs";
import { PromptPreview } from "./PromptPreview";
import { tabs, type Tab } from "./types";
import { VariablesSection } from "./VariablesSection";

interface PromptEditorProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  selectedSystem: PromptSystem | null;
  selectedSystemId: number | null;
  loadingDetails: boolean;
  detailsError: string | null;
  saving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  onSave: () => void;
  onRetry: () => void;
  onBackToLibrary: () => void;
  onPreview: () => void;
  onRun?: () => void;
  onDelete: () => void;
  onArchive?: (id: number) => void;
  onUnarchive?: (id: number) => void;
  editName: string;
  setEditName: (val: string) => void;
  editDescription: string;
  setEditDescription: (val: string) => void;
  editInstructions: string;
  setEditInstructions: (val: string) => void;
  editVariables: VariableDefinition[];
  editModules: unknown[];
  editExamples: unknown[];
  setEditExamples: (val: unknown[]) => void;
  editOutputFormat: unknown;
  setEditOutputFormat: (val: unknown) => void;
  onAddVariable: (prefillName?: string) => void;
  onEditVariable: (v: VariableDefinition, index: number) => void;
  onDeleteVariable: (v: VariableDefinition) => void;
  validationResult: VariableValidationResponse | null;
  validatingVariables: boolean;
  onValidateVariables: () => void;
  onNavigateToModules?: () => void;
}

export function PromptEditor({
  activeTab,
  setActiveTab,
  selectedSystem,
  selectedSystemId,
  loadingDetails,
  detailsError,
  saving,
  saveError,
  saveSuccess,
  onSave,
  onRetry,
  onBackToLibrary,
  onPreview,
  onRun,
  onDelete,
  onArchive,
  onUnarchive,
  editName,
  setEditName,
  editDescription,
  setEditDescription,
  editInstructions,
  setEditInstructions,
  editVariables,
  editModules,
  editExamples,
  setEditExamples,
  editOutputFormat,
  setEditOutputFormat,
  onAddVariable,
  onEditVariable,
  onDeleteVariable,
  validationResult,
  validatingVariables,
  onValidateVariables,
  onNavigateToModules,
}: PromptEditorProps) {
  if (loadingDetails) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="size-8 animate-spin text-primary" />
        <p className="text-sm">Loading Prompt System details...</p>
      </div>
    );
  }

  if (detailsError || !selectedSystem) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <h2 className="mt-3 text-base font-semibold text-foreground">
            {detailsError || "Prompt System not found"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The requested Prompt System could not be loaded or was removed.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Button variant="outline" size="sm" onClick={onBackToLibrary}>
              Back to Library
            </Button>
            {selectedSystemId && (
              <Button size="sm" onClick={onRetry}>
                <RefreshCw className="mr-1.5 size-3.5" /> Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pf-fade mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Save Success / Error banners */}
      {saveSuccess && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-xs font-medium text-success">
          <CheckCircle2 className="size-4" />
          <span>Prompt System saved successfully.</span>
        </div>
      )}
      {saveError && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-destructive/15 px-3 py-2 text-xs font-medium text-destructive">
          <AlertCircle className="size-4" />
          <span>{saveError}</span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase text-primary">Prompt System</p>
          <h1 className="mt-1 truncate text-2xl font-semibold">{editName || selectedSystem.name}</h1>
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
            {editDescription || selectedSystem.description || "Reusable Prompt System"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onArchive && onUnarchive && (
            selectedSystem.archived ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs text-primary hover:text-primary"
                onClick={() => onUnarchive(selectedSystem.id)}
              >
                <ArchiveRestore className="size-3.5" /> Unarchive
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => onArchive(selectedSystem.id)}
              >
                <Archive className="size-3.5" /> Archive
              </Button>
            )
          )}
          <span className={`rounded-md px-2 py-1 font-mono text-[10px] uppercase ${!selectedSystem.archived ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
            {!selectedSystem.archived ? "Active" : "Archived"}
          </span>
          <span className="rounded-md bg-primary-soft px-2 py-1 font-mono text-[10px] uppercase text-primary">
            v{selectedSystem.version}.0
          </span>
          {onRun && (
            <Button
              size="sm"
              className="h-7 gap-1.5 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              onClick={onRun}
              title="Run Prompt System with runtime variables"
            >
              <Play className="size-3.5 fill-current" /> Run
            </Button>
          )}
        </div>
      </div>

      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-border/60 pb-px">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`cursor-pointer whitespace-nowrap rounded-t-md px-3 py-2 text-xs transition ${activeTab === tab
                ? "bg-card font-medium text-foreground shadow-inner"
                : "text-muted-foreground hover:bg-card/40 hover:text-foreground"
              }`}
          >
            {tab}
            {tab === "Variables" && editVariables.length > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.2 font-mono text-[10px] text-primary">
                {editVariables.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          {activeTab === "Overview" && (
            <OverviewTab
              editName={editName}
              setEditName={setEditName}
              editDescription={editDescription}
              setEditDescription={setEditDescription}
              saving={saving}
              onSave={onSave}
              onDelete={onDelete}
            />
          )}

          {activeTab === "Instructions" && (
            <InstructionsTab
              editName={editName}
              editInstructions={editInstructions}
              setEditInstructions={setEditInstructions}
              saving={saving}
              onSave={onSave}
            />
          )}

          {activeTab === "Variables" && (
            <VariablesSection
              variables={editVariables}
              validationResult={validationResult}
              validatingVariables={validatingVariables}
              onValidateVariables={onValidateVariables}
              onAddVariable={onAddVariable}
              onEditVariable={onEditVariable}
              onDeleteVariable={onDeleteVariable}
            />
          )}

          {activeTab === "Modules" && (
            <ModulesTab
              editModules={editModules}
              promptSystemId={selectedSystemId}
              onNavigateToModules={onNavigateToModules}
            />
          )}

          {activeTab === "Examples" && (
            <ExamplesTab
              editExamples={editExamples}
              setEditExamples={setEditExamples}
              saving={saving}
              onSave={onSave}
            />
          )}

          {activeTab === "Output" && (
            <OutputTab
              editName={editName}
              editOutputFormat={editOutputFormat}
              setEditOutputFormat={setEditOutputFormat}
              saving={saving}
              onSave={onSave}
            />
          )}

          {activeTab === "Tests" && (
            <TestsTab
              promptSystemId={selectedSystemId}
              systemVariables={editVariables}
            />
          )}

          {activeTab === "Versions" && (
            <VersionsTab
              promptSystemId={selectedSystemId}
              onRestored={onRetry}
            />
          )}
        </section>

        <aside>
          <div className="sticky top-20 rounded-lg bg-card/55 p-4 ring-1 ring-border/60">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold">Prompt preview</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Compiled from the current configuration.
                </p>
              </div>
              <Button variant="ghost" size="icon">
                <MoreHorizontal />
              </Button>
            </div>
            <div className="mt-3 max-h-72 overflow-y-auto">
              <PromptPreview
                compact
                instructions={editInstructions}
                variables={editVariables}
                modules={editModules}
                outputFormat={editOutputFormat}
              />
            </div>
            <Button className="mt-3 w-full" onClick={onPreview}>
              <Sparkles className="mr-1.5 size-3.5" /> Preview Prompt
            </Button>
            {onRun && (
              <Button
                variant="outline"
                className="mt-2 w-full gap-1.5 border-primary/40 text-primary hover:bg-primary-soft hover:text-primary"
                onClick={onRun}
              >
                <Play className="size-3.5 fill-current" /> Run Prompt
              </Button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
