import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ProvenanceSurface } from "@/components/ui/provenance";
import { Separator } from "@/components/ui/separator";
import { useLocalization } from "@/contexts/LocalizationContext";
import { AI_BASE_URL, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import type { Subtask, Task, User } from "@/types";

interface TaskDetailsPanelProps {
  task: Task;
  onClose: () => void;
}

const selectClassName =
  "h-9 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm font-medium text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";

export default function TaskDetailsPanel({
  task,
  onClose,
}: TaskDetailsPanelProps) {
  const { t, language } = useLocalization();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedSubtasks, setGeneratedSubtasks] = useState<Subtask[]>([]);
  const [existingSubtasks, setExistingSubtasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState(0);
  const [storyPoints, setStoryPoints] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [aiError, setAiError] = useState("");

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm mx-auto min-h-[150px] rounded-[var(--radius-control)] border border-input bg-surface-subtle p-4 text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30",
      },
    },
  });

  useEffect(() => {
    if (!task) return;
    const syncTimer = setTimeout(() => {
      editor?.commands.setContent(task.Description || "");
      setAssigneeId(task.AssigneeID || "unassigned");
      setStatus(task.Status || "todo");
      setPriority(task.Priority || 0);
      setStoryPoints(task.StoryPoints || 0);
      setGeneratedSubtasks([]);
      setAiError("");
      setErrorMessage("");
    }, 0);

    const fetchSubtasks = async () => {
      try {
        const data = await apiGet<Task[]>(
          `/tasks/${task.ID}/subtasks`,
        );
        setExistingSubtasks(data || []);
      } catch (error) {
        console.error(error);
        setErrorMessage(t("pm.taskDetails.loadSubtasksFailed"));
      }
    };
    void fetchSubtasks();
    return () => clearTimeout(syncTimer);
  }, [task, editor, t]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const data = await apiGet<User[]>("/users/search?q=");
        setUsers(data || []);
      } catch (error) {
        console.error(error);
      }
    };
    void fetchUsers();
  }, []);

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setErrorMessage("");
    try {
      let recordVersion = task.RecordVersion;
      if (status !== task.Status) {
        const transitioned = await apiPost<Task>(`/tasks/${task.ID}/transition`, {
          status,
        });
        recordVersion = transitioned.RecordVersion;
      }
      await apiPut(`/tasks/${task.ID}`, {
        description: editor?.getHTML(),
        assignee_id: assigneeId === "unassigned" ? "" : assigneeId,
        priority,
        story_points: storyPoints,
        record_version: recordVersion,
      });
      window.dispatchEvent(
        new CustomEvent("ws-message", {
          detail: { type: "task_updated" },
        }),
      );
      onClose();
    } catch (error) {
      console.error(error);
      setErrorMessage(t("pm.taskDetails.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAIBreakdown = async () => {
    setIsGenerating(true);
    setGeneratedSubtasks([]);
    setAiError("");
    try {
      const data = await apiPost<{ subtasks: string[] }>(
        "/ai/generate-subtasks",
        {
          title: task.Title,
          description: editor?.getText() || "",
          lang: language,
        },
        AI_BASE_URL,
      );
      if (!Array.isArray(data.subtasks) || data.subtasks.length === 0) {
        throw new Error("empty AI response");
      }
      setGeneratedSubtasks(
        data.subtasks.map((title, index) => ({
          id: String(index + 1),
          title,
          done: false,
        })),
      );
    } catch (error) {
      console.error("AI subtask generation failed.", error);
      setAiError(t("pm.taskDetails.aiFailed"));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddSubtasks = async () => {
    const tasksToCreate = generatedSubtasks.filter((subtask) => !subtask.done);
    if (tasksToCreate.length === 0) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      for (const subtask of tasksToCreate) {
        await apiPost(`/tasks/${task.ID}/subtasks`, { title: subtask.title });
      }
      setGeneratedSubtasks([]);
      window.dispatchEvent(
        new CustomEvent("ws-message", {
          detail: { type: "task_updated" },
        }),
      );
      const data = await apiGet<Task[]>(
        `/tasks/${task.ID}/subtasks`,
      );
      setExistingSubtasks(data || []);
    } catch (error) {
      console.error("Failed to save subtasks.", error);
      setErrorMessage(t("pm.taskDetails.addSubtasksFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleExistingSubtask = async (
    subtaskId: string,
    currentStatus: string,
  ) => {
    const nextStatus: Record<string, string> = {
      todo: "in_progress",
      in_progress: "review",
      review: "done",
      blocked: "in_progress",
      done: "in_progress",
    };
    const newStatus = nextStatus[currentStatus] || "in_progress";
    setExistingSubtasks((current) =>
      current.map((subtask) =>
        subtask.ID === subtaskId
          ? { ...subtask, Status: newStatus }
          : subtask,
      ),
    );
    try {
      await apiPost(`/tasks/${subtaskId}/transition`, { status: newStatus });
      window.dispatchEvent(
        new CustomEvent("ws-message", {
          detail: { type: "task_updated" },
        }),
      );
    } catch (error) {
      console.error(error);
      setExistingSubtasks((current) =>
        current.map((subtask) =>
          subtask.ID === subtaskId
            ? { ...subtask, Status: currentStatus }
            : subtask,
        ),
      );
      setErrorMessage(t("pm.taskDetails.updateSubtaskFailed"));
    }
  };

  const openTasksCopilot = () => {
    window.dispatchEvent(
      new CustomEvent("open-copilot", {
        detail: {
          agentType: "tasks",
          contextData: {
            task_data: {
              id: task.ID,
              title: task.Title,
              status: task.Status,
              priority: task.Priority,
              story_points: task.StoryPoints,
              description: task.Description,
            },
          },
          title: t("pm.taskDetails.copilot"),
        },
      }),
    );
  };

  return (
    <aside
      aria-label={t("pm.taskDetails.panelLabel")}
      className="absolute inset-y-0 end-0 z-50 flex w-full max-w-[420px] animate-in flex-col border-s border-border bg-card text-card-foreground shadow-[var(--shadow-overlay)] zoom-in-95"
      data-testid="task-details-panel"
    >
      <header className="flex items-center gap-2 border-b border-border p-4">
        <span className="font-mono text-xs text-muted-foreground">
          TASK-{task.ID.substring(0, 4)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ms-auto text-brand"
          onClick={openTasksCopilot}
          title={t("pm.taskDetails.copilot")}
          aria-label={t("pm.taskDetails.copilot")}
        >
          <Sparkles />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title={t("pm.taskDetails.close")}
          aria-label={t("pm.taskDetails.close")}
        >
          <X />
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="mb-6 text-2xl font-bold leading-tight">{task.Title}</h2>

        {errorMessage ? (
          <Alert tone="danger" className="mb-4">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-6">
          <div className="grid grid-cols-[minmax(7rem,auto)_1fr] items-center gap-3 text-sm">
            <label htmlFor="task-details-status" className="text-muted-foreground">
              {t("pm.taskDetails.status")}
            </label>
            <select
              id="task-details-status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className={selectClassName}
            >
              <option value="todo">{t("pm.kanban.status.todo")}</option>
              <option value="in_progress">{t("pm.kanban.status.in_progress")}</option>
              <option value="review">{t("pm.kanban.status.review")}</option>
              <option value="blocked">{t("pm.kanban.status.blocked")}</option>
              <option value="done">{t("pm.kanban.status.done")}</option>
            </select>

            <label htmlFor="task-details-assignee" className="text-muted-foreground">
              {t("pm.taskDetails.assignee")}
            </label>
            <select
              id="task-details-assignee"
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              className={selectClassName}
            >
              <option value="unassigned">{t("pm.taskDetails.unassigned")}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email}
                </option>
              ))}
            </select>

            <label htmlFor="task-details-priority" className="text-muted-foreground">
              {t("pm.taskDetails.priority")}
            </label>
            <select
              id="task-details-priority"
              value={priority}
              onChange={(event) => setPriority(Number(event.target.value))}
              className={selectClassName}
            >
              <option value={0}>{t("pm.taskDetails.priorityNormal")}</option>
              <option value={1}>{t("pm.taskDetails.priorityHigh")}</option>
              <option value={2}>{t("pm.taskDetails.priorityUrgent")}</option>
            </select>

            <label htmlFor="task-details-points" className="text-muted-foreground">
              {t("pm.taskDetails.storyPoints")}
            </label>
            <select
              id="task-details-points"
              value={storyPoints}
              onChange={(event) => setStoryPoints(Number(event.target.value))}
              className={selectClassName}
            >
              <option value={0}>{t("pm.taskDetails.unestimated")}</option>
              {[1, 2, 3, 5, 8, 13, 21].map((points) => (
                <option key={points} value={points}>
                  {points} {t(points === 1 ? "pm.taskDetails.point" : "pm.taskDetails.points")}
                </option>
              ))}
            </select>
          </div>

          <Separator />

          <section>
            <h3 className="mb-2 text-sm font-semibold">
              {t("pm.taskDetails.description")}
            </h3>
            <EditorContent editor={editor} />
          </section>

          <Separator />

          <section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">
                {t("pm.taskDetails.subtasks")}
              </h3>
              {generatedSubtasks.length === 0 && !isGenerating ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAIBreakdown}
                >
                  <Sparkles />
                  {t("pm.taskDetails.breakDownAi")}
                </Button>
              ) : null}
            </div>

            {existingSubtasks.length > 0 ? (
              <div className="mb-4 space-y-2">
                {existingSubtasks.map((subtask) => {
                  const isCompleted = subtask.Status === "done";
                  return (
                    <button
                      type="button"
                      key={subtask.ID}
                      className="group flex w-full items-start gap-3 rounded-[var(--radius-control)] border border-border bg-card p-3 text-start shadow-[var(--shadow-raised)] hover:bg-muted/40"
                      onClick={() =>
                        handleToggleExistingSubtask(
                          subtask.ID,
                          subtask.Status,
                        )
                      }
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="mt-0.5 size-4 text-success" />
                      ) : (
                        <Circle className="mt-0.5 size-4 text-muted-foreground group-hover:text-brand" />
                      )}
                      <span
                        className={`text-sm ${
                          isCompleted
                            ? "text-muted-foreground line-through"
                            : "font-medium text-foreground"
                        }`}
                      >
                        {subtask.Title}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {isGenerating ? (
              <div className="flex flex-col items-center justify-center space-y-3 rounded-[var(--radius-surface)] border border-dashed border-border bg-surface-subtle py-8">
                <Loader2 className="size-6 animate-spin text-brand" />
                <p className="text-sm font-medium text-muted-foreground">
                  {t("pm.taskDetails.aiAnalyzing")}
                </p>
              </div>
            ) : null}

            {aiError ? (
              <Alert tone="danger">
                <AlertDescription>{aiError}</AlertDescription>
              </Alert>
            ) : null}

            {!isGenerating &&
            !aiError &&
            existingSubtasks.length === 0 &&
            generatedSubtasks.length === 0 ? (
              <EmptyState
                title={t("pm.taskDetails.noSubtasks")}
                description={t("pm.taskDetails.noSubtasksDescription")}
                className="min-h-36 p-5"
              />
            ) : null}

            {generatedSubtasks.length > 0 ? (
              <div className="space-y-3">
                <ProvenanceSurface level="assumption">
                  {t("pm.taskDetails.aiProvenance")}
                </ProvenanceSurface>
                <div className="space-y-2">
                  {generatedSubtasks.map((subtask) => {
                    const isExcluded = subtask.done;
                    return (
                      <button
                        type="button"
                        key={subtask.id}
                        className="group flex w-full items-start gap-3 rounded-[var(--radius-control)] border border-border bg-surface-subtle p-3 text-start transition-colors hover:bg-muted"
                        onClick={() =>
                          setGeneratedSubtasks((current) =>
                            current.map((item) =>
                              item.id === subtask.id
                                ? { ...item, done: !item.done }
                                : item,
                            ),
                          )
                        }
                        aria-pressed={!isExcluded}
                      >
                        {!isExcluded ? (
                          <CheckCircle2 className="mt-0.5 size-4 text-success" />
                        ) : (
                          <Circle className="mt-0.5 size-4 text-muted-foreground" />
                        )}
                        <span
                          className={`text-sm ${
                            isExcluded
                              ? "text-muted-foreground line-through"
                              : "font-medium text-foreground"
                          }`}
                        >
                          {subtask.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddSubtasks}
                  disabled={
                    isSaving ||
                    generatedSubtasks.every((subtask) => subtask.done)
                  }
                  className="w-full"
                >
                  {isSaving ? <Loader2 className="animate-spin" /> : null}
                  {t("pm.taskDetails.approveSelected")}
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      <footer className="border-t border-border bg-surface-subtle p-4">
        <Button
          type="button"
          onClick={handleSaveChanges}
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
          {isSaving ? t("common.saving") : t("common.saveChanges")}
        </Button>
      </footer>
    </aside>
  );
}
