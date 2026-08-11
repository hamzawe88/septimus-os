import React, { useState, useEffect } from "react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { 
  CheckCircle2, 
  Circle, 
  Clock, 
  ChevronDown, 
  ChevronUp, 
  Trash2, 
  Pencil,
  Check,
  X,
  Pin
} from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tag } from "@/components/ui/tag";
import { motion, AnimatePresence } from "framer-motion";
import EditPinnedTaskModal from "./EditPinnedTaskModal";

/* eslint-disable react-hooks/set-state-in-effect */

interface PinnedTaskBannerProps {
  channelId: string;
}

interface ChecklistItem {
  id: string;
  text: string;
  is_completed: boolean;
}

interface TaskData {
  title: string;
  description: string;
  timeline: {
    start_date: string | null;
    due_date: string | null;
    progress_percentage: number;
  };
  checklist: ChecklistItem[];
}

interface PinnedTask {
  id: string;
  data: TaskData;
}

export default function PinnedTasksBanner({ channelId }: PinnedTaskBannerProps) {
  const { t, language } = useLocalization();
  const [tasks, setTasks] = useState<PinnedTask[]>([]);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<PinnedTask | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchTasks = React.useCallback(async () => {
    if (!channelId) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/channels/${channelId}/pinned_tasks`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch pinned tasks", err);
    }
  }, [channelId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const handleRefresh = (e: Event) => {
      const detail = (e as CustomEvent<{ channelId?: string }>).detail;
      if (detail?.channelId === channelId) {
        fetchTasks();
      }
    };
    window.addEventListener('refresh_pinned_tasks', handleRefresh);
    return () => window.removeEventListener('refresh_pinned_tasks', handleRefresh);
  }, [channelId, fetchTasks]);

  const toggleChecklist = async (task: PinnedTask, index: number) => {
    const updatedChecklist = [...task.data.checklist];
    updatedChecklist[index].is_completed = !updatedChecklist[index].is_completed;
    
    const completedCount = updatedChecklist.filter(item => item.is_completed).length;
    const progress = updatedChecklist.length > 0
      ? Math.round((completedCount / updatedChecklist.length) * 100)
      : 0;

    const payload = {
      ...task.data,
      checklist: updatedChecklist,
      timeline: {
        ...task.data.timeline,
        progress_percentage: progress
      }
    };

    try {
      await fetchWithAuth(`${API_BASE_URL}/channels/${channelId}/pinned_tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      // The NATS broadcast will trigger a refresh for all clients, including us
    } catch (err) {
      console.error("Failed to update task", err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await fetchWithAuth(`${API_BASE_URL}/channels/${channelId}/pinned_tasks/${taskId}`, {
        method: "DELETE",
      });
      // The NATS broadcast will trigger a refresh
      setConfirmDeleteId(null);
    } catch (err) {
      console.error("Failed to delete task", err);
    }
  };

  if (tasks.length === 0) return null;

  return (
    <section className="z-10 w-full border-b border-border bg-surface-subtle px-4 py-3 shadow-sm" aria-label={t("chat.pinnedTasks")}>
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
        <Pin className="size-4 text-brand" aria-hidden />
        {t('chat.pinnedTasks')}
      </div>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex w-max gap-4 p-1 pb-4">
          <AnimatePresence mode="popLayout">
          {tasks.map((task) => {
            const data = task.data || {};
            const progress = data.timeline?.progress_percentage || 0;
            const isExpanded = expandedTaskId === task.id;
            const hasDetails = (data.description && data.description.trim().length > 0) || (data.checklist && data.checklist.length > 0);

            return (
              <motion.div 
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={task.id} 
                className={`group/task flex-none overflow-hidden whitespace-normal rounded-[var(--radius-surface)] border bg-card text-card-foreground shadow-[var(--shadow-raised)] transition-colors hover:shadow-[var(--shadow-overlay)] ${progress === 100 ? 'border-success' : 'border-border'}`}
                style={{ width: isExpanded ? '320px' : '260px' }}
              >
                <div className="flex min-h-[44px] items-center justify-between gap-3 px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <h3 className="truncate text-xs font-semibold text-foreground" title={data.title}>{data.title}</h3>
                    {!isExpanded && progress > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <Progress value={progress} className="h-1 flex-1" aria-label={t("chat.taskProgress")} />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditingTask(task); }} 
                      className="rounded-[var(--radius-control)] p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-brand focus:opacity-100 group-hover/task:opacity-100"
                      title={t('common.edit')}
                      aria-label={t("chat.editPinnedTask")}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    {confirmDeleteId === task.id ? (
                      <div className="flex items-center gap-1 rounded-[var(--radius-control)] bg-destructive/10 px-2 py-1 opacity-0 transition-all group-hover/task:opacity-100">
                        <span className="me-1 text-[10px] font-bold uppercase text-destructive">{t('common.confirm')}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }} 
                          className="rounded p-1 text-destructive transition-colors hover:bg-destructive/15"
                          aria-label={t("chat.confirmDeleteTask")}
                        >
                          <Check className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }} 
                          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted"
                          aria-label={t("common.cancel")}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(task.id); }} 
                        className="rounded-[var(--radius-control)] p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover/task:opacity-100"
                        title={t('common.delete')}
                        aria-label={t("chat.deletePinnedTask")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                    {hasDetails && (
                      <button
                        type="button"
                        className="rounded-[var(--radius-control)] bg-muted p-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? t("chat.collapseTask") : t("chat.expandTask")}
                      >
                        {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </button>
                    )}
                  </div>
                </div>

                <AnimatePresence>
                {hasDetails && isExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden border-t border-border px-3"
                  >
                    <div className="pt-3 pb-3">
                    {data.timeline?.due_date && (
                      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        <time dateTime={data.timeline.due_date}>{new Date(data.timeline.due_date).toLocaleDateString(language === "ar" ? "ar-SA-u-nu-latn" : "en-US")}</time>
                      </div>
                    )}
                    {data.description && (
                      <p className="mb-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{data.description}</p>
                    )}
                    {data.checklist && data.checklist.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('chat.subTasks')}</div>
                        {data.checklist.map((item: ChecklistItem, idx: number) => (
                          <button
                            type="button"
                            key={idx} 
                            className="group -mx-1.5 flex w-[calc(100%+0.75rem)] items-start gap-2 rounded-[var(--radius-control)] p-1.5 text-start transition-colors hover:bg-muted"
                            onClick={(e) => { e.stopPropagation(); toggleChecklist(task, idx); }}
                          >
                            <div className="mt-0.5 shrink-0 transition-colors">
                              {item.is_completed ? (
                                <CheckCircle2 className="size-4 text-success" />
                              ) : (
                                <Circle className="size-4 text-muted-foreground group-hover:text-brand" />
                              )}
                            </div>
                            <span className={`text-xs leading-snug ${item.is_completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                              {item.text}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {isExpanded && progress >= 0 && (
                      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                        <Tag tone={progress === 100 ? "success" : "neutral"}>{progress}%</Tag>
                        <Progress value={progress} className="h-1.5 flex-1" aria-label={t("chat.taskProgress")} />
                      </div>
                    )}
                    </div>
                  </motion.div>
                )}
                </AnimatePresence>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <EditPinnedTaskModal 
        isOpen={!!editingTask} 
        onClose={() => setEditingTask(null)} 
        channelId={channelId} 
        task={editingTask} 
      />
    </section>
  );
}
