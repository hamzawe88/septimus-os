import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CheckCircle2, Clock, PlayCircle } from "lucide-react";
import { Draggable } from "@hello-pangea/dnd";
import { Task } from "@/types";

interface TaskCardProps {
  task: Task;
  index: number;
  onTransition: (taskId: string, newStatus: string) => void;
}

export default function TaskCard({ task, index, onTransition }: TaskCardProps) {
  // Determine next status
  let nextStatus = "";
  let actionIcon = null;
  let actionLabel = "";
  let badgeColor = "";

  switch (task.Status) {
    case "todo":
      nextStatus = "in_progress";
      actionIcon = <PlayCircle className="w-4 h-4 me-1" />;
      actionLabel = "Start";
      badgeColor = "bg-[#f8fafc]0/20 text-slate-400";
      break;
    case "in_progress":
      nextStatus = "review";
      actionIcon = <Clock className="w-4 h-4 me-1" />;
      actionLabel = "Review";
      badgeColor = "bg-brand/20 text-blue-400";
      break;
    case "review":
      nextStatus = "done";
      actionIcon = <CheckCircle2 className="w-4 h-4 me-1" />;
      actionLabel = "Complete";
      badgeColor = "bg-yellow-500/20 text-yellow-400";
      break;
    case "done":
      badgeColor = "bg-green-500/20 text-green-400";
      break;
    default:
      badgeColor = "bg-gray-500/20 text-gray-400";
  }

  return (
    <Draggable draggableId={task.ID} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`group relative p-4 mb-3 rounded-xl bg-white border border-slate-200 transition-all duration-300 shadow-sm cursor-grab ${
            snapshot.isDragging ? 'rotate-2 scale-105 shadow-xl ring-2 ring-primary' : 'hover:border-slate-300 hover:shadow-md'
          }`}
        >
      <div className="flex justify-between items-start mb-2">
        <Badge variant="outline" className={`border-0 ${badgeColor} font-medium`}>
          {task.Status.replace("_", " ").toUpperCase()}
        </Badge>
        {task.Priority > 0 && (
          <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-0">
            P{task.Priority}
          </Badge>
        )}
      </div>

      <h4 className="text-sm font-semibold text-slate-900 mb-1 line-clamp-2">{task.Title}</h4>
      <p className="text-xs text-slate-500 mb-4 line-clamp-3">{task.Description}</p>

      <div className="flex justify-between items-center mt-auto">
        <Avatar className="h-6 w-6">
          <AvatarFallback className="bg-primary/20 text-primary text-[10px]">UN</AvatarFallback>
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
            className="h-7 px-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors opacity-0 group-hover:opacity-100 z-10 relative"
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
