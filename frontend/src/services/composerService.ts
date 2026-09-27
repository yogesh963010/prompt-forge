/**
 * PromptForge Composer API Service
 * Handles deterministic prompt composition via POST /prompt-systems/{id}/compose.
 */
import { apiRequest } from "./apiClient";

export interface ComposerResponse {
  prompt_system_id: number;
  prompt: string;
}

export const composerService = {
  /**
   * Compose the final prompt for a given PromptSystem.
   */
  async compose(promptSystemId: number): Promise<ComposerResponse> {
    return apiRequest<ComposerResponse>(`/prompt-systems/${promptSystemId}/compose`, {
      method: "POST",
    });
  },
};
