"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, X, Zap, Loader2 } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { apiGet, apiPost } from "@/lib/apiClient";
import type { Project } from "@/types";

interface EntityCreatorModalProps {
  onClose: () => void;
}

export default function EntityCreatorModal({ onClose }: EntityCreatorModalProps) {
  const { t } = useLocalization();
  const [entityType, setEntityType] = useState("task");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    void apiGet<Project[]>("/projects")
      .then((items) => {
        if (!active) return;
        const available = Array.isArray(items) ? items : [];
        setProjects(available);
        setProjectId((current) => current || available[0]?.ID || "");
      })
      .catch(() => {
        if (active) setProjects([]);
      });
    return () => {
      active = false;
    };
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      if (entityType === "task") {
        if (!projectId) throw new Error("project required");
        const priorities = { low: 1, medium: 2, high: 3 } as const;
        await apiPost("/tasks", {
          project_id: projectId,
          title: title.trim(),
          priority: priorities[priority as keyof typeof priorities],
          story_points: 0,
        });
      } else {
        await apiPost("/entities", {
          entity_type: entityType,
          data: { title: title.trim() },
        });
      }
      onClose();
    } catch {
      setErrorMessage(t("entityModal.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-content">
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="modal-icon-bg">
              <Zap className="w-5 h-5 text-yellow-500" aria-hidden />
            </div>
            <h2 id="modal-title" className="modal-title">{t("entityModal.title")}</h2>
          </div>
          <button onClick={onClose} className="modal-close-btn" aria-label={t("entityModal.close")}>
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {errorMessage && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="size-4 shrink-0" aria-hidden />
              <span>{errorMessage}</span>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">{t("entityModal.entityType")}</label>
            <select 
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="modal-input"
              title={t("entityModal.entityType")}
              aria-label={t("entityModal.entityType")}
            >
              <option value="task">{t("entityModal.types.task")}</option>
              <option value="document">{t("entityModal.types.document")}</option>
              <option value="meeting">{t("entityModal.types.meeting")}</option>
              <option value="issue">{t("entityModal.types.issue")}</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">{t("entityModal.recordTitle")}</label>
            <input
              type="text"
              required
              maxLength={500}
              placeholder={t("entityModal.recordTitlePlaceholder")}
              className="modal-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {entityType === "task" && (
            <>
              <div className="form-group">
                <label className="form-label">{t("entityModal.project")}</label>
                <select
                  className="modal-input"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  aria-label={t("entityModal.project")}
                  required
                >
                  <option value="">{t("entityModal.selectProject")}</option>
                  {projects.map((project) => (
                    <option key={project.ID} value={project.ID}>{project.Name}</option>
                  ))}
                </select>
                {projects.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{t("entityModal.noProjects")}</p>
                ) : null}
              </div>
              <div className="form-group">
                <label className="form-label">{t("entityModal.priority")}</label>
                <select
                  className="modal-input"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  title={t("entityModal.priority")}
                  aria-label={t("entityModal.priority")}
                >
                  <option value="high">{t("entityModal.priorities.high")}</option>
                  <option value="medium">{t("entityModal.priorities.medium")}</option>
                  <option value="low">{t("entityModal.priorities.low")}</option>
                </select>
              </div>
            </>
          )}

          <div className="modal-footer">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {t("entityModal.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || (entityType === "task" && !projectId)} className="modal-submit-btn">
              {isSubmitting ? <Loader2 className="w-4 h-4 me-2 animate-spin" aria-hidden /> : <Zap className="w-4 h-4 me-2" aria-hidden />}
              {isSubmitting ? t("entityModal.creating") : t("entityModal.create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
