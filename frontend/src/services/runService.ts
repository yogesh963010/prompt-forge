/**
 * PromptForge Prompt Run API Service
 * Handles executing prompt systems with runtime variables via POST /prompt-systems/{id}/run.
 */
import { apiRequest } from "./apiClient";

export interface PromptRunRequest {
  module_id?: number | null;
  variables?: Record<string, unknown>;
  module_variables?: Record<string, unknown>;
  user_input?: string | null;
  previous_module_output?: string | null;
}

export interface PromptRunResponse {
  prompt_system_id: number;
  module_id?: number | null;
  variables: Record<string, unknown>;
  module_variables?: Record<string, unknown>;
  user_input?: string | null;
  previous_module_output?: string | null;
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
