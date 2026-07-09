import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { apiPost } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocalization } from "@/contexts/LocalizationContext";

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
  projectId: string;
}

export default function NewTaskModal({ isOpen, onClose, onTaskCreated, projectId }: NewTaskModalProps) {
  const { isRtl } = useLocalization();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(0);
  const [storyPoints, setStoryPoints] = useState<number | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await apiPost("/tasks", {
        project_id: projectId,
        title,
        description,
        priority: Number(priority),
        story_points: storyPoints === "" ? 0 : Number(storyPoints)
      });

      setTitle("");
      setDescription("");
      setPriority(0);
      setStoryPoints("");
      onTaskCreated();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white border border-slate-200 text-slate-900 sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isRtl ? "إنشاء مهمة جديدة" : "Create New Task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">{isRtl ? "العنوان" : "Title"}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isRtl ? "مثال: تنفيذ مصادقة المستخدم" : "e.g. Implement user authentication"}
              className="bg-white border-slate-200 focus-visible:ring-primary"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">{isRtl ? "الوصف" : "Description"}</label>
            <Textarea
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
              placeholder={isRtl ? "أضف تفاصيل عن هذه المهمة..." : "Add details about this task..."}
              className="bg-white border-slate-200 focus-visible:ring-primary min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">{isRtl ? "الأولوية" : "Priority"}</label>
            <div className="flex space-x-2">
              {[0, 1, 2, 3].map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={priority === p ? "default" : "outline"}
                  onClick={() => setPriority(p)}
                  className={`flex-1 ${priority !== p ? "bg-transparent border-slate-200 text-slate-500 hover:text-slate-900" : ""}`}
                >
                  P{p}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">{isRtl ? "نقاط الجهد" : "Story Points"}</label>
            <Input
              type="number"
              value={storyPoints}
              onChange={(e) => setStoryPoints(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={isRtl ? "مثال: 5" : "e.g. 5"}
              className="bg-white border-slate-200 focus-visible:ring-primary"
            />
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {isRtl ? "إلغاء" : "Cancel"}
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? (isRtl ? "جارِ الإنشاء..." : "Creating...") : (isRtl ? "إنشاء المهمة" : "Create Task")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
