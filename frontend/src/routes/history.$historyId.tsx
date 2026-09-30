import { createFileRoute, redirect } from "@tanstack/react-router";
import { PromptForgeDashboard } from "@/components/dashboard";
import { isAuthenticated } from "@/lib/auth";

export const Route = createFileRoute("/history/$historyId")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !isAuthenticated()) {
      throw redirect({ to: "/login" });
    }
  },
  head: () => ({
    meta: [
      { title: "Prompt History Detail — PromptForge" },
      {
        name: "description",
        content: "View the exact final resolved prompt and runtime variables for this run snapshot.",
      },
      { property: "og:title", content: "Prompt History Detail — PromptForge" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryDetailPage,
});

function HistoryDetailPage() {
  const { historyId } = Route.useParams();
  const idNum = parseInt(historyId, 10);
  return (
    <PromptForgeDashboard
      initialScreen="history-detail"
      initialHistoryId={isNaN(idNum) ? null : idNum}
    />
  );
}
