/**
 * PromptForge Prompt Modules API Service
 * Handles CRUD operations against /modules endpoints.
 */
import { apiRequest } from "./apiClient";
import type { VariableDefinition } from "./promptSystemService";

export interface PromptModule {
  id: number;
  owner_id: number;
  name: string;
  description?: string | null;
  instructions?: string | null;
  variables?: VariableDefinition[];
  input_context?: string[] | Record<string, unknown> | unknown;
  output_contract?: string | Record<string, unknown> | unknown[] | null;
  examples?: Array<{ title?: string; input?: unknown; output?: unknown }> | unknown;
  created_at: string;
  updated_at: string;
}

export interface PromptModuleCreate {
  name: string;
  description?: string | null;
  instructions?: string | null;
  variables?: VariableDefinition[];
  input_context?: string[] | Record<string, unknown> | unknown;
  output_contract?: string | Record<string, unknown> | unknown[] | null;
  examples?: Array<{ title?: string; input?: unknown; output?: unknown }> | unknown;
}

export interface PromptModuleUpdate {
  name?: string;
  description?: string | null;
  instructions?: string | null;
  variables?: VariableDefinition[];
  input_context?: string[] | Record<string, unknown> | unknown;
  output_contract?: string | Record<string, unknown> | unknown[] | null;
  examples?: Array<{ title?: string; input?: unknown; output?: unknown }> | unknown;
}

export const moduleService = {
  /**
   * Fetch modules list: GET /modules
   */
  async list(): Promise<PromptModule[]> {
    return apiRequest<PromptModule[]>("/modules", {
      method: "GET",
    });
  },

  /**
   * Get single module by ID: GET /modules/{id}
   */
  async getById(id: number): Promise<PromptModule> {
    return apiRequest<PromptModule>(`/modules/${id}`, {
      method: "GET",
    });
  },

  /**
   * Create new module: POST /modules
   */
  async create(payload: PromptModuleCreate): Promise<PromptModule> {
    return apiRequest<PromptModule>("/modules", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name.trim(),
        description: payload.description ?? null,
        instructions: payload.instructions ?? null,
        variables: payload.variables ?? [],
        input_context: payload.input_context ?? [],
        output_contract: payload.output_contract ?? null,
        examples: payload.examples ?? [],
      }),
    });
  },

  /**
   * Update existing module: PATCH /modules/{id}
   */
  async update(id: number, payload: PromptModuleUpdate): Promise<PromptModule> {
    const body: PromptModuleUpdate = {};
    if (payload.name !== undefined) body.name = payload.name.trim();
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.instructions !== undefined) body.instructions = payload.instructions;
    if (payload.variables !== undefined) body.variables = payload.variables;
    if (payload.input_context !== undefined) body.input_context = payload.input_context;
    if (payload.output_contract !== undefined) body.output_contract = payload.output_contract;
    if (payload.examples !== undefined) body.examples = payload.examples;

    return apiRequest<PromptModule>(`/modules/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  /**
   * Delete module by ID: DELETE /modules/{id}
   */
  async delete(id: number): Promise<{ message: string; id: number }> {
    return apiRequest<{ message: string; id: number }>(`/modules/${id}`, {
      method: "DELETE",
    });
  },
};
