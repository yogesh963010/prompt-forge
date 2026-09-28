/**
 * PromptForge Prompt Run API Service
 * Handles executing prompt systems with runtime variables via POST /prompt-systems/{id}/run.
 */
import { apiRequest } from "./apiClient";

export interface PromptRunRequest {
  variables?: Record<string, unknown>;
}

export interface PromptRunResponse {
  prompt_system_id: number;
  variables: Record<string, unknown>;
  resolved_prompt: string;
}

export const runService = {
  /**
   * Run a prompt system with runtime variables.
   */
  async runPromptSystem(
    promptSystemId: number,
    data: PromptRunRequest = {}
  ): Promise<PromptRunResponse> {
    return apiRequest<PromptRunResponse>(`/prompt-systems/${promptSystemId}/run`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
