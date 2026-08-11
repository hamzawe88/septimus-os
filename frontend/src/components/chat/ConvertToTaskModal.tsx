import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ProvenanceSurface } from "@/components/ui/provenance";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, Save, CheckCircle2, Circle, Pin } from "lucide-react";
import { fetchWithAuth, API_BASE_URL, AI_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface ConvertToTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: { text?: string } | null;
  channelId: string;
}

interface ChecklistItem {
  id?: string;
  text: string;
  is_completed: boolean;
}

interface ExtractedTask {
  title?: string;
  description?: string;
  timeline?: { start_date?: string; due_date?: string };
  checklist?: ChecklistItem[];
}

export default function ConvertToTaskModal({ isOpen, onClose, message, channelId }: ConvertToTaskModalProps) {
  const { t, language } = useLocalization();
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [wasExtractedByAi, setWasExtractedByAi] = useState(false);
  const [extractionError, setExtractionError] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  const abortControllerRef = React.useRef<AbortController | null>(null);

  const handleAutoExtract = useCallback(async () => {
    if (!message || !message.text) return;
    
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    setIsExtracting(true);
    setWasExtractedByAi(false);
    setExtractionError(false);
    try {
      const res = await fetchWithAuth(`${AI_BASE_URL}/ai/text-to-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.text, lang: language }),
        signal: abortController.signal
      });
      if (res.ok) {
        const data = (await res.json()) as ExtractedTask;
        setTitle(data.title || "");
        setDescription(data.description || message.text.substring(0, 100));
        setStartDate(data.timeline?.start_date?.split("T")[0] || "");
        setDueDate(data.timeline?.due_date?.split("T")[0] || "");
        setChecklist(data.checklist || []);
        setWasExtractedByAi(true);
      } else {
        setExtractionError(true);
        if (!title) setTitle(message.text.split("\n")[0].slice(0, 80));
        if (!description) setDescription(message.text);
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error(error);
      setExtractionError(true);
      if (!title) setTitle(message.text.split("\n")[0].slice(0, 80));
      if (!description) setDescription(message.text);
    } finally {
      if (abortControllerRef.current === abortController) {
        setIsExtracting(false);
      }
    }
  // The fallback reads the current form values; adding them here would
  // retrigger extraction whenever the AI fills a field.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, language]);

  const cancelExtraction = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsExtracting(false);
    }
  };

  useEffect(() => {
    if (isOpen && message) {
      // Auto-extract when modal opens
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleAutoExtract();
    }
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [isOpen, message, handleAutoExtract]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        title,
        description,
        timeline: {
          start_date: startDate ? new Date(startDate).toISOString() : null,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          progress_percentage: 0
        },
        checklist
      };
      
      const res = await fetchWithAuth(`${API_BASE_URL}/channels/${channelId}/pinned_tasks`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        // Success
        onClose();
      } else {
        console.error("Failed to save pinned task");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleChecklist = (index: number) => {
    const newChecklist = [...checklist];
    newChecklist[index].is_completed = !newChecklist[index].is_completed;
    setChecklist(newChecklist);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[95vw] max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <Pin className="size-5 text-brand" aria-hidden />
            {t('chat.pinAsTask')}
          </DialogTitle>
          <DialogDescription>
            {isExtracting ? (
               <span className="flex flex-wrap items-center gap-2">
                 <span className="flex animate-pulse items-center gap-2 text-brand">
                   <Sparkles className="size-4" aria-hidden /> {t('chat.taskExtracting')}
                 </span>
                 <Button type="button" variant="link" size="xs" onClick={cancelExtraction}>
                   {t("chat.stopExtraction")}
                 </Button>
               </span>
            ) : (
               t('chat.convertTaskDescription')
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {wasExtractedByAi ? (
            <ProvenanceSurface level="assumption" className="p-3">
              {t("chat.aiExtractionProvenance")}
            </ProvenanceSurface>
          ) : null}
          {extractionError ? (
            <Alert tone="warning">
              <AlertDescription>{t("chat.extractionFallback")}</AlertDescription>
            </Alert>
          ) : null}
          <FormField label={t('chat.taskTitle')} htmlFor="converted-task-title" required>
            <Input 
              id="converted-task-title"
              value={title} 
              onChange={e => setTitle(e.target.value)} 
            />
          </FormField>
          <FormField label={t('chat.taskDescription')} htmlFor="converted-task-description">
            <Textarea
              id="converted-task-description"
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              className="min-h-24"
            />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t('chat.taskStartDate')} htmlFor="converted-task-start">
              <Input 
                id="converted-task-start"
                type="date"
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
              />
            </FormField>
            <FormField label={t('chat.taskDueDate')} htmlFor="converted-task-due">
              <Input 
                id="converted-task-due"
                type="date"
                value={dueDate} 
                onChange={e => setDueDate(e.target.value)} 
              />
            </FormField>
          </div>
          
          {checklist.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-foreground">{t('chat.taskChecklist')}</legend>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {checklist.map((item, idx) => (
                  <button type="button" key={item.id || idx} className="flex w-full items-center gap-2 rounded-[var(--radius-control)] p-2 text-start hover:bg-muted" onClick={() => toggleChecklist(idx)}>
                    {item.is_completed ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
                    <span className="text-sm">{item.text}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button 
            onClick={handleSave} 
            disabled={isExtracting || isSaving || !title.trim()}
          >
            <Save className="size-4" />
            {isSaving ? t("common.saving") : t('chat.saveTask')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
