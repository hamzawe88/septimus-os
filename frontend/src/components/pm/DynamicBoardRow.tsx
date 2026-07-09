import React from "react";
import { ChevronRight, CheckCircle2, Check, X, User as UserIcon } from "lucide-react";
import { Task, User } from "@/types";
import { useLocalization } from "@/contexts/LocalizationContext";

interface Status {
  value: string;
  label: string;
  bg: string;
  dot: string;
}

interface Priority {
  value: number;
  label: string;
  badge: string;
}

interface Cols {
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
  cols: Cols;
  statuses: Status[];
  priorities: Priority[];
  users: User[];
  editingCell: { id: string; field: string } | null;
  editTitleValue: string;
  setEditTitleValue: (v: string) => void;
  setEditingCell: (cell: { id: string; field: string } | null) => void;
  handleUpdateTaskField: (id: string, field: string, value: unknown) => void;
  toggleRow: (id: string) => void;
  setSelectedTaskId: (id: string) => void;
}

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
  setSelectedTaskId
}: DynamicBoardRowProps) {
  const { isRtl } = useLocalization();
  const currentStatus = statuses.find(s => s.value === task.Status) || statuses[0];
  const currentPriority = priorities.find(p => p.value === task.Priority) || priorities[3];

  return (
    <div 
      onClick={() => setSelectedTaskId(task.ID)}
      className={`flex items-center hover:bg-slate-50/90 cursor-pointer transition-colors group ${isSelected ? 'bg-brand-light/60 hover:bg-brand-light/80' : ''}`}
    >
      {/* Checkbox / Index */}
      <div className="w-12 py-3 border-e border-slate-100 flex justify-center">
        <span className="text-xs text-slate-300 font-mono group-hover:hidden">{index + 1}</span>
        <input type="checkbox" title={isRtl ? `تحديد المهمة ${task.ID}` : `Select task ${task.ID}`} aria-label={isRtl ? `تحديد المهمة ${task.ID}` : `Select task ${task.ID}`} className="hidden group-hover:block rounded border-slate-300 text-brand focus:ring-brand" />
      </div>
      
      {/* Task ID */}
      <div className="w-24 py-3 px-4 border-e border-slate-100 text-xs font-mono font-semibold text-slate-400 group-hover:text-brand transition-colors">
        T-{task.ID.substring(0,4)}
      </div>

      {/* Title Column with Inline Editing */}
      <div className="flex-1 py-2.5 px-4 border-e border-slate-100 flex items-center gap-2 min-w-[280px]" ref={(el) => { if (el) el.style.paddingLeft = `${Math.max(1, level * 1.5)}rem`; }}>
        {groupBy === "none" && (
          <button 
            onClick={(e) => { e.stopPropagation(); toggleRow(task.ID); }}
            className={`w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200 transition-colors ${hasChildren ? 'visible' : 'invisible'}`}
            title={isRtl ? "طيّ/فرد الصف" : "Toggle row"}
            aria-label={isRtl ? "طيّ/فرد الصف" : "Toggle row"}
          >
            <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
          </button>
        )}
        
        <div className="w-5 flex justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleUpdateTaskField(task.ID, 'status', task.Status === 'done' ? 'todo' : 'done');
            }}
            className="focus:outline-none"
            title={isRtl ? "تبديل إكمال المهمة" : "Toggle task completion"}
            aria-label={isRtl ? "تبديل إكمال المهمة" : "Toggle task completion"}
          >
            {task.Status === 'done' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 hover:scale-110 transition-transform" />
            ) : (
              <div className="w-3 h-3 rounded-sm border-2 border-slate-300 hover:border-brand transition-colors" />
            )}
          </button>
        </div>

        {editingCell?.id === task.ID && editingCell?.field === 'title' ? (
          <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              autoFocus
              title={isRtl ? "تعديل عنوان المهمة" : "Edit task title"}
              aria-label={isRtl ? "تعديل عنوان المهمة" : "Edit task title"}
              placeholder={isRtl ? "عنوان المهمة" : "Task title"}
              value={editTitleValue}
              onChange={(e) => setEditTitleValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUpdateTaskField(task.ID, 'title', editTitleValue);
                if (e.key === 'Escape') setEditingCell(null);
              }}
              className="w-full bg-white border border-purple-400 rounded px-2 py-1 text-sm text-slate-900 focus:outline-none shadow-sm"
            />
            <button onClick={() => handleUpdateTaskField(task.ID, 'title', editTitleValue)} title={isRtl ? "حفظ العنوان" : "Save title"} aria-label={isRtl ? "حفظ العنوان" : "Save title"} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"><Check className="w-3.5 h-3.5"/></button>
            <button onClick={() => setEditingCell(null)} title={isRtl ? "إلغاء التعديل" : "Cancel editing"} aria-label={isRtl ? "إلغاء التعديل" : "Cancel editing"} className="p-1 text-slate-400 hover:bg-slate-100 rounded"><X className="w-3.5 h-3.5"/></button>
          </div>
        ) : (
          <span 
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditTitleValue(task.Title);
              setEditingCell({ id: task.ID, field: 'title' });
            }}
            className={`text-sm font-semibold truncate select-none border-b border-transparent hover:border-dashed hover:border-slate-300 pb-0.5 transition-all ${task.Status === 'done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}
            title={isRtl ? "انقر مرتين للتعديل المباشر" : "Double-click to inline edit title"}
          >
            {task.Title}
          </span>
        )}
      </div>
      
      {/* Status Column */}
      {cols.status && (
        <div className="w-40 py-2 px-3 border-e border-slate-100 flex items-center" onClick={(e) => e.stopPropagation()}>
          <div className="relative w-full">
            <select
              title={isRtl ? "حالة المهمة" : "Task status"}
              aria-label={isRtl ? "حالة المهمة" : "Task status"}
              value={task.Status}
              onChange={(e) => handleUpdateTaskField(task.ID, 'status', e.target.value)}
              className={`w-full appearance-none px-2.5 py-1 rounded-lg border text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30 transition-all ${currentStatus.bg}`}
            >
              {statuses.map(s => (
                <option key={s.value} value={s.value} className="bg-white text-slate-800 font-medium py-1">
                  {s.label}
                </option>
              ))}
            </select>
            <div className={`absolute start-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full pointer-events-none ${currentStatus.dot}`} />
          </div>
        </div>
      )}

      {/* Priority Column */}
      {cols.priority && (
        <div className="w-36 py-2 px-3 border-e border-slate-100 flex items-center" onClick={(e) => e.stopPropagation()}>
          <select
            title={isRtl ? "أولوية المهمة" : "Task priority"}
            aria-label={isRtl ? "أولوية المهمة" : "Task priority"}
            value={task.Priority || 0}
            onChange={(e) => handleUpdateTaskField(task.ID, 'priority', parseInt(e.target.value))}
            className={`w-full appearance-none px-2.5 py-1 rounded-lg border text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30 transition-all text-center ${currentPriority.badge}`}
          >
            {priorities.map(p => (
              <option key={p.value} value={p.value} className="bg-white text-slate-800 font-medium">
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Story Points Column */}
      {cols.points && (
        <div className="w-28 py-2 px-3 border-e border-slate-100 flex items-center justify-center font-mono text-xs text-slate-600">
          <input
            type="number"
            title={isRtl ? "نقاط الجهد" : "Story points"}
            aria-label={isRtl ? "نقاط الجهد" : "Story points"}
            placeholder="--"
            defaultValue={task.StoryPoints || ""}
            onBlur={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val) && val !== task.StoryPoints) {
                handleUpdateTaskField(task.ID, 'story_points', val);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-16 text-center bg-transparent hover:bg-slate-100 focus:bg-white rounded border border-transparent focus:border-brand-light py-0.5 focus:outline-none font-medium transition-colors"
          />
        </div>
      )}

      {/* Due Date Column */}
      {cols.dueDate && (
        <div className="w-36 py-2 px-3 border-e border-slate-100 flex items-center justify-center text-xs text-slate-600 font-medium" onClick={(e) => e.stopPropagation()}>
          <input
            type="date"
            title={isRtl ? "تاريخ الاستحقاق" : "Due date"}
            aria-label="Due date"
            value={task.DueDate ? task.DueDate.substring(0, 10) : ""}
            onChange={(e) => handleUpdateTaskField(task.ID, 'due_date', e.target.value)}
            className="bg-transparent hover:bg-slate-100 focus:bg-white border border-transparent focus:border-brand-light rounded px-1.5 py-0.5 text-xs focus:outline-none cursor-pointer transition-colors"
          />
        </div>
      )}

      {/* Assignee Column */}
      {cols.assignee && (
        <div className="w-40 py-2 px-3 flex items-center" onClick={(e) => e.stopPropagation()}>
          <div className="relative w-full">
            <select
              title={isRtl ? "المُسند إليه" : "Task assignee"}
              aria-label="Task assignee"
              value={task.AssigneeID || ""}
              onChange={(e) => handleUpdateTaskField(task.ID, 'assignee_id', e.target.value)}
              className="w-full appearance-none bg-slate-50 hover:bg-slate-100 border border-slate-200/80 rounded-lg px-2.5 py-1 text-xs text-slate-700 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/30 truncate pe-6 transition-colors"
            >
              <option value="" className="text-slate-400">{isRtl ? "غير مُسند" : "Unassigned"}</option>
              {users.map(u => (
                <option key={u.id} value={u.id} className="text-slate-800 font-medium">
                  {u.email.split('@')[0]}
                </option>
              ))}
            </select>
            <UserIcon className="w-3 h-3 text-slate-400 absolute end-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      )}
    </div>
  );
}
