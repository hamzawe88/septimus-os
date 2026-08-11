import React from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tag } from "@/components/ui/tag";
import { CheckCircle2, Clock, PlayCircle } from "lucide-react";
import { Draggable } from "@hello-pangea/dnd";
import { Task } from "@/types";
import { useLocalization } from "@/contexts/LocalizationContext";

interface TaskCardProps {
  task: Task;
  index: number;
  onTransition: (taskId: string, newStatus: string) => void;
  onOpen: (taskId: string) => void;
}

export default function TaskCard({ task, index, onTransition, onOpen }: TaskCardProps) {
  const { t } = useLocalization();
  let nextStatus = "";
  let actionIcon = null;
  let actionLabel = "";
  let statusTone: "neutral" | "brand" | "warning" | "success" = "neutral";

  switch (task.Status) {
    case "todo":
      nextStatus = "in_progress";
      actionIcon = <PlayCircle />;
      actionLabel = t("pm.kanban.actions.start");
      break;
    case "in_progress":
      nextStatus = "review";
      actionIcon = <Clock />;
      actionLabel = t("pm.kanban.actions.review");
      statusTone = "brand";
      break;
    case "review":
      nextStatus = "done";
      actionIcon = <CheckCircle2 />;
      actionLabel = t("pm.kanban.actions.complete");
      statusTone = "warning";
      break;
    case "done":
      statusTone = "success";
      break;
  }

  return (
    <Draggable draggableId={task.ID} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          role="button"
          tabIndex={0}
          aria-label={`${t("pm.kanban.openTask")}: ${task.Title}`}
          onClick={() => onOpen(task.ID)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(task.ID);
            }
          }}
          className={`group relative mb-3 cursor-grab rounded-[var(--radius-surface)] border border-border bg-card p-4 text-card-foreground shadow-[var(--shadow-raised)] transition-all duration-300 ${
            snapshot.isDragging ? 'rotate-2 scale-105 shadow-[var(--shadow-overlay)] ring-2 ring-ring' : 'hover:border-brand/30 hover:shadow-[var(--shadow-overlay)]'
          }`}
        >
      <div className="mb-2 flex items-start justify-between">
        <Tag tone={statusTone}>
          {t(`pm.kanban.status.${task.Status}`)}
        </Tag>
        {task.Priority > 0 && (
          <Tag tone="danger">{t("pm.kanban.priority")} P{task.Priority}</Tag>
        )}
      </div>

      <h4 className="mb-1 line-clamp-2 text-sm font-semibold text-foreground">{task.Title}</h4>
      {task.Description ? <p className="mb-4 line-clamp-3 text-xs text-muted-foreground">{task.Description}</p> : null}

      <div className="mt-auto flex items-center justify-between">
        <Avatar className="h-6 w-6">
          <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">{t("pm.kanban.unassignedInitial")}</AvatarFallback>
        </Avatar>

        {nextStatus && (
          <Button
            size="sm"
            variant="ghost"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onTransition(task.ID, nextStatus);
            }}
            className="relative z-10 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
            aria-label={`${actionLabel}: ${task.Title}`}
          >
            {actionIcon}
            {actionLabel}
          </Button>
        )}
      </div>
        </div>
      )}
    </Draggable>
  );
}
