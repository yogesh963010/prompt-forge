/**
 * Document Service for isolated PDF uploads, listing, and deletion.
 */
import { API_BASE_URL, ApiError, formatErrorDetail, apiRequest } from "./apiClient";

export interface DocumentItem {
  id: string;
  filename: string;
  stored_filename: string;
  prompt_system_id: number;
  module_id: number | null;
  conversation_id: number | null;
  file_size: number;
  content_type: string;
  railway_document_id?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface ScopeContextResponse {
  documents: Array<{ id: string; filename: string; content: string }>;
  context_text: string;
  count: number;
}

export const documentService = {
  /**
   * List documents owned by authenticated user with optional scope filtering.
   */
  async listDocuments(
    promptSystemId?: number,
    moduleId?: number | null,
    conversationId?: number | null,
    parentOnly?: boolean
  ): Promise<DocumentItem[]> {
    const params = new URLSearchParams();
    if (promptSystemId !== undefined) {
      params.append("prompt_system_id", promptSystemId.toString());
    }
    if (moduleId !== undefined && moduleId !== null) {
      params.append("module_id", moduleId.toString());
    } else if (parentOnly) {
      params.append("parent_only", "true");
    }
    if (conversationId !== undefined && conversationId !== null) {
      params.append("conversation_id", conversationId.toString());
    }

    const qs = params.toString();
    const endpoint = `/documents${qs ? `?${qs}` : ""}`;
    return apiRequest<DocumentItem[]>(endpoint);
  },

  /**
   * Get extracted text context for documents in the current assistant scope.
   */
  async getScopeContext(
    promptSystemId: number,
    moduleId?: number | null,
    conversationId?: number | null
  ): Promise<ScopeContextResponse> {
    const params = new URLSearchParams();
    params.append("prompt_system_id", promptSystemId.toString());
    if (moduleId !== undefined && moduleId !== null) {
      params.append("module_id", moduleId.toString());
    }
    if (conversationId !== undefined && conversationId !== null) {
      params.append("conversation_id", conversationId.toString());
    }
    const endpoint = `/documents/context?${params.toString()}`;
    return apiRequest<ScopeContextResponse>(endpoint);
  },

  /**
   * Get single document metadata.
   */
  async getDocument(documentId: string): Promise<DocumentItem> {
    return apiRequest<DocumentItem>(`/documents/${documentId}`);
  },

  /**
   * Upload a PDF file scoped to a Prompt System and optional Child Module.
   */
  async uploadDocument(
    file: File,
    promptSystemId: number,
    moduleId?: number | null,
    conversationId?: number | null
  ): Promise<DocumentItem> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("prompt_system_id", promptSystemId.toString());
    if (moduleId !== undefined && moduleId !== null) {
      formData.append("module_id", moduleId.toString());
    }
    if (conversationId !== undefined && conversationId !== null) {
      formData.append("conversation_id", conversationId.toString());
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("pf-token") : null;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const url = `${API_BASE_URL}/documents/upload`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
      });
    } catch (_err) {
      throw new ApiError(
        "Unable to connect to PromptForge backend for upload. Please ensure backend is running.",
        0
      );
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = formatErrorDetail(res.status, data);
      throw new ApiError(message, res.status, data);
    }

    return data as DocumentItem;
  },

  /**
   * Delete a document and its physical file.
   */
  async deleteDocument(documentId: string): Promise<void> {
    await apiRequest<void>(`/documents/${documentId}`, {
      method: "DELETE",
    });
  },
};
