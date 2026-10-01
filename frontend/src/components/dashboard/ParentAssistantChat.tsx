import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, FileText, Loader2, Plus, Send, Trash2, Upload, User, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { promptSystemService, type PromptSystem } from "@/services/promptSystemService";
import { moduleReferenceService, type ModuleReference } from "@/services/moduleReferenceService";
import { conversationsService, type Conversation, type Message } from "@/services/conversationsService";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ParentAssistantChatProps {
  promptSystemId: number;
  onBack: () => void;
}

export function ParentAssistantChat({ promptSystemId, onBack }: ParentAssistantChatProps) {
  // State for fetching system and modules
  const [system, setSystem] = useState<PromptSystem | null>(null);
  const [modules, setModules] = useState<ModuleReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Chat State
  const [activeType, setActiveType] = useState<"parent" | "child">("parent");
  const [activeChildId, setActiveChildId] = useState<number | null>(null);
  
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  
  // Fake documents state for UI
  const [documents, setDocuments] = useState<{name: string; type: string}[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadDetails() {
      setLoading(true);
      setError(null);
      try {
        const sys = await promptSystemService.getById(promptSystemId);
        setSystem(sys);
        
        const mods = await moduleReferenceService.list(promptSystemId);
        setModules(mods.filter((m) => m.enabled));
      } catch (err: any) {
        setError(err.message || "Failed to load Parent Assistant details");
      } finally {
        setLoading(false);
      }
    }
    loadDetails();
  }, [promptSystemId]);

  // Load latest conversation when active tab changes
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

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

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
    if (!input.trim() || sending) return;

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
        setChatError("Failed to create conversation");
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
    setInput("");
    setSending(true);
    setChatError(null);

    try {
      // Create user message in backend
      await conversationsService.createMessage(conv.id, "user", tempMsg.content);

      // MOCK ASSISTANT REPLY for now (Since we don't connect to RAG/AI yet)
      setTimeout(async () => {
        const reply = await conversationsService.createMessage(conv.id, "assistant", "This is a mock response. The real AI backend integration will happen via Railway RAG.");
        setMessages((prev) => [...prev, reply]);
        setSending(false);
      }, 1000);
      
    } catch (err: any) {
      setChatError("Failed to send message");
      setSending(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setDocuments(prev => [...prev, { name: file.name, type: file.type || "Document" }]);
      e.target.value = "";
    }
  };

  const handleRemoveDoc = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  if (loading) {
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

  const variablesList = Array.isArray(system.variables) ? system.variables : [];

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
          <Badge className="mt-2 bg-primary/10 text-primary border-primary/20 text-[10px]">
            Parent Assistant
          </Badge>
        </div>

        <div className="p-4 space-y-6 flex-1">
          {/* Details Section */}
          <section className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Description</h3>
              <p className="text-sm text-foreground">{system.description || "No description provided."}</p>
            </div>
            {system.instructions && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Instructions</h3>
                <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded-md border border-border/50 line-clamp-4">
                  {system.instructions}
                </p>
              </div>
            )}
            {variablesList.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Variables</h3>
                <div className="flex flex-wrap gap-1.5">
                  {variablesList.map((v: any, i) => (
                    <span key={i} className="inline-flex items-center rounded-md bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-secondary-foreground border border-secondary">
                      {v.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
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
                <button
                  key={mod.id}
                  onClick={() => { setActiveType("child"); setActiveChildId(mod.module_id); }}
                  className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-all border ${
                    activeType === "child" && activeChildId === mod.module_id 
                      ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                      : "bg-card hover:bg-accent border-border/50 text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Zap className="size-3.5 opacity-70" />
                    <span className="font-medium truncate">{mod.module_name || `Module #${mod.module_id}`}</span>
                  </div>
                </button>
              ))}
              {modules.length === 0 && (
                <div className="text-xs text-muted-foreground italic px-1">No child assistants configured.</div>
              )}
            </div>
          </section>

          {/* Documents Section (Mock for RAG) */}
          <section className="border-t border-border/60 pt-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documents (RAG)</h3>
              <Button size="icon" variant="ghost" className="size-6 rounded-full h-6 w-6" onClick={() => fileInputRef.current?.click()}>
                <Plus className="size-3.5" />
              </Button>
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            </div>
            
            <div className="space-y-2">
              {documents.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-4 border border-dashed border-border/60 rounded-lg bg-muted/20 text-center">
                  <Upload className="size-4 text-muted-foreground mb-1" />
                  <span className="text-[10px] text-muted-foreground">Upload files for context</span>
                </div>
              ) : (
                documents.map((doc, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-md border border-border/50 bg-card/50">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="size-3.5 text-primary shrink-0" />
                      <span className="text-xs truncate font-medium">{doc.name}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="size-5 hover:bg-destructive/20 hover:text-destructive shrink-0" onClick={() => handleRemoveDoc(idx)}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))
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
                {activeType === "parent" ? "Parent Assistant Chat" : "Child Assistant Chat"}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleStartNewConversation} className="h-8 gap-1.5 text-xs">
            <Plus className="size-3.5" />
            New Chat
          </Button>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 relative">
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
                   <span className="text-muted-foreground text-xs">Assistant is typing...</span>
                 </div>
               </div>
             </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Chat Input */}
        <div className="border-t border-border/60 bg-background/95 backdrop-blur p-4 pb-6">
          {chatError && (
             <Alert variant="destructive" className="mb-3 py-2 px-3 h-auto min-h-0 text-xs">
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
              className="w-full rounded-full border border-border bg-card pl-5 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm"
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
          <div className="text-center mt-2">
            <span className="text-[10px] text-muted-foreground opacity-70">
              Messages are generated via mock backend for now.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple Badge component for local use if not imported
function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${className}`}>{children}</span>;
}
