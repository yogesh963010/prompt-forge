/**
 * RAG Assistant API Client
 * 
 * Reuses the existing Railway / FastAPI RAG backend endpoints:
 * - GET /health
 * - GET /status
 * - POST /upload
 * - DELETE /documents
 * - POST /ask (conversational RAG with session memory)
 * - POST /chat (tool-calling RAG query)
 */

function sanitizeBaseUrl(url: string | undefined): string {
  if (!url) return "";
  return url.replace(/\/docs(\/.*)?$/, "").replace(/\/+$/, "");
}

export const RAG_API_BASE_URL = sanitizeBaseUrl(
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_RAG_API_URL) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  ""
);

export interface RagSource {
  source?: string | null;
  page?: number | null;
}

export interface RagChatResponse {
  answer: string;
  sources: RagSource[];
}

export interface RagUploadResponse {
  message: string;
  filename: string;
  chunks?: number | null;
}

export interface RagStatusResponse {
  has_document: boolean;
  filename: string | null;
}

export interface RagHealthResponse {
  status: string;
}

export interface RagChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: RagSource[];
  timestamp: string;
  error?: boolean;
}

export class RagApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "RagApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Format error response from the RAG backend into a clear user-facing message.
 */
export function formatRagError(status: number, data: unknown): string {
  const errData = data as
    | { detail?: string | Array<{ msg?: string } | string>; message?: string }
    | null
    | undefined;

  if (errData?.detail) {
    if (typeof errData.detail === "string") {
      return errData.detail;
    }
    if (Array.isArray(errData.detail)) {
      return errData.detail
        .map((item) => {
          if (
            typeof item === "object" &&
            item !== null &&
            "msg" in item &&
            typeof item.msg === "string"
          ) {
            return item.msg.replace(/^Value error,\s*/i, "");
          }
          return typeof item === "string" ? item : JSON.stringify(item);
        })
        .join(". ");
    }
  }

  if (errData?.message) {
    return errData.message;
  }

  if (status === 400) return "Invalid request or unsupported document format.";
  if (status === 404) return "Requested resource not found on the RAG backend.";
  if (status === 413) return "File exceeds the maximum allowed size (10 MB).";
  if (status >= 500) return "The RAG backend encountered an error. Please try again.";

  return "Unable to complete request. Please verify the RAG backend is available.";
}

/**
 * Internal helper for making RAG API requests with automatic proxy fallback
 */
async function ragFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  const urlsToTry: string[] = [];

  // In browser, cleanEndpoint (/health, /status, /ask, etc.) is directly proxied by Vite to local FastAPI
  if (typeof window !== "undefined") {
    urlsToTry.push(cleanEndpoint);
    if (RAG_API_BASE_URL && !RAG_API_BASE_URL.startsWith("/")) {
      const cleanBase = RAG_API_BASE_URL.replace(/\/+$/, "");
      if (!urlsToTry.includes(`${cleanBase}${cleanEndpoint}`)) {
        urlsToTry.push(`${cleanBase}${cleanEndpoint}`);
      }
    }
  } else {
    if (RAG_API_BASE_URL) {
      const cleanBase = RAG_API_BASE_URL.replace(/\/+$/, "");
      urlsToTry.push(`${cleanBase}${cleanEndpoint}`);
    } else {
      urlsToTry.push(`http://127.0.0.1:8000${cleanEndpoint}`);
    }
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  // Attach PromptForge auth token if available in browser
  if (!headers.has("Authorization") && typeof window !== "undefined") {
    const token = localStorage.getItem("pf-token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  let lastError: unknown = null;
  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, {
        ...options,
        headers,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = formatRagError(res.status, data);
        throw new RagApiError(msg, res.status, data);
      }

      return data as T;
    } catch (err: unknown) {
      if (err instanceof RagApiError) {
        throw err;
      }
      lastError = err;
    }
  }

  throw new RagApiError(
    "Unable to connect to RAG backend. Please verify your connection or RAG backend URL.",
    0,
    lastError
  );
}

export const ragApi = {
  /**
   * Health check to test backend connectivity
   */
  async checkHealth(): Promise<RagHealthResponse> {
    return ragFetch<RagHealthResponse>("/health", { method: "GET" });
  },

  /**
   * Check if a document is currently indexed in the backend
   */
  async getStatus(): Promise<RagStatusResponse> {
    return ragFetch<RagStatusResponse>("/status", { method: "GET" });
  },

  /**
   * Upload and index a document (.pdf, .txt, .docx, .md, .csv up to 10MB)
   */
  async uploadDocument(file: File): Promise<RagUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);

    return ragFetch<RagUploadResponse>("/upload", {
      method: "POST",
      body: formData,
    });
  },

  /**
   * Delete all indexed documents and reset the vector store
   */
  async deleteDocuments(): Promise<{ message: string }> {
    return ragFetch<{ message: string }>("/documents", {
      method: "DELETE",
    });
  },

  /**
   * Send a question using the integrated local RAG endpoint
   */
  async askQuestion(
    question: string,
    sessionId?: string,
    conversationId?: number,
    promptSystemId?: number,
    moduleId?: number
  ): Promise<RagChatResponse> {
    return ragFetch<RagChatResponse>("/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: question.trim(),
        session_id: sessionId || undefined,
        conversation_id: conversationId,
        prompt_system_id: promptSystemId,
        module_id: moduleId,
      }),
    });
  },

  /**
   * Send a general tool-calling query to the chat endpoint
   */
  async chat(question: string, sessionId?: string): Promise<RagChatResponse> {
    return ragFetch<RagChatResponse>("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: question.trim(),
        session_id: sessionId || undefined,
      }),
    });
  },
};
