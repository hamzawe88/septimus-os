import React, { useEffect, useState } from "react";
import { FolderKanban, Loader2, Plus, Sheet } from "lucide-react";
import { DragDropContext, Droppable, type DropResult } from "@hello-pangea/dnd";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";
import { API_BASE_URL, apiGet, apiPost, fetchWithAuth } from "@/lib/apiClient";
import { getAllProjectTasks } from "@/lib/pm";
import { useAppStore } from "@/store/useAppStore";
import type { Task } from "@/types";
import NewTaskModal from "./NewTaskModal";
import TaskCard from "./TaskCard";
import TaskDetailsPanel from "./TaskDetailsPanel";

interface Sprint {
  ID: string;
  Name: string;
  Status: string;
}

const columns = [
  { id: "todo", tone: "bg-muted-foreground" },
  { id: "in_progress", tone: "bg-brand" },
  { id: "review", tone: "bg-warning" },
  { id: "blocked", tone: "bg-destructive" },
  { id: "done", tone: "bg-success" },
] as const;

export default function KanbanBoard() {
  const { t } = useLocalization();
  const { tasks, setTasks, projectId } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const fetchTasksAndSprints = async (pid: string) => {
    try {
      const [tasksData, sprintsData] = await Promise.all([
        getAllProjectTasks(pid),
        apiGet<Sprint[]>(`/sprints?project_id=${pid}`),
      ]);
      setTasks(tasksData);
      setSprints(sprintsData || []);
      setErrorMessage("");
    } catch (error) {
      console.error(error);
      setErrorMessage(t("pm.kanban.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!projectId) {
      void Promise.resolve().then(() => {
        setTasks([]);
        setSprints([]);
        setIsLoading(false);
      });
      return;
    }
    void Promise.resolve().then(() => {
      setIsLoading(true);
      return fetchTasksAndSprints(projectId);
    });
    // fetchTasksAndSprints is intentionally scoped to the selected project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, setTasks]);

  const exportToSheets = async () => {
    if (!projectId) return;
    setIsExporting(true);
    setErrorMessage("");
    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/integrations/google/export-tasks?project_id=${projectId}`,
        { method: "POST" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        spreadsheet_url?: string;
        error?: string;
      };
      if (!response.ok || !data.spreadsheet_url) {
        throw new Error(data.error || t("integrations.sheetsExportFailed"));
      }
      window.open(data.spreadsheet_url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t("common.unexpectedError"),
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleTransition = async (taskId: string, newStatus: string) => {
    try {
      await apiPost(`/tasks/${taskId}/transition`, { status: newStatus });
      setErrorMessage("");
    } catch (error) {
      console.error("Task transition failed.", error);
      setErrorMessage(t("pm.kanban.transitionFailed"));
      if (projectId) await fetchTasksAndSprints(projectId);
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) return;

    const newStatus = destination.droppableId;
    setTasks((current: Task[]) =>
      current.map((task) =>
        task.ID === draggableId ? { ...task, Status: newStatus } : task,
      ),
    );
    void handleTransition(draggableId, newStatus);
  };

  if (isLoading) {
    return (
      <div
        className="grid flex-1 grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-4"
        aria-label={t("pm.kanban.loading")}
      >
        {[0, 1, 2, 3].map((item) => (
          <Skeleton key={item} className="h-[420px] w-full" />
        ))}
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-6" data-testid="kanban-board">
        <EmptyState
          icon={<FolderKanban />}
          title={t("pm.projectScope.noProjects")}
          description={t("pm.projectScope.chooseOrCreate")}
        />
      </div>
    );
  }

  const activeSprint = sprints.find((sprint) => sprint.Status === "active");
  const sprintTasks = activeSprint
    ? tasks.filter((task) => task.SprintID === activeSprint.ID)
    : [];
  const selectedTask = tasks.find((task) => task.ID === selectedTaskId);

  return (
    <div
      className="relative flex h-full flex-1 flex-col overflow-hidden bg-background text-foreground"
      data-testid="kanban-board"
    >
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold">{t("pm.kanban.title")}</h2>
          {activeSprint ? (
            <span className="text-sm font-medium text-muted-foreground">
              {t("pm.kanban.activeSprint")}: {activeSprint.Name}
            </span>
          ) : (
            <span className="text-sm font-medium text-warning">
              {t("pm.kanban.noActiveSprint")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={exportToSheets}
            disabled={isExporting || !projectId}
            title={t("integrations.sheetsExportTitle")}
          >
            {isExporting ? <Loader2 className="animate-spin" /> : <Sheet />}
            {t("pm.kanban.exportSheets")}
          </Button>
          <Button onClick={() => setIsModalOpen(true)} disabled={!projectId}>
            <Plus />
            {t("pm.kanban.newTask")}
          </Button>
        </div>
      </header>

      {errorMessage ? (
        <Alert tone="danger" className="m-4 mb-0">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
          <div className="flex h-full min-w-max items-start gap-6">
            {columns.map((column) => {
              const columnTasks = sprintTasks.filter(
                (task) => task.Status === column.id,
              );
              return (
                <section
                  key={column.id}
                  className="flex h-full max-h-full w-80 flex-col rounded-[var(--radius-surface)] border border-border bg-surface-subtle"
                >
                  <div className="mb-2 flex items-center justify-between border-b border-border px-3 py-3">
                    <h3 className="flex items-center gap-2 font-semibold">
                      <span className={`size-2 rounded-full ${column.tone}`} aria-hidden />
                      {t(`pm.kanban.status.${column.id}`)}
                    </h3>
                    <Tag tone="neutral">{columnTasks.length}</Tag>
                  </div>
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`custom-scrollbar flex-1 overflow-y-auto px-2 pb-4 transition-colors ${
                          snapshot.isDraggingOver
                            ? "rounded-b-[var(--radius-surface)] bg-muted/80"
                            : ""
                        }`}
                      >
                        {columnTasks.length === 0 && !snapshot.isDraggingOver ? (
                          <EmptyState
                            title={t("pm.kanban.noTasks")}
                            description={t("pm.kanban.noTasksDescription")}
                            className="min-h-24 p-4"
                          />
                        ) : (
                          columnTasks.map((task, index) => (
                            <TaskCard
                              key={task.ID}
                              task={task}
                              index={index}
                              onTransition={handleTransition}
                              onOpen={setSelectedTaskId}
                            />
                          ))
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </section>
              );
            })}
          </div>
        </div>
      </DragDropContext>

      {selectedTask ? (
        <TaskDetailsPanel task={selectedTask} onClose={() => setSelectedTaskId(null)} />
      ) : null}

      <NewTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        projectId={projectId}
        onTaskCreated={() => fetchTasksAndSprints(projectId)}
      />
    </div>
  );
}
