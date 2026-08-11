"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Edit2,
  GripVertical,
  LayoutGrid,
  MoreHorizontal,
  Play,
  Plus,
  Trash2,
  User as UserIcon,
  Wand2,
  X,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Surface } from "@/components/ui/surface";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
} from "@/lib/apiClient";
import { getAllProjectTasks } from "@/lib/pm";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import type { AIProposal, Sprint, Task, User } from "@/types";

import { AIAutoPlanModal } from "./backlog/AIAutoPlanModal";
import { BacklogHeader } from "./backlog/BacklogHeader";
import SprintReport from "./SprintReport";
import TaskDetailsPanel from "./TaskDetailsPanel";

interface PlanningResponse {
  selected_task_ids?: string[];
  capacity_points: number;
  proposed_load_points: number;
  average_velocity: number;
  history_sprints: number;
  method: "priority_fit_observed_velocity";
}

interface CreatedTaskResponse {
  task?: Task;
  ID?: string;
}

interface InlineTaskComposerProps {
  accent?: "brand" | "success";
  title: string;
  titleLabel: string;
  pointsLabel: string;
  addLabel: string;
  cancelLabel: string;
  value: string;
  points: number;
  onValueChange: (value: string) => void;
  onPointsChange: (value: number) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

function InlineTaskComposer({
  accent = "brand",
  title,
  titleLabel,
  pointsLabel,
  addLabel,
  cancelLabel,
  value,
  points,
  onValueChange,
  onPointsChange,
  onSubmit,
  onCancel,
}: InlineTaskComposerProps) {
  return (
    <Surface
      padding="sm"
      className={cn(
        "space-y-3",
        accent === "success" ? "border-success/30" : "border-brand/30",
      )}
    >
      <Input
        autoFocus
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSubmit();
          if (event.key === "Escape") onCancel();
        }}
        placeholder={title}
        aria-label={titleLabel}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          {pointsLabel}
          <Input
            type="number"
            min={0}
            value={points}
            onChange={(event) => onPointsChange(Number(event.target.value))}
            className="h-8 w-20 text-center"
            aria-label={pointsLabel}
          />
        </label>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" size="sm" onClick={onSubmit} disabled={!value.trim()}>
            <Plus data-icon="inline-start" />
            {addLabel}
          </Button>
        </div>
      </div>
    </Surface>
  );
}

