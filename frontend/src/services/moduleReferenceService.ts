/**
 * PromptForge Module Reference API Service
 * Handles attaching, updating, and detaching prompt modules to/from prompt systems.
 * Base routes: /prompt-systems/{prompt_system_id}/modules
 */
import { apiRequest } from "./apiClient";

export interface ModuleReference {
  id: number;
  prompt_system_id: number;
  module_id: number;
  module_name?: string | null;
  input_mapping?: Record<string, unknown> | unknown;
  output_mapping?: Record<string, unknown> | unknown;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModuleReferenceCreate {
  module_id: number;
  input_mapping?: Record<string, unknown>;
  output_mapping?: Record<string, unknown>;
  enabled?: boolean;
}

export interface ModuleReferenceUpdate {
  input_mapping?: Record<string, unknown>;
  output_mapping?: Record<string, unknown>;
  enabled?: boolean;
}

export const moduleReferenceService = {
  /**
   * List module references for a Prompt System: GET /prompt-systems/{id}/modules
   */
  async list(promptSystemId: number): Promise<ModuleReference[]> {
    return apiRequest<ModuleReference[]>(`/prompt-systems/${promptSystemId}/modules`, {
      method: "GET",
    });
  },

  /**
   * Attach a PromptModule to a PromptSystem: POST /prompt-systems/{id}/modules
   */
  async attach(
    promptSystemId: number,
    payload: ModuleReferenceCreate
  ): Promise<ModuleReference> {
    return apiRequest<ModuleReference>(`/prompt-systems/${promptSystemId}/modules`, {
      method: "POST",
      body: JSON.stringify({
        module_id: payload.module_id,
        input_mapping: payload.input_mapping ?? {},
        output_mapping: payload.output_mapping ?? {},
        enabled: payload.enabled ?? true,
      }),
    });
  },

  /**
   * Update module reference (input_mapping, output_mapping, enabled): PATCH /prompt-systems/{id}/modules/{reference_id}
   */
  async update(
    promptSystemId: number,
    referenceId: number,
    payload: ModuleReferenceUpdate
  ): Promise<ModuleReference> {
    const body: ModuleReferenceUpdate = {};
    if (payload.input_mapping !== undefined) body.input_mapping = payload.input_mapping;
    if (payload.output_mapping !== undefined) body.output_mapping = payload.output_mapping;
    if (payload.enabled !== undefined) body.enabled = payload.enabled;

    return apiRequest<ModuleReference>(
      `/prompt-systems/${promptSystemId}/modules/${referenceId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      }
    );
  },

  /**
   * Remove a module reference: DELETE /prompt-systems/{id}/modules/{reference_id}
   * Crucial: Only deletes the reference; does NOT delete the underlying PromptModule.
   */
  async remove(
    promptSystemId: number,
    referenceId: number
  ): Promise<{ message: string; id: number }> {
    return apiRequest<{ message: string; id: number }>(
      `/prompt-systems/${promptSystemId}/modules/${referenceId}`,
      {
        method: "DELETE",
      }
    );
  },
};
