"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { Save, Plus, X, Pencil, ListChecks } from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface EditPinnedTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  channelId: string;
  task: PinnedTask | null;
}

interface ChecklistItem {
  id?: string;
  text: string;
  is_completed: boolean;
}

interface PinnedTaskData {
  title: string;
  description: string;
  timeline: { start_date: string | null; due_date: string | null; progress_percentage: number };
  checklist: ChecklistItem[];
}

interface PinnedTask {
  id: string;
  data: PinnedTaskData;
}

export default function EditPinnedTaskModal({ isOpen, onClose, channelId, task }: EditPinnedTaskModalProps) {
  const { t } = useLocalization();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (task && task.data) {
      setTitle(task.data.title || "");
      setDescription(task.data.description || "");
      setStartDate(task.data.timeline?.start_date?.split('T')[0] || "");
      setDueDate(task.data.timeline?.due_date?.split('T')[0] || "");
      setChecklist(task.data.checklist ? [...task.data.checklist] : []);
    }
  }, [task]);

  const handleSave = async () => {
    if (!title.trim() || !channelId || !task) return;
    setIsSaving(true);
    try {
      const payload = {
        ...task.data,
        title,
        description,
        timeline: {
          ...task.data.timeline,
          start_date: startDate ? new Date(startDate).toISOString() : null,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        },
        checklist: checklist
      };

      const res = await fetchWithAuth(`${API_BASE_URL}/channels/${channelId}/pinned_tasks/${task.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        onClose();
      } else {
        console.error("Failed to update task");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const addChecklistItem = () => {
    setChecklist([...checklist, { id: Date.now().toString(), text: "", is_completed: false }]);
  };

  const removeChecklistItem = (index: number) => {
    const newChecklist = [...checklist];
    newChecklist.splice(index, 1);
    setChecklist(newChecklist);
  };

  const updateChecklistItem = (index: number, text: string) => {
    const newChecklist = [...checklist];
    newChecklist[index].text = text;
    setChecklist(newChecklist);
  };

  if (!task) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Pencil className="size-5 text-brand" aria-hidden />
            {t('chat.editPinnedTask')}
          </DialogTitle>
          <DialogDescription>
            {t('chat.editTaskDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormField label={t('chat.taskTitle')} htmlFor="pinned-task-title" required>
            <Input 
              id="pinned-task-title"
              value={title} 
              onChange={e => setTitle(e.target.value)} 
            />
          </FormField>
          <FormField label={t('chat.taskDescription')} htmlFor="pinned-task-description">
            <Textarea
              id="pinned-task-description"
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              className="min-h-24"
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t('chat.taskStartDate')} htmlFor="pinned-task-start">
              <Input 
                id="pinned-task-start"
                type="date"
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
              />
            </FormField>
            <FormField label={t('chat.taskDueDate')} htmlFor="pinned-task-due">
              <Input 
                id="pinned-task-due"
                type="date"
                value={dueDate} 
                onChange={e => setDueDate(e.target.value)} 
              />
            </FormField>
          </div>
          
          <div>
            <div className="mb-2 mt-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t('chat.subTasks')}</h3>
              <Button type="button" variant="ghost" size="sm" onClick={addChecklistItem}>
                <Plus className="size-3.5" />
                {t('common.add')}
              </Button>
            </div>
            {checklist.length > 0 ? (
              <div className="max-h-40 space-y-2 overflow-y-auto p-1">
                {checklist.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center gap-2">
                    <Input 
                      value={item.text} 
                      onChange={e => updateChecklistItem(idx, e.target.value)} 
                      placeholder={t('chat.taskItemPlaceholder')}
                      className="h-8 text-sm"
                      aria-label={`${t('chat.subTask')} ${idx + 1}`}
                    />
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeChecklistItem(idx)}
                      aria-label={t("chat.removeSubTask")}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<ListChecks aria-hidden />}
                title={t('chat.noSubTasks')}
                description={t("chat.noSubTasksDescription")}
                action={<Button type="button" variant="outline" size="sm" onClick={addChecklistItem}><Plus />{t("chat.addSubTask")}</Button>}
                className="min-h-36 py-5"
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving || !title.trim()}
          >
            <Save className="size-4" />
            {isSaving ? t("common.saving") : t('chat.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
