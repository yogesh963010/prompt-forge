import {
  Check,
  Loader2,
  LogOut,
  Menu,
  Play,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { clearAuthData, getStoredUser, isAuthenticated } from "@/lib/auth";
import {
  moduleService,
  promptSystemService,
  type PromptModule,
  type PromptSystem,
  type VariableDefinition,
  type VariableValidationResponse,
} from "@/services";

import { DeleteModuleDialog, ModuleLibrary } from "./dashboard/ModuleLibrary";
import { ModuleEditor } from "./dashboard/ModuleEditor";
import { PromptEditor } from "./dashboard/PromptEditor";
import { PromptLibrary } from "./dashboard/PromptLibrary";
import { RagAssistant } from "./dashboard/RagAssistant";
import {
  CreatePromptSystemDialog,
  DeletePromptSystemDialog,
} from "./dashboard/PromptModals";
import { PromptPreviewDialog } from "./dashboard/PromptPreview";
import { PromptRunModal } from "./dashboard/PromptRunModal";
import { ParentAssistantChat } from "./dashboard/ParentAssistantChat";
import { Sidebar } from "./dashboard/Sidebar";
import type { Tab } from "./dashboard/types";
import {
  DeleteVariableDialog,
  VariableModal,
} from "./dashboard/VariablesSection";

export function PromptForgeDashboard({
  initialScreen = "library",
}: {
  initialScreen?: "library" | "editor" | "modules" | "module-editor" | "rag" | "parent_assistant";
} = {}) {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<
    "library" | "editor" | "modules" | "module-editor" | "rag" | "parent_assistant"
  >(initialScreen);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"All" | "Active" | "Draft">("All");
  const [mobileNav, setMobileNav] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [systemToRun, setSystemToRun] = useState<{
    id: number;
    name: string;
    variables: unknown;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [currentUser, setCurrentUser] = useState(getStoredUser());

  // Prompt Systems list state
  const [systems, setSystems] = useState<PromptSystem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Selected system (Editor) state
  const [selectedSystemId, setSelectedSystemId] = useState<number | null>(null);
  const [selectedSystem, setSelectedSystem] = useState<PromptSystem | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Editor editable fields
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editVariables, setEditVariables] = useState<VariableDefinition[]>([]);
  const [editModules, setEditModules] = useState<unknown[]>([]);
  const [editExamples, setEditExamples] = useState<unknown[]>([]);
  const [editOutputFormat, setEditOutputFormat] = useState<unknown>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createInstructions, setCreateInstructions] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete system dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [systemToDelete, setSystemToDelete] = useState<PromptSystem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Variable Management state
  const [variableModalOpen, setVariableModalOpen] = useState(false);
  const [variableModalMode, setVariableModalMode] = useState<"add" | "edit">("add");
  const [editingVarIndex, setEditingVarIndex] = useState<number | null>(null);
  const [varName, setVarName] = useState("");
  const [varLabel, setVarLabel] = useState("");
  const [varType, setVarType] = useState("text");
  const [varRequired, setVarRequired] = useState(true);
  const [varDefault, setVarDefault] = useState("");
  const [varDescription, setVarDescription] = useState("");
  const [varSaving, setVarSaving] = useState(false);
  const [varError, setVarError] = useState<string | null>(null);

  // Variable delete dialog state
  const [deleteVarDialogOpen, setDeleteVarDialogOpen] = useState(false);
  const [varToDelete, setVarToDelete] = useState<VariableDefinition | null>(null);
  const [varDeleting, setVarDeleting] = useState(false);
  const [varDeleteError, setVarDeleteError] = useState<string | null>(null);

  // Variable validation & detection state
  const [validationResult, setValidationResult] = useState<VariableValidationResponse | null>(null);
  const [validatingVariables, setValidatingVariables] = useState(false);

  // Route protection: redirect to /login if unauthenticated
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate({ to: "/login", replace: true });
    } else {
      setCurrentUser(getStoredUser());
    }
  }, [navigate]);

  const handleLogout = useCallback(() => {
    clearAuthData();
    navigate({ to: "/login", replace: true });
  }, [navigate]);

  // Fetch prompt systems list from backend
  const loadPromptSystems = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const data = await promptSystemService.list({ sort: "recent", include_archived: true });
      setSystems(data);
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 401) {
        handleLogout();
        return;
      }
      setListError(apiErr.message || "Failed to load Prompt Systems.");
    } finally {
      setLoadingList(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    if (isAuthenticated()) {
      loadPromptSystems();
    }
  }, [loadPromptSystems]);

  // Prompt Modules state
  const [modules, setModules] = useState<PromptModule[]>([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [modulesError, setModulesError] = useState<string | null>(null);

  // Selected module (Module Editor) state
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [selectedModule, setSelectedModule] = useState<PromptModule | null>(null);
  const [isNewModule, setIsNewModule] = useState(false);
  const [moduleSaving, setModuleSaving] = useState(false);
  const [moduleSaveError, setModuleSaveError] = useState<string | null>(null);
  const [moduleSaveSuccess, setModuleSaveSuccess] = useState(false);

  // Delete module dialog state
  const [deleteModuleDialogOpen, setDeleteModuleDialogOpen] = useState(false);
  const [moduleToDelete, setModuleToDelete] = useState<PromptModule | null>(null);
  const [moduleDeleting, setModuleDeleting] = useState(false);
  const [moduleDeleteError, setModuleDeleteError] = useState<string | null>(null);

  // Fetch modules list from backend
  const loadModules = useCallback(async () => {
    setLoadingModules(true);
    setModulesError(null);
    try {
      const data = await moduleService.list();
      setModules(data);
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 401) {
        handleLogout();
        return;
      }
      setModulesError(apiErr.message || "Failed to load Prompt Modules.");
    } finally {
      setLoadingModules(false);
    }
  }, [handleLogout]);

  useEffect(() => {
    if (initialScreen) {
      setScreen(initialScreen);
    }
  }, [initialScreen]);

  const handleOpenModule = useCallback(
    async (id: number) => {
      setSelectedModuleId(id);
      setIsNewModule(false);
      setModuleSaveError(null);
      setModuleSaveSuccess(false);

      const existing = modules.find((m) => m.id === id);
      if (existing) {
        setSelectedModule(existing);
      }

      setScreen("module-editor");

      try {
        const full = await moduleService.getById(id);
        setSelectedModule(full);
      } catch (err: unknown) {
        const apiErr = err as { message?: string };
        setModuleSaveError(apiErr.message || "Failed to load module details.");
      }
    },
    [modules]
  );

  const handleCreateModule = useCallback(() => {
    setSelectedModuleId(null);
    setSelectedModule(null);
    setIsNewModule(true);
    setModuleSaveError(null);
    setModuleSaveSuccess(false);
    setScreen("module-editor");
  }, []);

  const handleSaveModule = useCallback(
    async (payload: {
      name: string;
      description: string;
      instructions: string;
      variables: VariableDefinition[];
      input_context: string[];
      output_contract: string;
      examples: Array<{ title?: string; input: string; output: string }>;
    }) => {
      setModuleSaving(true);
      setModuleSaveError(null);
      setModuleSaveSuccess(false);

      try {
        if (isNewModule) {
          const created = await moduleService.create(payload);
          setModules((prev) => [created, ...prev]);
          setSelectedModule(created);
          setSelectedModuleId(created.id);
          setIsNewModule(false);
          setModuleSaveSuccess(true);
        } else if (selectedModuleId) {
          const updated = await moduleService.update(selectedModuleId, payload);
          setModules((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
          setSelectedModule(updated);
          setModuleSaveSuccess(true);
        }
      } catch (err: unknown) {
        const apiErr = err as { message?: string };
        setModuleSaveError(apiErr.message || "Failed to save module.");
      } finally {
        setModuleSaving(false);
      }
    },
    [isNewModule, selectedModuleId]
  );

  const promptDeleteModule = useCallback((mod: PromptModule) => {
    setModuleToDelete(mod);
    setModuleDeleteError(null);
    setDeleteModuleDialogOpen(true);
  }, []);

  const handleConfirmDeleteModule = useCallback(async () => {
    if (!moduleToDelete) return;
    setModuleDeleting(true);
    setModuleDeleteError(null);
    try {
      await moduleService.delete(moduleToDelete.id);
      setModules((prev) => prev.filter((m) => m.id !== moduleToDelete.id));
      setDeleteModuleDialogOpen(false);
      setModuleToDelete(null);
      if (screen === "module-editor") {
        setScreen("modules");
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setModuleDeleteError(apiErr.message || "Failed to delete module.");
    } finally {
      setModuleDeleting(false);
    }
  }, [moduleToDelete, screen]);

  // Validate variables against instructions using backend API
  const runValidateVariables = useCallback(
    async (id: number) => {
      setValidatingVariables(true);
      try {
        const res = await promptSystemService.validateVariables(id);
        setValidationResult(res);
      } catch {
        setValidationResult(null);
      } finally {
        setValidatingVariables(false);
      }
    },
    []
  );

  // Fetch single Prompt System by ID
  const fetchDetails = useCallback(
    async (id: number) => {
      setLoadingDetails(true);
      setDetailsError(null);
      setSaveError(null);
      setSaveSuccess(false);
      try {
        const data = await promptSystemService.getById(id);
        setSelectedSystem(data);
        setEditName(data.name || "");
        setEditDescription(data.description || "");
        setEditInstructions(data.instructions || "");
        setEditVariables(Array.isArray(data.variables) ? (data.variables as VariableDefinition[]) : []);
        setEditModules(Array.isArray(data.modules) ? (data.modules as unknown[]) : []);
        setEditExamples(Array.isArray(data.examples) ? (data.examples as unknown[]) : []);
        setEditOutputFormat(data.output_format ?? {});

        // Run variable detection & validation
        runValidateVariables(id);
      } catch (err: unknown) {
        const apiErr = err as { status?: number; message?: string };
        if (apiErr?.status === 401) {
          handleLogout();
          return;
        }
        setDetailsError(apiErr.message || "Prompt System not found.");
      } finally {
        setLoadingDetails(false);
      }
    },
    [handleLogout, runValidateVariables]
  );

  const openEditor = useCallback(
    (id: number) => {
      setSelectedSystemId(id);
      setScreen("editor");
      setActiveTab("Overview");
      setMobileNav(false);
      fetchDetails(id);
    },
    [fetchDetails]
  );

  // Trigger validation when switching to Variables tab
  useEffect(() => {
    if (screen === "editor" && activeTab === "Variables" && selectedSystemId) {
      runValidateVariables(selectedSystemId);
    }
  }, [screen, activeTab, selectedSystemId, runValidateVariables]);

  // Handle Save / Update
  const handleSave = async () => {
    if (!selectedSystem || saving) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setSaveError("Prompt System name cannot be empty.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const updated = await promptSystemService.update(selectedSystem.id, {
        name: trimmedName,
        description: editDescription.trim() || null,
        instructions: editInstructions || null,
        variables: editVariables,
        examples: editExamples,
        output_format: editOutputFormat,
        modules: editModules,
      });

      setSelectedSystem(updated);
      setEditName(updated.name);
      setEditDescription(updated.description || "");
      setEditInstructions(updated.instructions || "");
      setEditVariables(Array.isArray(updated.variables) ? (updated.variables as VariableDefinition[]) : []);
      setEditModules(Array.isArray(updated.modules) ? (updated.modules as unknown[]) : []);
      setEditExamples(Array.isArray(updated.examples) ? (updated.examples as unknown[]) : []);
      setEditOutputFormat(updated.output_format ?? {});

      // Update list in state
      setSystems((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Re-validate variables
      runValidateVariables(updated.id);
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 401) {
        handleLogout();
        return;
      }
      setSaveError(apiErr.message || "Failed to update Prompt System.");
    } finally {
      setSaving(false);
    }
  };

  // Handle Create
  const handleCreatePromptSystem = async () => {
    const trimmedName = createName.trim();
    if (!trimmedName) {
      setCreateError("Prompt System name is required.");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const created = await promptSystemService.create({
        name: trimmedName,
        description: createDescription.trim() || null,
        instructions: createInstructions.trim() || null,
        variables: [],
        examples: [],
        output_format: {},
        modules: [],
      });

      setSystems((prev) => [created, ...prev]);
      setNewOpen(false);
      setCreateName("");
      setCreateDescription("");
      setCreateInstructions("");

      // Open the Parent Assistant experience for the newly created Prompt System
      setSystemToRun(created);
      setScreen("parent_assistant");
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 401) {
        handleLogout();
        return;
      }
      setCreateError(apiErr.message || "Failed to create Prompt System.");
    } finally {
      setCreating(false);
    }
  };

  // Handle Delete Prompt System Confirmation
  const promptDelete = (system: PromptSystem) => {
    setSystemToDelete(system);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!systemToDelete || deleting) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await promptSystemService.delete(systemToDelete.id);
      setSystems((prev) => prev.filter((item) => item.id !== systemToDelete.id));
      setDeleteDialogOpen(false);

      if (screen === "editor" && selectedSystemId === systemToDelete.id) {
        setScreen("library");
        setSelectedSystem(null);
        setSelectedSystemId(null);
      }
      setSystemToDelete(null);
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 401) {
        handleLogout();
        return;
      }
      setDeleteError(apiErr.message || "Failed to delete Prompt System.");
    } finally {
      setDeleting(false);
    }
  };

  // Handle Archive Prompt System
  const handleArchivePromptSystem = async (id: number) => {
    try {
      const updated = await promptSystemService.archive(id);
      setSystems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedSystem && selectedSystem.id === updated.id) {
        setSelectedSystem(updated);
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setListError(apiErr.message || "Failed to archive Prompt System.");
    }
  };

  // Handle Unarchive Prompt System
  const handleUnarchivePromptSystem = async (id: number) => {
    try {
      const updated = await promptSystemService.unarchive(id);
      setSystems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      if (selectedSystem && selectedSystem.id === updated.id) {
        setSelectedSystem(updated);
      }
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setListError(apiErr.message || "Failed to unarchive Prompt System.");
    }
  };

  // Variable Management Handlers (Add, Edit, Delete)
  const openAddVariable = (prefillName?: string) => {
    setVariableModalMode("add");
    setEditingVarIndex(null);
    const initialName = prefillName ? prefillName.trim() : "";
    setVarName(initialName);
    setVarLabel(initialName);
    setVarType("text");
    setVarRequired(true);
    setVarDefault("");
    setVarDescription("");
    setVarError(null);
    setVariableModalOpen(true);
  };

  const openEditVariable = (variable: VariableDefinition, index: number) => {
    setVariableModalMode("edit");
    setEditingVarIndex(index);
    setVarName(variable.name);
    setVarLabel(variable.label || variable.name);
    setVarType(variable.type?.toLowerCase() || "text");
    setVarRequired(variable.required ?? true);
    setVarDefault(
      variable.default !== undefined && variable.default !== null
        ? String(variable.default)
        : ""
    );
    setVarDescription(variable.description || "");
    setVarError(null);
    setVariableModalOpen(true);
  };

  const handleSaveVariable = async () => {
    const trimmedName = varName.trim();
    if (!trimmedName) {
      setVarError("Variable name is required.");
      return;
    }
    if (/\s/.test(trimmedName)) {
      setVarError("Variable name cannot contain spaces.");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedName)) {
      setVarError("Variable name can only contain letters, numbers, and underscores.");
      return;
    }

    const isDuplicate = editVariables.some((v, idx) => {
      if (variableModalMode === "edit" && idx === editingVarIndex) return false;
      return v.name.toLowerCase() === trimmedName.toLowerCase();
    });

    if (isDuplicate) {
      setVarError(`A variable with name "${trimmedName}" already exists.`);
      return;
    }

    let parsedDefault: unknown = null;
    if (varType.toLowerCase() === "number") {
      if (varDefault.trim() !== "" && !isNaN(Number(varDefault))) {
        parsedDefault = Number(varDefault);
      } else if (varDefault.trim() !== "") {
        setVarError("Default value must be a valid number for Number variable type.");
        return;
      }
    } else if (varDefault.trim() !== "") {
      parsedDefault = varDefault.trim();
    }

    const variablePayload: VariableDefinition = {
      name: trimmedName,
      label: varLabel.trim() || trimmedName,
      type: varType.toLowerCase(),
      required: varRequired,
      default: parsedDefault,
      description: varDescription.trim() || undefined,
    };

    let nextVariables: VariableDefinition[];
    if (variableModalMode === "add") {
      nextVariables = [...editVariables, variablePayload];
    } else if (editingVarIndex !== null) {
      nextVariables = editVariables.map((v, idx) =>
        idx === editingVarIndex ? variablePayload : v
      );
    } else {
      nextVariables = [...editVariables, variablePayload];
    }

    if (!selectedSystem) {
      setEditVariables(nextVariables);
      setVariableModalOpen(false);
      return;
    }

    setVarSaving(true);
    setVarError(null);

    try {
      const updatedSystem = await promptSystemService.updateVariables(
        selectedSystem.id,
        nextVariables
      );

      const savedVars = Array.isArray(updatedSystem.variables)
        ? (updatedSystem.variables as VariableDefinition[])
        : nextVariables;

      setEditVariables(savedVars);
      setSelectedSystem(updatedSystem);
      setSystems((prev) =>
        prev.map((item) => (item.id === updatedSystem.id ? updatedSystem : item))
      );

      setVariableModalOpen(false);
      runValidateVariables(updatedSystem.id);
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 401) {
        handleLogout();
        return;
      }
      setVarError(apiErr.message || "Failed to save variable.");
    } finally {
      setVarSaving(false);
    }
  };

  const promptDeleteVariable = (variable: VariableDefinition) => {
    setVarToDelete(variable);
    setVarDeleteError(null);
    setDeleteVarDialogOpen(true);
  };

  const handleConfirmDeleteVariable = async () => {
    if (!varToDelete || !selectedSystem || varDeleting) return;

    setVarDeleting(true);
    setVarDeleteError(null);

    const nextVariables = editVariables.filter((v) => v.name !== varToDelete.name);

    try {
      const updatedSystem = await promptSystemService.updateVariables(
        selectedSystem.id,
        nextVariables
      );

      const savedVars = Array.isArray(updatedSystem.variables)
        ? (updatedSystem.variables as VariableDefinition[])
        : nextVariables;

      setEditVariables(savedVars);
      setSelectedSystem(updatedSystem);
      setSystems((prev) =>
        prev.map((item) => (item.id === updatedSystem.id ? updatedSystem : item))
      );

      setDeleteVarDialogOpen(false);
      setVarToDelete(null);
      runValidateVariables(updatedSystem.id);
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr?.status === 401) {
        handleLogout();
        return;
      }
      setVarDeleteError(apiErr.message || "Failed to delete variable.");
    } finally {
      setVarDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    return systems.filter((item) => {
      const term = search.toLowerCase();
      const matchesSearch =
        item.name.toLowerCase().includes(term) ||
        (item.description || "").toLowerCase().includes(term);

      if (!matchesSearch) return false;

      if (statusFilter === "Active") return !item.archived;
      if (statusFilter === "Draft") return item.archived;
      return true;
    });
  }, [systems, search, statusFilter]);

  const copyPreview = async () => {
    const previewContent = [
      "Core Instructions",
      editInstructions || "No instructions defined.",
      "\nVariables",
      editVariables.length > 0
        ? editVariables
            .map((v) => `${v.name}${v.required ? " (required)" : ""}`)
            .join(", ")
        : "None",
      "\nModules",
      editModules.length > 0
        ? editModules
            .map((m) =>
              typeof m === "string"
                ? m
                : (m as { name?: string })?.name || JSON.stringify(m)
            )
            .join(", ")
        : "None",
      "\nOutput Requirements",
      typeof editOutputFormat === "string"
        ? editOutputFormat
        : JSON.stringify(editOutputFormat, null, 2),
    ].join("\n");

    await navigator.clipboard?.writeText(previewContent);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleRunFromEditor = () => {
    if (selectedSystemId) {
      setSystemToRun({
        id: selectedSystemId,
        name: editName || selectedSystem?.name || "Prompt System",
        variables: editVariables,
      });
      setRunModalOpen(true);
    }
  };

  const handleRunFromLibrary = (system: PromptSystem) => {
    setSystemToRun({
      id: system.id,
      name: system.name,
      variables: system.variables,
    });
    setRunModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 bg-workspace" aria-hidden="true" />
      {mobileNav && (
        <button
          className="fixed inset-0 z-30 bg-overlay md:hidden"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="relative flex min-h-screen">
        <Sidebar
          open={mobileNav}
          user={currentUser}
          systemCount={systems.length}
          moduleCount={modules.length}
          currentScreen={screen}
          onClose={() => setMobileNav(false)}
          onHome={() => {
            setScreen("library");
            setMobileNav(false);
          }}
          onEditor={() => {
            setScreen("library");
            setMobileNav(false);
          }}
          onModules={() => {
            setScreen("modules");
            setMobileNav(false);
          }}
          onRag={() => {
            setScreen("rag");
            setMobileNav(false);
          }}
          onLogout={handleLogout}
        />
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-border/60 bg-surface-glass px-4 py-3 backdrop-blur-xl sm:px-6">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setMobileNav(true)}
                aria-label="Open navigation"
              >
                <Menu />
              </Button>
              <div className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                {screen === "rag" ? (
                  <button
                    onClick={() => setScreen("rag")}
                    className="cursor-pointer font-medium text-foreground hover:text-foreground"
                  >
                    AI Assistant
                  </button>
                ) : screen === "modules" || screen === "module-editor" ? (
                  <>
                    <button
                      onClick={() => setScreen("modules")}
                      className="cursor-pointer hover:text-foreground"
                    >
                      Prompt Modules
                    </button>
                    {screen === "module-editor" && (
                      <>
                        <span>/</span>
                        <span className="font-medium text-foreground truncate max-w-[200px]">
                          {isNewModule ? "Create Module" : selectedModule?.name || "Edit Module"}
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setScreen("library")}
                      className="cursor-pointer hover:text-foreground"
                    >
                      Prompt Library
                    </button>
                    {screen === "editor" && selectedSystem && (
                      <>
                        <span>/</span>
                        <span className="font-medium text-foreground truncate max-w-[200px]">
                          {editName || selectedSystem.name}
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                {screen === "editor" && selectedSystem && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSave}
                      disabled={saving || loadingDetails}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                          Saving...
                        </>
                      ) : saveSuccess ? (
                        <>
                          <Check className="mr-1.5 size-3.5 text-success" />
                          Saved
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      title="Delete Prompt System"
                      onClick={() => promptDelete(selectedSystem)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                )}

                {screen === "modules" && (
                  <Button size="sm" onClick={handleCreateModule}>
                    <Plus className="mr-1.5 size-3.5" /> Create Module
                  </Button>
                )}

                {screen === "library" && (
                  <Button size="sm" onClick={() => setNewOpen(true)}>
                    <Plus className="mr-1.5 size-3.5" /> New Prompt System
                  </Button>
                )}

                {screen === "editor" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
                      <Sparkles className="mr-1.5 size-3.5" /> Preview Prompt
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={handleRunFromEditor}>
                      <Play className="size-3.5 fill-current" /> Run
                    </Button>
                  </>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="hidden text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
                >
                  <LogOut className="mr-1 size-3.5" />
                  Logout
                </Button>
              </div>
            </div>
          </header>

          {screen === "library" && (
            <PromptLibrary
              search={search}
              setSearch={setSearch}
              systems={systems}
              filtered={filtered}
              filterOpen={filterOpen}
              setFilterOpen={setFilterOpen}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              loading={loadingList}
              error={listError}
              onRetry={loadPromptSystems}
              onOpen={openEditor}
              onNew={() => {
                setCreateError(null);
                setNewOpen(true);
              }}
              onDelete={promptDelete}
              onArchive={handleArchivePromptSystem}
              onUnarchive={handleUnarchivePromptSystem}
              onRun={(system) => {
                setSystemToRun({ id: system.id, name: system.name, variables: system.variables });
                setScreen("parent_assistant");
              }}
            />
          )}

          {screen === "editor" && (
            <PromptEditor
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              selectedSystem={selectedSystem}
              selectedSystemId={selectedSystemId}
              loadingDetails={loadingDetails}
              detailsError={detailsError}
              saving={saving}
              saveError={saveError}
              saveSuccess={saveSuccess}
              onSave={handleSave}
              onRetry={() => selectedSystemId && fetchDetails(selectedSystemId)}
              onBackToLibrary={() => setScreen("library")}
              onPreview={() => setPreviewOpen(true)}
              onRun={handleRunFromEditor}
              onDelete={() => selectedSystem && promptDelete(selectedSystem)}
              onArchive={handleArchivePromptSystem}
              onUnarchive={handleUnarchivePromptSystem}
              editName={editName}
              setEditName={setEditName}
              editDescription={editDescription}
              setEditDescription={setEditDescription}
              editInstructions={editInstructions}
              setEditInstructions={setEditInstructions}
              editVariables={editVariables}
              editModules={editModules}
              editExamples={editExamples}
              setEditExamples={setEditExamples}
              editOutputFormat={editOutputFormat}
              setEditOutputFormat={setEditOutputFormat}
              onAddVariable={openAddVariable}
              onEditVariable={openEditVariable}
              onDeleteVariable={promptDeleteVariable}
              validationResult={validationResult}
              validatingVariables={validatingVariables}
              onValidateVariables={() => selectedSystemId && runValidateVariables(selectedSystemId)}
              onNavigateToModules={() => setScreen("modules")}
            />
          )}

          {screen === "modules" && (
            <ModuleLibrary
              modules={modules}
              loading={loadingModules}
              error={modulesError}
              onRefresh={loadModules}
              onCreateModule={handleCreateModule}
              onOpenModule={handleOpenModule}
              onEditModule={handleOpenModule}
              onDeleteModule={promptDeleteModule}
              onBack={() => setScreen("library")}
            />
          )}

          {screen === "module-editor" && (
            <ModuleEditor
              key={selectedModuleId ? `module-${selectedModuleId}` : "new-module"}
              module={selectedModule}
              moduleId={selectedModuleId}
              isNew={isNewModule}
              saving={moduleSaving}
              saveError={moduleSaveError}
              saveSuccess={moduleSaveSuccess}
              onSave={handleSaveModule}
              onDelete={
                selectedModule ? () => promptDeleteModule(selectedModule) : undefined
              }
              onBack={() => setScreen("modules")}
            />
          )}

          {screen === "rag" && <RagAssistant onBack={() => setScreen("library")} />}
          
          {screen === "parent_assistant" && systemToRun && (
            <ParentAssistantChat promptSystemId={systemToRun.id} onBack={() => setScreen("library")} />
          )}
        </main>
      </div>

      {/* Dialogs */}
      <CreatePromptSystemDialog
        open={newOpen}
        onOpenChange={(open) => {
          if (!creating) {
            setNewOpen(open);
            if (!open) setCreateError(null);
          }
        }}
        createName={createName}
        setCreateName={setCreateName}
        createDescription={createDescription}
        setCreateDescription={setCreateDescription}
        createInstructions={createInstructions}
        setCreateInstructions={setCreateInstructions}
        creating={creating}
        createError={createError}
        onSubmit={handleCreatePromptSystem}
      />

      <DeletePromptSystemDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!deleting) {
            setDeleteDialogOpen(open);
            if (!open) {
              setDeleteError(null);
              setSystemToDelete(null);
            }
          }
        }}
        system={systemToDelete}
        deleting={deleting}
        deleteError={deleteError}
        onConfirm={handleConfirmDelete}
      />

      <VariableModal
        open={variableModalOpen}
        onOpenChange={(open) => {
          if (!varSaving) {
            setVariableModalOpen(open);
            if (!open) setVarError(null);
          }
        }}
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
        saving={varSaving}
        error={varError}
        onSubmit={handleSaveVariable}
      />

      <DeleteVariableDialog
        open={deleteVarDialogOpen}
        onOpenChange={(open) => {
          if (!varDeleting) {
            setDeleteVarDialogOpen(open);
            if (!open) {
              setVarDeleteError(null);
              setVarToDelete(null);
            }
          }
        }}
        variable={varToDelete}
        deleting={varDeleting}
        error={varDeleteError}
        onConfirm={handleConfirmDeleteVariable}
      />

      <PromptPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        promptSystemId={selectedSystemId}
        instructions={editInstructions}
        variables={editVariables}
        modules={editModules}
        outputFormat={editOutputFormat}
        copied={copied}
        onCopy={copyPreview}
      />

      <PromptRunModal
        open={runModalOpen}
        onOpenChange={(open) => {
          setRunModalOpen(open);
          if (!open) {
            loadHistory();
          }
        }}
        promptSystemId={systemToRun?.id ?? null}
        promptSystemName={systemToRun?.name}
        variables={systemToRun?.variables}
      />

      <DeleteModuleDialog
        open={deleteModuleDialogOpen}
        onOpenChange={(open) => {
          if (!moduleDeleting) {
            setDeleteModuleDialogOpen(open);
            if (!open) {
              setModuleDeleteError(null);
              setModuleToDelete(null);
            }
          }
        }}
        module={moduleToDelete}
        deleting={moduleDeleting}
        error={moduleDeleteError}
        onConfirm={handleConfirmDeleteModule}
      />
    </div>
  );
}
