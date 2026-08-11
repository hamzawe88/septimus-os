"use client";

import React from "react";
import { Check, CheckCircle2, ChevronRight, User as UserIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalization } from "@/contexts/LocalizationContext";
import { cn } from "@/lib/utils";
import { Task, User } from "@/types";

export interface BoardStatus {
  value: string;
  label: string;
}

export interface BoardPriority {
  value: number;
  label: string;
}

export interface BoardColumns {
  status: boolean;
  priority: boolean;
  points: boolean;
  dueDate: boolean;
  assignee: boolean;
}

interface DynamicBoardRowProps {
  task: Task;
  index: number;
  groupBy: "none" | "status" | "priority" | "assignee";
  level: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  cols: BoardColumns;
  statuses: BoardStatus[];
  priorities: BoardPriority[];
  users: User[];
  editingCell: { id: string; field: string } | null;
  editTitleValue: string;
  setEditTitleValue: (value: string) => void;
  setEditingCell: (cell: { id: string; field: string } | null) => void;
  handleUpdateTaskField: (id: string, field: string, value: unknown) => void;
  toggleRow: (id: string) => void;
  setSelectedTaskId: (id: string) => void;
}

const cellClass = "border-e border-border px-3 py-2";
const selectClass =
  "h-8 w-full rounded-[var(--radius-control)] border border-border bg-background px-2 text-xs text-foreground outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20";

export default function DynamicBoardRow({
  task,
  index,
  groupBy,
  level,
  hasChildren,
  isExpanded,
  isSelected,
  cols,
  statuses,
  priorities,
  users,
  editingCell,
  editTitleValue,
  setEditTitleValue,
  setEditingCell,
  handleUpdateTaskField,
  toggleRow,
  setSelectedTaskId,
}: DynamicBoardRowProps) {
  const { t } = useLocalization();
  const isEditingTitle = editingCell?.id === task.ID && editingCell.field === "title";

  return (
    <div
      data-testid="dynamic-board-row"
      onClick={() => setSelectedTaskId(task.ID)}
      className={cn(
        "flex min-w-max cursor-pointer items-center border-b border-border bg-card text-foreground transition-colors hover:bg-muted/50",
        isSelected && "bg-brand-light hover:bg-brand-light",
      )}
    >
      <div className={cn(cellClass, "flex w-12 justify-center")}>
        <span className="font-mono text-xs text-muted-foreground">{index + 1}</span>
      </div>

      <div className={cn(cellClass, "w-24 font-mono text-xs font-semibold text-muted-foreground")}>
        T-{task.ID.substring(0, 4)}
      </div>

      <div
        className={cn(cellClass, "flex min-w-[280px] flex-1 items-center gap-2")}
        style={{ paddingInlineStart: `${Math.max(0.75, level * 1.5 + 0.75)}rem` }}
      >
        {groupBy === "none" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-7 shrink-0", !hasChildren && "invisible")}
            onClick={(event) => {
              event.stopPropagation();
              toggleRow(task.ID);
            }}
            aria-label={t("pm.dynamicBoard.toggleRow")}
          >
            <ChevronRight
              className={cn(
                "size-4 transition-transform rtl:rotate-180",
                isExpanded && "rotate-90 rtl:rotate-90",
              )}
            />
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={(event) => {
            event.stopPropagation();
            handleUpdateTaskField(task.ID, "status", task.Status === "done" ? "todo" : "done");
          }}
          aria-label={t("pm.dynamicBoard.toggleCompletion")}
        >
          {task.Status === "done" ? (
            <CheckCircle2 className="size-4 text-success" />
          ) : (
            <span className="size-3 rounded-sm border-2 border-muted-foreground" />
          )}
        </Button>

        {isEditingTitle ? (
          <div
            className="flex w-full items-center gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            <Input
              autoFocus
              value={editTitleValue}
              onChange={(event) => setEditTitleValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleUpdateTaskField(task.ID, "title", editTitleValue.trim());
                }
                if (event.key === "Escape") setEditingCell(null);
              }}
              aria-label={t("pm.dynamicBoard.editTaskTitle")}
              placeholder={t("pm.dynamicBoard.taskTitle")}
              className="h-8"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-success"
              onClick={() => handleUpdateTaskField(task.ID, "title", editTitleValue.trim())}
              aria-label={t("common.save")}
            >
              <Check className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setEditingCell(null)}
              aria-label={t("common.cancel")}
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onDoubleClick={(event) => {
              event.stopPropagation();
              setEditTitleValue(task.Title);
              setEditingCell({ id: task.ID, field: "title" });
            }}
            className={cn(
              "min-w-0 flex-1 truncate text-start text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
              task.Status === "done" && "text-muted-foreground line-through",
            )}
            title={t("pm.dynamicBoard.doubleClickToEdit")}
          >
            {task.Title}
          </button>
        )}
      </div>

      {cols.status ? (
        <div className={cn(cellClass, "w-40")} onClick={(event) => event.stopPropagation()}>
          <select
            value={task.Status}
            onChange={(event) => handleUpdateTaskField(task.ID, "status", event.target.value)}
            className={selectClass}
            aria-label={t("pm.dynamicBoard.status")}
          >
            {statuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {cols.priority ? (
        <div className={cn(cellClass, "w-36")} onClick={(event) => event.stopPropagation()}>
          <select
            value={task.Priority || 0}
            onChange={(event) =>
              handleUpdateTaskField(task.ID, "priority", Number(event.target.value))
            }
            className={selectClass}
            aria-label={t("pm.dynamicBoard.priority")}
          >
            {priorities.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {cols.points ? (
        <div className={cn(cellClass, "flex w-28 justify-center")}>
          <Input
            type="number"
            min={0}
            defaultValue={task.StoryPoints || ""}
            onBlur={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(value) && value !== task.StoryPoints) {
                handleUpdateTaskField(task.ID, "story_points", value);
              }
            }}
            onClick={(event) => event.stopPropagation()}
            aria-label={t("pm.dynamicBoard.storyPoints")}
            className="h-8 w-16 text-center font-mono"
          />
        </div>
      ) : null}

      {cols.dueDate ? (
        <div className={cn(cellClass, "w-36")} onClick={(event) => event.stopPropagation()}>
          <Input
            type="date"
            value={task.DueDate ? task.DueDate.substring(0, 10) : ""}
            onChange={(event) =>
              handleUpdateTaskField(task.ID, "due_date", event.target.value)
            }
            aria-label={t("pm.dynamicBoard.dueDate")}
            className="h-8 text-xs"
          />
        </div>
      ) : null}

      {cols.assignee ? (
        <div className="w-40 px-3 py-2" onClick={(event) => event.stopPropagation()}>
          <div className="relative">
            <select
              value={task.AssigneeID || ""}
              onChange={(event) =>
                handleUpdateTaskField(task.ID, "assignee_id", event.target.value)
              }
              className={cn(selectClass, "pe-7")}
              aria-label={t("pm.dynamicBoard.assignee")}
            >
              <option value="">{t("pm.taskDetails.unassigned")}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email.split("@")[0]}
                </option>
              ))}
            </select>
            <UserIcon className="pointer-events-none absolute end-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
