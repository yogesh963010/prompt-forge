import { createFileRoute, redirect } from "@tanstack/react-router";
import { PromptForgeDashboard } from "@/components/dashboard";
import { isAuthenticated } from "@/lib/auth";

export const Route = createFileRoute("/modules")({
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Prompt Modules — PromptForge" },
      {
        name: "description",
        content: "Build and manage reusable Prompt Modules with defined boundaries and output contracts.",
      },
      { property: "og:title", content: "Prompt Modules — PromptForge" },
      {
        property: "og:description",
        content: "Build and manage reusable Prompt Modules with defined boundaries and output contracts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ModulesPage,
});

function ModulesPage() {
  return <PromptForgeDashboard initialScreen="modules" />;
}
