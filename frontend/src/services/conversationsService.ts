import { apiRequest } from "./apiClient";

export interface Conversation {
  id: number;
  user_id: number;
  prompt_system_id?: number;
  module_id?: number;
  title?: string;
  variables?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "system" | "client";
  content: string;
  created_at: string;
}

export interface AssistantContext {
  parent_context: any;
  parent_instructions?: string;
  current_child_context: any;
  current_child_instructions?: string;
  previous_child_context: any[];
  current_conversation_history: Message[];
}

export const conversationsService = {
  async createConversation(data: { title?: string; prompt_system_id?: number; module_id?: number }): Promise<Conversation> {
    return apiRequest<Conversation>("/conversations", { method: "POST", body: JSON.stringify(data) });
  },

  async getConversations(): Promise<Conversation[]> {
    return apiRequest<Conversation[]>("/conversations", { method: "GET" });
  },

  async getConversation(id: number): Promise<Conversation> {
    return apiRequest<Conversation>(`/conversations/${id}`, { method: "GET" });
  },

  async updateConversation(id: number, data: { title: string }): Promise<Conversation> {
    return apiRequest<Conversation>(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  },

  async deleteConversation(id: number): Promise<void> {
    await apiRequest(`/conversations/${id}`, { method: "DELETE" });
  },

  async clearMessages(id: number): Promise<void> {
    await apiRequest(`/conversations/${id}/clear`, { method: "POST" });
  },

  async getMessages(conversationId: number): Promise<Message[]> {
    return apiRequest<Message[]>(`/conversations/${conversationId}/messages`, { method: "GET" });
  },

  async createMessage(conversationId: number, role: string, content: string): Promise<Message> {
    return apiRequest<Message>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ role, content }),
    });
  },

  async getAssistantContext(assistantId: number, conversationId?: number): Promise<AssistantContext> {
    let url = `/assistants/${assistantId}/context`;
    if (conversationId) {
      url += `?conversation_id=${conversationId}`;
    }
    return apiRequest<AssistantContext>(url, { method: "GET" });
  },
};
