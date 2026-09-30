/**
 * PromptForge AI Providers API Service
 */
import { apiRequest } from "./apiClient";

export interface ProviderCapabilities {
  open: boolean;
  run: boolean;
  copy_prompt: boolean;
}

export interface Provider {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
}

export interface ProviderActionResponse {
  provider_id: string;
  provider_name: string;
  url: string;
  resolved_prompt: string;
  action: string;
  copy_prompt: boolean;
}

export const providerService = {
  /**
   * Fetch all registered AI providers.
   */
  async getProviders(): Promise<Provider[]> {
    return apiRequest<Provider[]>("/providers");
  },

  /**
   * Execute provider action (returns destination URL and verifies prompt).
   */
  async executeAction(
    providerId: string,
    resolvedPrompt: string
  ): Promise<ProviderActionResponse> {
    return apiRequest<ProviderActionResponse>(`/providers/${providerId}/action`, {
      method: "POST",
      body: JSON.stringify({ resolved_prompt: resolvedPrompt }),
    });
  },
};
