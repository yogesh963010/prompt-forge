import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, FileText, Loader2, Plus, Send, Trash2, Upload, User, Zap, Edit2, Check, X, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { promptSystemService, type PromptSystem, type VariableDefinition } from "@/services/promptSystemService";
import { moduleReferenceService, type ModuleReference } from "@/services/moduleReferenceService";
import { conversationsService, type Conversation, type Message } from "@/services/conversationsService";
import { moduleService, type PromptModule } from "@/services/moduleService";
import { ragApi } from "@/services/ragApi";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ModuleEditor } from "./ModuleEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ParentAssistantChatProps {
  promptSystemId: number;
  onBack: () => void;
}

export function ParentAssistantChat({ promptSystemId, onBack }: ParentAssistantChatProps) {
  // System Data
  const [system, setSystem] = useState<PromptSystem | null>(null);
  const [modules, setModules] = useState<ModuleReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Instructions State
  const [isEditingInstructions, setIsEditingInstructions] = useState(false);
  const [editInstructions, setEditInstructions] = useState("");
  const [savingInstructions, setSavingInstructions] = useState(false);

  // Variables State
  const [variables, setVariables] = useState<VariableDefinition[]>([]);

  // Runtime Variables
  const [runtimeVars, setRuntimeVars] = useState<Record<string, string>>({});
  const [varsSaved, setVarsSaved] = useState(false);
  const [isEditingVars, setIsEditingVars] = useState(true);

  // Chat State
  const [activeType, setActiveType] = useState<"parent" | "child">("parent");
  const [activeChildId, setActiveChildId] = useState<number | null>(null);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Documents State
  const [documentStatus, setDocumentStatus] = useState<{has_document: boolean, filename: string | null}>({has_document: false, filename: null});
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Child Assistant Editor State
  const [isEditingChild, setIsEditingChild] = useState(false);
  const [childEditorMode, setChildEditorMode] = useState<"create" | "edit">("create");
  const [editingModule, setEditingModule] = useState<PromptModule | null>(null);
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null);
  const [childSaving, setChildSaving] = useState(false);
  const [childSaveError, setChildSaveError] = useState<string | null>(null);
  const [childSaveSuccess, setChildSaveSuccess] = useState(false);

  // Child Assistant Delete State
  const [deleteChildDialogOpen, setDeleteChildDialogOpen] = useState(false);
  const [childToDelete, setChildToDelete] = useState<ModuleReference | null>(null);
  const [childDeleting, setChildDeleting] = useState(false);
  const [childDeleteError, setChildDeleteError] = useState<string | null>(null);

  // Child Assistant Handlers
  const handleOpenAddChild = () => {
    setChildEditorMode("create");
    setEditingModule(null);
    setEditingModuleId(null);
    setIsEditingChild(true);
  };

  const handleOpenEditChild = async (modId: number) => {
    try {
      const mod = await moduleService.getById(modId);
      setEditingModule(mod);
      setEditingModuleId(mod.id);
      setChildEditorMode("edit");
      setIsEditingChild(true);
    } catch (e: any) {
      alert("Failed to load Child Assistant details.");
    }
  };

  const handleSaveChild = async (payload: any) => {
    setChildSaving(true);
    setChildSaveError(null);
    setChildSaveSuccess(false);

    try {
      if (childEditorMode === "create") {
        // Create new module
        const created = await moduleService.create(payload);
        
        // Associate with parent system
        await moduleReferenceService.attach(promptSystemId, {
          module_id: created.id,
          enabled: true,
          input_mapping: {},
          output_mapping: {},
        });
        
        setChildSaveSuccess(true);
        setTimeout(() => setIsEditingChild(false), 500);
      } else if (editingModuleId) {
        // Update existing module
        await moduleService.update(editingModuleId, payload);
        setChildSaveSuccess(true);
        setTimeout(() => setIsEditingChild(false), 500);
      }
      
      // Reload modules list
      const mods = await moduleReferenceService.list(promptSystemId);
      setModules(mods.filter((m) => m.enabled));
    } catch (e: any) {
      setChildSaveError(e.message || "Failed to save Child Assistant.");
    } finally {
      setChildSaving(false);
    }
  };

  const handleConfirmDeleteChild = async () => {
    if (!childToDelete) return;
    setChildDeleting(true);
    setChildDeleteError(null);
    
    try {
      // Delete the module reference and the module itself
      await moduleReferenceService.remove(promptSystemId, childToDelete.module_id);
      await moduleService.delete(childToDelete.module_id);
      
      setDeleteChildDialogOpen(false);
      setChildToDelete(null);
      
      // Reload modules list
      const mods = await moduleReferenceService.list(promptSystemId);
      setModules(mods.filter((m) => m.enabled));
      
      // If the deleted module was the active child, switch back to parent
      if (activeType === "child" && activeChildId === childToDelete.module_id) {
        setActiveType("parent");
        setActiveChildId(null);
      }
    } catch (e: any) {
      setChildDeleteError(e.message || "Failed to delete Child Assistant.");
    } finally {
      setChildDeleting(false);
    }
  };

  const loadDetails = useCallback(async () => {
    try {
      const sys = await promptSystemService.getById(promptSystemId);
      setSystem(sys);
      setEditInstructions(sys.instructions || "");
      setVariables(Array.isArray(sys.variables) ? sys.variables : []);
      
      const initialRuntimeVars: Record<string, string> = {};
      if (Array.isArray(sys.variables)) {
        sys.variables.forEach(v => {
          const val = (v.default !== undefined && v.default !== null) ? String(v.default) : "";
          initialRuntimeVars[v.name] = val;
        });
      }
      setRuntimeVars(initialRuntimeVars);

      const mods = await moduleReferenceService.list(promptSystemId);
      setModules(mods.filter((m) => m.enabled));
      
      try {
        const convs = await conversationsService.getConversations();
        const latestParentConv = convs.find(c => c.prompt_system_id === promptSystemId && !c.module_id);
        if (latestParentConv) {
          setCurrentConversation(latestParentConv);
        }
      } catch(e) {
        console.error("Failed to load history", e);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load Parent Assistant details");
    } finally {
      setLoading(false);
    }
  }, [promptSystemId]);

  useEffect(() => {
    setLoading(true);
    loadDetails();
  }, [loadDetails]);

  // Load Doc Status
  const loadDocStatus = useCallback(async () => {
    try {
      const status = await ragApi.getStatus();
      setDocumentStatus(status);
    } catch (err) {
      console.error("Failed to load document status", err);
    }
  }, []);

  useEffect(() => {
    loadDocStatus();
  }, [loadDocStatus]);

  // Load Conversation
  useEffect(() => {
    async function loadConversation() {
      try {
        const allConvs = await conversationsService.getConversations();
        let targetConv = null;
        if (activeType === "parent") {
          targetConv = allConvs.find(c => c.prompt_system_id === promptSystemId && !c.module_id);
        } else {
          targetConv = allConvs.find(c => c.module_id === activeChildId);
        }
        
        if (targetConv) {
          setCurrentConversation(targetConv);
          const msgs = await conversationsService.getMessages(targetConv.id);
          setMessages(msgs);
        } else {
          setCurrentConversation(null);
          setMessages([]);
        }
      } catch (err) {
        console.error("Failed to load conversation", err);
      }
    }
    if (!loading) {
      loadConversation();
    }
  }, [activeType, activeChildId, promptSystemId, loading]);

  // Update Variables when switching active type
  useEffect(() => {
    if (loading) return;
    
    let targetVars: VariableDefinition[] = [];
    if (activeType === "parent") {
      targetVars = variables;
    } else {
      const activeModRef = modules.find(m => m.module_id === activeChildId);
      targetVars = (activeModRef?.module_variables as VariableDefinition[]) || [];
    }

    const initialRuntimeVars: Record<string, string> = {};
    let hasSavedValue = false;
    
    targetVars.forEach(v => {
      const val = (v.default !== undefined && v.default !== null) ? String(v.default) : "";
      initialRuntimeVars[v.name] = val;
      if (val) hasSavedValue = true;
    });

    setRuntimeVars(initialRuntimeVars);
    setIsEditingVars(!hasSavedValue);
  }, [activeType, activeChildId, variables, modules, loading]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  // --- Handlers: Instructions ---
  const handleSaveInstructions = async () => {
    if (!system) return;
    setSavingInstructions(true);
    try {
      const updated = await promptSystemService.update(system.id, { instructions: editInstructions });
      setSystem(updated);
      setIsEditingInstructions(false);
    } catch (err: any) {
      alert(err.message || "Failed to save instructions");
    } finally {
      setSavingInstructions(false);
    }
  };


  // --- Handlers: Documents ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadingDoc(true);
      setDocError(null);
      try {
        await ragApi.uploadDocument(file);
        await loadDocStatus();
      } catch (err: any) {
        setDocError(err.message || "Upload failed");
      } finally {
        setUploadingDoc(false);
        e.target.value = "";
      }
    }
  };

  const handleRemoveDoc = async () => {
    setUploadingDoc(true);
    setDocError(null);
    try {
      await ragApi.deleteDocuments();
      await loadDocStatus();
    } catch (err: any) {
      setDocError(err.message || "Delete failed");
    } finally {
      setUploadingDoc(false);
    }
  };

  // --- Handlers: Chat ---
  const handleStartNewConversation = async () => {
    try {
      const conv = await conversationsService.createConversation({
        title: "New Conversation",
        prompt_system_id: activeType === "parent" ? promptSystemId : undefined,
        module_id: activeType === "child" ? activeChildId! : undefined,
      });
      setCurrentConversation(conv);
      setMessages([]);
      setChatError(null);
    } catch (err: any) {
      setChatError("Failed to start new conversation");
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || sending || !system) return;

    let conv = currentConversation;
    if (!conv) {
      try {
        conv = await conversationsService.createConversation({
          title: input.slice(0, 30) + "...",
          prompt_system_id: activeType === "parent" ? promptSystemId : undefined,
          module_id: activeType === "child" ? activeChildId! : undefined,
        });
        setCurrentConversation(conv);
      } catch (err: any) {
        console.error("Failed to create conversation:", err, err.data);
        setChatError(`Failed to create conversation: ${err.message || "Unknown error"}`);
        return;
      }
    }

    const tempMsg: Message = {
      id: Date.now(),
      conversation_id: conv.id,
      role: "user",
      content: input,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMsg]);
    const userMessageContent = input;
    setInput("");
    setSending(true);
    setChatError(null);

    try {
      // Create user message in DB
      await conversationsService.createMessage(conv.id, "user", userMessageContent);

      // Construct LLM payload context
      let combinedQuestion = "";
      
      if (activeType === "child" && activeChildId) {
        // Use Context API for Child Assistants
        const context = await conversationsService.getAssistantContext(activeChildId, conv.id);
        
        let promptPrefix = "";
        if (context.parent_instructions) {
          promptPrefix += `[Parent System Instructions]\n${context.parent_instructions}\n\n`;
        }
        if (context.current_child_instructions) {
          promptPrefix += `[Child Module Instructions]\n${context.current_child_instructions}\n\n`;
        }
        
        const parentVars = context.parent_context?.variables || [];
        if (parentVars.length > 0) {
           promptPrefix += `[Parent Variables]\n${JSON.stringify(parentVars, null, 2)}\n\n`;
        }
        
        const childVars = Object.entries(runtimeVars); // Using runtimeVars for both parent/child for now
        if (childVars.length > 0) {
          promptPrefix += `[Child Variables]\n${childVars.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n`;
        }
        
        // Add previous conversations context
        if (context.previous_child_context && context.previous_child_context.length > 0) {
           promptPrefix += `[Previous Child Conversations]\n${JSON.stringify(context.previous_child_context, null, 2)}\n\n`;
        }
        
        promptPrefix += `[User Message]\n`;
        combinedQuestion = `${promptPrefix}${userMessageContent}`;
      } else {
        // Manual context for Parent Assistant
        let promptPrefix = "";
        if (system.instructions) {
          promptPrefix += `[System Instructions]\n${system.instructions}\n\n`;
        }
        
        const varEntries = Object.entries(runtimeVars);
        if (varEntries.length > 0) {
          promptPrefix += `[Variables]\n${varEntries.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n`;
        }

        promptPrefix += `[User Message]\n`;

        combinedQuestion = `${promptPrefix}${userMessageContent}`;
      }

      // Call Railway RAG backend
      const response = await ragApi.askQuestion(combinedQuestion, conv.id.toString());
      
      const assistantMsgContent = response.answer;

      // Save assistant message in DB
      const reply = await conversationsService.createMessage(conv.id, "assistant", assistantMsgContent);
      
      // Update UI
      setMessages((prev) => [...prev, reply]);
    } catch (err: any) {
      setChatError(err.message || "Failed to get AI response");
    } finally {
      setSending(false);
    }
  };

  if (loading && !system) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !system) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Alert variant="destructive" className="max-w-md">
          <AlertDescription>{error || "Prompt System not found."}</AlertDescription>
        </Alert>
        <Button onClick={onBack} className="mt-4" variant="outline">
          Back to Library
        </Button>
      </div>
    );
  }

  if (isEditingChild) {
    return (
      <div className="h-[calc(100vh-60px)] overflow-y-auto">
        <ModuleEditor
          module={editingModule}
          moduleId={editingModuleId}
          isNew={childEditorMode === "create"}
          saving={childSaving}
          saveError={childSaveError}
          saveSuccess={childSaveSuccess}
          onSave={handleSaveChild}
          onBack={() => setIsEditingChild(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-60px)] flex-col md:flex-row bg-background">
      {/* LEFT PANEL: Details & Documents */}
      <aside className="w-full border-r border-border/60 bg-muted/10 md:w-80 flex flex-col overflow-y-auto">
        <div className="p-4 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur z-10">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-2 text-muted-foreground w-full justify-start hover:bg-muted/50">
            <ArrowLeft className="mr-2 size-4" />
            Back to Home
          </Button>
          <h2 className="text-xl font-bold tracking-tight text-foreground">{system.name}</h2>
          <span className="inline-flex mt-2 items-center rounded-full px-2 py-0.5 text-xs font-semibold transition-colors bg-primary/10 text-primary border-primary/20">
            Parent Assistant
          </span>
        </div>

        <div className="p-4 space-y-6 flex-1">
          {/* Details Section */}
          <section className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</h3>
              <p className="text-sm text-foreground">{system.description || "No description provided."}</p>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Instructions</h3>
                {!isEditingInstructions ? (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditingInstructions(true)}>
                    <Edit2 className="size-3" />
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => { setIsEditingInstructions(false); setEditInstructions(system.instructions || ""); }}>
                      <X className="size-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-success" onClick={handleSaveInstructions} disabled={savingInstructions}>
                      {savingInstructions ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    </Button>
                  </div>
                )}
              </div>
              {!isEditingInstructions ? (
                <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded-md border border-border/50 line-clamp-6 whitespace-pre-wrap">
                  {system.instructions || "No instructions provided."}
                </p>
              ) : (
                <Textarea 
                  value={editInstructions}
                  onChange={(e) => setEditInstructions(e.target.value)}
                  className="text-xs min-h-[120px]"
                />
              )}
            </div>

            {(() => {
              const activeModRef = activeType === "child" ? modules.find(m => m.module_id === activeChildId) : null;
              const activeVariables = activeType === "parent" 
                ? variables 
                : (activeModRef?.module_variables as VariableDefinition[] || []);
                
              if (activeVariables.length === 0) return null;

              return (
                <div className="mt-4 pt-4 border-t border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {activeType === "parent" ? "Parent Variables" : "Child Variables"}
                    </h3>
                    {!isEditingVars && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditingVars(true)}>
                        <Edit2 className="size-3" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {activeVariables.map(v => (
                      <div key={`runtime-${v.name}`} className="space-y-1">
                        <label className="text-xs text-muted-foreground">{v.label || v.name}</label>
                        {isEditingVars ? (
                          <Input 
                            value={runtimeVars[v.name] || ""} 
                            onChange={(e) => setRuntimeVars(prev => ({ ...prev, [v.name]: e.target.value }))}
                            className="h-7 text-xs bg-card"
                          />
                        ) : (
                          <div className="text-sm font-medium text-foreground bg-muted/30 p-1.5 rounded border border-border/40 min-h-[28px] break-words">
                            {runtimeVars[v.name] || <span className="text-muted-foreground italic text-xs">Not provided</span>}
                          </div>
                        )}
                      </div>
                    ))}
                    {isEditingVars && (
                      <Button 
                        size="sm" 
                        variant={varsSaved ? "secondary" : "default"}
                        className="w-full mt-2 h-7 text-xs transition-all" 
                        disabled={varsSaved}
                        onClick={async () => {
                          try {
                            const updatedVariables = activeVariables.map(v => ({
                              ...v,
                              default: runtimeVars[v.name] || v.default
                            }));
                            
                            if (activeType === "parent") {
                              if (!system) return;
                              await promptSystemService.updateVariables(system.id, updatedVariables);
                              setVariables(updatedVariables);
                            } else {
                              if (!activeChildId) return;
                              await moduleService.update(activeChildId, { variables: updatedVariables });
                              // Reload modules to update module_variables
                              const mods = await moduleReferenceService.list(promptSystemId);
                              setModules(mods.filter((m) => m.enabled));
                            }
                            
                            setVarsSaved(true);
                            setTimeout(() => {
                              setVarsSaved(false);
                              setIsEditingVars(false);
                            }, 500);
                          } catch (err: any) {
                            alert(err.message || "Failed to save variables to database");
                          }
                        }}
                      >
                        {varsSaved ? (
                          <><Check className="mr-1.5 size-3 text-success" /> Submitted</>
                        ) : (
                          "Submit Variables"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Child Assistants Section */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center justify-between">
              Child Assistants
              <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-[9px]">{modules.length}</span>
            </h3>
            <div className="space-y-1.5">
              <button
                onClick={() => { setActiveType("parent"); setActiveChildId(null); }}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-all border ${
                  activeType === "parent" 
                    ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                    : "bg-card hover:bg-accent border-border/50 text-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Bot className="size-4" />
                  <span className="font-medium truncate">{system.name} (Parent)</span>
                </div>
              </button>
              
              {modules.map((mod) => (
                <div key={mod.id} className="group relative flex items-center">
                  <button
                    onClick={() => { setActiveType("child"); setActiveChildId(mod.module_id); }}
                    className={`flex-1 text-left rounded-lg px-3 py-2 pr-16 text-sm transition-all border ${
                      activeType === "child" && activeChildId === mod.module_id 
                        ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                        : "bg-card hover:bg-accent border-border/50 text-foreground opacity-60 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="size-3.5 opacity-70 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium truncate block">{mod.module_name || `Module #${mod.module_id}`}</span>
                      </div>
                    </div>
                  </button>
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 h-7 w-7 text-muted-foreground hover:text-foreground bg-background/50 backdrop-blur"
                      onClick={() => handleOpenEditChild(mod.module_id)}
                      title="Edit Child Assistant"
                    >
                      <Edit2 className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 h-7 w-7 text-muted-foreground hover:text-destructive bg-background/50 backdrop-blur"
                      onClick={() => {
                        setChildToDelete(mod);
                        setDeleteChildDialogOpen(true);
                      }}
                      title="Delete Child Assistant"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2 border-dashed h-8 text-xs text-muted-foreground"
                onClick={handleOpenAddChild}
              >
                <Plus className="mr-1.5 size-3" /> Add Child Assistant
              </Button>
            </div>
          </section>

          {/* Documents Section (Mock for RAG) */}
          <section className="border-t border-border/60 pt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documents (RAG)</h3>
              <Button size="icon" variant="ghost" className="size-6 rounded-full h-6 w-6" onClick={() => fileInputRef.current?.click()} disabled={uploadingDoc || documentStatus.has_document}>
                {uploadingDoc ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              </Button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.txt,.docx,.md,.csv" onChange={handleFileUpload} />
            </div>
            
            {docError && (
              <Alert variant="destructive" className="mb-2 py-2 px-3 h-auto min-h-0 text-xs">
                <AlertDescription className="text-xs">{docError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              {!documentStatus.has_document ? (
                <div className="flex flex-col items-center justify-center p-4 border border-dashed border-border/60 rounded-lg bg-muted/20 text-center">
                  <Upload className="size-4 text-muted-foreground mb-1" />
                  <span className="text-[10px] text-muted-foreground">Upload files for context</span>
                </div>
              ) : (
                <div className="flex items-center justify-between p-2 rounded-md border border-border/50 bg-card/50">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <FileText className="size-3.5 text-primary shrink-0" />
                    <span className="text-xs truncate font-medium">{documentStatus.filename || "Uploaded Document"}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="size-5 hover:bg-destructive/20 hover:text-destructive shrink-0" onClick={handleRemoveDoc} disabled={uploadingDoc}>
                    {uploadingDoc ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                  </Button>
                </div>
              )}
            </div>
          </section>
        </div>
      </aside>

      {/* RIGHT PANEL: Chatbot */}
      <div className="flex flex-1 flex-col overflow-hidden bg-card/30 relative">
        {/* Chat Header */}
        <header className="border-b border-border/60 bg-background/95 backdrop-blur px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              {activeType === "parent" ? <Bot className="size-4.5" /> : <Zap className="size-4.5" />}
            </div>
            <div>
              <h2 className="text-base font-semibold leading-none">
                {activeType === "parent" ? system.name : modules.find(m => m.module_id === activeChildId)?.module_name || "Child Assistant"}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                {activeType === "parent" ? "Parent Assistant Chat" : "Child Assistant Chat (Preview)"}
              </p>
            </div>
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 relative">
          {activeType === "child" && (
             <div className="mx-auto max-w-md mb-6">
                <Alert className="bg-primary/5 border-primary/20">
                  <AlertDescription className="text-xs text-center text-primary/80">
                    Child Assistant detailed chat implementation will be done later. Clicking here is ready for future implementation.
                  </AlertDescription>
                </Alert>
             </div>
          )}

          {messages.length === 0 && !sending ? (
            <div className="flex h-full flex-col items-center justify-center text-center opacity-60">
              <Bot className="size-12 mb-3 text-primary/50" />
              <h3 className="font-semibold text-lg">Start a conversation</h3>
              <p className="text-sm max-w-sm mt-1">Send a message to interact with {activeType === "parent" ? "the Parent Assistant" : "this Child Assistant"}.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div key={msg.id || idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="flex max-w-[85%] md:max-w-[75%] gap-3">
                  {msg.role !== "user" && (
                    <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                      <Bot className="size-3.5" />
                    </div>
                  )}
                  <div className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-card border border-border/50 text-foreground rounded-tl-sm"}`}>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    {msg.created_at && (
                       <div className={`mt-1.5 text-[9px] ${msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                         {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}

          {sending && (
             <div className="flex justify-start">
               <div className="flex max-w-[85%] gap-3">
                 <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                   <Bot className="size-3.5 animate-pulse" />
                 </div>
                 <div className="rounded-2xl px-4 py-3 text-sm bg-card border border-border/50 flex items-center gap-2">
                   <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                   <span className="text-muted-foreground text-xs">AI is thinking...</span>
                 </div>
               </div>
             </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Chat Input */}
        <div className="border-t border-border/60 bg-background/95 backdrop-blur p-4 pb-6">
          {chatError && (
             <Alert variant="destructive" className="mb-3 py-2 px-3 h-auto min-h-0 text-xs mx-auto max-w-4xl">
               <AlertDescription className="text-xs">{chatError}</AlertDescription>
             </Alert>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative flex items-center max-w-4xl mx-auto"
          >
            <input
              type="text"
              placeholder={`Message ${activeType === "parent" ? "Parent Assistant" : "Child Assistant"}...`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full rounded-full border border-border bg-card pl-5 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm disabled:opacity-50"
              disabled={sending}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || sending}
              className="absolute right-2 size-9 rounded-full transition-all"
            >
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </div>
      <Dialog open={deleteChildDialogOpen} onOpenChange={(open) => !childDeleting && setDeleteChildDialogOpen(open)}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Child Assistant</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">"{childToDelete?.module_name || 'this module'}"</span>? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {childDeleteError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{childDeleteError}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:space-x-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteChildDialogOpen(false)}
              disabled={childDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmDeleteChild}
              disabled={childDeleting}
            >
              {childDeleting ? (
                <><Loader2 className="mr-1.5 size-3.5 animate-spin" /> Deleting...</>
              ) : (
                <><Trash2 className="mr-1.5 size-3.5" /> Delete</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
