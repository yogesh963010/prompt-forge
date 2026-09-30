import { createFileRoute, redirect } from "@tanstack/react-router";
import { PromptForgeDashboard } from "@/components/dashboard";
import { isAuthenticated } from "@/lib/auth";

export const Route = createFileRoute("/history")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !isAuthenticated()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Prompt History — PromptForge" },
      {
        name: "description",
        content: "View, copy, and manage your previously generated final prompts in PromptForge.",
      },
      { property: "og:title", content: "Prompt History — PromptForge" },
      {
        property: "og:description",
        content: "View, copy, and manage your previously generated final prompts in PromptForge.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  return <PromptForgeDashboard initialScreen="history" />;
}
