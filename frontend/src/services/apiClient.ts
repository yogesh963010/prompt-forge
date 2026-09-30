/**
 * PromptForge Base API Client and Error Utilities
 */

export const API_BASE_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "";

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Format error responses from FastAPI / Pydantic into human-readable messages.
 */
export function formatErrorDetail(status: number, data: unknown): string {
  const errData = data as
    | { detail?: string | Array<{ msg?: string } | string> }
    | null
    | undefined;

  if (errData?.detail) {
    if (typeof errData.detail === "string") {
      return errData.detail;
    }
    if (Array.isArray(errData.detail)) {
      return errData.detail
        .map((item) => {
          if (
            typeof item === "object" &&
            item !== null &&
            "msg" in item &&
            typeof item.msg === "string"
          ) {
            return item.msg.replace(/^Value error,\s*/i, "");
          }
          return typeof item === "string" ? item : JSON.stringify(item);
        })
        .join(". ");
    }
  }

  if (status === 400) return "Invalid request. Please check your inputs.";
  if (status === 401) return "Authentication required. Please log in again.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return "Prompt System not found.";
  if (status === 422) return "Validation failed. Please verify your inputs.";
  if (status >= 500) return "A server error occurred. Please try again later.";

  return "An unexpected error occurred. Please try again.";
}

/**
 * Universal request wrapper for PromptForge API
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  if (!headers.has("Content-Type") && options.body && typeof options.body === "string") {
    headers.set("Content-Type", "application/json");
  }

  if (!headers.has("Authorization") && typeof window !== "undefined") {
    const token = localStorage.getItem("pf-token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
    });
  } catch (_err: unknown) {
    throw new ApiError(
      "Unable to connect to the PromptForge server. Please ensure the backend is running.",
      0
    );
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = formatErrorDetail(res.status, data);
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}


