/**
 * PromptForge Sharing API Service
 * Handles sharing visibility, public access, copy, and shared run endpoints.
 */
import { apiRequest } from "./apiClient";
import type { PromptSystem } from "./promptSystemService";

export interface SharingStatus {
  visibility: string;
  share_token: string | null;
  share_url: string | null;
}

export interface PublicSharedModule {
  id: number;
  name: string;
  description?: string | null;
  variables?: unknown;
}

export interface PublicSharedSystem {
  share_token: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  variables?: unknown;
  examples?: unknown;
  output_format?: unknown;
  modules?: unknown;
  attached_modules: PublicSharedModule[];
  created_at: string;
  updated_at: string;
}

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

export const sharingService = {
  /**
   * Get sharing status: GET /prompt-systems/{id}/sharing
   */
  async getStatus(promptSystemId: number): Promise<SharingStatus> {
    return apiRequest<SharingStatus>(`/prompt-systems/${promptSystemId}/sharing`, {
      method: "GET",
    });
  },

  /**
   * Update sharing visibility: PATCH /prompt-systems/{id}/sharing
   */
  async updateVisibility(promptSystemId: number, visibility: string): Promise<SharingStatus> {
    return apiRequest<SharingStatus>(`/prompt-systems/${promptSystemId}/sharing`, {
      method: "PATCH",
      body: JSON.stringify({ visibility }),
    });
  },

  /**
   * Get public shared system: GET /api/shared/{shareToken}
   */
  async getPublicSystem(shareToken: string): Promise<PublicSharedSystem> {
    return apiRequest<PublicSharedSystem>(`/api/shared/${shareToken}`, {
      method: "GET",
    });
  },

  /**
   * Copy a shared system: POST /api/shared/{shareToken}/copy
   */
  async copySystem(shareToken: string): Promise<PromptSystem> {
    return apiRequest<PromptSystem>(`/api/shared/${shareToken}/copy`, {
      method: "POST",
    });
  },

  /**
   * Run a shared system: POST /api/shared/{shareToken}/run
   */
  async runSharedSystem(shareToken: string, data: PromptRunRequest = {}): Promise<PromptRunResponse> {
    return apiRequest<PromptRunResponse>(`/api/shared/${shareToken}/run`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
