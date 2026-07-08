import React, { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskCard from "./TaskCard";
import NewTaskModal from "./NewTaskModal";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { useAppStore } from "@/store/useAppStore";
import { apiGet, apiPost } from "@/lib/apiClient";
import { Task } from "@/types";

export default function KanbanBoard() {
  const { tasks, setTasks, projectId, setProjectId } = useAppStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sprints, setSprints] = useState<any[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Constants for our columns based on backend State Machine
  const columns = [
    { id: "todo", title: "To Do" },
    { id: "in_progress", title: "In Progress" },
    { id: "review", title: "Review" },
    { id: "done", title: "Done" },
  ];

  const fetchTasksAndSprints = async (pid: string) => {
    try {
      const [tasksData, sprintsData] = await Promise.all([
        apiGet<{tasks: Task[]}>(`/tasks?project_id=${pid}`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apiGet<any[]>(`/sprints?project_id=${pid}`)
      ]);
      
      setTasks(tasksData.tasks || []);
      setSprints(sprintsData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const fetchOrCreateProject = async () => {
      try {
        // Try fetching first project
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = await apiGet<any[]>("/projects");
          if (data && data.length > 0) {
            setProjectId(data[0].ID);
            fetchTasksAndSprints(data[0].ID);
            return;
          }
        } catch (e) {
          console.warn("Failed to fetch projects, will create default", e);
        }

        // If no project, create a default one
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newProj = await apiPost<any>("/projects", { name: "Default Project", settings: {} });
        setProjectId(newProj.ID);
        fetchTasksAndSprints(newProj.ID);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrCreateProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setProjectId, setTasks]);

  const handleTransition = async (taskId: string, newStatus: string) => {
    try {
      await apiPost(`/tasks/${taskId}/transition`, { status: newStatus });
      // The local state update happens before this API call via onDragEnd
    } catch (err) {
      console.error("Transition error", err);
      alert(`Transition failed: ${err instanceof Error ? err.message : String(err)}`);
      // Re-fetch to revert optimistic update
      fetchTasksAndSprints(projectId);
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    // Optimistically update the UI in global store
    const newStatus = destination.droppableId;
    setTasks((prevTasks: Task[]) => prevTasks.map((t: Task) => t.ID === draggableId ? { ...t, Status: newStatus } : t));

    // Send API request
    handleTransition(draggableId, newStatus);
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-slate-400">Loading Kanban Board...</div>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeSprint = sprints.find((s) => s.Status === "active") as any;
  const sprintTasks = activeSprint ? tasks.filter((t) => t.SprintID === activeSprint.ID) : [];

  const selectedTask = tasks.find(t => t.ID === selectedTaskId);

  return (
    <div className="flex-1 flex flex-col h-full bg-white text-slate-900 overflow-hidden relative">
      {/* Kanban Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex flex-col space-y-1">
          <h2 className="text-xl font-bold text-gray-800">Board</h2>
          {activeSprint ? (
             <span className="text-sm font-medium text-slate-500">Active Sprint: {activeSprint.Name}</span>
          ) : (
             <span className="text-sm font-medium text-amber-600">No active sprint. Please start a sprint from the Backlog view.</span>
          )}
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> New Task
        </Button>
      </div>

      {/* Board Area */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
          <div className="flex h-full items-start space-x-6 min-w-max">
            {columns.map((col) => {
              const columnTasks = sprintTasks.filter((t) => t.Status === col.id);
              return (
                <div key={col.id} className="w-80 flex flex-col h-full max-h-full bg-[#f8fafc]/50 rounded-xl border border-slate-100">
                  <div className="flex items-center justify-between mb-2 px-3 py-3 border-b border-slate-100">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        col.id === 'todo' ? 'bg-slate-400' :
                        col.id === 'in_progress' ? 'bg-[#dfb2e5]' :
                        col.id === 'review' ? 'bg-amber-400' : 'bg-emerald-400'
                      }`} />
                      {col.title}
                    </h3>
                    <span className="text-xs font-semibold bg-slate-100 text-slate-500 py-1 px-2 rounded-full">
                      {columnTasks.length}
                    </span>
                  </div>
                  
                  {/* Column Content */}
                  <Droppable droppableId={col.id}>
                    {(provided, snapshot) => (
                      <div 
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`flex-1 overflow-y-auto px-2 custom-scrollbar pb-4 transition-colors ${snapshot.isDraggingOver ? 'bg-slate-100/80 rounded-b-xl' : ''}`}
                      >
                        {columnTasks.length === 0 && !snapshot.isDraggingOver ? (
                          <div className="h-24 border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-sm text-slate-400">
                            No tasks
                          </div>
                        ) : (
                          columnTasks.map((task, index) => (
                            <div key={task.ID} onClick={() => setSelectedTaskId(task.ID)}>
                              <TaskCard task={task} index={index} onTransition={handleTransition} />
                            </div>
                          ))
                        )}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </div>
      </DragDropContext>

      {/* Task Details Right Panel (Slide Over) */}
      {selectedTask && (
        <div className="absolute top-0 end-0 h-full w-[400px] bg-white shadow-2xl border-s border-slate-200 z-50 flex flex-col animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-slate-400">TASK-{selectedTask.ID.substring(0,4)}</span>
            </div>
            <button 
              onClick={() => setSelectedTaskId(null)}
              className="p-2 hover:bg-slate-100 rounded-md text-slate-500 transition-colors"
              title="Close Task"
              aria-label="Close Task"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.8536 2.85355C13.0488 2.65829 13.0488 2.34171 12.8536 2.14645C12.6583 1.95118 12.3417 1.95118 12.1464 2.14645L7.5 6.79289L2.85355 2.14645C2.65829 1.95118 2.34171 1.95118 2.14645 2.14645C1.95118 2.34171 1.95118 2.65829 2.14645 2.85355L6.79289 7.5L2.14645 12.1464C1.95118 12.3417 1.95118 12.6583 2.14645 12.8536C2.34171 13.0488 2.65829 13.0488 2.85355 12.8536L7.5 8.20711L12.1464 12.8536C12.3417 13.0488 12.6583 13.0488 12.8536 12.8536C13.0488 12.6583 13.0488 12.3417 12.8536 12.1464L8.20711 7.5L12.8536 2.85355Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
              </svg>
            </button>
          </div>
          <div className="p-6 overflow-y-auto flex-1">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 leading-tight">{selectedTask.Title}</h2>
            
            <div className="space-y-6">
              {/* Properties */}
              <div className="grid grid-cols-3 gap-y-4 text-sm">
                <div className="text-slate-500">Status</div>
                <div className="col-span-2">
                  <span className="px-2 py-1 bg-slate-100 rounded-md font-medium text-slate-700 capitalize">
                    {selectedTask.Status.replace('_', ' ')}
                  </span>
                </div>
                
                <div className="text-slate-500">Assignee</div>
                <div className="col-span-2 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                    UN
                  </div>
                  <span className="text-slate-700 font-medium">Unassigned</span>
                </div>

                <div className="text-slate-500">Priority</div>
                <div className="col-span-2">
                  {selectedTask.Priority > 0 ? (
                    <span className="text-red-600 font-medium flex items-center gap-1">
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.5 1V14M7.5 1L3.5 5M7.5 1L11.5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      High
                    </span>
                  ) : (
                    <span className="text-slate-500 flex items-center gap-1">
                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 7.5H13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      Normal
                    </span>
                  )}
                </div>
              </div>

              <div className="w-full h-px bg-slate-100" />

              {/* Description */}
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">Description</h3>
                <p className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedTask.Description || "No description provided."}
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-slate-100 bg-[#f8fafc]">
            <button className="w-full py-2 bg-brand text-white rounded-md font-medium hover:bg-brand transition-colors">
              Save Changes
            </button>
          </div>
        </div>
      )}
      
      <NewTaskModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        projectId={projectId} 
        onTaskCreated={() => fetchTasksAndSprints(projectId)} 
      />
    </div>
  );
}
