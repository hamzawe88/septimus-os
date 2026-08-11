"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Archive, History, Loader2, RotateCcw, X } from "lucide-react";
import { schemaRequest } from "./schemaApi";
import type {
  EntityDefinition,
  EntitySchemaVersion,
  FieldSchema,
  SchemaActivityItem,
  SchemaActivityResponse,
  SchemaChangeJob,
  SchemaChangeJobsResponse,
  SchemaVersionsResponse,
} from "./types";

interface Props {
  definition: EntityDefinition | null;
  busy: boolean;
  t: (key: string) => string;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onError: (error: unknown) => void;
}

interface FieldComparison {
  key: string;
  before?: FieldSchema;
  after?: FieldSchema;
  kind: "added" | "removed" | "changed" | "unchanged";
}

export default function SchemaGovernanceDialog({
  definition,
  busy,
  t,
  onClose,
  onChanged,
  onError,
}: Props) {
  const [versions, setVersions] = useState<EntitySchemaVersion[]>([]);
  const [jobs, setJobs] = useState<SchemaChangeJob[]>([]);
  const [activity, setActivity] = useState<SchemaActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [fromVersion, setFromVersion] = useState(0);
  const [toVersion, setToVersion] = useState(0);

  const load = useCallback(async () => {
    if (!definition) return;
    setLoading(true);
    try {
      const [versionResponse, jobResponse, activityResponse] = await Promise.all([
        schemaRequest<SchemaVersionsResponse>(
          `/schema-definitions/${definition.id}/versions`,
          "GET",
        ),
        schemaRequest<SchemaChangeJobsResponse>(
          `/schema-definitions/${definition.id}/change-jobs`,
          "GET",
        ),
        schemaRequest<SchemaActivityResponse>(
          `/schema-definitions/${definition.id}/activity`,
          "GET",
        ),
      ]);
      const nextVersions = versionResponse.data || [];
      setVersions(nextVersions);
      setJobs(jobResponse.data || []);
      setActivity(activityResponse.data || []);
      setToVersion(nextVersions[0]?.version || 0);
      setFromVersion(nextVersions[1]?.version || nextVersions[0]?.version || 0);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }, [definition, onError]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const comparison = useMemo(() => {
    const from = versions.find((item) => item.version === fromVersion);
    const to = versions.find((item) => item.version === toVersion);
    const before = new Map((from?.ui_schema?.fields || []).map((field) => [field.key, field]));
    const after = new Map((to?.ui_schema?.fields || []).map((field) => [field.key, field]));
    const keys = Array.from(new Set([...before.keys(), ...after.keys()])).sort();
    return keys.map<FieldComparison>((key) => {
      const left = before.get(key);
      const right = after.get(key);
      if (!left) return { key, after: right, kind: "added" };
      if (!right) return { key, before: left, kind: "removed" };
      const changed =
        left.type !== right.type ||
        left.required !== right.required ||
        left.lifecycle !== right.lifecycle;
      return { key, before: left, after: right, kind: changed ? "changed" : "unchanged" };
    });
  }, [fromVersion, toVersion, versions]);

  if (!definition) return null;

  const restoreVersion = async (version: number) => {
    setActing(true);
    try {
      await schemaRequest(
        `/schema-definitions/${definition.id}/versions/${version}/restore`,
        "POST",
        { expected_revision: definition.draft_revision },
      );
      await onChanged();
      onClose();
    } catch (error) {
      onError(error);
    } finally {
      setActing(false);
    }
  };

  const toggleArchive = async () => {
    setActing(true);
    try {
      await schemaRequest(
        `/schema-definitions/${definition.id}/${definition.status === "archived" ? "restore" : "archive"}`,
        "POST",
        {},
      );
      await onChanged();
      onClose();
    } catch (error) {
      onError(error);
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[var(--color-ink)]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="schema-history-title">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border-color)] p-5">
          <div>
            <h2 id="schema-history-title" className="flex items-center gap-2 text-lg font-bold">
              <History className="size-5 text-primary" aria-hidden />
              {t("schemaBuilder.history.title")}
            </h2>
            <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]" dir="ltr">
              {definition.key}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={acting || busy} className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-secondary)] disabled:opacity-50" aria-label={t("schemaBuilder.history.close")}>
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="size-6 animate-spin text-primary" aria-label={t("schemaBuilder.loading")} /></div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <aside className="space-y-4">
                <section>
                  <h3 className="mb-2 text-sm font-bold">{t("schemaBuilder.history.versions")}</h3>
                  <div className="space-y-2">
                    {versions.map((version) => (
                      <div key={version.id} className="rounded-xl border border-[var(--border-color)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold">{t("schemaBuilder.version")} {version.version}</span>
                          <button type="button" onClick={() => void restoreVersion(version.version)} disabled={acting || version.version === definition.current_version} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-primary hover:bg-brand-light disabled:opacity-40">
                            <RotateCcw className="size-3" aria-hidden />
                            {t("schemaBuilder.history.restoreDraft")}
                          </button>
                        </div>
                        <p className="mt-1 text-[10px] text-[var(--text-secondary)]" dir="ltr">
                          {new Date(version.published_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-bold">{t("schemaBuilder.history.jobs")}</h3>
                  <div className="space-y-2">
                    {jobs.filter((job) => job.job_type === "migration").slice(0, 5).map((job) => (
                      <div key={job.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
                        <div className="flex justify-between gap-2 text-xs font-semibold">
                          <span>{t(`schemaBuilder.history.jobStatus.${job.status}`)}</span>
                          <span dir="ltr">{job.progress_processed}/{job.progress_total}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--border-color)]">
                          <div className="h-full bg-primary" style={{ width: `${job.progress_total > 0 ? Math.min(100, (job.progress_processed / job.progress_total) * 100) : 0}%` }} />
                        </div>
                      </div>
                    ))}
                    {!jobs.some((job) => job.job_type === "migration") && (
                      <p className="text-xs text-[var(--text-secondary)]">{t("schemaBuilder.history.noJobs")}</p>
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <Activity className="size-4 text-primary" aria-hidden />
                    {t("schemaBuilder.history.activity")}
                  </h3>
                  <div className="space-y-2">
                    {activity.slice(0, 8).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3"
                      >
                        <p className="text-xs font-semibold">
                          {t(
                            `schemaBuilder.history.activityActions.${item.action.replaceAll(".", "_")}`,
                          )}
                        </p>
                        <p className="mt-1 text-[10px] text-[var(--text-secondary)]" dir="ltr">
                          {new Date(item.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                    {activity.length === 0 && (
                      <p className="text-xs text-[var(--text-secondary)]">
                        {t("schemaBuilder.history.noActivity")}
                      </p>
                    )}
                  </div>
                </section>
              </aside>

              <section className="min-w-0">
                <h3 className="mb-3 text-sm font-bold">{t("schemaBuilder.history.compare")}</h3>
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-xs">
                    <span className="text-[var(--text-secondary)]">{t("schemaBuilder.history.from")}</span>
                    <select value={fromVersion} onChange={(event) => setFromVersion(Number(event.target.value))} className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2">
                      {versions.map((version) => <option key={version.id} value={version.version}>{t("schemaBuilder.version")} {version.version}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs">
                    <span className="text-[var(--text-secondary)]">{t("schemaBuilder.history.to")}</span>
                    <select value={toVersion} onChange={(event) => setToVersion(Number(event.target.value))} className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2">
                      {versions.map((version) => <option key={version.id} value={version.version}>{t("schemaBuilder.version")} {version.version}</option>)}
                    </select>
                  </label>
                </div>
                <div className="overflow-hidden rounded-xl border border-[var(--border-color)]">
                  <div className="grid grid-cols-[minmax(0,1fr)_8rem_8rem_7rem] gap-2 bg-[var(--bg-secondary)] px-3 py-2 text-[11px] font-bold text-[var(--text-secondary)]">
                    <span>{t("schemaBuilder.fieldKey")}</span><span>{t("schemaBuilder.history.before")}</span><span>{t("schemaBuilder.history.after")}</span><span>{t("schemaBuilder.history.change")}</span>
                  </div>
                  {comparison.map((item) => (
                    <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_8rem_8rem_7rem] gap-2 border-t border-[var(--border-color)] px-3 py-2 text-xs">
                      <span className="truncate font-mono" dir="ltr">{item.key}</span>
                      <span>{item.before?.type || "—"}</span>
                      <span>{item.after?.type || "—"}</span>
                      <span>{t(`schemaBuilder.history.changeKind.${item.kind}`)}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        <footer className="flex justify-between gap-3 border-t border-[var(--border-color)] p-4">
          <button type="button" onClick={() => void toggleArchive()} disabled={acting || busy} className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-semibold hover:bg-[var(--bg-secondary)] disabled:opacity-50">
            {acting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Archive className="size-4" aria-hidden />}
            {definition.status === "archived" ? t("schemaBuilder.history.unarchive") : t("schemaBuilder.history.archive")}
          </button>
          <button type="button" onClick={onClose} disabled={acting || busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">
            {t("schemaBuilder.history.close")}
          </button>
        </footer>
      </div>
    </div>
  );
}
