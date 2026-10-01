import {
  AlertCircle,
  Bot,
  Check,
  Clock,
  Copy,
  FileCheck,
  FileCode,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  User,
  Zap,
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ragApi,
  type RagChatMessage,
  type RagSource,
  type RagStatusResponse,
} from "@/services/ragApi";

const SUPPORTED_EXTENSIONS = [".pdf", ".txt", ".docx", ".md", ".csv"];
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const SUGGESTION_PROMPTS = [
  "Summarize the main takeaways from this document",
  "What are the key concepts and definitions explained?",
  "List any critical methodologies, steps, or conclusions",
  "Extract formulas, equations, or quantitative facts",
];

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
      return <FileText className="size-5 text-red-500" />;
    case "docx":
      return <FileText className="size-5 text-blue-500" />;
    case "csv":
      return <FileSpreadsheet className="size-5 text-emerald-500" />;
    case "md":
    case "txt":
      return <FileCode className="size-5 text-amber-500" />;
    default:
      return <FileText className="size-5 text-muted-foreground" />;
  }
}

export function RagAssistant() {
  // Session State
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("pf-rag-session-id");
      if (saved) return saved;
    }
    const newId = generateSessionId();
    if (typeof window !== "undefined") {
      sessionStorage.setItem("pf-rag-session-id", newId);
    }
    return newId;
  });

  // Backend / Document Status State
  const [docStatus, setDocStatus] = useState<RagStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Chat State
  const [messages, setMessages] = useState<RagChatMessage[]>([]);
  const [inputQuestion, setInputQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll chat to bottom when messages change or while asking
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, asking]);

  // Load document status and health check
  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    setBackendError(null);
    try {
      // Check health
      try {
        await ragApi.checkHealth();
        setBackendHealthy(true);
      } catch {
        setBackendHealthy(false);
      }

      // Check document status
      const status = await ragApi.getStatus();
      setDocStatus(status);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load document status";
      setBackendError(msg);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Handle New Session
  const handleNewSession = useCallback(() => {
    const newId = generateSessionId();
    setSessionId(newId);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("pf-rag-session-id", newId);
    }
    setMessages([]);
    setChatError(null);
    setInputQuestion("");
  }, []);

  // Handle File Selection
  const handleFileChange = (file: File | null) => {
    setUploadError(null);
    setUploadSuccess(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;
    if (!SUPPORTED_EXTENSIONS.includes(fileExt)) {
      setUploadError(
        `Unsupported file type "${fileExt}". Allowed formats: ${SUPPORTED_EXTENSIONS.join(", ")}`
      );
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(
        `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed ${MAX_FILE_SIZE_MB} MB.`
      );
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Upload Document
  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const res = await ragApi.uploadDocument(selectedFile);
      setUploadSuccess(
        res.chunks
          ? `Indexed "${res.filename}" into ${res.chunks} chunks successfully.`
          : `"${res.filename}" uploaded and indexed successfully.`
      );
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await refreshStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to upload and index document.";
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  // Clear Documents
  const handleDeleteDocuments = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await ragApi.deleteDocuments();
      setDeleteDialogOpen(false);
      setUploadSuccess(null);
      await refreshStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to clear documents.";
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Send Chat Question
  const handleSendQuestion = async (queryText?: string) => {
    const query = (queryText ?? inputQuestion).trim();
    if (!query || asking) return;

    const userMessage: RagChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuestion("");
    setChatError(null);
    setAsking(true);

    try {
      const response = await ragApi.askQuestion(query, sessionId);

      const assistantMessage: RagChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: "assistant",
        content: response.answer || "No answer generated.",
        sources: response.sources || [],
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to receive response from RAG assistant. Please try again.";

      setChatError(msg);

      const errorMessage: RagChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: "assistant",
        content: `Error: ${msg}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        error: true,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setAsking(false);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendQuestion();
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMessageId(id);
    setTimeout(() => {
      setCopiedMessageId(null);
    }, 2000);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background p-4 md:p-6">
      {/* Top Header Banner */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Bot className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-foreground">
                AI Assistant
              </h1>
              <Badge
                variant="outline"
                className="bg-primary/5 text-[11px] font-medium text-primary border-primary/20"
              >
                RAG Powered
              </Badge>
              {backendHealthy === true ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                >
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  API Online
                </Badge>
              ) : backendHealthy === false ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                >
                  <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Backend Connecting
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Conversational search & reasoning over uploaded documents powered by your Railway RAG pipeline
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshStatus}
                  disabled={statusLoading}
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={`size-3.5 ${statusLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sync index status with RAG backend</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button
            variant="outline"
            size="sm"
            onClick={handleNewSession}
            className="h-8 gap-1.5 text-xs"
          >
            <Plus className="size-3.5" />
            New Chat
          </Button>
        </div>
      </div>

      {backendError && (
        <Alert variant="destructive" className="mb-4 text-xs">
          <AlertCircle className="size-4" />
          <AlertTitle className="text-xs font-semibold">Backend Notice</AlertTitle>
          <AlertDescription className="text-[11px]">
            {backendError} Ensure the RAG backend is active on Railway or local proxy.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Grid: Left Documents Panel, Right Chat Interface */}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden lg:grid-cols-12">
        {/* Left Column: Documents & Index Management (4 cols) */}
        <div className="flex flex-col gap-4 overflow-hidden lg:col-span-4 xl:col-span-4">
          <Card className="flex flex-col overflow-hidden border-border/60 bg-card/60 shadow-xs backdrop-blur-md">
            <CardHeader className="p-4 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Document Knowledge Base</CardTitle>
                {docStatus?.has_document ? (
                  <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400">
                    <FileCheck className="size-3" />
                    Indexed
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    No Document
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                Upload study notes, research papers, or manuals to query with citations.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4 p-4 pt-0">
              {/* Drag & Drop Upload Zone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => !uploading && fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-all ${
                  dragActive
                    ? "border-primary bg-primary/10"
                    : "border-border/70 hover:border-primary/50 hover:bg-muted/30"
                } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx,.md,.csv"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                />
                <div className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground mb-2">
                  <Upload className="size-4" />
                </div>
                <div className="text-xs font-medium text-foreground">
                  {selectedFile ? (
                    <span className="text-primary font-semibold">{selectedFile.name}</span>
                  ) : (
                    "Click or drag document to upload"
                  )}
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  PDF, DOCX, TXT, MD, CSV (up to 10 MB)
                </div>
              </div>

              {/* Upload Button */}
              {selectedFile && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="w-full gap-2 text-xs font-medium"
                    onClick={handleUpload}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Chunking & Indexing...
                      </>
                    ) : (
                      <>
                        <Upload className="size-3.5" />
                        Index &quot;{selectedFile.name}&quot;
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedFile(null)}
                    disabled={uploading}
                    className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {uploadSuccess && (
                <Alert className="border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                  <FileCheck className="size-3.5" />
                  <AlertDescription className="text-[11px] font-medium">
                    {uploadSuccess}
                  </AlertDescription>
                </Alert>
              )}

              {uploadError && (
                <Alert variant="destructive" className="p-2.5 text-xs">
                  <AlertCircle className="size-3.5" />
                  <AlertDescription className="text-[11px] font-medium">
                    {uploadError}
                  </AlertDescription>
                </Alert>
              )}

              <Separator className="bg-border/60" />

              {/* Current Active Document Display */}
              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Currently Indexed</span>
                  {docStatus?.has_document && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteDialogOpen(true)}
                      className="h-6 gap-1 px-1.5 text-[10px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                      Clear Index
                    </Button>
                  )}
                </div>

                {statusLoading ? (
                  <div className="flex items-center justify-center p-6 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                    Checking indexed documents...
                  </div>
                ) : docStatus?.has_document && docStatus.filename ? (
                  <div className="flex items-start justify-between rounded-lg border border-border/70 bg-card/80 p-3 shadow-2xs">
                    <div className="flex items-start gap-2.5 overflow-hidden">
                      <div className="mt-0.5 shrink-0">
                        {getFileIcon(docStatus.filename)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-foreground" title={docStatus.filename}>
                          {docStatus.filename}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                          <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
                          FAISS Vector Store Ready
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 p-4 text-center">
                    <p className="text-xs text-muted-foreground">
                      No document indexed yet. Upload a document above to enable RAG answers and source citations.
                    </p>
                  </div>
                )}
              </div>

              {/* Quick Info Box */}
              <div className="rounded-lg bg-muted/40 p-3 text-[11px] text-muted-foreground space-y-1.5">
                <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                  <Zap className="size-3 text-primary" />
                  RAG Pipeline Architecture
                </div>
                <p className="text-[10px] leading-relaxed">
                  Documents are automatically loaded, split into semantic chunks, converted into vector embeddings, and indexed into FAISS for retrieval.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Interactive Chat Interface (8 cols) */}
        <div className="flex flex-col overflow-hidden lg:col-span-8 xl:col-span-8">
          <Card className="flex flex-1 flex-col overflow-hidden border-border/60 bg-card/60 shadow-xs backdrop-blur-md">
            {/* Chat Header */}
            <CardHeader className="flex-row items-center justify-between border-b border-border/60 p-3 px-4">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Interactive Assistant</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  (Session: {sessionId.substring(0, 8)}...)
                </span>
              </div>
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMessages([])}
                  className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear Chat
                </Button>
              )}
            </CardHeader>

            {/* Chat Messages Scroll Area */}
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                      <Sparkles className="size-6" />
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-foreground">
                      Ask anything about your document
                    </h3>
                    <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                      {docStatus?.has_document
                        ? `Ready to query "${docStatus.filename}". Ask questions or explore key concepts.`
                        : "Upload a document on the left to start grounded Q&A with real-time sources and citations."}
                    </p>

                    {/* Suggestions */}
                    <div className="mt-6 flex flex-wrap justify-center gap-2 max-w-lg">
                      {SUGGESTION_PROMPTS.map((promptText) => (
                        <Button
                          key={promptText}
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendQuestion(promptText)}
                          disabled={asking}
                          className="h-auto py-1.5 px-2.5 text-left text-xs font-normal text-muted-foreground hover:text-foreground hover:border-primary/50"
                        >
                          <HelpCircle className="mr-1.5 size-3 text-primary shrink-0" />
                          <span>{promptText}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 text-xs ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      {msg.role === "assistant" && (
                        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                          <Bot className="size-3.5" />
                        </div>
                      )}

                      <div
                        className={`group relative max-w-[85%] rounded-lg p-3.5 transition-all ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : msg.error
                            ? "border border-destructive/30 bg-destructive/10 text-destructive"
                            : "border border-border/70 bg-card/90 text-foreground shadow-2xs"
                        }`}
                      >
                        <div className="whitespace-pre-wrap leading-relaxed text-xs">
                          {msg.content}
                        </div>

                        {/* Sources / Citations Section */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-3 border-t border-border/60 pt-2.5">
                            <div className="flex items-center gap-1 font-semibold text-[11px] text-primary">
                              <Paperclip className="size-3" />
                              Sources & Citations:
                            </div>
                            <div className="mt-1.5 space-y-1">
                              {msg.sources.map((src: RagSource, idx: number) => {
                                const filename = src.source ? src.source.split(/[\\/]/).pop() : "document";
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-2 rounded bg-muted/50 px-2 py-1 font-mono text-[10px] text-muted-foreground"
                                  >
                                    <span className="font-semibold text-primary">{idx + 1}.</span>
                                    <span className="truncate max-w-[220px] text-foreground font-medium">
                                      {filename}
                                    </span>
                                    {src.page !== null && src.page !== undefined && (
                                      <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                        Page {src.page}
                                      </Badge>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Timestamp & Copy Action */}
                        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] opacity-70">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="size-2.5" />
                            {msg.timestamp}
                          </span>

                          <button
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                            className="cursor-pointer hover:opacity-100"
                            title="Copy answer"
                          >
                            {copiedMessageId === msg.id ? (
                              <Check className="size-3 text-emerald-400" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      </div>

                      {msg.role === "user" && (
                        <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          <User className="size-3.5" />
                        </div>
                      )}
                    </div>
                  ))
                )}

                {/* Asking / Generating State */}
                {asking && (
                  <div className="flex gap-3 text-xs">
                    <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                      <Bot className="size-3.5 animate-pulse" />
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/90 p-3 text-muted-foreground shadow-2xs">
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                      <span>Thinking & searching vector store...</span>
                    </div>
                  </div>
                )}

                <div ref={chatBottomRef} />
              </div>
            </ScrollArea>

            {chatError && (
              <div className="px-4 pb-2">
                <Alert variant="destructive" className="py-2 text-xs">
                  <AlertCircle className="size-3.5" />
                  <AlertDescription className="text-[11px] font-medium">
                    {chatError}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Chat Input Box */}
            <CardFooter className="border-t border-border/60 p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendQuestion();
                }}
                className="flex w-full items-center gap-2"
              >
                <div className="relative flex-1">
                  <textarea
                    ref={textareaRef}
                    value={inputQuestion}
                    onChange={(e) => setInputQuestion(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      docStatus?.has_document
                        ? "Ask a question about your indexed document... (Enter to send)"
                        : "Ask a question or upload a document to enable citations..."
                    }
                    rows={1}
                    disabled={asking}
                    className="w-full resize-none rounded-lg border border-border/70 bg-background/80 px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-hidden focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  disabled={asking || !inputQuestion.trim()}
                  className="h-9 px-3 gap-1.5 text-xs shrink-0"
                >
                  {asking ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <>
                      <span>Send</span>
                      <Send className="size-3" />
                    </>
                  )}
                </Button>
              </form>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">
              Clear All Indexed Documents?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              This will remove all uploaded files, delete the FAISS vector index, and reset the retriever. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <Alert variant="destructive" className="text-xs">
              <AlertCircle className="size-3.5" />
              <AlertDescription className="text-[11px]">{deleteError}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} className="text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDocuments}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Clearing...
                </>
              ) : (
                "Clear Documents"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
