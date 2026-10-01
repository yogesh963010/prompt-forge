import {
  AlertCircle,
  Boxes,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Edit2,
  Eye,
  FileCode2,
  Filter,
  Layers,
  ListPlus,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Zap,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PREDEFINED_MODULES,
  type PredefinedModule,
} from "@/data/predefinedModules";
import { moduleService, type PromptModule } from "@/services";
import { formatRelativeTime } from "./types";

interface ModuleCardProps {
  module: PromptModule;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ModuleCard({ module, onOpen, onEdit, onDelete }: ModuleCardProps) {
  const varCount = Array.isArray(module.variables) ? module.variables.length : 0;
  const contextCount = Array.isArray(module.input_context)
    ? module.input_context.length
    : module.input_context && typeof module.input_context === "object"
      ? Object.keys(module.input_context).length
      : 0;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative cursor-pointer rounded-lg bg-card/55 p-4 text-left ring-1 ring-border/60 transition hover:-translate-y-0.5 hover:bg-card/75 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          <Boxes className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{module.name}</h3>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {formatRelativeTime(module.updated_at)}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {module.description || "No description provided."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {varCount} {varCount === 1 ? "var" : "vars"}
          </span>
          {contextCount > 0 && (
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {contextCount} context {contextCount === 1 ? "input" : "inputs"}
            </span>
          )}
          {module.output_contract && (
            <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
              Contract
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            <Edit2 className="mr-1 size-3" /> Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-destructive"
            title="Delete Module"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <ChevronRight className="size-4 text-muted-foreground opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
        </div>
      </div>
    </div>
  );
}

interface PredefinedModuleCardProps {
  template: PredefinedModule;
  onPreview: (template: PredefinedModule) => void;
  onUse: (template: PredefinedModule) => void;
  cloning: boolean;
}

export function PredefinedModuleCard({
  template,
  onPreview,
  onUse,
  cloning,
}: PredefinedModuleCardProps) {
  return (
    <div className="group relative flex flex-col justify-between rounded-lg border border-border/70 bg-card/60 p-4 transition-all hover:border-primary/50 hover:bg-card/90 hover:shadow-md">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground line-clamp-1">{template.name}</h3>
              <span className="text-[10px] text-muted-foreground font-medium">{template.category}</span>
            </div>
          </div>
          <Badge variant="outline" className="text-[9px] border-primary/20 bg-primary/5 text-primary">
            Preset
          </Badge>
        </div>

        <p className="mt-2.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {template.description}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
            {template.variables.length} vars
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
            {template.input_context.length} context
          </span>
          {template.output_contract && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] text-primary">
              Output Schema
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onPreview(template)}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Eye className="mr-1 size-3" /> Preview
        </Button>
        <Button
          size="sm"
          onClick={() => onUse(template)}
          disabled={cloning}
          className="h-7 px-2.5 text-xs gap-1 font-medium"
        >
          {cloning ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <>
              <Plus className="size-3" /> Use Preset
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface ModuleLibraryProps {
  modules: PromptModule[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onCreateModule: () => void;
  onOpenModule: (id: number) => void;
  onEditModule: (id: number) => void;
  onDeleteModule: (module: PromptModule) => void;
}

export function ModuleLibrary({
  modules,
  loading,
  error,
  onRefresh,
  onCreateModule,
  onOpenModule,
  onEditModule,
  onDeleteModule,
}: ModuleLibraryProps) {
  const [activeTab, setActiveTab] = useState<"all" | "custom" | "predefined">("all");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  // Template preview modal state
  const [previewTemplate, setPreviewTemplate] = useState<PredefinedModule | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Cloning state
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneSuccess, setCloneSuccess] = useState<string | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    PREDEFINED_MODULES.forEach((m) => cats.add(m.category));
    return ["All", ...Array.from(cats)];
  }, []);

  const filteredCustomModules = useMemo(() => {
    if (!search.trim()) return modules;
    const q = search.toLowerCase();
    return modules.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))
    );
  }, [modules, search]);

