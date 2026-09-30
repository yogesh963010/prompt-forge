/**
 * PromptForge History API Service
 * Manages PromptRunHistory records representing immutable snapshots of completed Prompt Runs.
 */
import { apiRequest } from "./apiClient";

export interface PromptRunHistoryItem {
  id: number;
  user_id: number;
  prompt_system_id: number | null;
  module_id: number | null;
  prompt_system_name: string;
  module_name: string | null;
  final_prompt: string;
  runtime_variables: Record<string, unknown> | null;
  created_at: string;
}

export interface PromptRunHistoryList {
  items: PromptRunHistoryItem[];
}

export const historyService = {
  /**
   * Fetch all history items for the authenticated user, ordered by most recent first.
   */
  async getHistory(): Promise<PromptRunHistoryList> {
    return apiRequest<PromptRunHistoryList>("/api/history", {
      method: "GET",
    });
  },

  /**
   * Fetch a single history record by ID with ownership verification.
   */
  async getHistoryById(id: number): Promise<PromptRunHistoryItem> {
    return apiRequest<PromptRunHistoryItem>(`/api/history/${id}`, {
      method: "GET",
    });
  },

  /**
   * Delete a single history record by ID.
   */
  async deleteHistory(id: number): Promise<{ message: string; id: number }> {
    return apiRequest<{ message: string; id: number }>(`/api/history/${id}`, {
      method: "DELETE",
    });
  },
};
