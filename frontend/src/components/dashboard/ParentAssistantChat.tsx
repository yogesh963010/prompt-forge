import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Bot, FileText, Loader2, Plus, Send, Trash2, Edit2, Paperclip, MoreHorizontal, MessageSquare, Search, ChevronDown, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { promptSystemService, type PromptSystem } from "@/services/promptSystemService";
import { moduleReferenceService, type ModuleReference } from "@/services/moduleReferenceService";
import { conversationsService, type Conversation, type Message } from "@/services/conversationsService";
import { moduleService, type PromptModule } from "@/services/moduleService";
import { ragApi } from "@/services/ragApi";
import { documentService, type DocumentItem } from "@/services/documentService";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ModuleEditor } from "./ModuleEditor";

interface ParentAssistantChatProps {
  promptSystemId: number;
  onBack: () => void;
}

export function ParentAssistantChat({ promptSystemId, onBack }: ParentAssistantChatProps) {
  const [system, setSystem] = useState<PromptSystem | null>(null);
  const [modules, setModules] = useState<ModuleReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [runtimeVars, setRuntimeVars] = useState<Record<string, string>>({});

  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [renamingChatId, setRenamingChatId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const [activeSubAssistantId, setActiveSubAssistantId] = useState<number | null>(null);

  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");
  const [newChatVars, setNewChatVars] = useState<Record<string, string>>({});
  const [newChatErrors, setNewChatErrors] = useState<Record<string, string>>({});

  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [attachedDocs, setAttachedDocs] = useState<DocumentItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [isEditingChild, setIsEditingChild] = useState(false);
  const [childEditorMode, setChildEditorMode] = useState<"create" | "edit">("create");
  const [editingModule, setEditingModule] = useState<PromptModule | null>(null);
  const [editingModuleId, setEditingModuleId] = useState<number | null>(null);
  const [childSaving, setChildSaving] = useState(false);
  const [childSaveError, setChildSaveError] = useState<string | null>(null);
  const [childSaveSuccess, setChildSaveSuccess] = useState(false);

  const [docToDelete, setDocToDelete] = useState<DocumentItem | null>(null);
  const [isDeletingDoc, setIsDeletingDoc] = useState(false);
  const [deleteDocError, setDeleteDocError] = useState<string | null>(null);

  const [childToDelete, setChildToDelete] = useState<ModuleReference | null>(null);
  const [isDeletingChild, setIsDeletingChild] = useState(false);
  const [deleteChildError, setDeleteChildError] = useState<string | null>(null);

  const [isClearChatModalOpen, setIsClearChatModalOpen] = useState(false);
  const [isClearingChat, setIsClearingChat] = useState(false);
  const [clearChatError, setClearChatError] = useState<string | null>(null);

  const isCreatingInitialChatRef = useRef(false);

  const loadDetails = useCallback(async () => {
    try {
      const sys = await promptSystemService.getById(promptSystemId);
      setSystem(sys);

      const mods = await moduleReferenceService.list(promptSystemId);
      setModules(mods.filter((m) => m.enabled));

      const convs = await conversationsService.getConversations();
      const parentConvs = convs.filter(c => c.prompt_system_id === promptSystemId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAllConversations(parentConvs);

      if (parentConvs.length > 0) {
        setCurrentConversation(parentConvs[0]);
        setRuntimeVars(parentConvs[0].variables || {});
      } else if (!isCreatingInitialChatRef.current) {
        isCreatingInitialChatRef.current = true;
        try {
          const conv = await conversationsService.createConversation({
            title: sys.name,
            prompt_system_id: promptSystemId,
            variables: {}
          });
          setAllConversations([conv]);
          setCurrentConversation(conv);
          setRuntimeVars({});
        } catch (createErr) {
          console.error("Failed to create initial conversation:", createErr);
          isCreatingInitialChatRef.current = false;
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to load details");
    } finally {
      setLoading(false);
    }
  }, [promptSystemId]);

  useEffect(() => {
    setLoading(true);
    loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    async function loadConversation() {
      if (currentConversation) {
        try {
          const msgs = await conversationsService.getMessages(currentConversation.id);
          setMessages(msgs);
        } catch (err) {
          console.error("Failed to load messages", err);
        }
      } else {
        setMessages([]);
      }
    }
    if (!loading) {
      loadConversation();
    }
  }, [currentConversation, loading]);

  useEffect(() => {
    if (!loading) {
      let targetVars = Array.isArray(system?.variables) ? system?.variables : [];
      if (activeSubAssistantId) {
        const activeModRef = modules.find(m => m.module_id === activeSubAssistantId);
        if (activeModRef && activeModRef.module_variables) {
          targetVars = [...targetVars, ...(activeModRef.module_variables as any[])];
        }
      }
      const newRuntimeVars: Record<string, string> = { ...runtimeVars };
      targetVars.forEach(v => {
        if (!(v.name in newRuntimeVars)) {
          newRuntimeVars[v.name] = "";
        }
      });
      setRuntimeVars(newRuntimeVars);
    }
  }, [activeSubAssistantId, system, modules, loading]);

  const loadAttachedDocs = useCallback(async () => {
    try {
      const docs = await documentService.listDocuments(promptSystemId, activeSubAssistantId ?? null, currentConversation?.id, activeSubAssistantId === null);
      setAttachedDocs(docs);
    } catch (e) {
      console.error(e);
    }
  }, [promptSystemId, activeSubAssistantId, currentConversation?.id]);

  useEffect(() => {
    loadAttachedDocs();
  }, [loadAttachedDocs]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleStartNewConversation = async (fallbackTitle?: string | React.MouseEvent, variables?: Record<string, string>) => {
    try {
      const titleString = typeof fallbackTitle === 'string' ? fallbackTitle : (system?.name || "New Chat");
      const convVars = variables || {};
      const conv = await conversationsService.createConversation({
        title: titleString,
        prompt_system_id: promptSystemId,
        variables: convVars,
      });
      setAllConversations([conv, ...allConversations]);
      setCurrentConversation(conv);
      setRuntimeVars(convVars);
      setMessages([]);
      setChatError(null);
    } catch (err: any) {
      setChatError("Failed to start new conversation");
    }
  };

  const handleRenameChat = async (e: React.FormEvent, conv: Conversation) => {
    e.preventDefault();
    if (!renameValue.trim()) {
      setRenamingChatId(null);
      return;
    }
    try {
      const updated = await conversationsService.updateConversation(conv.id, { title: renameValue });
      setAllConversations(allConversations.map(c => c.id === conv.id ? updated : c));
      if (currentConversation?.id === conv.id) setCurrentConversation(updated);
      setRenamingChatId(null);
    } catch (err) {
      console.error(err);
      setRenamingChatId(null);
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, conv: Conversation) => {
    e.stopPropagation();
    try {
      await conversationsService.deleteConversation(conv.id);
      const newConvs = allConversations.filter(c => c.id !== conv.id);
      setAllConversations(newConvs);
      if (currentConversation?.id === conv.id) {
        const nextConv = newConvs.length > 0 ? newConvs[0] : null;
        setCurrentConversation(nextConv);
        if (nextConv) {
           setRuntimeVars(nextConv.variables || {});
        } else {
           handleStartNewConversation(system?.name);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectConversation = (conv: Conversation) => {
    if (renamingChatId === conv.id) return;
    setCurrentConversation(conv);
    setRuntimeVars(conv.variables || {});
  };

  const handleOpenAddChild = () => {
    setChildEditorMode("create");
    setEditingModule(null);
    setEditingModuleId(null);
    setIsEditingChild(true);
  };

  const handleSaveChild = async (payload: any) => {
    setChildSaving(true);
    setChildSaveError(null);
    setChildSaveSuccess(false);

    try {
      if (childEditorMode === "create") {
        const created = await moduleService.create(payload);
        await moduleReferenceService.attach(promptSystemId, {
          module_id: created.id,
          enabled: true,
          input_mapping: {},
          output_mapping: {},
        });
        setChildSaveSuccess(true);
        setTimeout(() => setIsEditingChild(false), 500);
      } else if (editingModuleId) {
        await moduleService.update(editingModuleId, payload);
        setChildSaveSuccess(true);
        setTimeout(() => setIsEditingChild(false), 500);
      }

      const mods = await moduleReferenceService.list(promptSystemId);
      setModules(mods.filter((m) => m.enabled));
    } catch (e: any) {
      setChildSaveError(e.message || "Failed to save Sub Assistant.");
    } finally {
      setChildSaving(false);
    }
  };

  const handleEditChild = async (modRef: ModuleReference) => {
    try {
      const fullModule = await moduleService.getById(modRef.module_id);
      setEditingModule(fullModule);
      setEditingModuleId(modRef.module_id);
      setChildEditorMode("edit");
      setIsEditingChild(true);
    } catch (e: any) {
      console.error("Failed to load module for editing:", e);
    }
  };

  const confirmDeleteChild = async () => {
    if (!childToDelete) return;
    setIsDeletingChild(true);
    setDeleteChildError(null);
    try {
      await moduleReferenceService.remove(promptSystemId, childToDelete.id);
      await moduleService.delete(childToDelete.module_id);
      setModules(modules.filter(m => m.module_id !== childToDelete.module_id));
      if (activeSubAssistantId === childToDelete.module_id) setActiveSubAssistantId(null);
      setChildToDelete(null);
    } catch (e: any) {
      setDeleteChildError(e.message || "Failed to delete Sub Assistant.");
    } finally {
      setIsDeletingChild(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadingDoc(true);
      try {
        await documentService.uploadDocument(
          file,
          promptSystemId,
          activeSubAssistantId ?? null,
          currentConversation?.id ?? null
        );
        loadAttachedDocs();
      } catch (err: any) {
        alert(err.message || "Upload failed");
      } finally {
        setUploadingDoc(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

  const confirmDeleteDoc = async () => {
    if (!docToDelete) return;
    setIsDeletingDoc(true);
    setDeleteDocError(null);
    try {
      await documentService.deleteDocument(docToDelete.id);
      loadAttachedDocs();
      setDocToDelete(null);
    } catch (e: any) {
      setDeleteDocError(e.message || "Failed to delete document");
    } finally {
      setIsDeletingDoc(false);
    }
  };

  const confirmClearChat = async () => {
    if (!currentConversation) return;
    setIsClearingChat(true);
    setClearChatError(null);
    try {
      await conversationsService.clearMessages(currentConversation.id);
      setMessages([]);
      setIsClearChatModalOpen(false);
    } catch (e: any) {
      setClearChatError(e.message || "Failed to clear chat.");
    } finally {
      setIsClearingChat(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || sending || !system) return;

    let conv = currentConversation;
    if (!conv) {
      try {
        conv = await conversationsService.createConversation({
          title: input.slice(0, 30) + "...",
          prompt_system_id: promptSystemId,
        });
        setAllConversations([conv, ...allConversations]);
        setCurrentConversation(conv);
      } catch (err: any) {
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
      await conversationsService.createMessage(conv.id, "user", userMessageContent);

      let docContextText = "";
      try {
        const docCtx = await documentService.getScopeContext(
          promptSystemId,
          activeSubAssistantId ?? null,
          conv.id
        );
        if (docCtx.context_text) {
          docContextText = `[Grounding Documents Context - Isolated Scope]\n${docCtx.context_text}\n\n`;
        }
      } catch (e) {
        console.warn("Failed to fetch document context", e);
      }

      let promptPrefix = "";

      if (activeSubAssistantId) {
        const context = await conversationsService.getAssistantContext(activeSubAssistantId, conv.id);

        promptPrefix = `[Assistant Scope: Sub Assistant (Module #${activeSubAssistantId})]\n`;
        if (context.parent_instructions) {
          promptPrefix += `[Parent System Instructions]\n${context.parent_instructions}\n\n`;
        }
        if (context.current_child_instructions) {
          promptPrefix += `[Sub Assistant Instructions]\n${context.current_child_instructions}\n\n`;
        }

        const parentVars = context.parent_context?.variables || [];
        if (parentVars.length > 0) {
          promptPrefix += `[Parent Variables]\n${JSON.stringify(parentVars, null, 2)}\n\n`;
        }

        const childVars = Object.entries(runtimeVars);
        if (childVars.length > 0) {
          promptPrefix += `[Active Variables]\n${childVars.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n`;
        }

        if (context.previous_child_context && context.previous_child_context.length > 0) {
          promptPrefix += `[Previous Conversations Context]\n${JSON.stringify(context.previous_child_context, null, 2)}\n\n`;
        }
      } else {
        promptPrefix = `[Assistant Scope: Parent Assistant (System #${promptSystemId})]\n`;
        if (system.instructions) {
          promptPrefix += `[System Instructions]\n${system.instructions}\n\n`;
        }

        const varEntries = Object.entries(runtimeVars);
        if (varEntries.length > 0) {
          promptPrefix += `[Variables]\n${varEntries.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n`;
        }
      }

      if (docContextText) {
        promptPrefix += docContextText;
      }
      promptPrefix += `[User Message]\n`;
      // We pass the userMessageContent directly to the endpoint as was done previously
      const scopedSessionId = `pf_u${system.owner_id}_s${promptSystemId}_${activeSubAssistantId ? `m${activeSubAssistantId}` : "p"}_c${conv.id}`;
      const response = await ragApi.askQuestion(
        userMessageContent,
        scopedSessionId,
        conv.id,
        promptSystemId,
        activeSubAssistantId || undefined,
        runtimeVars
      );

      const assistantMsgContent = response.answer;
      const reply = await conversationsService.createMessage(conv.id, "assistant", assistantMsgContent);
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
          <AlertDescription>{error || "Assistant not found."}</AlertDescription>
        </Alert>
        <Button onClick={onBack} className="mt-4" variant="outline">
          Back to Library
        </Button>
      </div>
    );
  }

  if (isEditingChild) {
    return (
      <div className="h-full overflow-y-auto">
        <ModuleEditor
          module={editingModule}
          moduleId={editingModuleId}
          isNew={childEditorMode === "create"}
          saving={childSaving}
          saveError={childSaveError}
          saveSuccess={childSaveSuccess}
          entityType="assistant"
          onSave={handleSaveChild}
          onBack={() => setIsEditingChild(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className="w-[280px] border-r border-border/60 bg-muted/10 flex flex-col shrink-0">
        <div className="p-4 border-b border-border/60">
          <Button onClick={onBack} variant="ghost" className="mb-4 text-muted-foreground w-full justify-start -ml-2 hover:bg-muted/50">
            <ArrowLeft className="mr-2 size-4" /> Back to Library
          </Button>
          <div className="flex items-center gap-2 px-1">
            <div className="bg-primary/10 p-1.5 rounded text-primary">
              <Bot className="size-5" />
            </div>
            <h2 className="text-lg font-bold">{system.name}</h2>
          </div>
        </div>

        <div className="p-4 flex flex-col flex-1 overflow-hidden">
          <Button className="w-full mb-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm" onClick={() => {
            setNewChatTitle("");
            const initialVars: Record<string, string> = {};
            if (Array.isArray(system?.variables)) {
              system.variables.forEach(v => {
                initialVars[v.name] = v.type === "boolean" ? "false" : "";
              });
            }
            setNewChatVars(initialVars);
            setNewChatErrors({});
            setNewChatModalOpen(true);
          }}>
            <Plus className="mr-2 size-4" /> New Chat
          </Button>

          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-sm font-semibold">Chats</h3>
            <Search className="size-4 text-muted-foreground" />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-2">
            {allConversations.map(conv => (
              <div
                key={conv.id}
                className={`p-3 rounded-lg cursor-pointer flex justify-between items-start transition-colors ${currentConversation?.id === conv.id ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-foreground"}`}
                onClick={() => handleSelectConversation(conv)}
              >
                <div className="overflow-hidden pr-2 flex-1">
                  {renamingChatId === conv.id ? (
                    <form onSubmit={(e) => handleRenameChat(e, conv)} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="h-6 text-sm px-1 py-0 w-full"
                        autoFocus
                        onBlur={(e) => handleRenameChat(e as any, conv)}
                      />
                    </form>
                  ) : (
                    <>
                      <div className="font-medium text-sm flex items-center gap-2 truncate">
                        <MessageSquare className="size-3.5 shrink-0" />
                        <span className="truncate">{conv.title || "New Chat"}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 ml-5.5">
                        {new Date(conv.created_at).toLocaleDateString()} {new Date(conv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground shrink-0 p-0 ml-1">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingChatId(conv.id);
                        setRenameValue(conv.title || "");
                      }}
                    >
                      <Edit2 className="size-4 mr-2" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => handleDeleteChat(e as any, conv)}
                      className="text-destructive focus:bg-destructive focus:text-destructive-foreground"
                    >
                      <Trash2 className="size-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        {/* Header */}
        <header className="h-14 border-b border-border/60 bg-background flex items-center justify-between px-6 shrink-0">
          <h2 className="text-lg font-bold">{system.name}</h2>
          <div className="flex items-center">
            <div className="flex items-center gap-2 bg-primary/10 text-primary rounded-full pl-1 pr-3 py-1 text-sm font-medium">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">Y</span>
              Yogesh
              <ChevronDown className="size-3.5 ml-1" />
            </div>
          </div>
        </header>

        {/* Sub Assistants Bar */}
        <div className="px-6 py-3 border-b border-border/60 bg-background flex items-center gap-3 overflow-x-auto shrink-0 shadow-sm z-10">
          <span className="text-sm font-bold text-foreground whitespace-nowrap">Sub Assistants:</span>
          {modules.map(mod => {
            const isActive = activeSubAssistantId === mod.module_id;
            return (
              <div
                key={mod.id}
                className={`flex items-center rounded-full transition-all border ${isActive ? "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 border-primary" : "bg-muted/60 hover:bg-muted text-foreground border-border"}`}
              >
                <button
                  type="button"
                  className="flex items-center h-8 px-3 rounded-l-full text-sm font-medium"
                  onClick={() => setActiveSubAssistantId(isActive ? null : mod.module_id)}
                >
                  {isActive ? <Send className="mr-1.5 size-3.5" /> : <RefreshCw className="mr-1.5 size-3.5" />}
                  {mod.module_name}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={`h-8 px-2 rounded-r-full flex items-center justify-center opacity-70 hover:opacity-100 ${isActive ? "hover:bg-primary-foreground/20" : "hover:bg-foreground/10"}`}>
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem onClick={() => handleEditChild(mod)}>
                      <Edit2 className="size-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setChildToDelete(mod)} className="text-destructive focus:bg-destructive focus:text-destructive-foreground">
                      <Trash2 className="size-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          <Button variant="outline" size="sm" className="rounded-full whitespace-nowrap text-primary border-primary/20 hover:bg-primary/10 bg-transparent h-8 px-4 ml-1" onClick={handleOpenAddChild}>
            <Plus className="mr-1 size-3.5" /> New Sub Assistant
          </Button>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8"
              onClick={() => setIsClearChatModalOpen(true)}
              disabled={sending || messages.length === 0}
            >
              <Trash2 className="size-4 mr-1.5" />
              Clear Chat
            </Button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-background">
          {messages.map((msg, idx) => (
            <div key={msg.id || idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className="flex max-w-[85%] md:max-w-[70%] gap-3">
                {msg.role !== "user" && (
                  <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Bot className="size-4" />
                  </div>
                )}
                {msg.role === "user" ? (
                  <div className="rounded-2xl px-5 py-3 text-[15px] font-normal leading-relaxed bg-primary text-primary-foreground shadow-sm rounded-tr-sm">
                    {msg.content}
                    <div className="text-primary-foreground/70 text-[10px] mt-1 text-right">
                      {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl px-5 py-3 text-[15px] font-normal leading-relaxed bg-card border border-border/60 text-foreground shadow-sm rounded-tl-sm">
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    <div className="flex items-center gap-2 text-muted-foreground text-[10px] mt-2 justify-end">
                      {msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="flex gap-3">
                <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Bot className="size-4 animate-pulse" />
                </div>
                <div className="rounded-2xl px-5 py-3 text-sm bg-card border border-border/60 flex items-center gap-2 shadow-sm">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Chat Input */}
        <div className="p-6 bg-background shrink-0">
          {chatError && (
            <Alert variant="destructive" className="mb-3">
              <AlertDescription>{chatError}</AlertDescription>
            </Alert>
          )}

          {attachedDocs.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 max-w-5xl mx-auto px-2">
              {attachedDocs.map(doc => (
                <div key={doc.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-medium">
                  <FileText className="size-3.5" />
                  <span className="truncate max-w-[150px]">{doc.filename}</span>
                  <button
                    type="button"
                    onClick={() => setDocToDelete(doc)}
                    className="ml-1 opacity-70 hover:opacity-100 hover:text-destructive transition-colors focus:outline-none"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2 bg-card rounded-2xl border border-border/80 p-2 shadow-sm focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all max-w-5xl mx-auto"
          >
            <div className="flex items-center px-1 pb-1">
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground rounded-full hover:bg-muted" onClick={() => fileInputRef.current?.click()} disabled={uploadingDoc}>
                {uploadingDoc ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}
              </Button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.txt,.docx" onChange={handleFileUpload} />
            </div>

            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 bg-transparent border-none focus:outline-none px-2 py-3 text-[15px] resize-none min-h-[44px] max-h-[200px]"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={sending}
            />

            <div className="px-1 pb-1">
              <Button type="submit" size="icon" disabled={!input.trim() || sending} className="h-9 w-9 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all disabled:opacity-50">
                <Send className="size-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* New Chat Modal */}
      <Dialog open={newChatModalOpen} onOpenChange={setNewChatModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New Chat</DialogTitle>
            <DialogDescription>
              Set a name for this chat and initialize its variables.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4 max-h-[60vh] overflow-y-auto px-1">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Chat Name</label>
              <Input
                value={newChatTitle}
                onChange={(e) => setNewChatTitle(e.target.value)}
                placeholder="Name of this chat"
              />
            </div>
            {Array.isArray(system?.variables) && system.variables.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-4">Chat Variables</h4>
                <div className="space-y-4">
                  {system.variables.map((v) => (
                    <div key={v.name} className="flex flex-col gap-2">
                      <label className="text-sm font-medium leading-none">
                        {v.label || v.name}
                        {v.required && <span className="text-destructive ml-1">*</span>}
                      </label>
                      <div>
                        {v.type === "number" ? (
                          <Input
                            type="number"
                            placeholder={v.description || `Enter ${v.name}`}
                            value={newChatVars[v.name] || ""}
                            onChange={(e) => setNewChatVars({...newChatVars, [v.name]: e.target.value})}
                          />
                        ) : v.type === "boolean" ? (
                          <div className="flex items-center h-10">
                            <Switch
                              checked={newChatVars[v.name] === "true"}
                              onCheckedChange={(checked) => setNewChatVars({...newChatVars, [v.name]: checked ? "true" : "false"})}
                            />
                            <span className="ml-3 text-sm">{newChatVars[v.name] === "true" ? "True" : "False"}</span>
                          </div>
                        ) : (
                          <Input
                            placeholder={v.description || `Enter ${v.name}`}
                            value={newChatVars[v.name] || ""}
                            onChange={(e) => setNewChatVars({...newChatVars, [v.name]: e.target.value})}
                          />
                        )}
                        {newChatErrors[v.name] && <p className="text-xs text-destructive mt-1.5">{newChatErrors[v.name]}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewChatModalOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              let hasErrors = false;
              const errors: Record<string, string> = {};
              if (Array.isArray(system?.variables)) {
                system.variables.forEach(v => {
                  const val = newChatVars[v.name] || "";
                  // boolean always has a value ("true"/"false"), skip blank check
                  if (v.type !== "boolean" && !val.trim()) {
                    errors[v.name] = "This field is required";
                    hasErrors = true;
                  } else if (val.trim() && v.type === "number" && isNaN(Number(val))) {
                    errors[v.name] = "Must be a valid number";
                    hasErrors = true;
                  }
                });
              }
              if (hasErrors) {
                setNewChatErrors(errors);
                return;
              }
              setNewChatModalOpen(false);
              handleStartNewConversation(newChatTitle, newChatVars);
            }}>Create Chat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Document Dialog */}
      <Dialog open={!!docToDelete} onOpenChange={(open) => {
        if (!open && !isDeletingDoc) {
          setDocToDelete(null);
          setDeleteDocError(null);
        }
      }}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              Delete Document
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-foreground">"{docToDelete?.filename}"</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteDocError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{deleteDocError}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:space-x-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDocToDelete(null)}
              disabled={isDeletingDoc}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDeleteDoc}
              disabled={isDeletingDoc}
            >
              {isDeletingDoc ? (
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

      {/* Delete Child Dialog */}
      <Dialog open={!!childToDelete} onOpenChange={(open) => {
        if (!open && !isDeletingChild) {
          setChildToDelete(null);
          setDeleteChildError(null);
        }
      }}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              Delete Sub Assistant
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-foreground">"{childToDelete?.module_name}"</span>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteChildError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{deleteChildError}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:space-x-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setChildToDelete(null)}
              disabled={isDeletingChild}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDeleteChild}
              disabled={isDeletingChild}
            >
              {isDeletingChild ? (
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

      {/* Clear Chat Dialog */}
      <Dialog open={isClearChatModalOpen} onOpenChange={(open) => {
        if (!open && !isClearingChat) {
          setIsClearChatModalOpen(false);
          setClearChatError(null);
        }
      }}>
        <DialogContent className="border-border bg-popover sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              Clear Chat
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to clear all messages in this chat? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {clearChatError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{clearChatError}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:space-x-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsClearChatModalOpen(false)}
              disabled={isClearingChat}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmClearChat}
              disabled={isClearingChat}
            >
              {isClearingChat ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="mr-1.5 size-3.5" />
                  Clear Messages
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
