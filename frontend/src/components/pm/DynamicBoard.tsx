"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  Hash,
  Layers,
  LayoutGrid,
  Plus,
  SlidersHorizontal,
  User as UserIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";
import { apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { getAllProjectTasks } from "@/lib/pm";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";
import { Task, User } from "@/types";

import DynamicBoardRow, {
  BoardColumns,
  BoardPriority,
  BoardStatus,
} from "./DynamicBoardRow";
import TaskDetailsPanel from "./TaskDetailsPanel";

type GroupBy = "none" | "status" | "priority" | "assignee";

interface BoardGroup {
  key: string;
  label: string;
  tasks: Task[];
  tone: "neutral" | "brand" | "success" | "warning" | "danger" | "info";
}

const defaultColumns: BoardColumns = {
  status: true,
  priority: true,
  points: true,
  dueDate: true,
  assignee: true,
};

const getIndentLevel = (path?: string) => (path ? path.split(".").length - 1 : 0);

function loadColumns(): BoardColumns {
  if (typeof window === "undefined") return defaultColumns;
  try {
    const saved = window.localStorage.getItem("septimus_grid_cols");
    return saved ? { ...defaultColumns, ...JSON.parse(saved) } : defaultColumns;
  } catch {
    return defaultColumns;
  }
}

export default function DynamicBoard() {
  const { t } = useLocalization();
  const { projectId: activeProjectId } = useAppStore();
  const [treeData, setTreeData] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [cols, setCols] = useState<BoardColumns>(loadColumns);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateColumns = (next: BoardColumns) => {
    setCols(next);
    try {
      window.localStorage.setItem("septimus_grid_cols", JSON.stringify(next));
    } catch {
      // Column persistence is optional; the board remains functional without storage.
    }
  };

  const fetchBoard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!activeProjectId) {
        setTreeData([]);
        setUsers([]);
        return;
      }
      const [taskResponse, userResponse] = await Promise.all([
        getAllProjectTasks(activeProjectId),
        apiGet("/users/search?q=") as Promise<User[]>,
      ]);
      const nextTasks = [...taskResponse].sort((a, b) =>
        (a.Path || "").localeCompare(b.Path || ""),
      );
      setTreeData(nextTasks);
      setUsers(userResponse || []);
    } catch (fetchError) {
      console.error(fetchError);
      setError(t("pm.dynamicBoard.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [activeProjectId, t]);

  useEffect(() => {
    void Promise.resolve().then(fetchBoard);

    const handleWsMessage = (event: Event) => {
      const message = (event as CustomEvent).detail;
      if (
        message &&
        ["task_updated", "task_created", "task_deleted"].includes(message.type)
      ) {
        void fetchBoard();
      }
    };

    window.addEventListener("ws-message", handleWsMessage);
    return () => window.removeEventListener("ws-message", handleWsMessage);
  }, [fetchBoard]);

  const statuses: BoardStatus[] = useMemo(
    () => [
      { value: "todo", label: t("pm.kanban.status.todo") },
      { value: "in_progress", label: t("pm.kanban.status.in_progress") },
      { value: "review", label: t("pm.kanban.status.review") },
      { value: "blocked", label: t("pm.kanban.status.blocked") },
      { value: "done", label: t("pm.kanban.status.done") },
    ],
    [t],
  );

  const priorities: BoardPriority[] = useMemo(
    () => [
      { value: 1, label: t("pm.dynamicBoard.priorityUrgent") },
      { value: 2, label: t("pm.dynamicBoard.priorityHigh") },
      { value: 3, label: t("pm.dynamicBoard.priorityNormal") },
      { value: 0, label: t("pm.dynamicBoard.priorityNone") },
    ],
    [t],
  );

  const projectId = activeProjectId || null;

  const handleCreateTask = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setIsCreatingNew(false);
      setNewTaskTitle("");
      return;
    }
    if (event.key !== "Enter" || !newTaskTitle.trim() || !projectId) return;

    setError(null);
    try {
      await apiPost("/tasks", {
        project_id: projectId,
        title: newTaskTitle.trim(),
        description: "",
      });
      setNewTaskTitle("");
      setIsCreatingNew(false);
      await fetchBoard();
    } catch (createError) {
      console.error(createError);
      setError(t("pm.dynamicBoard.createFailed"));
    }
  };

  const handleUpdateTaskField = async (
    taskId: string,
    field: string,
    value: unknown,
  ) => {
    if (field === "title" && !String(value).trim()) return;

    const previous = treeData;
    setError(null);
    setTreeData((current) =>
      current.map((task) => {
        if (task.ID !== taskId) return task;
        if (field === "title") return { ...task, Title: String(value) };
        if (field === "status") return { ...task, Status: String(value) };
        if (field === "priority") return { ...task, Priority: Number(value) };
        if (field === "story_points") return { ...task, StoryPoints: Number(value) };
        if (field === "due_date") return { ...task, DueDate: String(value) };
        if (field === "assignee_id") {
          return { ...task, AssigneeID: value ? String(value) : undefined };
        }
        return task;
      }),
    );
    setEditingCell(null);

    try {
      if (field === "status") {
        await apiPost(`/tasks/${taskId}/transition`, { status: value });
      } else {
        await apiPut(`/tasks/${taskId}`, { [field]: value });
      }
    } catch (updateError) {
      console.error(updateError);
      setTreeData(previous);
      setError(t("pm.dynamicBoard.updateFailed"));
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const groupedData = useMemo<BoardGroup[]>(() => {
    if (groupBy === "status") {
      const tones: BoardGroup["tone"][] = ["neutral", "brand", "warning", "success"];
      return statuses.map((status, index) => ({
        key: status.value,
        label: status.label,
        tasks: treeData.filter((task) => task.Status === status.value),
        tone: tones[index],
      }));
    }
    if (groupBy === "priority") {
      const tones: BoardGroup["tone"][] = ["danger", "warning", "brand", "neutral"];
      return priorities.map((priority, index) => ({
        key: String(priority.value),
        label: priority.label,
        tasks: treeData.filter((task) => (task.Priority || 0) === priority.value),
        tone: tones[index],
      }));
    }
    if (groupBy === "assignee") {
      const assigned: BoardGroup[] = users
        .map((user) => ({
          key: user.id,
          label: user.email.split("@")[0],
          tasks: treeData.filter((task) => task.AssigneeID === user.id),
          tone: "brand" as const,
        }))
        .filter((group) => group.tasks.length > 0);
      const unassigned = treeData.filter((task) => !task.AssigneeID);
      if (unassigned.length > 0) {
        assigned.push({
          key: "unassigned",
          label: t("pm.taskDetails.unassigned"),
          tasks: unassigned,
          tone: "neutral",
        });
      }
      return assigned;
    }
    return [{ key: "all", label: "", tasks: treeData, tone: "neutral" }];
  }, [groupBy, priorities, statuses, t, treeData, users]);

  const selectedTask = treeData.find((task) => task.ID === selectedTaskId);
  const completedTasks = treeData.filter((task) => task.Status === "done").length;
  const completionPercentage =
    treeData.length > 0 ? Math.round((completedTasks / treeData.length) * 100) : 0;

  const renderTaskRow = (task: Task, index: number) => {
    const level = groupBy === "none" ? getIndentLevel(task.Path) : 0;
    const hasChildren =
      groupBy === "none" && treeData.some((candidate) => candidate.ParentID === task.ID);

    if (groupBy === "none" && task.ParentID && !expandedRows.has(task.ParentID)) {
      return null;
    }

    return (
      <DynamicBoardRow
        key={task.ID}
        task={task}
        index={index}
        groupBy={groupBy}
        level={level}
        hasChildren={hasChildren}
        isExpanded={expandedRows.has(task.ID)}
        isSelected={selectedTaskId === task.ID}
        cols={cols}
        statuses={statuses}
        priorities={priorities}
        users={users}
        editingCell={editingCell}
        editTitleValue={editTitleValue}
        setEditTitleValue={setEditTitleValue}
        setEditingCell={setEditingCell}
        handleUpdateTaskField={handleUpdateTaskField}
        toggleRow={toggleRow}
        setSelectedTaskId={setSelectedTaskId}
      />
    );
  };

  const groupOptions: GroupBy[] = ["none", "status", "priority", "assignee"];
  const columnOptions: Array<{
    key: keyof BoardColumns;
    label: string;
    icon?: React.ReactNode;
  }> = [
    { key: "status", label: t("pm.dynamicBoard.status") },
    { key: "priority", label: t("pm.dynamicBoard.priority") },
    {
      key: "points",
      label: t("pm.dynamicBoard.storyPoints"),
      icon: <Hash className="size-3.5" />,
    },
    {
      key: "dueDate",
      label: t("pm.dynamicBoard.dueDate"),
      icon: <Calendar className="size-3.5" />,
    },
    {
      key: "assignee",
      label: t("pm.dynamicBoard.assignee"),
      icon: <UserIcon className="size-3.5" />,
    },
  ];

  return (
    <div
      data-testid="dynamic-board"
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      <header className="flex flex-col gap-4 border-b border-border bg-card px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand-light text-brand">
            <LayoutGrid className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-foreground">
                {t("pm.dynamicBoard.title")}
              </h2>
              <Tag tone="brand">{t("pm.dynamicBoard.badge")}</Tag>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("pm.dynamicBoard.description")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap items-center gap-1 rounded-[var(--radius-control)] border border-border bg-muted p-1"
            aria-label={t("pm.dynamicBoard.groupBy")}
          >
            <span className="flex items-center gap-1 px-2 text-xs font-semibold text-muted-foreground">
              <Layers className="size-3.5" />
              {t("pm.dynamicBoard.groupBy")}
            </span>
            {groupOptions.map((option) => (
              <Button
                key={option}
                type="button"
                variant={groupBy === option ? "outline" : "ghost"}
                size="xs"
                onClick={() => setGroupBy(option)}
                aria-pressed={groupBy === option}
              >
                {t(`pm.dynamicBoard.group.${option}`)}
              </Button>
            ))}
          </div>

          <div className="relative">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowColumnMenu((current) => !current)}
              aria-expanded={showColumnMenu}
            >
              <SlidersHorizontal data-icon="inline-start" />
              {t("pm.dynamicBoard.columns")}
            </Button>
            {showColumnMenu ? (
              <Surface
                variant="raised"
                padding="sm"
                className="absolute end-0 z-30 mt-2 w-60 space-y-1"
              >
                <p className="px-2 pb-1 text-xs font-bold text-muted-foreground">
                  {t("pm.dynamicBoard.chooseColumns")}
                </p>
                {columnOptions.map((option) => (
                  <label
                    key={option.key}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] px-2 py-2 text-sm hover:bg-muted"
                  >
                    <span className="flex items-center gap-2">
                      {option.icon}
                      {option.label}
                    </span>
                    <Switch
                      checked={cols[option.key]}
                      onCheckedChange={(checked) =>
                        updateColumns({ ...cols, [option.key]: checked })
                      }
                      aria-label={option.label}
                    />
                  </label>
                ))}
              </Surface>
            ) : null}
          </div>

          <Button
            type="button"
            onClick={() => setIsCreatingNew(true)}
            disabled={!projectId}
          >
            <Plus data-icon="inline-start" />
            {t("pm.dynamicBoard.newRow")}
          </Button>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="mx-4 mt-4 flex items-center gap-2 rounded-[var(--radius-control)] border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive lg:mx-6"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="ms-auto"
            onClick={() => void fetchBoard()}
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto p-4 lg:p-6">
        <Surface
          padding="none"
          className="flex min-h-0 min-w-[1050px] flex-1 flex-col overflow-hidden"
        >
          <div className="flex min-w-max items-center border-b border-border bg-muted text-xs font-bold text-muted-foreground">
            <div className="w-12 border-e border-border px-3 py-3 text-center">#</div>
            <div className="w-24 border-e border-border px-3 py-3">{t("common.id")}</div>
            <div className="min-w-[280px] flex-1 border-e border-border px-3 py-3">
              {t("pm.dynamicBoard.taskTitle")}
            </div>
            {cols.status ? (
              <div className="w-40 border-e border-border px-3 py-3">
                {t("pm.dynamicBoard.status")}
              </div>
            ) : null}
            {cols.priority ? (
              <div className="w-36 border-e border-border px-3 py-3">
                {t("pm.dynamicBoard.priority")}
              </div>
            ) : null}
            {cols.points ? (
              <div className="w-28 border-e border-border px-3 py-3 text-center">
                {t("pm.dynamicBoard.storyPoints")}
              </div>
            ) : null}
            {cols.dueDate ? (
              <div className="w-36 border-e border-border px-3 py-3 text-center">
                {t("pm.dynamicBoard.dueDate")}
              </div>
            ) : null}
            {cols.assignee ? (
              <div className="w-40 px-3 py-3">{t("pm.dynamicBoard.assignee")}</div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isCreatingNew ? (
              <div className="flex min-w-max items-center border-b border-border bg-brand-light">
                <div className="w-12 border-e border-border px-3 py-3" />
                <div className="w-24 border-e border-border px-3 py-3 font-mono text-xs font-bold text-brand">
                  {t("pm.dynamicBoard.new")}
                </div>
                <div className="min-w-[280px] flex-1 border-e border-border px-3 py-2">
                  <Input
                    autoFocus
                    value={newTaskTitle}
                    onChange={(event) => setNewTaskTitle(event.target.value)}
                    onKeyDown={handleCreateTask}
                    placeholder={t("pm.dynamicBoard.newTaskPlaceholder")}
                    aria-label={t("pm.dynamicBoard.newTaskTitle")}
                    className="h-8"
                  />
                </div>
                {cols.status ? <div className="w-40 border-e border-border px-3 py-3" /> : null}
                {cols.priority ? <div className="w-36 border-e border-border px-3 py-3" /> : null}
                {cols.points ? <div className="w-28 border-e border-border px-3 py-3" /> : null}
                {cols.dueDate ? <div className="w-36 border-e border-border px-3 py-3" /> : null}
                {cols.assignee ? <div className="w-40 px-3 py-3" /> : null}
              </div>
            ) : null}

            {isLoading ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                {t("pm.dynamicBoard.loading")}
              </div>
            ) : treeData.length === 0 && !isCreatingNew ? (
              <EmptyState
                className="m-6"
                icon={<LayoutGrid />}
                title={t("pm.dynamicBoard.empty")}
                description={
                  projectId
                    ? t("pm.dynamicBoard.emptyDescription")
                    : t("pm.dynamicBoard.selectProject")
                }
                action={
                  projectId ? (
                    <Button type="button" onClick={() => setIsCreatingNew(true)}>
                      <Plus data-icon="inline-start" />
                      {t("pm.dynamicBoard.newRow")}
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              groupedData.map((group) => {
                const collapsed = collapsedGroups.has(group.key);
                return (
                  <React.Fragment key={group.key}>
                    {groupBy !== "none" ? (
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        className="flex w-full min-w-max items-center gap-2 border-b border-border bg-muted/70 px-4 py-2 text-start hover:bg-muted"
                        aria-expanded={!collapsed}
                      >
                        <ChevronDown
                          className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            collapsed && "-rotate-90 rtl:rotate-90",
                          )}
                        />
                        <Tag tone={group.tone}>{group.label}</Tag>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {group.tasks.length}
                        </span>
                      </button>
                    ) : null}
                    {!collapsed
                      ? group.tasks.map((task, index) => renderTaskRow(task, index))
                      : null}
                  </React.Fragment>
                );
              })
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-4">
              <span>
                <strong className="text-foreground">{treeData.length}</strong>{" "}
                {t("pm.dynamicBoard.totalTasks")}
              </span>
              <span>
                <strong className="text-success">{completedTasks}</strong>{" "}
                {t("pm.dynamicBoard.completed")}
              </span>
              <div className="flex min-w-52 items-center gap-2">
                <span>{t("pm.dynamicBoard.progress")}</span>
                <Progress value={completionPercentage} className="w-24" />
                <strong className="text-foreground">{completionPercentage}%</strong>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsCreatingNew(true)}
              disabled={!projectId}
            >
              <Plus data-icon="inline-start" />
              {t("pm.dynamicBoard.quickAdd")}
            </Button>
          </footer>
        </Surface>
      </div>

      {selectedTask ? (
        <TaskDetailsPanel task={selectedTask} onClose={() => setSelectedTaskId(null)} />
      ) : null}
    </div>
  );
}
