/**
 * PromptForge Preview API Service
 * Handles fetching raw and structured prompt previews via POST /prompt-systems/{id}/preview.
 */
import { apiRequest } from "./apiClient";

export interface StructuredModule {
  name: string;
  description?: string | null;
  instructions?: string | null;
  input_context?: unknown;
  output_contract?: unknown;
  output_mapping?: unknown;
}

export interface StructuredPrompt {
  instructions?: string | null;
  variables?: unknown[];
  examples?: unknown[];
  modules: StructuredModule[];
  output_requirements?: unknown;
}

export interface PreviewResponse {
  prompt_system_id: number;
  raw_prompt: string;
  structured_prompt: StructuredPrompt;
}

export const previewService = {
  /**
   * Fetch prompt preview (raw & structured).
   */
  async getPreview(promptSystemId: number): Promise<PreviewResponse> {
    return apiRequest<PreviewResponse>(`/prompt-systems/${promptSystemId}/preview`, {
      method: "POST",
    });
  },
};
