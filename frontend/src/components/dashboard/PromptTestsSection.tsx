import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Edit2,
  FileText,
  FlaskConical,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
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
  createTestCase,
  deleteTestCase,
  getTestCases,
  runTestCase,
  updateTestCase,
  type TestCase,
  type TestCaseRunResponse,
  type VariableDefinition,
} from "@/services";

interface PromptTestsSectionProps {
  promptSystemId: number | null;
  systemVariables?: VariableDefinition[];
}

interface VariableEntry {
  key: string;
  value: string;
  required?: boolean;
}

export function PromptTestsSection({
  promptSystemId,
  systemVariables = [],
}: PromptTestsSectionProps) {
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state for Create / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingTestCaseId, setEditingTestCaseId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formVariables, setFormVariables] = useState<VariableEntry[]>([]);
  const [formExpectedBehavior, setFormExpectedBehavior] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete modal state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testToDelete, setTestToDelete] = useState<TestCase | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Run state & results (keyed by test_case_id)
  const [runningId, setRunningId] = useState<number | null>(null);
  const [runResults, setRunResults] = useState<Record<number, TestCaseRunResponse>>({});
  const [runErrors, setRunErrors] = useState<Record<number, string>>({});
  const [activeResultModal, setActiveResultModal] = useState<TestCaseRunResponse | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Fetch test cases whenever promptSystemId changes
  useEffect(() => {
    if (!promptSystemId) {
      setTestCases([]);
      return;
    }
    fetchTestCases(promptSystemId);
  }, [promptSystemId]);

  async function fetchTestCases(id: number) {
    setLoading(true);
    setError(null);
    try {
      const items = await getTestCases(id);
      setTestCases(items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load test cases.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // Open modal for Create
  function openCreateModal() {
    setModalMode("create");
    setEditingTestCaseId(null);
    setFormName("");
    setFormExpectedBehavior("");
    setFormError(null);

    // Seed variables from prompt system's configured variables
    const initialVars: VariableEntry[] = systemVariables.map((v) => ({
      key: v.name,
      value: v.default !== undefined && v.default !== null ? String(v.default) : "",
      required: v.required !== false,
    }));
    setFormVariables(initialVars);
    setModalOpen(true);
  }

  // Open modal for Edit
  function openEditModal(testCase: TestCase) {
    setModalMode("edit");
    setEditingTestCaseId(testCase.id);
    setFormName(testCase.name);

    // Format expected behavior
    let expectedStr = "";
    if (testCase.expected_behavior) {
      if (Array.isArray(testCase.expected_behavior)) {
        expectedStr = testCase.expected_behavior.join("\n");
      } else if (typeof testCase.expected_behavior === "string") {
        expectedStr = testCase.expected_behavior;
      } else {
        expectedStr = JSON.stringify(testCase.expected_behavior, null, 2);
      }
    }
    setFormExpectedBehavior(expectedStr);
    setFormError(null);

    // Map test case variables
    const existing = testCase.variables || {};
    const keysSeen = new Set<string>();
    const varEntries: VariableEntry[] = [];

    // First include any known system variables
    systemVariables.forEach((sv) => {
      keysSeen.add(sv.name);
      varEntries.push({
        key: sv.name,
        value: existing[sv.name] !== undefined && existing[sv.name] !== null ? String(existing[sv.name]) : "",
        required: sv.required !== false,
      });
    });

    // Then any extra keys stored in the test case
    Object.entries(existing).forEach(([k, v]) => {
      if (!keysSeen.has(k)) {
        keysSeen.add(k);
        varEntries.push({
          key: k,
          value: v !== undefined && v !== null ? String(v) : "",
          required: false,
        });
      }
    });

    setFormVariables(varEntries);
    setModalOpen(true);
  }

  // Handle variable field updates
  function handleVariableChange(index: number, value: string) {
    setFormVariables((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], value };
      return next;
    });
  }

  function handleAddCustomVariable() {
    setFormVariables((prev) => [
      ...prev,
      { key: "", value: "", required: false },
    ]);
  }

  function handleCustomKeyChange(index: number, newKey: string) {
    setFormVariables((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], key: newKey.trim() };
      return next;
    });
  }

  function handleRemoveVariable(index: number) {
    setFormVariables((prev) => prev.filter((_, i) => i !== index));
  }

  // Save Create or Edit
  async function handleSaveTestCase() {
    if (!promptSystemId) return;
    if (!formName.trim()) {
      setFormError("Test case name is required.");
      return;
    }

    setSaving(true);
    setFormError(null);

    // Build variables object
    const variablesMap: Record<string, string> = {};
    for (const v of formVariables) {
      const k = v.key.trim();
      if (k) {
        variablesMap[k] = v.value;
      }
    }

    // Process expected behavior
    let expectedPayload: unknown = null;
    if (formExpectedBehavior.trim()) {
      const lines = formExpectedBehavior
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      expectedPayload = lines.length > 1 ? lines : formExpectedBehavior.trim();
    }

    try {
      if (modalMode === "create") {
        const created = await createTestCase(promptSystemId, {
          name: formName.trim(),
          variables: variablesMap,
          expected_behavior: expectedPayload,
        });
        setTestCases((prev) => [...prev, created]);
      } else if (modalMode === "edit" && editingTestCaseId !== null) {
        const updated = await updateTestCase(promptSystemId, editingTestCaseId, {
          name: formName.trim(),
          variables: variablesMap,
          expected_behavior: expectedPayload,
        });
        setTestCases((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
      }
      setModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save test case.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  // Delete handling
  function promptDelete(testCase: TestCase) {
    setTestToDelete(testCase);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  }

  async function handleConfirmDelete() {
    if (!promptSystemId || !testToDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteTestCase(promptSystemId, testToDelete.id);
      setTestCases((prev) => prev.filter((t) => t.id !== testToDelete.id));
      setRunResults((prev) => {
        const next = { ...prev };
        delete next[testToDelete.id];
        return next;
      });
      setDeleteDialogOpen(false);
      setTestToDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete test case.";
      setDeleteError(msg);
    } finally {
      setDeleting(false);
    }
  }

  // Run test case
  async function handleRunTestCase(testCase: TestCase) {
    if (!promptSystemId) return;
    setRunningId(testCase.id);
    setRunErrors((prev) => {
      const next = { ...prev };
      delete next[testCase.id];
      return next;
    });

    try {
      const res = await runTestCase(promptSystemId, testCase.id);
      // Ensure name and expected_behavior are populated for UI
      const resultWithMeta: TestCaseRunResponse = {
        ...res,
        name: res.name || testCase.name,
        expected_behavior: res.expected_behavior || testCase.expected_behavior,
        variables: res.variables || testCase.variables || {},
      };
      setRunResults((prev) => ({
        ...prev,
        [testCase.id]: resultWithMeta,
      }));
      setActiveResultModal(resultWithMeta);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Test execution failed.";
      setRunErrors((prev) => ({
        ...prev,
        [testCase.id]: msg,
      }));
    } finally {
      setRunningId(null);
    }
  }

  function handleCopyPrompt(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }

  if (!promptSystemId) {
    return (
      <div className="rounded-lg bg-card/55 p-8 text-center ring-1 ring-border/60">
        <FlaskConical className="mx-auto size-8 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-semibold">Select a Prompt System</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Save or choose a Prompt System to create and run test cases.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab Header Panel */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Test Cases</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Validate expected behavior against representative variable inputs and verify resolved prompts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchTestCases(promptSystemId)}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={openCreateModal} className="h-8 gap-1.5 text-xs">
            <Plus className="size-3.5" /> Add Test Case
          </Button>
        </div>
      </div>

      {/* Global Error message */}
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchTestCases(promptSystemId)}
            className="ml-auto h-6 px-2 text-xs"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && testCases.length === 0 && (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-xs">Loading test cases...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && testCases.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-border/80 bg-card/30 p-10 text-center">
          <FlaskConical className="mx-auto size-9 text-muted-foreground" />
          <h3 className="mt-3 text-sm font-semibold">No test cases created yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            Test cases allow you to test your prompt system with sample variables and review the resolved prompt and generated output.
          </p>
          <Button size="sm" onClick={openCreateModal} className="mt-4 gap-1.5 text-xs">
            <Plus className="size-3.5" /> Create First Test Case
          </Button>
        </div>
      )}

      {/* Test Cases List */}
      <div className="space-y-3">
        {testCases.map((tc) => {
          const isRunning = runningId === tc.id;
          const runResult = runResults[tc.id];
          const runError = runErrors[tc.id];
          const varCount = tc.variables ? Object.keys(tc.variables).length : 0;

          return (
            <div
              key={tc.id}
              className="rounded-lg bg-card/55 p-4 ring-1 ring-border/60 transition hover:bg-card/70"
            >
              {/* Card Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <FlaskConical className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">{tc.name}</h3>
                  {runResult ? (
                    <span className="flex items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 font-mono text-[10px] text-success">
                      <CheckCircle2 className="size-3" /> Run Succeeded
                    </span>
                  ) : (
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      Ready
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => openEditModal(tc)}
                  >
                    <Edit2 className="size-3" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => promptDelete(tc)}
                    title="Delete test case"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 gap-1.5 px-3 text-xs"
                    onClick={() => handleRunTestCase(tc)}
                    disabled={isRunning}
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" /> Running...
                      </>
                    ) : runResult ? (
                      <>
                        <RotateCcw className="size-3" /> Run Again
                      </>
                    ) : (
                      <>
                        <Play className="size-3" /> Run Test
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Execution Error Banner */}
              {runError && (
                <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{runError}</span>
                </div>
              )}

              {/* Variables & Expected Behavior Grid */}
              <div className="mt-3 grid gap-4 text-xs sm:grid-cols-2">
                {/* Variables */}
                <div>
                  <span className="font-medium text-muted-foreground">
                    Input Variables ({varCount})
                  </span>
                  {varCount > 0 ? (
                    <div className="mt-1.5 space-y-1 rounded-md bg-muted/40 p-2.5 font-mono text-[11px]">
                      {Object.entries(tc.variables || {}).map(([key, val]) => (
                        <div key={key} className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-primary">{key}:</span>
                          <span className="truncate text-foreground">
                            {val !== undefined && val !== null && String(val) !== ""
                              ? String(val)
                              : "<empty>"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-muted-foreground italic">No variables specified.</p>
                  )}
                </div>

                {/* Expected Behavior */}
                <div>
                  <span className="font-medium text-muted-foreground">Expected Behavior</span>
                  {tc.expected_behavior ? (
                    <div className="mt-1.5 rounded-md bg-muted/40 p-2.5 text-[11px] leading-relaxed">
                      {Array.isArray(tc.expected_behavior) ? (
                        <ul className="list-inside list-disc space-y-0.5">
                          {tc.expected_behavior.map((b, i) => (
                            <li key={i}>{String(b)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="whitespace-pre-wrap">{String(tc.expected_behavior)}</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-muted-foreground italic">No expected behavior defined.</p>
                  )}
                </div>
              </div>

              {/* In-place View Result summary if run */}
              {runResult && (
                <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <Sparkles className="size-3.5" /> Latest Run Result
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] text-primary hover:text-primary"
                      onClick={() => setActiveResultModal(runResult)}
                    >
                      View Details & Resolved Prompt
                    </Button>
                  </div>
                  <p className="mt-1 line-clamp-2 font-mono text-[11px] text-muted-foreground">
                    {runResult.resolved_prompt}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* Create / Edit Modal Dialog                                                */}
      {/* ========================================================================= */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {modalMode === "create" ? "Create Test Case" : "Edit Test Case"}
            </DialogTitle>
            <DialogDescription>
              Define sample variable inputs and expected outcomes to test your prompt system.
            </DialogDescription>
          </DialogHeader>

          {formError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-4 py-2 text-xs">
            {/* Test Case Name */}
            <div>
              <label className="mb-1 block font-medium">
                Test Case Name <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Kubernetes Article, Executive Summary..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Input Variables */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <span className="block font-medium">Input Variables</span>
                  <p className="text-[11px] text-muted-foreground">
                    Sample runtime values for placeholders in your prompt instructions.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomVariable}
                  className="h-7 gap-1 text-[11px]"
                >
                  <Plus className="size-3" /> Add Variable
                </Button>
              </div>

              {formVariables.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/70 p-4 text-center text-muted-foreground">
                  <p className="text-[11px]">No variables defined for this system.</p>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={handleAddCustomVariable}
                    className="mt-1 h-6 text-xs text-primary"
                  >
                    + Add a variable placeholder
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 rounded-lg bg-card/40 p-3 ring-1 ring-border/50">
                  {formVariables.map((v, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="w-1/3">
                        <Input
                          placeholder="variable_name"
                          value={v.key}
                          onChange={(e) => handleCustomKeyChange(idx, e.target.value)}
                          className="h-8 font-mono text-[11px]"
                          disabled={systemVariables.some((sv) => sv.name === v.key)}
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          placeholder={`Sample value for {${v.key || "var"}}`}
                          value={v.value}
                          onChange={(e) => handleVariableChange(idx, e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      {!systemVariables.some((sv) => sv.name === v.key) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => handleRemoveVariable(idx)}
                          title="Remove custom variable"
                        >
                          <X className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expected Behavior */}
            <div>
              <label className="mb-1 block font-medium">Expected Behavior</label>
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                Describe the expected output criteria, style guidelines, or requirements (one per line).
              </p>
              <Textarea
                placeholder={"- Explain concepts clearly\n- Include examples\n- Avoid unsupported claims"}
                value={formExpectedBehavior}
                onChange={(e) => setFormExpectedBehavior(e.target.value)}
                rows={4}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveTestCase} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Saving...
                </>
              ) : modalMode === "create" ? (
                "Save Test Case"
              ) : (
                "Update Test Case"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* Delete Confirmation Dialog                                               */}
      {/* ========================================================================= */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Test Case</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                "{testToDelete?.name}"
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/15 p-2.5 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{deleteError}</span>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Deleting...
                </>
              ) : (
                "Delete Test Case"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* Run Result Detail Dialog                                                 */}
      {/* ========================================================================= */}
      <Dialog
        open={Boolean(activeResultModal)}
        onOpenChange={(open) => !open && setActiveResultModal(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {activeResultModal && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <DialogTitle className="text-base">
                    Test Run Result: {activeResultModal.name}
                  </DialogTitle>
                </div>
                <DialogDescription>
                  Review the resolved prompt and generated output for this test case.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2 text-xs">
                {/* Input Variables */}
                <div>
                  <span className="font-semibold text-foreground">Input Variables</span>
                  {activeResultModal.variables && Object.keys(activeResultModal.variables).length > 0 ? (
                    <div className="mt-1.5 grid gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
                      {Object.entries(activeResultModal.variables).map(([k, v]) => (
                        <div key={k} className="flex flex-col">
                          <span className="font-mono text-[11px] font-semibold text-primary">
                            {k}
                          </span>
                          <span className="font-mono text-[11px] text-foreground">
                            {String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground italic">None</p>
                  )}
                </div>

                {/* Resolved Prompt */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Resolved Prompt</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => handleCopyPrompt(activeResultModal.resolved_prompt)}
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="size-3 text-success" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" /> Copy Prompt
                        </>
                      )}
                    </Button>
                  </div>
                  <pre className="mt-1.5 max-h-48 overflow-y-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100 whitespace-pre-wrap border border-zinc-800">
                    {activeResultModal.resolved_prompt}
                  </pre>
                </div>

                {/* Generated Output */}
                <div>
                  <span className="font-semibold text-foreground">Generated Output</span>
                  <pre className="mt-1.5 max-h-48 overflow-y-auto rounded-md bg-zinc-950 p-3 font-mono text-[11px] leading-relaxed text-zinc-100 whitespace-pre-wrap border border-zinc-800">
                    {activeResultModal.generated_output}
                  </pre>
                </div>

                {/* Expected Behavior */}
                {activeResultModal.expected_behavior && (
                  <div>
                    <span className="font-semibold text-foreground">Expected Behavior</span>
                    <div className="mt-1.5 rounded-md bg-muted/40 p-2.5 text-[11px] leading-relaxed">
                      {Array.isArray(activeResultModal.expected_behavior) ? (
                        <ul className="list-inside list-disc space-y-0.5">
                          {activeResultModal.expected_behavior.map((item, i) => (
                            <li key={i}>{String(item)}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="whitespace-pre-wrap">
                          {String(activeResultModal.expected_behavior)}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-2 flex items-center justify-between sm:justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const tc = testCases.find((t) => t.id === activeResultModal.test_case_id);
                    if (tc) {
                      handleRunTestCase(tc);
                    }
                  }}
                  disabled={runningId === activeResultModal.test_case_id}
                  className="gap-1.5 text-xs"
                >
                  <RotateCcw className="size-3" /> Run Again
                </Button>
                <Button
                  size="sm"
                  onClick={() => setActiveResultModal(null)}
                  className="text-xs"
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
