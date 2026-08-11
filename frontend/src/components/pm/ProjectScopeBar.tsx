"use client";

import { useEffect, useState } from "react";
import { FolderKanban, Loader2, Plus } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useLocalization } from "@/contexts/LocalizationContext";
import { apiPost } from "@/lib/apiClient";
import { getProjects } from "@/lib/pm";
import { useAppStore } from "@/store/useAppStore";
import type { Project } from "@/types";

const projectStorageKey = "septimus_pm_project_id";

export default function ProjectScopeBar() {
  const { t } = useLocalization();
  const { projectId, setProjectId } = useAppStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const loaded = await getProjects();
        if (!active) return;
        setProjects(loaded);
        const stored = window.localStorage.getItem(projectStorageKey) || "";
        const candidate = projectId || stored;
        const selected = loaded.some((project) => project.ID === candidate)
          ? candidate
          : loaded[0]?.ID || "";
        setProjectId(selected);
        if (selected) window.localStorage.setItem(projectStorageKey, selected);
        else window.localStorage.removeItem(projectStorageKey);
        setError("");
      } catch (loadError) {
        console.error(loadError);
        if (active) setError(t("pm.projectScope.loadFailed"));
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [projectId, setProjectId, t]);

  const selectProject = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    if (nextProjectId) window.localStorage.setItem(projectStorageKey, nextProjectId);
  };

  const createProject = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    setError("");
    try {
      const project = await apiPost<Project>("/projects", { name: name.trim() });
      setProjects((current) => [project, ...current]);
      selectProject(project.ID);
      setName("");
      setIsDialogOpen(false);
    } catch (createError) {
      console.error(createError);
      setError(t("pm.projectScope.createFailed"));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <div
        data-testid="pm-project-scope"
        className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3 text-foreground sm:px-6"
      >
        <FolderKanban className="size-5 shrink-0 text-brand" aria-hidden />
        <label htmlFor="pm-project-selector" className="text-sm font-semibold">
          {t("pm.projectScope.label")}
        </label>
        <select
          id="pm-project-selector"
          value={projectId}
          onChange={(event) => selectProject(event.target.value)}
          disabled={isLoading || projects.length === 0}
          className="h-9 min-w-52 max-w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm font-medium outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
          aria-label={t("pm.projectScope.select")}
        >
          {projects.length === 0 ? (
            <option value="">{t("pm.projectScope.noProjects")}</option>
          ) : null}
          {projects.map((project) => (
            <option key={project.ID} value={project.ID}>
              {project.Name}
            </option>
          ))}
        </select>
        {isLoading ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="sm:ms-auto"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus data-icon="inline-start" />
          {t("pm.projectScope.newProject")}
        </Button>
        {error ? (
          <Alert tone="danger" className="basis-full">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pm.projectScope.createTitle")}</DialogTitle>
            <DialogDescription>{t("pm.projectScope.createDescription")}</DialogDescription>
          </DialogHeader>
          <FormField label={t("pm.projectScope.projectName")} htmlFor="pm-project-name" required>
            <Input
              id="pm-project-name"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createProject();
              }}
              placeholder={t("pm.projectScope.namePlaceholder")}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isCreating}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={() => void createProject()} disabled={isCreating || !name.trim()}>
              {isCreating ? t("pm.projectScope.creating") : t("pm.projectScope.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
