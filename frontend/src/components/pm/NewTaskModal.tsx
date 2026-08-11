import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { apiPost } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Plus } from "lucide-react";

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
  projectId: string;
}

export default function NewTaskModal({ isOpen, onClose, onTaskCreated, projectId }: NewTaskModalProps) {
  const { t } = useLocalization();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(0);
  const [storyPoints, setStoryPoints] = useState<number | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    setErrorMessage("");
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
      setErrorMessage(t("pm.newTask.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="size-5 text-brand" />{t("pm.newTask.title")}</DialogTitle>
          <DialogDescription>{t("pm.newTask.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {errorMessage ? <Alert tone="danger"><AlertDescription>{errorMessage}</AlertDescription></Alert> : null}
          <FormField label={t("pm.newTask.taskTitle")} htmlFor="new-task-title" required>
            <Input
              id="new-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("pm.newTask.titlePlaceholder")}
              required
            />
          </FormField>
          <FormField label={t("pm.newTask.taskDescription")} htmlFor="new-task-description">
            <Textarea
              id="new-task-description"
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
              placeholder={t("pm.newTask.descriptionPlaceholder")}
              className="min-h-[100px]"
            />
          </FormField>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-foreground">{t("pm.newTask.priority")}</legend>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={priority === p ? "default" : "outline"}
                  onClick={() => setPriority(p)}
                  className="flex-1"
                  aria-pressed={priority === p}
                >
                  P{p}
                </Button>
              ))}
            </div>
          </fieldset>
          <FormField label={t("pm.newTask.storyPoints")} htmlFor="new-task-points" hint={t("pm.newTask.storyPointsHint")}>
            <Input
              id="new-task-points"
              type="number"
              min={0}
              value={storyPoints}
              onChange={(e) => setStoryPoints(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder={t("pm.newTask.pointsPlaceholder")}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim()}>
              {isSubmitting ? t("pm.newTask.creating") : t("pm.newTask.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
