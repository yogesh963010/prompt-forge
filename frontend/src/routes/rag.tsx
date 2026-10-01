import { createFileRoute, redirect } from "@tanstack/react-router";
import { PromptForgeDashboard } from "@/components/dashboard";
import { isAuthenticated } from "@/lib/auth";

export const Route = createFileRoute("/rag")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !isAuthenticated()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "AI Assistant — PromptForge" },
      {
        name: "description",
        content: "Document grounding, vector retrieval, and conversational study assistant powered by full-stack RAG.",
      },
      { property: "og:title", content: "AI Assistant — PromptForge" },
      {
        property: "og:description",
        content: "Document grounding, vector retrieval, and conversational study assistant powered by full-stack RAG.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RagPage,
});

function RagPage() {
  return <PromptForgeDashboard initialScreen="rag" />;
}
