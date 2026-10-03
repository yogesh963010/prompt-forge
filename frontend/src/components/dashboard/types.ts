export type Tab =
  | "Overview"
  | "Instructions"
  | "Variables"
  | "Examples"
  | "Output"
  | "Tests"
  | "Versions"
  | "Sharing";

export const tabs: Tab[] = [
  "Overview",
  "Instructions",
  "Variables",
  "Examples",
  "Output",
  "Tests",
  "Versions",
  "Sharing",
];

export function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return "Recently";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0 || isNaN(diffMs)) return "Recently";
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours === 1) return "1 hour ago";
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}
