/**
 * PromptForge Prompt Tests API Service
 * Handles CRUD and test execution operations against /prompt-systems/{id}/tests endpoints.
 */
import { apiRequest } from "./apiClient";

export interface TestCase {
  id: number;
  prompt_system_id: number;
  name: string;
  variables?: Record<string, unknown> | null;
  expected_behavior?: unknown;
  created_at: string;
}

export interface TestCaseCreate {
  name: string;
  variables?: Record<string, unknown>;
  expected_behavior?: unknown;
}

export interface TestCaseUpdate {
  name?: string;
  variables?: Record<string, unknown>;
  expected_behavior?: unknown;
}

export interface TestCaseRunResponse {
  test_case_id: number;
  prompt_system_id: number;
  name?: string;
  variables?: Record<string, unknown>;
  expected_behavior?: unknown;
  resolved_prompt: string;
  generated_output: string;
}

/**
 * Create a new test case for a Prompt System.
 */
export async function createTestCase(
  promptSystemId: number,
  data: TestCaseCreate
): Promise<TestCase> {
  return apiRequest<TestCase>(`/prompt-systems/${promptSystemId}/tests`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * List all test cases for a Prompt System.
 */
export async function getTestCases(promptSystemId: number): Promise<TestCase[]> {
  return apiRequest<TestCase[]>(`/prompt-systems/${promptSystemId}/tests`, {
    method: "GET",
  });
}

/**
 * Get a single test case by ID.
 */
export async function getTestCase(
  promptSystemId: number,
  testId: number
): Promise<TestCase> {
  return apiRequest<TestCase>(`/prompt-systems/${promptSystemId}/tests/${testId}`, {
    method: "GET",
  });
}

/**
 * Update a test case.
 */
export async function updateTestCase(
  promptSystemId: number,
  testId: number,
  data: TestCaseUpdate
): Promise<TestCase> {
  return apiRequest<TestCase>(`/prompt-systems/${promptSystemId}/tests/${testId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * Delete a test case.
 */
export async function deleteTestCase(
  promptSystemId: number,
  testId: number
): Promise<{ message: string; id: number }> {
  return apiRequest<{ message: string; id: number }>(
    `/prompt-systems/${promptSystemId}/tests/${testId}`,
    {
      method: "DELETE",
    }
  );
}

/**
 * Run a test case and retrieve resolved prompt and generated output.
 */
export async function runTestCase(
  promptSystemId: number,
  testId: number
): Promise<TestCaseRunResponse> {
  return apiRequest<TestCaseRunResponse>(
    `/prompt-systems/${promptSystemId}/tests/${testId}/run`,
    {
      method: "POST",
    }
  );
}
