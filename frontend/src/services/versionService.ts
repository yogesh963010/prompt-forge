/**
 * PromptForge Version History API Service
 * Handles listing, creating, comparing, and restoring Prompt System version snapshots.
 */
import { apiRequest } from "./apiClient";

export interface VersionModuleSnapshot {
  module_id: number;
  module_name?: string | null;
  input_mapping?: unknown;
  output_mapping?: unknown;
  enabled: boolean;
}

export interface PromptVersionSnapshot {
  name: string;
  description?: string | null;
  instructions?: string | null;
  variables?: unknown;
  examples?: unknown;
  output_format?: unknown;
  modules?: VersionModuleSnapshot[];
}

export interface PromptVersion {
  id: number;
  prompt_system_id: number;
  version_number: number;
  configuration_snapshot: PromptVersionSnapshot;
  change_note?: string | null;
  created_at: string;
  created_by: number;
}

export interface PromptVersionCreate {
  change_note?: string | null;
}

export interface VersionFieldDiff {
  changed: boolean;
  before: unknown;
  after: unknown;
}

export interface PromptVersionCompareResponse {
  version_a: number;
  version_b: number;
  changes: Record<string, VersionFieldDiff>;
}

export interface PromptVersionRestoreResponse {
  message: string;
  prompt_system_id: number;
  restored_from_version: number;
  new_version_number: number;
  version: PromptVersion;
}

/**
 * List historical version snapshots for a Prompt System, newest first.
 */
export async function getVersions(promptSystemId: number): Promise<PromptVersion[]> {
  return apiRequest<PromptVersion[]>(`/prompt-systems/${promptSystemId}/versions`, {
    method: "GET",
  });
}

/**
 * Get a single version snapshot by ID or version number.
 */
export async function getVersion(
  promptSystemId: number,
  versionId: number
): Promise<PromptVersion> {
  return apiRequest<PromptVersion>(`/prompt-systems/${promptSystemId}/versions/${versionId}`, {
    method: "GET",
  });
}

/**
 * Create a new historical version snapshot from the current Prompt System state.
 */
export async function createVersion(
  promptSystemId: number,
  data?: PromptVersionCreate
): Promise<PromptVersion> {
  return apiRequest<PromptVersion>(`/prompt-systems/${promptSystemId}/versions`, {
    method: "POST",
    body: JSON.stringify(data || {}),
  });
}

/**
 * Compare two version snapshots.
 */
export async function compareVersions(
  promptSystemId: number,
  versionA: number,
  versionB: number
): Promise<PromptVersionCompareResponse> {
  return apiRequest<PromptVersionCompareResponse>(
    `/prompt-systems/${promptSystemId}/versions/compare?version_a=${versionA}&version_b=${versionB}`,
    {
      method: "GET",
    }
  );
}

/**
 * Restore a previous version snapshot into the current Prompt System.
 */
export async function restoreVersion(
  promptSystemId: number,
  versionId: number
): Promise<PromptVersionRestoreResponse> {
  return apiRequest<PromptVersionRestoreResponse>(
    `/prompt-systems/${promptSystemId}/versions/${versionId}/restore`,
    {
      method: "POST",
    }
  );
}
