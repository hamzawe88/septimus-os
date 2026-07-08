/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState } from "react";
import { ChevronDown, Plus, LayoutGrid, Calendar, Hash, Sparkles, SlidersHorizontal, Layers, User as UserIcon } from "lucide-react";
import TaskDetailsPanel from "./TaskDetailsPanel";
import DynamicBoardRow from "./DynamicBoardRow";

import { apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { Task, User } from "@/types";

const getIndentLevel = (path?: string) => {
  if (!path) return 0;
  return path.split(".").length - 1;
};

export default function DynamicBoard() {
  const [treeData, setTreeData] = useState<Task[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  // Super-Grid States
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [showColMenu, setShowColMenu] = useState(false);
  const [groupBy, setGroupBy] = useState<"none" | "status" | "priority" | "assignee">("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Persistent column visibility
  const [cols, setCols] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("septimus_grid_cols");
      if (saved) {
        try { return JSON.parse(saved); } catch { /* ignore */ }
      }
    }
    return { status: true, priority: true, points: true, dueDate: true, assignee: true };
  });

  const updateCols = (newCols: typeof cols) => {
    setCols(newCols);
    if (typeof window !== "undefined") {
      localStorage.setItem("septimus_grid_cols", JSON.stringify(newCols));
    }
  };

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const data = await apiGet("/tasks") as unknown as { tasks: Task[] };
        const tasks: Task[] = data.tasks || [];
          tasks.sort((a, b) => (a.Path || "").localeCompare(b.Path || ""));
          setTreeData(tasks);
          if (tasks.length > 0) {
             const pid = (tasks[0] as any).ProjectID as string;
             if (pid) setProjectId(pid);
          }
      } catch (err) {
        console.error(err);
      }
    };
    fetchTasks();

    const fetchUsers = async () => {
      try {
        const data = await apiGet("/users/search?q=") as unknown as User[];
        setUsers(data || []);
      } catch (e) {
        console.error(e);
      }
    };
    fetchUsers();

    const handleWsMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const msg = customEvent.detail;
      if (msg && (msg.type === "task_updated" || msg.type === "task_created" || msg.type === "task_deleted")) {
        fetchTasks();
      }
    };

    window.addEventListener("ws-message", handleWsMessage);
    return () => window.removeEventListener("ws-message", handleWsMessage);
  }, []);

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const toggleGroup = (groupKey: string) => {
    const next = new Set(collapsedGroups);
    if (next.has(groupKey)) next.delete(groupKey);
    else next.add(groupKey);
    setCollapsedGroups(next);
  };

  const selectedTask = treeData.find(t => t.ID === selectedTaskId);

  const handleCreateNewTask = async (e: React.KeyboardEvent<HTMLInputElement>, defaultStatus = "todo") => {
    if (e.key === "Enter" && newTaskTitle.trim()) {
      if (!projectId) return;
      try {
        await apiPost(`/projects/${projectId}/tasks`, {
            title: newTaskTitle.trim(),
            description: "",
            status: defaultStatus
        });
        setNewTaskTitle("");
        setIsCreatingNew(false);
        window.dispatchEvent(new CustomEvent("ws-message", { detail: { type: "task_created" } }));
      } catch (err) { console.error(err); }
    } else if (e.key === "Escape") {
      setIsCreatingNew(false);
      setNewTaskTitle("");
    }
  };

  const handleUpdateTaskField = async (taskId: string, field: string, value: unknown) => {
    // Optimistic UI update
    setTreeData(prev => prev.map(t => {
      if (t.ID === taskId) {
        if (field === 'title') return { ...t, Title: value as string };
        if (field === 'status') return { ...t, Status: value as string };
        if (field === 'priority') return { ...t, Priority: value as number };
        if (field === 'story_points') return { ...t, StoryPoints: value as number };
        if (field === 'due_date') return { ...t, DueDate: value as string };
        if (field === 'assignee_id') return { ...t, AssigneeID: (value === "" ? undefined : value as string) };
      }
      return t;
    }));
    setEditingCell(null);

    try {
      const payload: any = {};
      payload[field] = value;
      await apiPut("/tasks/${taskId}", payload);
      window.dispatchEvent(new CustomEvent("ws-message", { detail: { type: "task_updated" } }));
    } catch (err) {
      console.error(err);
    }
  };

  // Status definitions with curated vibrant palettes
  const statuses = [
    { value: "todo", label: "To Do", bg: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" },
    { value: "in_progress", label: "In Progress", bg: "bg-brand-light text-brand-dark border-brand-light font-semibold", dot: "bg-[#dfb2e5]" },
    { value: "review", label: "In Review", bg: "bg-amber-50 text-amber-800 border-amber-200 font-semibold", dot: "bg-amber-400" },
    { value: "done", label: "Done", bg: "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold", dot: "bg-emerald-500" }
  ];

  // Priority definitions
  const priorities = [
    { value: 1, label: "P1 Urgent", badge: "text-red-700 bg-red-100 border-red-200 font-bold" },
    { value: 2, label: "P2 High", badge: "text-orange-700 bg-orange-100 border-orange-200 font-semibold" },
    { value: 3, label: "P3 Normal", badge: "text-brand bg-brand-light border-brand-light font-medium" },
    { value: 0, label: "No Priority", badge: "text-slate-500 bg-slate-100 border-slate-200 font-normal" }
  ];

  const totalTasks = treeData.length;
  const completedTasks = treeData.filter(t => t.Status === 'done').length;
  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Grouping generator
  const getGroupedTasks = () => {
    if (groupBy === "none") return [{ key: "all", label: "", tasks: treeData, badge: "" }];

    if (groupBy === "status") {
      return statuses.map(s => ({
        key: s.value,
        label: s.label,
        tasks: treeData.filter(t => t.Status === s.value),
        badge: s.bg
      }));
    }

    if (groupBy === "priority") {
      return priorities.map(p => ({
        key: String(p.value),
        label: p.label,
        tasks: treeData.filter(t => (t.Priority || 0) === p.value),
        badge: p.badge
      }));
    }

    if (groupBy === "assignee") {
      const assignedGroups = users.map(u => ({
        key: u.id,
        label: u.email.split('@')[0],
        tasks: treeData.filter(t => t.AssigneeID === u.id),
        badge: "bg-brand-light text-brand border-brand-light"
      })).filter(g => g.tasks.length > 0);

      const unassignedTasks = treeData.filter(t => !t.AssigneeID);
      if (unassignedTasks.length > 0) {
        assignedGroups.push({
          key: "unassigned",
          label: "Unassigned",
          tasks: unassignedTasks,
          badge: "bg-slate-100 text-slate-600 border-slate-200"
        });
      }
      return assignedGroups;
    }

    return [{ key: "all", label: "", tasks: treeData, badge: "" }];
  };

  const groupedData = getGroupedTasks();

  const renderTaskRow = (task: Task, index: number) => {
    const level = groupBy === "none" ? getIndentLevel(task.Path) : 0;
    const hasChildren = groupBy === "none" && treeData.some(t => t.ParentID === task.ID);
    const isExpanded = expandedRows.has(task.ID);
    
    if (groupBy === "none" && task.ParentID && !expandedRows.has(task.ParentID)) return null;

    const isSelected = selectedTaskId === task.ID;

    return (
      <DynamicBoardRow
        key={task.ID}
        task={task}
        index={index}
        groupBy={groupBy}
        level={level}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        isSelected={isSelected}
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

  return (
    <div className="flex-1 h-full flex flex-col bg-slate-50/50 overflow-hidden relative">
      {/* Top Header with Glassmorphism */}
      <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200/80 bg-white/80 backdrop-blur-md z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-light/80 rounded-xl text-[#9d4edd]">
            <Sparkles className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Task Table</h2>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-full shadow-sm">Super-Grid</span>
            </div>
            <p className="text-xs font-medium text-slate-500">Phase 2: Dynamic Grouping, Persistent Custom Columns & Inline Pickers</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Dynamic Group By Control */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/60 text-xs font-semibold text-slate-600">
            <span className="px-2.5 py-1 text-slate-400 flex items-center gap-1"><Layers className="w-3.5 h-3.5"/> Group:</span>
            {(["none", "status", "priority", "assignee"] as const).map(g => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`px-3 py-1 rounded-lg capitalize transition-all ${groupBy === g ? 'bg-white text-brand shadow-sm font-bold' : 'hover:text-slate-900'}`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Custom Columns Dropdown Trigger */}
          <div className="relative">
            <button
              onClick={() => setShowColMenu(!showColMenu)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              Columns
            </button>

            {showColMenu && (
              <div className="absolute end-0 mt-2 w-52 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-30 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">Toggle Custom Columns</div>
                
                <label className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-medium text-slate-700">
                  <span>Status</span>
                  <input type="checkbox" checked={cols.status} onChange={(e) => updateCols({...cols, status: e.target.checked})} className="rounded text-brand focus:ring-brand"/>
                </label>
                <label className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-medium text-slate-700">
                  <span>Priority</span>
                  <input type="checkbox" checked={cols.priority} onChange={(e) => updateCols({...cols, priority: e.target.checked})} className="rounded text-brand focus:ring-brand"/>
                </label>
                <label className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-medium text-slate-700">
                  <span className="flex items-center gap-2"><Hash className="w-3.5 h-3.5 text-slate-400"/> Story Points</span>
                  <input type="checkbox" checked={cols.points} onChange={(e) => updateCols({...cols, points: e.target.checked})} className="rounded text-brand focus:ring-brand"/>
                </label>
                <label className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-medium text-slate-700">
                  <span className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-slate-400"/> Due Date</span>
                  <input type="checkbox" checked={cols.dueDate} onChange={(e) => updateCols({...cols, dueDate: e.target.checked})} className="rounded text-brand focus:ring-brand"/>
                </label>
                <label className="flex items-center justify-between px-2 py-1.5 hover:bg-slate-50 rounded-lg cursor-pointer text-xs font-medium text-slate-700">
                  <span className="flex items-center gap-2"><UserIcon className="w-3.5 h-3.5 text-slate-400"/> Assignee</span>
                  <input type="checkbox" checked={cols.assignee} onChange={(e) => updateCols({...cols, assignee: e.target.checked})} className="rounded text-brand focus:ring-brand"/>
                </label>
              </div>
            )}
          </div>

          <button 
            onClick={() => setIsCreatingNew(true)}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg shadow-md hover:shadow-lg font-semibold transition-all flex items-center gap-2 text-xs"
          >
            <Plus className="w-4 h-4" />
            New Row
          </button>
        </div>
      </div>

      {/* Main Grid Container */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden flex flex-col p-6">
        <div className="flex-1 min-w-[1050px] border border-slate-200/80 rounded-2xl overflow-hidden flex flex-col bg-white shadow-lg shadow-slate-100/50">
          
          {/* Sticky Table Header */}
          <div className="flex items-center bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-10 select-none">
            <div className="w-12 py-3.5 border-e border-slate-200 flex justify-center">
              <input type="checkbox" title="Select all tasks" aria-label="Select all tasks" className="rounded border-slate-300 text-brand focus:ring-brand" />
            </div>
            <div className="w-24 py-3.5 px-4 border-e border-slate-200">ID</div>
            <div className="flex-1 py-3.5 px-4 border-e border-slate-200">Task Title</div>
            {cols.status && <div className="w-40 py-3.5 px-4 border-e border-slate-200">Status</div>}
            {cols.priority && <div className="w-36 py-3.5 px-4 border-e border-slate-200">Priority</div>}
            {cols.points && <div className="w-28 py-3.5 px-4 border-e border-slate-200 text-center">Points</div>}
            {cols.dueDate && <div className="w-36 py-3.5 px-4 border-e border-slate-200 text-center">Due Date</div>}
            {cols.assignee && <div className="w-40 py-3.5 px-4">Assignee</div>}
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto bg-white divide-y divide-slate-100 custom-scrollbar">
            {isCreatingNew && (
              <div className="flex items-center bg-brand-light/40 animate-in fade-in duration-200">
                <div className="w-12 py-3 border-e border-slate-100 flex justify-center"></div>
                <div className="w-24 py-3 px-4 border-e border-slate-100 text-xs font-mono text-brand font-bold">NEW</div>
                <div className="flex-1 py-2 px-4 border-e border-slate-100">
                  <input 
                    type="text" 
                    autoFocus
                    title="New task title"
                    aria-label="New task title"
                    placeholder="Enter task title and press Enter (Esc to cancel)..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => handleCreateNewTask(e)}
                    className="w-full bg-white border border-brand-light rounded-md focus:ring-2 focus:ring-brand text-sm font-medium text-slate-900 px-3 py-1.5 shadow-inner"
                  />
                </div>
                {cols.status && <div className="w-40 py-3 px-4 border-e border-slate-100"></div>}
                {cols.priority && <div className="w-36 py-3 px-4 border-e border-slate-100"></div>}
                {cols.points && <div className="w-28 py-3 px-4 border-e border-slate-100"></div>}
                {cols.dueDate && <div className="w-36 py-3 px-4 border-e border-slate-100"></div>}
                {cols.assignee && <div className="w-40 py-3 px-4"></div>}
              </div>
            )}

            {treeData.length === 0 && !isCreatingNew ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 p-12 space-y-4">
                <div className="p-4 bg-slate-50 rounded-full">
                  <LayoutGrid className="w-12 h-12 text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-slate-600">No tasks found</p>
                  <p className="text-xs text-slate-400 mt-1">Click &quot;New Row&quot; above to create your first task in the super-grid.</p>
                </div>
              </div>
            ) : (
              groupedData.map((group) => {
                const isGroupCollapsed = collapsedGroups.has(group.key);

                return (
                  <React.Fragment key={group.key}>
                    {/* Group Section Header */}
                    {groupBy !== "none" && (
                      <div 
                        onClick={() => toggleGroup(group.key)}
                        className="flex items-center justify-between px-4 py-2.5 bg-slate-100/80 border-y border-slate-200 cursor-pointer hover:bg-slate-200/60 transition-colors select-none"
                      >
                        <div className="flex items-center gap-2">
                          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${isGroupCollapsed ? '-rotate-90' : ''}`} />
                          <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold border ${group.badge || 'bg-white text-slate-700 border-slate-300'}`}>
                            {group.label}
                          </span>
                          <span className="text-xs font-semibold text-slate-500">({group.tasks.length})</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsCreatingNew(true);
                          }}
                          className="text-xs text-brand hover:text-brand font-semibold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add in group
                        </button>
                      </div>
                    )}

                    {/* Group Rows */}
                    {!isGroupCollapsed && group.tasks.map((task, idx) => renderTaskRow(task, idx))}
                  </React.Fragment>
                );
              })
            )}
          </div>
          
          {/* Smart Footer Summary */}
          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 font-medium">
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-brand"></span> <b>{totalTasks}</b> Total Tasks</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> <b>{completedTasks}</b> Completed</span>
              <div className="flex items-center gap-2">
                <span>Progress:</span>
                <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 transition-all duration-500" ref={(el) => { if (el) el.style.width = `${completionPercentage}%`; }}></div>
                </div>
                <span className="font-bold text-slate-800">{completionPercentage}%</span>
              </div>
            </div>

            <button 
              onClick={() => setIsCreatingNew(true)}
              className="flex items-center gap-1 text-brand hover:text-brand font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Quick Add Row
            </button>
          </div>
        </div>
      </div>

      <TaskDetailsPanel task={selectedTask as unknown as import("@/types").Task} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}
