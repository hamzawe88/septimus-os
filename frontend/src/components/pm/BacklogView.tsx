/* eslint-disable */
"use client";
import React, { useState, useEffect, useCallback } from "react";
import { Plus, Play, Calendar, CheckCircle2, LayoutGrid, GripVertical, Rocket, Search, Filter, AlertTriangle, MoreHorizontal, Edit2, Trash2, Check, X, Sparkles, User as UserIcon, Clock, Wand2, CheckSquare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import TaskDetailsPanel from "./TaskDetailsPanel";
import SprintReport from "./SprintReport";

import { apiGet, apiPost, apiDelete, apiPut, AI_BASE_URL } from "@/lib/apiClient";
import { AIAutoPlanModal } from './backlog/AIAutoPlanModal';
import { BacklogHeader } from './backlog/BacklogHeader';
import { Task, Sprint, User, AIProposal } from "@/types";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function BacklogView() {
  const { isRtl } = useLocalization();
  const { projectId } = useAppStore();
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [reportSprint, setReportSprint] = useState<Sprint | null>(null);

  // Agile Super-Hub States
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [creatingInTarget, setCreatingInTarget] = useState<string | null>(null); // "backlog" or sprint ID
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPoints, setNewTaskPoints] = useState<number>(3);
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<number | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<string | null>(null);

  // Sprint Editing
  const [editingSprintId, setEditingSprintId] = useState<string | null>(null);
  const [sprintEditName, setSprintEditName] = useState("");
  const [sprintEditGoal, setSprintEditGoal] = useState("");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Phase 3: AI Agile Co-Pilot States
  const [aiProposalModal, setAiProposalModal] = useState<AIProposal | null>(null);
  const [isAssigningAI, setIsAssigningAI] = useState(false);

  const fetchSprintsAndTasks = useCallback(async () => {
    if (!projectId) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const [sprints, tasksData, users] = await Promise.all([
        apiGet(`/sprints?project_id=${projectId}`),
        apiGet(`/tasks?project_id=${projectId}`),
        apiGet(`/users/search?q=`)
      ]);

      setSprints((sprints as Sprint[]) || []);
      setTasks((tasksData as any).tasks || []);
      setUsers((users as User[]) || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSprintsAndTasks();

    const handleWsMessage = (e: Event) => {
      const customEvent = e as CustomEvent;
      const msg = customEvent.detail;
      if (msg && (msg.type === "task_updated" || msg.type === "task_created" || msg.type === "task_deleted" || msg.type === "sprint_updated")) {
        fetchSprintsAndTasks();
      }
    };

    window.addEventListener("ws-message", handleWsMessage);
    return () => window.removeEventListener("ws-message", handleWsMessage);
  }, [fetchSprintsAndTasks]);

  const handleCreateSprint = async () => {
    const sprintName = `Sprint ${sprints.length + 1}`;
    
    try {
      await apiPost("/sprints", {
          project_id: projectId,
          name: sprintName,
          goal: isRtl ? "تسليم مخرجات السبرنت بفعالية" : "Deliver sprint increments effectively",
        });
      fetchSprintsAndTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStartSprint = async (sprintId: string) => {
    try {
      await apiPut(`/sprints/${sprintId}/start`, {});
      fetchSprintsAndTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateSprint = async (sprintId: string) => {
    try {
      await apiPut(`/sprints/${sprintId}`, {
          name: sprintEditName,
          goal: sprintEditGoal,
        });
      setEditingSprintId(null);
      fetchSprintsAndTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSuggestGoal = (sprint: Sprint) => {
    const sprintTasks = tasks.filter(t => t.SprintID === sprint.ID);
    if (sprintTasks.length === 0) {
      alert(isRtl ? "يرجى إضافة بعض المهام للسبرنت أولاً ليتمكن الذكاء الاصطناعي من توليد هدف مناسب!" : "Please add some tasks to the sprint first so AI can generate a tailored goal!");
      return;
    }
    const titles = sprintTasks.map(t => t.Title.toLowerCase());
    let actionWord = "Deliver";
    if (titles.some(t => t.includes("fix") || t.includes("bug") || t.includes("issue") || t.includes("error"))) actionWord = "Resolve critical system stability issues and optimize";
    else if (titles.some(t => t.includes("ui") || t.includes("design") || t.includes("frontend") || t.includes("css"))) actionWord = "Enhance user interface experience and deliver";
    else if (titles.some(t => t.includes("api") || t.includes("backend") || t.includes("db") || t.includes("auth"))) actionWord = "Strengthen core backend architecture and implement";

    const totalPts = sprintTasks.reduce((acc, t) => acc + (t.StoryPoints || 0), 0);
    const goal = `${actionWord} ${sprintTasks.length} planned iterations (${totalPts} pts velocity).`;
    
    setEditingSprintId(sprint.ID);
    setSprintEditName(sprint.Name);
    setSprintEditGoal(goal);
    setActiveMenuId(null);
  };

  const handleCreateTaskInline = async (target: string) => {
    if (!newTaskTitle.trim() || !projectId) return;
    try {
      const created = await apiPost(`/projects/${projectId}/tasks`, {
        title: newTaskTitle.trim(),
        story_points: newTaskPoints,
        status: "todo"
      }) as any;
      const createdId = created.task ? created.task.ID : (created.ID || null);
      if (createdId && target !== "backlog") {
        await apiPut(`/tasks/${createdId}`, { sprint_id: target, story_points: newTaskPoints });
      }
      setNewTaskTitle("");
      setNewTaskPoints(3);
      setCreatingInTarget(null);
      fetchSprintsAndTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("taskId", taskId);
  };

  const handleDrop = async (e: React.DragEvent, sprintId: string | null) => {
    e.preventDefault();
    setDragOverId(null);
    const taskId = e.dataTransfer.getData("taskId");
    if (!taskId) return;

    try {
      setTasks((prev) => prev.map(t => t.ID === taskId ? { ...t, SprintID: sprintId || undefined } : t));
      
      await apiPut(`/tasks/${taskId}`, { sprint_id: sprintId });
      fetchSprintsAndTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (dragOverId !== targetId) {
      setDragOverId(targetId);
    }
  };

  // Phase 3: Interactive AI Auto-Plan trigger
  const handleAutoPlan = async () => {
    const targetSprint = planningSprints[0] || activeSprint;
    if (!targetSprint) {
      alert(isRtl ? "يرجى إنشاء سبرنت أولاً قبل التخطيط التلقائي." : "Please create a Sprint first before auto-planning.");
      return;
    }

    const backlog = tasks.filter(t => !t.SprintID).map(t => ({
      ID: t.ID,
      Title: t.Title,
      StoryPoints: t.StoryPoints || 0,
      Priority: t.Priority || 0
    }));

    if (backlog.length === 0) {
      alert(isRtl ? "قائمة المهام فارغة!" : "Backlog is empty!");
      return;
    }

    try {
      setIsLoading(true);
      const aiRes = await apiPost("/ai/plan-sprint", {
          capacity: 30,
          backlog: backlog
        }, AI_BASE_URL);

      if (aiRes) {
        const data = aiRes as any;
        const selectedIds: string[] = data.selected_task_ids || [];
        
        const proposedTasks = tasks.filter(t => selectedIds.includes(t.ID));
        if (proposedTasks.length === 0) {
          alert(isRtl ? "حلّل الذكاء الاصطناعي المهام لكن تعذّر احتواؤها ضمن قيود سعة السبرنت." : "AI analyzed the backlog but could not fit tasks within sprint capacity constraints.");
          return;
        }

        const rationale = `AI analyzed ${backlog.length} backlog items and selected ${proposedTasks.length} tasks prioritizing high-urgency items while balancing story point weights against optimal sprint velocity (30 pts).`;
        setAiProposalModal({ targetSprint, selectedTasks: proposedTasks, rationale });
      } else {
        alert(isRtl ? "خدمة التخطيط بالذكاء الاصطناعي أعادت خطأ." : "AI Planning service returned an error.");
      }
    } catch (err) {
      console.error(err);
      alert(isRtl ? "تعذّر الوصول لخدمة التخطيط. تأكد من تشغيل خدمة ai-sidecar وأن backend-core يعمل." : "AI Planning endpoint unreachable. Make sure the ai-sidecar service is running and reachable via backend-core.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAcceptAIProposal = async () => {
    if (!aiProposalModal) return;
    setIsAssigningAI(true);
    try {
      await Promise.all(aiProposalModal.selectedTasks.map((task) => 
        apiPut(`/tasks/${task.ID}`, { sprint_id: aiProposalModal.targetSprint.ID })
      ));
      setAiProposalModal(null);
      await fetchSprintsAndTasks();
    } catch (err) {
      console.error(err);
    } finally {
      setIsAssigningAI(false);
    }
  };

  const priorities = [
    { value: 1, label: isRtl ? "P1 عاجلة" : "P1 Urgent", badge: "text-red-700 bg-red-100 border-red-200 font-bold" },
    { value: 2, label: isRtl ? "P2 عالية" : "P2 High", badge: "text-orange-700 bg-orange-100 border-orange-200 font-semibold" },
    { value: 3, label: isRtl ? "P3 عادية" : "P3 Normal", badge: "text-brand bg-brand-light border-brand-light font-medium" },
    { value: 0, label: isRtl ? "بلا أولوية" : "No Priority", badge: "text-slate-500 bg-slate-100 border-slate-200" }
  ];

  const filterTask = (t: Task) => {
    if (searchQuery.trim() && !t.Title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterPriority !== null && (t.Priority || 0) !== filterPriority) return false;
    if (filterAssignee !== null && t.AssigneeID !== filterAssignee) return false;
    return true;
  };

  const activeSprint = sprints.find(s => s.Status === "active");
  const planningSprints = sprints.filter(s => s.Status === "planning");
  const backlogTasks = tasks.filter(t => !t.SprintID).filter(filterTask);
  const selectedTask = tasks.find((t) => t.ID === selectedTaskId);

  const renderTaskCard = (task: Task) => {
    const isSelected = selectedTaskId === task.ID;
    const prio = priorities.find(p => p.value === (task.Priority || 0)) || priorities[3];
    const assignee = users.find(u => u.id === task.AssigneeID);

    return (
      <div 
        key={task.ID} 
        draggable
        onDragStart={(e) => handleDragStart(e, task.ID)}
        onClick={() => setSelectedTaskId(task.ID)}
        className={`bg-white border ${isSelected ? 'border-brand ring-2 ring-brand/20 shadow-md' : 'border-slate-200/80 shadow-sm hover:border-brand-light'} rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all group`}
      >
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 text-slate-300 group-hover:text-brand transition-colors">
            <GripVertical className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-1.5 gap-2">
              <span className="text-[11px] font-mono font-bold text-slate-400 group-hover:text-brand transition-colors">T-{task.ID.substring(0,4)}</span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${prio.badge}`}>{prio.label.split(' ')[0]}</span>
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/60">{task.StoryPoints || 0} pts</span>
              </div>
            </div>
            <p className={`font-semibold text-sm leading-snug truncate ${task.Status === 'done' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{task.Title}</p>
            
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-xs text-slate-400">
              <span className="capitalize text-[11px] font-medium px-2 py-0.5 rounded bg-slate-50 border border-slate-200/60 text-slate-600">
                {task.Status.replace("_", " ")}
              </span>
              {assignee ? (
                <span className="flex items-center gap-1 text-xs font-medium text-brand bg-brand-light px-2 py-0.5 rounded-full border border-brand-light">
                  <UserIcon className="w-3 h-3" /> {assignee.email.split('@')[0]}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 italic">{isRtl ? "غير مُسند" : "Unassigned"}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCapacityBar = (sprintTasks: Task[], capacity = 30) => {
    const totalPts = sprintTasks.reduce((acc, t) => acc + (t.StoryPoints || 0), 0);
    const percentage = Math.min(100, Math.round((totalPts / capacity) * 100));
    const isOver = totalPts > capacity;

    let barColor = "bg-emerald-500";
    if (percentage > 70) barColor = "bg-amber-500";
    if (isOver) barColor = "bg-red-500";

    return (
      <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-200 flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-xs font-semibold">
          <span className="text-slate-600 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />  {isRtl ? "سرعة سعة السبرنت" : "Sprint Capacity Velocity"}
          </span>
          <div className="flex items-center gap-2">
            {isOver && (
              <span className="flex items-center gap-1 text-red-600 bg-red-100 px-2 py-0.5 rounded-full text-[10px] font-bold animate-pulse">
                <AlertTriangle className="w-3 h-3" />  {isRtl ? `تجاوز السعة (+${totalPts - capacity})` : `Over Capacity (+${totalPts - capacity} pts)`}
              </span>
            )}
            <span className={`font-bold ${isOver ? 'text-red-600' : 'text-slate-800'}`}>{totalPts} / {capacity} pts</span>
          </div>
        </div>
        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} transition-all duration-500`} ref={(el) => { if (el) el.style.width = `${percentage}%`; }}></div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 overflow-hidden relative">
      {reportSprint && (
        <SprintReport 
          sprint={reportSprint as any} 
          tasks={tasks as any} 
          onClose={() => setReportSprint(null)} 
        />
      )}

      {/* Phase 3: AI Proposal Modal */}
      <AIAutoPlanModal 
        isOpen={!!aiProposalModal}
        proposal={aiProposalModal}
        isAssigning={isAssigningAI}
        onClose={() => setAiProposalModal(null)}
        onAccept={handleAcceptAIProposal}
        priorities={priorities}
      />

      {/* Header & Agile Super-Hub Toolbar */}
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

      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Product Backlog */}
        <div 
          className={`w-1/3 border-e border-slate-200 flex flex-col transition-colors ${dragOverId === "backlog" ? "bg-brand-light/40 ring-2 ring-indigo-400 inset-0" : "bg-slate-100/50"}`}
          onDragOver={(e) => handleDragOver(e, "backlog")}
          onDrop={(e) => handleDrop(e, null)}
        >
          <div className="p-4 border-b border-slate-200/80 flex justify-between items-center bg-white sticky top-0 z-10 shadow-sm">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-brand" />
              Product Backlog 
              <span className="text-xs font-bold text-brand bg-brand-light px-2.5 py-0.5 rounded-full border border-brand-light">{backlogTasks.length}</span>
            </h3>
            <span className="text-[11px] font-semibold text-slate-400">
              {backlogTasks.reduce((acc, t) => acc + (t.StoryPoints || 0), 0)} total pts
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
            {backlogTasks.length === 0 ? (
              <div className="text-center p-12 text-slate-400 text-sm bg-white rounded-2xl border-2 border-dashed border-slate-200/80 flex flex-col items-center justify-center space-y-2 shadow-sm">
                <LayoutGrid className="w-10 h-10 text-slate-300" />
                <p className="font-bold text-slate-600">{isRtl ? "قائمة المهام فارغة" : "Backlog is empty"}</p>
                <p className="text-xs text-slate-400">{isRtl ? "أضف مهاماً بالأسفل أو أعد ضبط الفلاتر لعرض المزيد." : "Add tasks below or reset your filters to see more work items."}</p>
              </div>
            ) : (
              backlogTasks.map(task => renderTaskCard(task))
            )}

            {/* Inline Creation inside Backlog */}
            {creatingInTarget === "backlog" ? (
              <div className="bg-white border-2 border-indigo-400 rounded-xl p-3 shadow-md space-y-2 animate-in fade-in duration-150">
                <input
                  type="text"
                  autoFocus
                  title={isRtl ? "عنوان عنصر جديد" : "New backlog item title"}
                  aria-label={isRtl ? "عنوان عنصر جديد" : "New backlog item title"}
                  placeholder={isRtl ? "ما الذي يجب إنجازه؟..." : "What needs to be done?..."}
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateTaskInline("backlog");
                    if (e.key === "Escape") setCreatingInTarget(null);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-500">Points:</span>
                    <input
                      type="number"
                      title={isRtl ? "تقدير نقاط الجهد" : "Story points estimation"}
                      aria-label={isRtl ? "تقدير نقاط الجهد" : "Story points estimation"}
                      value={newTaskPoints}
                      onChange={(e) => setNewTaskPoints(Number(e.target.value))}
                      className="w-14 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-center font-bold focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCreatingInTarget(null)} title="Cancel" aria-label="Cancel" className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-md">Cancel</button>
                    <button onClick={() => handleCreateTaskInline("backlog")} title={isRtl ? "إضافة مهمة" : "Add task"} aria-label={isRtl ? "إضافة مهمة" : "Add task"} className="px-3 py-1 bg-brand hover:bg-brand text-white font-bold text-xs rounded-md shadow-sm">{isRtl ? "إضافة" : "Add"}</button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setCreatingInTarget("backlog"); setNewTaskTitle(""); setNewTaskPoints(3); }}
                className="w-full py-2.5 border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-brand-light/50 rounded-xl text-slate-500 hover:text-brand font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" /> Add Backlog Item
              </button>
            )}
          </div>
        </div>

        {/* Right Pane: Sprints */}
        <div className="w-2/3 flex flex-col bg-white overflow-y-auto custom-scrollbar">
          <div className="p-6 max-w-4xl mx-auto w-full space-y-8">
            
            {/* Active Sprint Section */}
            {activeSprint && (
              <div 
                className={`bg-white rounded-2xl border-2 transition-all shadow-md overflow-hidden ${dragOverId === activeSprint.ID ? 'border-emerald-500 ring-4 ring-emerald-500/10 bg-emerald-50/20' : 'border-emerald-200'}`}
                onDragOver={(e) => handleDragOver(e, activeSprint.ID)}
                onDrop={(e) => handleDrop(e, activeSprint.ID)}
              >
                <div className="flex justify-between items-center p-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border-b border-emerald-200">
                  <div className="flex items-center space-x-3">
                    <div className="bg-emerald-500 p-2 rounded-xl shadow-md">
                      <Play className="w-4 h-4 text-white fill-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-slate-900 text-base">{activeSprint.Name}</h3>
                        <span className="text-[10px] font-black bg-emerald-500 text-white px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm animate-pulse">{isRtl ? "الدورة النشطة" : "Active Cycle"}</span>
                      </div>
                      <p className="text-xs font-medium text-slate-500 mt-0.5">{activeSprint.Goal || "Delivering core increments and customer value"}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs font-bold border-emerald-300 text-emerald-800 hover:bg-emerald-100 shadow-sm">{isRtl ? "إنهاء السبرنت" : "Complete Sprint"}</Button>
                </div>
                
                {/* Capacity & Progress Bar */}
                {renderCapacityBar(tasks.filter(t => t.SprintID === activeSprint.ID), 30)}

                <div className="bg-slate-50/50 min-h-[140px] p-4 space-y-2.5">
                  {tasks.filter(t => t.SprintID === activeSprint.ID).filter(filterTask).length === 0 ? (
                    <div className="text-center p-8 text-slate-400 text-sm bg-white rounded-xl border border-dashed border-slate-200 m-2">{isRtl ? "لا مهام نشطة تطابق الفلاتر." : "No active tasks match your filters."}</div>
                  ) : (
                    tasks.filter(t => t.SprintID === activeSprint.ID).filter(filterTask).map(task => renderTaskCard(task))
                  )}

                  {/* Inline Creation inside Active Sprint */}
                  {creatingInTarget === activeSprint.ID ? (
                    <div className="bg-white border-2 border-emerald-400 rounded-xl p-3 shadow-md space-y-2">
                      <input
                        type="text"
                        autoFocus
                        title={isRtl ? "عنوان مهمة السبرنت" : "New sprint task title"}
                        aria-label={isRtl ? "عنوان مهمة السبرنت" : "New sprint task title"}
                        placeholder={isRtl ? "عنوان مهمة للسبرنت النشط..." : "Task title for active sprint..."}
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateTaskInline(activeSprint.ID);
                          if (e.key === "Escape") setCreatingInTarget(null);
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-500">Points:</span>
                          <input type="number" title="Points" aria-label="Points" value={newTaskPoints} onChange={(e) => setNewTaskPoints(Number(e.target.value))} className="w-14 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-center font-bold" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setCreatingInTarget(null)} className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-md">Cancel</button>
                          <button onClick={() => handleCreateTaskInline(activeSprint.ID)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-md">Add to Sprint</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setCreatingInTarget(activeSprint.ID); setNewTaskTitle(""); setNewTaskPoints(3); }}
                      className="w-full py-2 border border-dashed border-emerald-300 hover:border-emerald-500 hover:bg-emerald-50/50 rounded-xl text-emerald-700 font-bold text-xs flex items-center justify-center gap-1 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" /> {isRtl ? "إضافة مهمة للسبرنت النشط" : "Add Task to Active Sprint"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Planning Sprints */}
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider px-1">{isRtl ? "دورات العمل القادمة" : "Upcoming Work Cycles"}</h3>
              
              {planningSprints.map(sprint => (
                <div 
                  key={sprint.ID} 
                  className={`bg-white rounded-2xl border-2 transition-all shadow-sm overflow-hidden relative ${dragOverId === sprint.ID ? 'border-brand ring-4 ring-brand/10 bg-brand-light/20' : 'border-slate-200/80 hover:border-slate-300'}`}
                  onDragOver={(e) => handleDragOver(e, sprint.ID)}
                  onDrop={(e) => handleDrop(e, sprint.ID)}
                >
                  <div className="flex justify-between items-center p-4 bg-slate-50/80 border-b border-slate-200">
                    {editingSprintId === sprint.ID ? (
                      <div className="flex items-center gap-2 flex-1 me-4">
                        <input
                          type="text"
                          title={isRtl ? "اسم السبرنت" : "Sprint name"}
                          aria-label={isRtl ? "اسم السبرنت" : "Sprint name"}
                          value={sprintEditName}
                          onChange={(e) => setSprintEditName(e.target.value)}
                          className="bg-white border border-indigo-400 rounded px-2 py-1 text-sm font-bold text-slate-800 focus:outline-none w-48"
                        />
                        <input
                          type="text"
                          title={isRtl ? "هدف السبرنت" : "Sprint goal"}
                          aria-label={isRtl ? "هدف السبرنت" : "Sprint goal"}
                          placeholder={isRtl ? "هدف السبرنت..." : "Sprint Goal..."}
                          value={sprintEditGoal}
                          onChange={(e) => setSprintEditGoal(e.target.value)}
                          className="bg-white border border-slate-300 rounded px-2 py-1 text-xs text-slate-600 focus:outline-none flex-1"
                        />
                        <button onClick={() => handleSuggestGoal(sprint)} title="AI Suggest Goal" aria-label="AI Suggest Goal" className="p-1.5 bg-brand-light text-brand rounded hover:bg-purple-200 flex items-center gap-1 text-[11px] font-bold">
                          <Wand2 className="w-3.5 h-3.5" /> AI Suggest
                        </button>
                        <button onClick={() => handleUpdateSprint(sprint.ID)} title="Save sprint details" aria-label="Save sprint details" className="p-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingSprintId(null)} title="Cancel editing sprint" aria-label="Cancel editing sprint" className="p-1.5 bg-slate-200 text-slate-600 rounded hover:bg-slate-300"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-3">
                        <div className="bg-brand-light p-2 rounded-xl text-brand">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-slate-800 text-base">{sprint.Name}</h3>
                            <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full shadow-2xs">
                              {tasks.filter(t => t.SprintID === sprint.ID).length} tasks
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-500 mt-0.5">{sprint.Goal || "Planned feature iterations"}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleStartSprint(sprint.ID)} className="bg-brand hover:bg-brand text-white font-bold text-xs shadow-sm">
                        {isRtl ? "بدء السبرنت" : "Start Sprint"}
                      </Button>

                      {/* Sprint Settings Dropdown */}
                      <div className="relative">
                        <button 
                          onClick={() => setActiveMenuId(activeMenuId === sprint.ID ? null : sprint.ID)}
                          title={isRtl ? "خيارات السبرنت" : "Sprint options"}
                          aria-label={isRtl ? "خيارات السبرنت" : "Sprint options"}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        {activeMenuId === sprint.ID && (
                          <div className="absolute end-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg p-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                            <button
                              onClick={() => {
                                setEditingSprintId(sprint.ID);
                                setSprintEditName(sprint.Name);
                                setSprintEditGoal(sprint.Goal || "");
                                setActiveMenuId(null);
                              }}
                              className="w-full text-start px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-slate-400" /> Edit & AI Goal
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm(`Delete ${sprint.Name}? Tasks will move back to backlog.`)) {
                                  await apiDelete(`/sprints/${sprint.ID}`);
                                  setActiveMenuId(null);
                                  fetchSprintsAndTasks();
                                }
                              }}
                              className="w-full text-start px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" /> Delete Sprint
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Capacity Bar */}
                  {renderCapacityBar(tasks.filter(t => t.SprintID === sprint.ID), 30)}

                  <div className="bg-slate-50/30 min-h-[120px] p-4 space-y-2.5">
                    {tasks.filter(t => t.SprintID === sprint.ID).filter(filterTask).length === 0 ? (
                      <div className="text-center p-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 m-2 rounded-2xl bg-white/60">
                        Drag tasks from the backlog or click below to plan this sprint.
                      </div>
                    ) : (
                      tasks.filter(t => t.SprintID === sprint.ID).filter(filterTask).map(task => renderTaskCard(task))
                    )}

                    {/* Inline Creation inside Planning Sprint */}
                    {creatingInTarget === sprint.ID ? (
                      <div className="bg-white border-2 border-indigo-400 rounded-xl p-3 shadow-md space-y-2">
                        <input
                          type="text"
                          autoFocus
                          title={isRtl ? "عنوان مهمة السبرنت" : "New sprint task title"}
                          aria-label={isRtl ? "عنوان مهمة السبرنت" : "New sprint task title"}
                          placeholder={isRtl ? "عنوان المهمة..." : "Task title..."}
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateTaskInline(sprint.ID);
                            if (e.key === "Escape") setCreatingInTarget(null);
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                        <div className="flex items-center justify-between pt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-500">Points:</span>
                            <input type="number" title="Points" aria-label="Points" value={newTaskPoints} onChange={(e) => setNewTaskPoints(Number(e.target.value))} className="w-14 bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-center font-bold" />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setCreatingInTarget(null)} className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 rounded-md">Cancel</button>
                            <button onClick={() => handleCreateTaskInline(sprint.ID)} className="px-3 py-1 bg-brand hover:bg-brand text-white font-bold text-xs rounded-md">Add to Sprint</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setCreatingInTarget(sprint.ID); setNewTaskTitle(""); setNewTaskPoints(3); }}
                        className="w-full py-2 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-brand-light/50 rounded-xl text-slate-500 hover:text-brand font-bold text-xs flex items-center justify-center gap-1 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> {isRtl ? `إضافة مهمة إلى ${sprint.Name}` : `Add Task to ${sprint.Name}`}
                      </button>
                    )}
                  </div>
                </div>
              ))}

            </div>

          </div>
        </div>
      </div>

      {/* Task Details Panel */}
      <TaskDetailsPanel task={selectedTask as unknown as import("@/types").Task} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}
