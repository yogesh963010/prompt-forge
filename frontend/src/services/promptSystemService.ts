/**
 * PromptForge Prompt Systems API Service
 * Handles CRUD operations against /prompt-systems endpoints.
 */
import { apiRequest } from "./apiClient";

export interface VariableDefinition {
  name: string;
  label?: string;
  type?: "text" | "number" | "select" | "multiline" | string;
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface PromptSystemCreate {
  name: string;
  description?: string | null;
  instructions?: string | null;
  variables?: VariableDefinition[] | Record<string, unknown> | unknown[];
  examples?: unknown[] | Record<string, unknown>;
  output_format?: string | Record<string, unknown> | unknown[];
  modules?: unknown[] | Record<string, unknown>;
}

export interface PromptSystemUpdate {
  name?: string;
  description?: string | null;
  instructions?: string | null;
  variables?: VariableDefinition[] | Record<string, unknown> | unknown[];
  examples?: unknown[] | Record<string, unknown>;
  output_format?: string | Record<string, unknown> | unknown[];
  modules?: unknown[] | Record<string, unknown>;
}

export interface PromptSystem {
  id: number;
  name: string;
  description?: string | null;
  owner_id: number;
  instructions?: string | null;
  variables?: unknown;
  examples?: unknown;
  output_format?: unknown;
  modules?: unknown;
  version: number;
  archived: boolean;
  visibility?: string;
  share_token?: string | null;
  created_at: string;
  updated_at: string;
}


export interface ListPromptSystemsParams {
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
  include_archived?: boolean;
}

export interface VariableValidationResponse {
  valid: boolean;
  detected_variables: string[];
  configured_variables: string[];
  missing_variables: string[];
  unused_variables: string[];
}

export const promptSystemService = {
  /**
   * Fetch Prompt Systems list: GET /prompt-systems
   */
  async list(params?: ListPromptSystemsParams): Promise<PromptSystem[]> {
    const searchParams = new URLSearchParams();
    if (params?.search) {
      searchParams.set("search", params.search);
    }
    if (params?.sort) {
      searchParams.set("sort", params.sort);
    }
    if (params?.page !== undefined) {
      searchParams.set("page", String(params.page));
    }
    if (params?.limit !== undefined) {
      searchParams.set("limit", String(params.limit));
    }
    if (params?.include_archived !== undefined) {
      searchParams.set("include_archived", String(params.include_archived));
    }

    const queryStr = searchParams.toString();
    const endpoint = `/prompt-systems${queryStr ? `?${queryStr}` : ""}`;
    return apiRequest<PromptSystem[]>(endpoint, {
      method: "GET",
    });
  },

  /**
   * Get single Prompt System by ID: GET /prompt-systems/{id}
   */
  async getById(id: number): Promise<PromptSystem> {
    return apiRequest<PromptSystem>(`/prompt-systems/${id}`, {
      method: "GET",
    });
  },

  /**
   * Create new Prompt System: POST /prompt-systems
   */
  async create(payload: PromptSystemCreate): Promise<PromptSystem> {
    return apiRequest<PromptSystem>("/prompt-systems", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name.trim(),
        description: payload.description ?? null,
        instructions: payload.instructions ?? null,
        variables: payload.variables ?? [],
        examples: payload.examples ?? [],
        output_format: payload.output_format ?? {},
        modules: payload.modules ?? [],
      }),
    });
  },

  /**
   * Update existing Prompt System: PUT /prompt-systems/{id}
   */
  async update(id: number, payload: PromptSystemUpdate): Promise<PromptSystem> {
    const body: PromptSystemUpdate = {};
    if (payload.name !== undefined) body.name = payload.name.trim();
    if (payload.description !== undefined) body.description = payload.description;
    if (payload.instructions !== undefined) body.instructions = payload.instructions;
    if (payload.variables !== undefined) body.variables = payload.variables;
    if (payload.examples !== undefined) body.examples = payload.examples;
    if (payload.output_format !== undefined) body.output_format = payload.output_format;
    if (payload.modules !== undefined) body.modules = payload.modules;

    return apiRequest<PromptSystem>(`/prompt-systems/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  /**
   * Partially update variables for a Prompt System: PATCH /prompt-systems/{id}
   */
  async updateVariables(id: number, variables: VariableDefinition[]): Promise<PromptSystem> {
    return apiRequest<PromptSystem>(`/prompt-systems/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ variables }),
    });
  },

  /**
   * Validate Prompt System variables: POST /prompt-systems/{id}/variables/validate
   */
  async validateVariables(id: number): Promise<VariableValidationResponse> {
    return apiRequest<VariableValidationResponse>(`/prompt-systems/${id}/variables/validate`, {
      method: "POST",
    });
  },

  /**
   * Archive a Prompt System: PATCH /prompt-systems/{id}/archive
   */
  async archive(id: number): Promise<PromptSystem> {
    return apiRequest<PromptSystem>(`/prompt-systems/${id}/archive`, {
      method: "PATCH",
    });
  },

  /**
   * Unarchive a Prompt System: PATCH /prompt-systems/{id}/unarchive
   */
  async unarchive(id: number): Promise<PromptSystem> {
    return apiRequest<PromptSystem>(`/prompt-systems/${id}/unarchive`, {
      method: "PATCH",
    });
  },

  /**
   * Delete Prompt System by ID: DELETE /prompt-systems/{id}
   */
  async delete(id: number): Promise<{ message: string; id: number }> {
    return apiRequest<{ message: string; id: number }>(`/prompt-systems/${id}`, {
      method: "DELETE",
    });
  },
};