export default function BacklogView() {
  const { t } = useLocalization();
  const { projectId } = useAppStore();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [reportSprint, setReportSprint] = useState<Sprint | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [creatingInTarget, setCreatingInTarget] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPoints, setNewTaskPoints] = useState(3);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<number | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);
  const [sprintEditName, setSprintEditName] = useState("");
  const [sprintEditGoal, setSprintEditGoal] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [aiProposalModal, setAiProposalModal] = useState<AIProposal | null>(null);
  const [isAssigningAI, setIsAssigningAI] = useState(false);
  const [message, setMessage] = useState<{
    tone: "danger" | "warning" | "success";
    text: string;
  } | null>(null);

  const fetchSprintsAndTasks = useCallback(async () => {
    if (!projectId) {
      setSprints([]);
      setTasks([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setMessage(null);
    try {
      const [sprintResponse, taskResponse, userResponse] = await Promise.all([
        apiGet<Sprint[]>(`/sprints?project_id=${encodeURIComponent(projectId)}`),
        getAllProjectTasks(projectId),
        apiGet<User[]>("/users/search?q="),
      ]);
      setSprints(sprintResponse || []);
      setTasks(taskResponse);
      setUsers(userResponse || []);
    } catch (error) {
      console.error(error);
      setMessage({ tone: "danger", text: t("pm.backlog.loadFailed") });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void Promise.resolve().then(fetchSprintsAndTasks);

    const handleWsMessage = (event: Event) => {
      const messageData = (event as CustomEvent).detail;
      if (
        messageData &&
        ["task_updated", "task_created", "task_deleted", "sprint_updated"].includes(
          messageData.type,
        )
      ) {
        void fetchSprintsAndTasks();
      }
    };

    window.addEventListener("ws-message", handleWsMessage);
    return () => window.removeEventListener("ws-message", handleWsMessage);
  }, [fetchSprintsAndTasks]);

  const runSprintAction = async (
    action: () => Promise<unknown>,
    failureMessage: string,
  ) => {
    setMessage(null);
    try {
      await action();
      await fetchSprintsAndTasks();
      return true;
    } catch (error) {
      console.error(error);
      setMessage({ tone: "danger", text: failureMessage });
      return false;
    }
  };

  const handleCreateSprint = async () => {
    if (!projectId) {
      setMessage({ tone: "warning", text: t("pm.backlog.selectProject") });
      return;
    }
    await runSprintAction(
      () =>
        apiPost("/sprints", {
          project_id: projectId,
          name: `${t("pm.backlog.sprint")} ${sprints.length + 1}`,
          goal: t("pm.backlog.defaultSprintGoal"),
        }),
      t("pm.backlog.createSprintFailed"),
    );
  };

  const handleStartSprint = async (sprintId: string) => {
    await runSprintAction(
      () => apiPut(`/sprints/${sprintId}/start`, {}),
      t("pm.backlog.startSprintFailed"),
    );
  };

  const handleCompleteSprint = async (sprintId: string) => {
    const completed = await runSprintAction(
      () => apiPut(`/sprints/${sprintId}/complete`, {}),
      t("pm.backlog.completeSprintFailed"),
    );
    if (completed) {
      setMessage({ tone: "success", text: t("pm.backlog.sprintCompleted") });
    }
  };

  const handleUpdateSprint = async (sprintId: string) => {
    const updated = await runSprintAction(
      () =>
        apiPut(`/sprints/${sprintId}`, {
          name: sprintEditName.trim(),
          goal: sprintEditGoal.trim(),
        }),
      t("pm.backlog.updateSprintFailed"),
    );
    if (updated) setEditingSprintId(null);
  };

  const handleDeleteSprint = async (sprint: Sprint) => {
    const confirmed = window.confirm(
      t("pm.backlog.deleteSprintConfirm").replace("{name}", sprint.Name),
    );
    if (!confirmed) return;

    const deleted = await runSprintAction(
      () => apiDelete(`/sprints/${sprint.ID}`),
      t("pm.backlog.deleteSprintFailed"),
    );
    if (deleted) setActiveMenuId(null);
  };

  const handleSuggestGoalTemplate = (sprint: Sprint) => {
    const sprintTasks = tasks.filter((task) => task.SprintID === sprint.ID);
    if (sprintTasks.length === 0) {
      setMessage({ tone: "warning", text: t("pm.backlog.goalTemplateNeedsTasks") });
      return;
    }
    const totalPoints = sprintTasks.reduce(
      (sum, task) => sum + (task.StoryPoints || 0),
      0,
    );
    setEditingSprintId(sprint.ID);
    setSprintEditName(sprint.Name);
    setSprintEditGoal(
      `${t("pm.backlog.goalTemplatePrefix")} ${sprintTasks.length} ${t(
        "pm.backlog.goalTemplateTasks",
      )} (${totalPoints} ${t("pm.autoPlan.points")}).`,
    );
    setActiveMenuId(null);
  };

  const handleCreateTaskInline = async (target: string) => {
    if (!newTaskTitle.trim() || !projectId) return;
    setMessage(null);
    try {
      const response = await apiPost<CreatedTaskResponse>(
        "/tasks",
        {
          project_id: projectId,
          title: newTaskTitle.trim(),
          story_points: newTaskPoints,
        },
      );
      const createdId = response.task?.ID || response.ID;
      if (createdId && target !== "backlog") {
        await apiPut(`/tasks/${createdId}`, {
          sprint_id: target,
          story_points: newTaskPoints,
        });
      }
      setNewTaskTitle("");
      setNewTaskPoints(3);
      setCreatingInTarget(null);
      await fetchSprintsAndTasks();
    } catch (error) {
      console.error(error);
      setMessage({ tone: "danger", text: t("pm.backlog.createTaskFailed") });
    }
  };

  const handleDrop = async (
    event: React.DragEvent,
    sprintId: string | null,
  ) => {
    event.preventDefault();
    setDragOverId(null);
    const taskId = event.dataTransfer.getData("taskId");
    if (!taskId) return;

    const previousTasks = tasks;
    setTasks((current) =>
      current.map((task) =>
        task.ID === taskId
          ? { ...task, SprintID: sprintId || undefined }
          : task,
      ),
    );
    try {
      await apiPut(`/tasks/${taskId}`, { sprint_id: sprintId });
    } catch (error) {
      console.error(error);
      setTasks(previousTasks);
      setMessage({ tone: "danger", text: t("pm.backlog.moveTaskFailed") });
    }
  };

  const activeSprint = sprints.find((sprint) => sprint.Status === "active");
  const planningSprints = sprints.filter((sprint) => sprint.Status === "planning");

  const handleAutoPlan = async () => {
    const targetSprint = planningSprints[0] || activeSprint;
    if (!targetSprint) {
      setMessage({ tone: "warning", text: t("pm.backlog.autoPlanNeedsSprint") });
      return;
    }

    const backlog = tasks.filter((task) => !task.SprintID);
    if (backlog.length === 0) {
      setMessage({ tone: "warning", text: t("pm.backlog.autoPlanNeedsTasks") });
      return;
    }

    setIsLoading(true);
    setMessage(null);
    try {
      const response = await apiPost<PlanningResponse>(
        "/pm/plan-sprint",
        { project_id: projectId, sprint_id: targetSprint.ID },
      );
      const selectedIds = response.selected_task_ids || [];
      const proposedTasks = tasks.filter((task) => selectedIds.includes(task.ID));
      if (proposedTasks.length === 0) {
        setMessage({ tone: "warning", text: t("pm.backlog.noPlanningFit") });
        return;
      }
      setAiProposalModal({
        targetSprint,
        selectedTasks: proposedTasks,
        rationale: t("pm.autoPlan.evidenceRationale")
          .replace("{velocity}", String(response.average_velocity))
          .replace("{sprints}", String(response.history_sprints))
          .replace("{selected}", String(proposedTasks.length)),
        capacityPoints: response.capacity_points,
        historySprints: response.history_sprints,
      });
    } catch (error) {
      console.error(error);
      setMessage({ tone: "danger", text: t("pm.backlog.autoPlanFailed") });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptAIProposal = async () => {
    if (!aiProposalModal) return;
    setIsAssigningAI(true);
    setMessage(null);
    try {
      await Promise.all(
        aiProposalModal.selectedTasks.map((task) =>
          apiPut(`/tasks/${task.ID}`, {
            sprint_id: aiProposalModal.targetSprint.ID,
          }),
        ),
      );
      setAiProposalModal(null);
      await fetchSprintsAndTasks();
    } catch (error) {
      console.error(error);
      setMessage({ tone: "danger", text: t("pm.backlog.assignProposalFailed") });
    } finally {
      setIsAssigningAI(false);
    }
  };

  const priorities = useMemo(
    () => [
      { value: 1, label: t("pm.dynamicBoard.priorityUrgent") },
      { value: 2, label: t("pm.dynamicBoard.priorityHigh") },
      { value: 3, label: t("pm.dynamicBoard.priorityNormal") },
      { value: 0, label: t("pm.dynamicBoard.priorityNone") },
    ],
    [t],
  );

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return tasks.filter((task) => {
      if (query && !task.Title.toLocaleLowerCase().includes(query)) return false;
      if (filterPriority !== null && (task.Priority || 0) !== filterPriority) {
        return false;
      }
      if (filterAssignee !== null && task.AssigneeID !== filterAssignee) return false;
      return true;
    });
  }, [filterAssignee, filterPriority, searchQuery, tasks]);

  const backlogTasks = filteredTasks.filter((task) => !task.SprintID);
  const selectedTask = tasks.find((task) => task.ID === selectedTaskId);

  const priorityTone = (priority: number) => {
    if (priority === 1) return "danger" as const;
    if (priority === 2) return "warning" as const;
    if (priority === 3) return "brand" as const;
    return "neutral" as const;
  };

  const renderTaskCard = (task: Task) => {
    const priority =
      priorities.find((candidate) => candidate.value === (task.Priority || 0)) ||
      priorities[priorities.length - 1];
    const assignee = users.find((user) => user.id === task.AssigneeID);

    return (
      <article
        key={task.ID}
        draggable
        tabIndex={0}
        role="button"
        onDragStart={(event) => event.dataTransfer.setData("taskId", task.ID)}
        onClick={() => setSelectedTaskId(task.ID)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setSelectedTaskId(task.ID);
          }
        }}
        className={cn(
          "group rounded-[var(--radius-surface)] border border-border bg-card p-3 shadow-sm outline-none transition-all hover:border-brand/30 focus-visible:ring-2 focus-visible:ring-brand/30",
          selectedTaskId === task.ID && "border-brand ring-2 ring-brand/20",
        )}
        aria-label={t("pm.backlog.openTask").replace("{title}", task.Title)}
      >
        <div className="flex items-start gap-2.5">
          <GripVertical className="mt-1 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold text-muted-foreground">
                T-{task.ID.substring(0, 4)}
              </span>
              <div className="flex items-center gap-1.5">
                <Tag tone={priorityTone(task.Priority || 0)}>{priority.label}</Tag>
                <Tag tone="neutral">
                  {task.StoryPoints || 0} {t("pm.autoPlan.points")}
                </Tag>
              </div>
            </div>
            <p
              className={cn(
                "mt-2 truncate text-sm font-semibold text-foreground",
                task.Status === "done" && "text-muted-foreground line-through",
              )}
            >
              {task.Title}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
              <Tag tone="neutral">
                {t(`pm.kanban.status.${task.Status}`)}
              </Tag>
              {assignee ? (
                <Tag tone="brand">
                  <UserIcon />
                  {assignee.email.split("@")[0]}
                </Tag>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t("pm.taskDetails.unassigned")}
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderCapacity = (sprintTasks: Task[], capacity = 30) => {
    const totalPoints = sprintTasks.reduce(
      (sum, task) => sum + (task.StoryPoints || 0),
      0,
    );
    const percentage = Math.round((totalPoints / capacity) * 100);
    const isOver = totalPoints > capacity;

    return (
      <div className="space-y-2 border-b border-border bg-muted/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
            <Clock className="size-3.5" />
            {t("pm.backlog.sprintCapacity")}
          </span>
          <div className="flex items-center gap-2">
            {isOver ? (
              <Tag tone="danger">
                <AlertTriangle />
                {t("pm.backlog.overCapacity").replace(
                  "{points}",
                  String(totalPoints - capacity),
                )}
              </Tag>
            ) : null}
            <strong className={cn("text-foreground", isOver && "text-destructive")}>
              {totalPoints} / {capacity} {t("pm.autoPlan.points")}
            </strong>
          </div>
        </div>
        <Progress
          value={Math.min(percentage, 100)}
          indicatorClassName={isOver ? "bg-destructive" : percentage > 70 ? "bg-warning" : "bg-success"}
          aria-label={t("pm.backlog.sprintCapacity")}
        />
      </div>
    );
  };

  const beginInlineCreation = (target: string) => {
    setCreatingInTarget(target);
    setNewTaskTitle("");
    setNewTaskPoints(3);
  };

  const renderComposer = (target: string, accent: "brand" | "success" = "brand") => (
    <InlineTaskComposer
      accent={accent}
      title={t("pm.backlog.taskTitlePlaceholder")}
      titleLabel={t("pm.backlog.taskTitle")}
      pointsLabel={t("pm.dynamicBoard.storyPoints")}
      addLabel={target === "backlog" ? t("pm.backlog.addTask") : t("pm.backlog.addToSprint")}
      cancelLabel={t("common.cancel")}
      value={newTaskTitle}
      points={newTaskPoints}
      onValueChange={setNewTaskTitle}
      onPointsChange={setNewTaskPoints}
      onSubmit={() => void handleCreateTaskInline(target)}
      onCancel={() => setCreatingInTarget(null)}
    />
  );

  return (
    <div
      data-testid="backlog-view"
      className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      {reportSprint ? (
        <SprintReport
          sprint={reportSprint}
          tasks={tasks}
          onClose={() => setReportSprint(null)}
        />
      ) : null}

      <AIAutoPlanModal
        isOpen={Boolean(aiProposalModal)}
        proposal={aiProposalModal}
        isAssigning={isAssigningAI}
        onClose={() => setAiProposalModal(null)}
        onAccept={handleAcceptAIProposal}
        priorities={priorities}
      />

      <BacklogHeader
        isLoading={isLoading}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterPriority={filterPriority}
        setFilterPriority={setFilterPriority}
        filterAssignee={filterAssignee}
        setFilterAssignee={setFilterAssignee}
        users={users}
        priorities={priorities}
        onAutoPlan={handleAutoPlan}
        onCreateSprint={handleCreateSprint}
      />

      {message ? (
        <Alert tone={message.tone} className="m-4 mb-0">
          <AlertTriangle />
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(300px,36%)_1fr] lg:overflow-hidden">
        <section
          className={cn(
            "flex min-h-[360px] flex-col border-b border-border bg-muted/30 lg:min-h-0 lg:border-b-0 lg:border-e",
            dragOverId === "backlog" && "bg-brand-light",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOverId("backlog");
          }}
          onDragLeave={() => setDragOverId(null)}
          onDrop={(event) => void handleDrop(event, null)}
          aria-label={t("pm.backlog.productBacklog")}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border bg-card p-4">
            <h3 className="flex min-w-0 items-center gap-2 font-bold">
              <LayoutGrid className="size-4 text-brand" />
              <span className="truncate">{t("pm.backlog.productBacklog")}</span>
              <Tag tone="brand">{backlogTasks.length}</Tag>
            </h3>
            <span className="text-xs font-semibold text-muted-foreground">
              {backlogTasks.reduce(
                (sum, task) => sum + (task.StoryPoints || 0),
                0,
              )}{" "}
              {t("pm.backlog.totalPoints")}
            </span>
          </div>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
            {isLoading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {t("common.loading")}
              </p>
            ) : backlogTasks.length === 0 ? (
              <EmptyState
                icon={<LayoutGrid />}
                title={t("pm.backlog.empty")}
                description={t("pm.backlog.emptyDescription")}
              />
            ) : (
              backlogTasks.map(renderTaskCard)
            )}

            {creatingInTarget === "backlog" ? (
              renderComposer("backlog")
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full border-dashed"
                onClick={() => beginInlineCreation("backlog")}
                disabled={!projectId}
              >
                <Plus data-icon="inline-start" />
                {t("pm.backlog.addBacklogItem")}
              </Button>
            )}
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto bg-background p-4 lg:p-6">
          <div className="mx-auto max-w-5xl space-y-6">
            {activeSprint ? (
              <Surface
                padding="none"
                className={cn(
                  "overflow-hidden border-success/30",
                  dragOverId === activeSprint.ID && "ring-2 ring-success/30",
                )}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverId(activeSprint.ID);
                }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(event) => void handleDrop(event, activeSprint.ID)}
              >
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-success/10 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-success text-background">
                      <Play className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-bold">{activeSprint.Name}</h3>
                        <Tag tone="success">{t("pm.backlog.activeCycle")}</Tag>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {activeSprint.Goal || t("pm.backlog.noSprintGoal")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setReportSprint(activeSprint)}
                    >
                      {t("pm.backlog.viewReport")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCompleteSprint(activeSprint.ID)}
                    >
                      <Check data-icon="inline-start" />
                      {t("pm.backlog.completeSprint")}
                    </Button>
                  </div>
                </header>

                {renderCapacity(
                  tasks.filter((task) => task.SprintID === activeSprint.ID),
                )}

                <div className="space-y-2.5 bg-muted/20 p-4">
                  {filteredTasks.filter(
                    (task) => task.SprintID === activeSprint.ID,
                  ).length === 0 ? (
                    <EmptyState
                      title={t("pm.backlog.noActiveTasks")}
                      description={t("pm.backlog.noActiveTasksDescription")}
                    />
                  ) : (
                    filteredTasks
                      .filter((task) => task.SprintID === activeSprint.ID)
                      .map(renderTaskCard)
                  )}

                  {creatingInTarget === activeSprint.ID ? (
                    renderComposer(activeSprint.ID, "success")
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-dashed"
                      onClick={() => beginInlineCreation(activeSprint.ID)}
                    >
                      <Plus data-icon="inline-start" />
                      {t("pm.backlog.addActiveSprintTask")}
                    </Button>
                  )}
                </div>
              </Surface>
            ) : (
              <EmptyState
                icon={<Play />}
                title={t("pm.backlog.noActiveSprint")}
                description={t("pm.backlog.noActiveSprintDescription")}
              />
            )}

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-muted-foreground">
                {t("pm.backlog.upcomingCycles")}
              </h3>

              {planningSprints.length === 0 ? (
                <EmptyState
                  icon={<Calendar />}
                  title={t("pm.backlog.noPlanningSprints")}
                  description={t("pm.backlog.noPlanningSprintsDescription")}
                />
              ) : null}

              {planningSprints.map((sprint) => {
                const sprintTasks = tasks.filter(
                  (task) => task.SprintID === sprint.ID,
                );
                const filteredSprintTasks = filteredTasks.filter(
                  (task) => task.SprintID === sprint.ID,
                );

                return (
                  <Surface
                    key={sprint.ID}
                    padding="none"
                    className={cn(
                      "overflow-hidden",
                      dragOverId === sprint.ID && "border-brand ring-2 ring-brand/20",
                    )}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverId(sprint.ID);
                    }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={(event) => void handleDrop(event, sprint.ID)}
                  >
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/50 p-4">
                      {editingSprintId === sprint.ID ? (
                        <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[12rem_1fr_auto]">
                          <Input
                            value={sprintEditName}
                            onChange={(event) => setSprintEditName(event.target.value)}
                            aria-label={t("pm.backlog.sprintName")}
                          />
                          <Input
                            value={sprintEditGoal}
                            onChange={(event) => setSprintEditGoal(event.target.value)}
                            placeholder={t("pm.backlog.sprintGoal")}
                            aria-label={t("pm.backlog.sprintGoal")}
                          />
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleSuggestGoalTemplate(sprint)}
                            >
                              <Wand2 />
                              {t("pm.backlog.suggestGoalTemplate")}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => void handleUpdateSprint(sprint.ID)}
                              aria-label={t("common.save")}
                            >
                              <Check />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setEditingSprintId(null)}
                              aria-label={t("common.cancel")}
                            >
                              <X />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand-light text-brand">
                            <Calendar className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate font-bold">{sprint.Name}</h3>
                              <Tag tone="neutral">
                                {sprintTasks.length} {t("pm.backlog.tasks")}
                              </Tag>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {sprint.Goal || t("pm.backlog.noSprintGoal")}
                            </p>
                          </div>
                        </div>
                      )}

                      {editingSprintId !== sprint.ID ? (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleStartSprint(sprint.ID)}
                          >
                            <Play data-icon="inline-start" />
                            {t("pm.backlog.startSprint")}
                          </Button>
                          <div className="relative">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() =>
                                setActiveMenuId((current) =>
                                  current === sprint.ID ? null : sprint.ID,
                                )
                              }
                              aria-label={t("pm.backlog.sprintOptions")}
                              aria-expanded={activeMenuId === sprint.ID}
                            >
                              <MoreHorizontal />
                            </Button>
                            {activeMenuId === sprint.ID ? (
                              <Surface
                                variant="raised"
                                padding="sm"
                                className="absolute end-0 z-30 mt-2 w-52 space-y-1"
                              >
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="w-full justify-start"
                                  onClick={() => {
                                    setEditingSprintId(sprint.ID);
                                    setSprintEditName(sprint.Name);
                                    setSprintEditGoal(sprint.Goal || "");
                                    setActiveMenuId(null);
                                  }}
                                >
                                  <Edit2 />
                                  {t("pm.backlog.editSprint")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  className="w-full justify-start"
                                  onClick={() => void handleDeleteSprint(sprint)}
                                >
                                  <Trash2 />
                                  {t("pm.backlog.deleteSprint")}
                                </Button>
                              </Surface>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </header>

                    {renderCapacity(sprintTasks)}

                    <div className="space-y-2.5 bg-muted/20 p-4">
                      {filteredSprintTasks.length === 0 ? (
                        <EmptyState
                          title={t("pm.backlog.noPlannedTasks")}
                          description={t("pm.backlog.noPlannedTasksDescription")}
                        />
                      ) : (
                        filteredSprintTasks.map(renderTaskCard)
                      )}

                      {creatingInTarget === sprint.ID ? (
                        renderComposer(sprint.ID)
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full border-dashed"
                          onClick={() => beginInlineCreation(sprint.ID)}
                        >
                          <Plus data-icon="inline-start" />
                          {t("pm.backlog.addToNamedSprint").replace(
                            "{name}",
                            sprint.Name,
                          )}
                        </Button>
                      )}
                    </div>
                  </Surface>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {selectedTask ? (
        <TaskDetailsPanel
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
        />
      ) : null}
    </div>
  );
}