  const filteredPredefinedModules = useMemo(() => {
    return PREDEFINED_MODULES.filter((m) => {
      const matchCat = selectedCategory === "All" || m.category === selectedCategory;
      if (!matchCat) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [selectedCategory, search]);

  const handleUseTemplate = async (template: PredefinedModule) => {
    setCloningId(template.id);
    setCloneError(null);
    setCloneSuccess(null);

    try {
      const created = await moduleService.create({
        name: template.name,
        description: template.description,
        instructions: template.instructions,
        variables: template.variables,
        input_context: template.input_context,
        output_contract: template.output_contract,
        examples: template.examples,
      });

      setCloneSuccess(`Added "${template.name}" to your workspace modules.`);
      onRefresh();
      setPreviewModalOpen(false);
      setTimeout(() => setCloneSuccess(null), 4000);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setCloneError(apiErr.message || "Failed to add module to workspace.");
    } finally {
      setCloningId(null);
    }
  };

  const handleOpenPreview = (template: PredefinedModule) => {
    setPreviewTemplate(template);
    setPreviewModalOpen(true);
  };

  return (
    <div className="pf-fade mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Prompt Modules</h1>
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
              {modules.length} Custom • {PREDEFINED_MODULES.length} Presets
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Reusable prompt components with input boundaries, variables, and output contracts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh module library"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={onCreateModule} className="gap-1.5">
            <Plus className="size-3.5" /> Create Module
          </Button>
        </div>
      </div>

      {cloneSuccess && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          <Check className="size-4 shrink-0" />
          <span>{cloneSuccess}</span>
        </div>
      )}

      {cloneError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{cloneError}</span>
        </div>
      )}

      {/* Tabs & Search Filter Controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "all" | "custom" | "predefined")}
          className="w-full md:w-auto"
        >
          <TabsList className="bg-muted/60 p-1">
            <TabsTrigger value="all" className="text-xs">
              All Modules ({modules.length + PREDEFINED_MODULES.length})
            </TabsTrigger>
            <TabsTrigger value="predefined" className="text-xs gap-1.5">
              <Sparkles className="size-3 text-primary" />
              Predefined Presets ({PREDEFINED_MODULES.length})
            </TabsTrigger>
            <TabsTrigger value="custom" className="text-xs">
              My Modules ({modules.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modules, tags, description..."
            className="pl-9 text-xs h-9 bg-card/70"
          />
        </div>
      </div>

      {/* Category Filter Pills (When viewing presets or all) */}
      {(activeTab === "predefined" || activeTab === "all") && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <span className="text-[11px] font-medium text-muted-foreground mr-1 shrink-0 flex items-center gap-1">
            <Filter className="size-3" /> Categories:
          </span>
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className="h-6 px-2.5 text-[10px] rounded-full shrink-0"
            >
              {cat}
            </Button>
          ))}
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={onRefresh}>
            Retry
          </Button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="space-y-6">
        {/* TAB: ALL (Sections for Predefined and Custom) */}
        {activeTab === "all" && (
          <div className="space-y-6">
            {/* Predefined Section */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <h2 className="text-sm font-semibold">Predefined Starter Modules</h2>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {filteredPredefinedModules.length} available
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab("predefined")}
                  className="h-6 text-[11px] text-primary hover:text-primary"
                >
                  View all presets →
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPredefinedModules.map((tpl) => (
                  <PredefinedModuleCard
                    key={tpl.id}
                    template={tpl}
                    onPreview={handleOpenPreview}
                    onUse={handleUseTemplate}
                    cloning={cloningId === tpl.id}
                  />
                ))}
              </div>
            </div>

            <Separator className="bg-border/60" />

            {/* Custom Modules Section */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Boxes className="size-4 text-foreground" />
                  <h2 className="text-sm font-semibold">My Custom Modules</h2>
                  <Badge variant="outline" className="text-[10px] font-normal">
                    {filteredCustomModules.length}
                  </Badge>
                </div>
              </div>

              {loading && modules.length === 0 ? (
                <div className="flex h-32 items-center justify-center gap-2 text-muted-foreground text-xs">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Loading workspace modules...
                </div>
              ) : filteredCustomModules.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/80 bg-card/25 p-8 text-center">
                  <Boxes className="size-8 mx-auto text-muted-foreground opacity-50" />
                  <h3 className="mt-2 text-xs font-semibold">No custom modules created yet</h3>
                  <p className="mt-1 text-[11px] text-muted-foreground max-w-sm mx-auto">
                    Click &quot;Use Preset&quot; above to clone a predefined module into your workspace, or build a new one from scratch.
                  </p>
                  <Button size="sm" variant="outline" onClick={onCreateModule} className="mt-3 text-xs">
                    <Plus className="mr-1 size-3" /> Create Custom Module
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredCustomModules.map((m) => (
                    <ModuleCard
                      key={m.id}
                      module={m}
                      onOpen={() => onOpenModule(m.id)}
                      onEdit={() => onEditModule(m.id)}
                      onDelete={() => onDeleteModule(m)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: PREDEFINED PRESETS ONLY */}
        {activeTab === "predefined" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPredefinedModules.map((tpl) => (
              <PredefinedModuleCard
                key={tpl.id}
                template={tpl}
                onPreview={handleOpenPreview}
                onUse={handleUseTemplate}
                cloning={cloningId === tpl.id}
              />
            ))}
          </div>
        )}

        {/* TAB: MY CUSTOM MODULES ONLY */}
        {activeTab === "custom" && (
          <div>
            {loading && modules.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="size-8 animate-spin text-primary" />
                <p className="text-xs">Loading prompt modules...</p>
              </div>
            ) : filteredCustomModules.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/80 bg-card/25 p-12 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Boxes className="size-6" />
                </div>
                <h3 className="mt-4 text-sm font-semibold">
                  {search ? "No matching custom modules found" : "No Custom Prompt Modules yet"}
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                  {search
                    ? `No custom modules matched "${search}".`
                    : "Create custom modules or use any of the predefined starter presets."}
                </p>
                <div className="mt-6 flex justify-center gap-2">
                  <Button size="sm" onClick={() => setActiveTab("predefined")} variant="outline" className="text-xs gap-1">
                    <Sparkles className="size-3 text-primary" /> Explore Predefined Presets
                  </Button>
                  <Button size="sm" onClick={onCreateModule} className="text-xs">
                    <Plus className="mr-1.5 size-3.5" /> Create Module
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredCustomModules.map((m) => (
                  <ModuleCard
                    key={m.id}
                    module={m}
                    onOpen={() => onOpenModule(m.id)}
                    onEdit={() => onEditModule(m.id)}
                    onDelete={() => onDeleteModule(m)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* PREVIEW PREDEFINED MODULE MODAL */}
      <Dialog open={previewModalOpen} onOpenChange={setPreviewModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden border-border bg-card">
          <DialogHeader className="p-5 pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold flex items-center gap-2">
                  {previewTemplate?.name}
                  <Badge variant="outline" className="text-[10px]">
                    {previewTemplate?.category}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  {previewTemplate?.description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {previewTemplate && (
            <ScrollArea className="flex-1 p-5 space-y-4">
              <div className="space-y-4 text-xs">
                {/* Instructions */}
                <div>
                  <h4 className="font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                    <Code2 className="size-3.5 text-primary" /> Module Instructions
                  </h4>
                  <div className="rounded-lg bg-muted/60 p-3 font-mono text-[11px] whitespace-pre-wrap leading-relaxed border border-border/50">
                    {previewTemplate.instructions}
                  </div>
                </div>

                {/* Variables */}
                <div>
                  <h4 className="font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                    <Layers className="size-3.5 text-primary" /> Module Variables ({previewTemplate.variables.length})
                  </h4>
                  <div className="space-y-1.5">
                    {previewTemplate.variables.map((v) => (
                      <div
                        key={v.name}
                        className="flex items-center justify-between rounded-md border border-border/60 bg-muted/40 p-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium text-foreground">{v.name}</span>
                          <Badge variant="outline" className="text-[9px] h-4">
                            {v.type}
                          </Badge>
                          {v.required && (
                            <span className="text-[9px] text-destructive font-semibold">Required</span>
                          )}
                        </div>
                        {v.default && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Default: {String(v.default)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Input Context Boundaries */}
                <div>
                  <h4 className="font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                    <Boxes className="size-3.5 text-primary" /> Input Context Scope
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {previewTemplate.input_context.map((ctx) => (
                      <Badge key={ctx} variant="secondary" className="font-mono text-[10px]">
                        {ctx}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Output Contract */}
                <div>
                  <h4 className="font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                    <FileCode2 className="size-3.5 text-primary" /> Output Contract Schema
                  </h4>
                  <div className="rounded-lg bg-muted/60 p-3 font-mono text-[11px] whitespace-pre-wrap border border-border/50">
                    {previewTemplate.output_contract}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="p-4 border-t border-border/60 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewModalOpen(false)}
              className="text-xs"
            >
              Close
            </Button>
            {previewTemplate && (
              <Button
                size="sm"
                onClick={() => handleUseTemplate(previewTemplate)}
                disabled={cloningId === previewTemplate.id}
                className="text-xs gap-1.5"
              >
                {cloningId === previewTemplate.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <>
                    <Plus className="size-3.5" /> Use & Clone to Workspace
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface DeleteModuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: PromptModule | null;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
}

export function DeleteModuleDialog({
  open,
  onOpenChange,
  module,
  deleting,
  error,
  onConfirm,
}: DeleteModuleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Prompt Module</DialogTitle>
          <DialogDescription>
            Are you sure you want to permanently delete{" "}
            <span className="font-semibold text-foreground">
              {module?.name || "this module"}
            </span>
            ? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={deleting}>
            {deleting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Deleting...
              </>
            ) : (
              "Delete Module"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
