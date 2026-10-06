import { promptSystemService } from "@/services";

/**
 * Downloads the exported Assistant configuration as a JSON file.
 */
export async function downloadAssistantExport(id: number, name: string): Promise<void> {
  const exportData = await promptSystemService.exportAssistant(id);
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  // Safe filename
  const safeName = name.replace(/[^a-z0-9_\-]/gi, "_").toLowerCase() || "assistant";
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}-promptforge.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
