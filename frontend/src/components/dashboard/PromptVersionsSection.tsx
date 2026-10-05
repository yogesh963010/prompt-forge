import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  Eye,
  GitBranch,
  GitCompare,
  History,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  compareVersions,
  createVersion,
  getVersions,
  restoreVersion,
  type PromptVersion,
  type PromptVersionCompareResponse,
} from "@/services";

interface PromptVersionsSectionProps {
  promptSystemId: number | null;
  onRestored?: () => void;
}

export function PromptVersionsSection({
  promptSystemId,
  onRestored,
}: PromptVersionsSectionProps) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create Version modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // View Version modal state
  const [viewVersion, setViewVersion] = useState<PromptVersion | null>(null);

  // Compare modal state
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [selectedVerA, setSelectedVerA] = useState<number | null>(null);
  const [selectedVerB, setSelectedVerB] = useState<number | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<PromptVersionCompareResponse | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  // Restore modal state
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [versionToRestore, setVersionToRestore] = useState<PromptVersion | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!promptSystemId) {
      setVersions([]);
      return;
    }
    fetchVersions(promptSystemId);
  }, [promptSystemId]);

  async function fetchVersions(id: number) {
    setLoading(true);
    setError(null);
    try {
      const items = await getVersions(id);
      setVersions(items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load versions.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // Create version
  async function handleCreateVersion() {
    if (!promptSystemId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createVersion(promptSystemId, {
        change_note: changeNote.trim() || undefined,
      });
      setVersions((prev) => [created, ...prev]);
      setCreateModalOpen(false);
      setChangeNote("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create version.";
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  }

  // Open compare dialog
  function openCompareModal(defaultA?: number, defaultB?: number) {
    if (versions.length < 2) {
      setError("At least two versions are required to compare.");
      return;
    }
    const verA = defaultA ?? (versions[1]?.version_number || versions[0]?.version_number);
    const verB = defaultB ?? versions[0]?.version_number;
    setSelectedVerA(verA);
    setSelectedVerB(verB);
    setCompareResult(null);
    setCompareError(null);
    setCompareModalOpen(true);
    executeCompare(verA, verB);
  }

  async function executeCompare(verA: number, verB: number) {
    if (!promptSystemId) return;
    setComparing(true);
    setCompareError(null);
    try {
      const res = await compareVersions(promptSystemId, verA, verB);
      setCompareResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to compare versions.";
      setCompareError(msg);
    } finally {
      setComparing(false);
    }
  }

  // Prompt restore
  function promptRestore(version: PromptVersion) {
    setVersionToRestore(version);
    setRestoreError(null);
    setRestoreModalOpen(true);
  }

  async function handleConfirmRestore() {
    if (!promptSystemId || !versionToRestore) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      const res = await restoreVersion(promptSystemId, versionToRestore.version_number);
      setRestoreSuccess(res.message);
      setRestoreModalOpen(false);
      setViewVersion(null);
      // Reload versions and notify parent to reload current Assistant
      await fetchVersions(promptSystemId);
      if (onRestored) {
        onRestored();
      }
      setTimeout(() => setRestoreSuccess(null), 5000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to restore version.";
      setRestoreError(msg);
    } finally {
      setRestoring(false);
    }
  }

  if (!promptSystemId) {
    return (
      <div className="rounded-lg bg-card/55 p-8 text-center ring-1 ring-border/60">
        <History className="mx-auto size-8 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-semibold">Select a Assistant</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Save or choose a Assistant to view and manage its version history.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Panel */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Version History</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Review immutable configuration snapshots, inspect changes, and restore prior states.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {versions.length >= 2 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openCompareModal()}
              className="h-8 gap-1.5 text-xs"
            >
              <GitCompare className="size-3.5" /> Compare Versions
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchVersions(promptSystemId)}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setChangeNote("");
              setCreateError(null);
              setCreateModalOpen(true);
            }}
            className="h-8 gap-1.5 text-xs"
          >
            <Plus className="size-3.5" /> Create Version
          </Button>
        </div>
      </div>

      {/* Success banner */}
      {restoreSuccess && (
        <div className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-xs font-medium text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{restoreSuccess}</span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchVersions(promptSystemId)}
            className="ml-auto h-6 px-2 text-xs"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && versions.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-xs">Loading version history...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && versions.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-border/80 bg-card/30 p-10 text-center">
          <History className="mx-auto size-9 text-muted-foreground" />
          <h3 className="mt-3 text-sm font-semibold">No versions created yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Capture a milestone snapshot of your prompt configuration to track revisions and restore earlier configurations at any time.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setChangeNote("");
              setCreateError(null);
              setCreateModalOpen(true);
            }}
            className="mt-4 gap-1.5 text-xs"
          >
            <Plus className="size-3.5" /> Create First Version
          </Button>
        </div>
      )}

      {/* Versions List */}
      <div className="space-y-3">
        {versions.map((ver, index) => {
          const isLatest = index === 0;
          const snap = ver.configuration_snapshot || {};
          const moduleCount = snap.modules ? snap.modules.length : 0;
          const varCount = Array.isArray(snap.variables) ? snap.variables.length : snap.variables ? Object.keys(snap.variables).length : 0;

          return (
            <div
              key={ver.id}
              className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60 transition hover:bg-card/70"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-primary-soft px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                    v{ver.version_number}.0
                  </span>
                  {isLatest && (
                    <span className="rounded-md bg-success-soft px-2 py-0.5 font-mono text-[10px] text-success">
                      Current Deployment
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="size-3" />
                    {new Date(ver.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setViewVersion(ver)}
                  >
                    <Eye className="size-3" /> View Snapshot
                  </Button>
                  {versions.length >= 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => openCompareModal(ver.version_number)}
                    >
                      <GitCompare className="size-3" /> Compare
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-primary"
                    onClick={() => promptRestore(ver)}
                    disabled={isLatest}
                    title={isLatest ? "Already current configuration" : "Restore this version"}
                  >
                    <RotateCcw className="size-3" /> Restore
                  </Button>
                </div>
              </div>

              {/* Version Metadata & Snapshot Preview */}
              <div className="mt-3 grid gap-3 text-xs sm:grid-cols-[1fr_auto]">
                <div>
                  <h4 className="font-medium text-foreground">
                    {ver.change_note || <span className="italic text-muted-foreground">No change note</span>}
                  </h4>
                  <p className="mt-1 line-clamp-2 font-mono text-[11px] text-muted-foreground">
                    {snap.instructions || "No instructions defined."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground sm:flex-col sm:items-end sm:gap-1">
                  <span>Variables: <strong className="text-foreground">{varCount}</strong></span>
                  <span>Modules: <strong className="text-foreground">{moduleCount}</strong></span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* Create Version Modal                                                      */}
      {/* ========================================================================= */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Version</DialogTitle>
            <DialogDescription>
              Capture an immutable snapshot of the current Assistant configuration.
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <div className="space-y-3 py-2 text-xs">
            <div>
              <label className="mb-1 block font-medium">Change Note</label>
              <Textarea
                placeholder="e.g. Added Research Module, updated tone variable, refined core instructions..."
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                rows={3}
                className="text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                The snapshot will automatically capture all instructions, variables, examples, output requirements, and module bindings.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateModalOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateVersion} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Creating...
                </>
              ) : (
                "Create Version"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* View Version Detail Modal                                                 */}
      {/* ========================================================================= */}
      <Dialog open={Boolean(viewVersion)} onOpenChange={(open) => !open && setViewVersion(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {viewVersion && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-primary-soft px-2 py-0.5 font-mono text-xs font-semibold text-primary">
                    v{viewVersion.version_number}.0
                  </span>
                  <DialogTitle className="text-base">
                    Historical Snapshot Details
                  </DialogTitle>
                </div>
                <DialogDescription>
                  Captured on {new Date(viewVersion.created_at).toLocaleString()} • Immutable Historical Snapshot
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                {/* Change note banner */}
                <div className="rounded-md bg-muted/40 p-3">
                  <span className="font-semibold text-foreground">Change Note</span>
                  <p className="mt-1 text-muted-foreground">
                    {viewVersion.change_note || "No change note recorded."}
                  </p>
                </div>

                {/* Instructions */}
                <div>
                  <span className="font-semibold text-foreground">Instructions</span>
                  <pre className="mt-1.5 max-h-40 overflow-y-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100 whitespace-pre-wrap border border-zinc-800">
                    {viewVersion.configuration_snapshot.instructions || "<No instructions>"}
                  </pre>
                </div>

                {/* Variables */}
                <div>
                  <span className="font-semibold text-foreground">Variables</span>
                  <div className="mt-1.5 rounded-md bg-muted/40 p-2.5 font-mono text-[11px]">
                    {Array.isArray(viewVersion.configuration_snapshot.variables) &&
                    viewVersion.configuration_snapshot.variables.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {viewVersion.configuration_snapshot.variables.map((v, i) => (
                          <span key={i} className="rounded bg-background px-2 py-1 ring-1 ring-border/60">
                            {typeof v === "object" && v && "name" in v ? String(v.name) : String(v)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground italic">None</span>
                    )}
                  </div>
                </div>

                {/* Output Format */}
                {viewVersion.configuration_snapshot.output_format && (
                  <div>
                    <span className="font-semibold text-foreground">Output Format</span>
                    <pre className="mt-1.5 max-h-28 overflow-y-auto rounded-md bg-muted/40 p-2.5 font-mono text-[11px] whitespace-pre-wrap">
                      {typeof viewVersion.configuration_snapshot.output_format === "object"
                        ? JSON.stringify(viewVersion.configuration_snapshot.output_format, null, 2)
                        : String(viewVersion.configuration_snapshot.output_format)}
                    </pre>
                  </div>
                )}

                {/* Modules */}
                <div>
                  <span className="font-semibold text-foreground">
                    Referenced Modules ({viewVersion.configuration_snapshot.modules?.length || 0})
                  </span>
                  {viewVersion.configuration_snapshot.modules &&
                  viewVersion.configuration_snapshot.modules.length > 0 ? (
                    <div className="mt-1.5 space-y-2">
                      {viewVersion.configuration_snapshot.modules.map((m, idx) => (
                        <div key={idx} className="rounded-md bg-muted/40 p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-primary">
                              {m.module_name || `Module #${m.module_id}`}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {m.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground italic">No modules attached.</p>
                  )}
                </div>
              </div>

              <DialogFooter className="mt-2 flex items-center justify-between sm:justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => promptRestore(viewVersion)}
                  className="gap-1.5 text-xs text-primary hover:text-primary"
                >
                  <RotateCcw className="size-3" /> Restore This Version
                </Button>
                <Button size="sm" onClick={() => setViewVersion(null)} className="text-xs">
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* Compare Modal                                                             */}
      {/* ========================================================================= */}
      <Dialog open={compareModalOpen} onOpenChange={setCompareModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <GitCompare className="size-4 text-primary" />
              <DialogTitle className="text-base">Compare Versions</DialogTitle>
            </div>
            <DialogDescription>
              Select two version snapshots to see configuration differences.
            </DialogDescription>
          </DialogHeader>

          {compareError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{compareError}</span>
            </div>
          )}

          {/* Version Selection Header */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-card/60 p-3 ring-1 ring-border/60 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-muted-foreground">Version A:</span>
              <select
                value={selectedVerA ?? ""}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSelectedVerA(val);
                  if (selectedVerB) executeCompare(val, selectedVerB);
                }}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.version_number}>
                    v{v.version_number}.0 {v.change_note ? `(${v.change_note})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <ArrowRight className="size-4 text-muted-foreground" />

            <div className="flex items-center gap-2">
              <span className="font-semibold text-muted-foreground">Version B:</span>
              <select
                value={selectedVerB ?? ""}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setSelectedVerB(val);
                  if (selectedVerA) executeCompare(selectedVerA, val);
                }}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.version_number}>
                    v{v.version_number}.0 {v.change_note ? `(${v.change_note})` : ""}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedVerA && selectedVerB) executeCompare(selectedVerA, selectedVerB);
              }}
              disabled={comparing}
              className="ml-auto h-7 text-xs"
            >
              {comparing ? <Loader2 className="size-3 animate-spin" /> : "Refresh Diff"}
            </Button>
          </div>

          {/* Diff Result */}
          {comparing ? (
            <div className="flex h-36 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-xs">Computing diff between snapshots...</p>
            </div>
          ) : compareResult ? (
            <div className="space-y-4 py-2 text-xs">
              {Object.entries(compareResult.changes).map(([field, diff]) => (
                <div key={field} className="rounded-lg bg-card/40 p-3 ring-1 ring-border/50">
                  <div className="flex items-center justify-between pb-2 border-b border-border/40">
                    <span className="font-semibold uppercase tracking-wider text-[11px] text-foreground">
                      {field}
                    </span>
                    {diff.changed ? (
                      <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-500">
                        Modified
                      </span>
                    ) : (
                      <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        Unchanged
                      </span>
                    )}
                  </div>

                  {diff.changed ? (
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md bg-destructive/10 p-2.5 border border-destructive/20">
                        <span className="font-semibold text-destructive block mb-1">
                          v{compareResult.version_a}.0 (Before)
                        </span>
                        <pre className="font-mono text-[11px] whitespace-pre-wrap max-h-36 overflow-y-auto">
                          {typeof diff.before === "object"
                            ? JSON.stringify(diff.before, null, 2)
                            : String(diff.before ?? "<empty>")}
                        </pre>
                      </div>
                      <div className="rounded-md bg-success-soft p-2.5 border border-success/20">
                        <span className="font-semibold text-success block mb-1">
                          v{compareResult.version_b}.0 (After)
                        </span>
                        <pre className="font-mono text-[11px] whitespace-pre-wrap max-h-36 overflow-y-auto text-success">
                          {typeof diff.after === "object"
                            ? JSON.stringify(diff.after, null, 2)
                            : String(diff.after ?? "<empty>")}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground italic">
                      Values are identical in both versions.
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <DialogFooter>
            <Button size="sm" onClick={() => setCompareModalOpen(false)} className="text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* Restore Confirmation Dialog                                               */}
      {/* ========================================================================= */}
      <Dialog open={restoreModalOpen} onOpenChange={setRestoreModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Restore Version {versionToRestore?.version_number}?
            </DialogTitle>
            <DialogDescription>
              This will replace the current Assistant configuration with the state from Version{" "}
              {versionToRestore?.version_number}.
            </DialogDescription>
          </DialogHeader>

          {restoreError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{restoreError}</span>
            </div>
          )}

          <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
            <p>
              <strong>Append-Only Guarantee:</strong> Your existing versions will be preserved. A new version representing this restored configuration will be created to maintain full history.
            </p>
          </div>

          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRestoreModalOpen(false)}
              disabled={restoring}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmRestore}
              disabled={restoring}
              className="gap-1.5"
            >
              {restoring ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Restoring...
                </>
              ) : (
                <>
                  <RotateCcw className="size-3.5" /> Restore Version
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
