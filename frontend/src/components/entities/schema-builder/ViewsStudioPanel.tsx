"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { schemaRequest } from "./schemaApi";
import type {
  EntityView,
  FieldSchema,
  RecordFilter,
  SchemaResourceList,
} from "./types";

interface Props {
  definitionId: string | null;
  fields: FieldSchema[];
  t: (key: string) => string;
  onError: () => void;
}

function newView(fields: FieldSchema[]): EntityView {
  return {
    id: "",
    name_ar: "",
    name_en: "",
    view_type: "table",
    sharing: "workspace",
    query: { limit: 30 },
    config: {
      columns: fields.filter((field) => field.lifecycle !== "hidden").map((field) => field.key),
    },
    revision: 0,
    is_default: false,
    updated_at: "",
  };
}

export default function ViewsStudioPanel({ definitionId, fields, t, onError }: Props) {
  const [views, setViews] = useState<EntityView[]>([]);
  const [draft, setDraft] = useState<EntityView | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const availableFields = useMemo(
    () => fields.filter((field) => field.lifecycle !== "hidden"),
    [fields],
  );

  const load = useCallback(async () => {
    if (!definitionId) return;
    setLoading(true);
    try {
      const response = await schemaRequest<SchemaResourceList<EntityView>>(
        `/schema-definitions/${definitionId}/views`,
        "GET",
      );
      setViews(response.data || []);
      setDraft((current) => {
        if (current?.id === "") return current;
        return response.data?.find((item) => item.id === current?.id) || response.data?.[0] || null;
      });
    } catch {
      onError();
    } finally {
      setLoading(false);
    }
  }, [definitionId, onError]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!definitionId) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border-color)] p-8 text-center text-xs text-[var(--text-secondary)]">
        {t("schemaBuilder.viewsStudio.saveSchemaFirst")}
      </p>
    );
  }

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await schemaRequest<EntityView>(
        `/schema-definitions/${definitionId}/views${draft.id ? `/${draft.id}` : ""}`,
        draft.id ? "PATCH" : "POST",
        {
          name_ar: draft.name_ar,
          name_en: draft.name_en,
          view_type: draft.view_type,
          sharing: draft.sharing,
          query: draft.query,
          config: draft.config,
          is_default: draft.is_default,
          expected_revision: draft.revision,
        },
      );
      setDraft(saved);
      await load();
    } catch {
      onError();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id || !window.confirm(t("schemaBuilder.viewsStudio.deleteConfirm"))) return;
    setSaving(true);
    try {
      await schemaRequest(
        `/schema-definitions/${definitionId}/views/${draft.id}`,
        "DELETE",
        { expected_revision: draft.revision },
      );
      setDraft(null);
      await load();
    } catch {
      onError();
    } finally {
      setSaving(false);
    }
  };

  const filter = draft?.query.filter;
  const setFilter = (patch: Partial<RecordFilter> | null) => {
    if (!draft) return;
    setDraft({
      ...draft,
      query: {
        ...draft.query,
        filter: patch === null ? undefined : { ...(filter || {}), ...patch },
      },
    });
  };

  const toggleColumn = (key: string, checked: boolean) => {
    if (!draft) return;
    setDraft({
      ...draft,
      config: {
        ...draft.config,
        columns: checked
          ? [...draft.config.columns.filter((item) => item !== key), key]
          : draft.config.columns.filter((item) => item !== key),
      },
    });
  };

  return (
    <section className="space-y-4" aria-labelledby="views-studio-title">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id="views-studio-title" className="flex items-center gap-2 text-sm font-bold">
            <Eye className="size-4 text-primary" aria-hidden />
            {t("schemaBuilder.viewsStudio.title")}
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {t("schemaBuilder.viewsStudio.hint")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(newView(fields))}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          <Plus className="size-3.5" aria-hidden />
          {t("schemaBuilder.viewsStudio.new")}
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="size-5 animate-spin text-primary" aria-label={t("schemaBuilder.loading")} />
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setDraft(view)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-start text-xs ${
                draft?.id === view.id
                  ? "border-primary bg-brand-light text-brand"
                  : "border-[var(--border-color)] bg-[var(--bg-primary)]"
              }`}
            >
              <span className="block font-semibold">{view.name_ar}</span>
              <span className="block text-[10px] text-[var(--text-secondary)]" dir="ltr">{view.name_en}</span>
            </button>
          ))}
        </div>
      )}

      {draft ? (
        <div className="space-y-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label={t("schemaBuilder.identity.labelAr")} value={draft.name_ar} onChange={(value) => setDraft({ ...draft, name_ar: value })} />
            <LabeledInput label={t("schemaBuilder.identity.labelEn")} value={draft.name_en} direction="ltr" onChange={(value) => setDraft({ ...draft, name_en: value })} />
            <label className="space-y-1 text-xs">
              <span className="font-semibold">{t("schemaBuilder.viewsStudio.type")}</span>
              <select
                value={draft.view_type}
                onChange={(event) => setDraft({ ...draft, view_type: event.target.value as EntityView["view_type"] })}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2"
              >
                {(["table", "kanban", "calendar", "gallery"] as const).map((type) => (
                  <option key={type} value={type}>{t(`schemaBuilder.viewsStudio.types.${type}`)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-semibold">{t("schemaBuilder.viewsStudio.sharing")}</span>
              <select
                value={draft.sharing}
                onChange={(event) => setDraft({ ...draft, sharing: event.target.value as EntityView["sharing"] })}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2"
              >
                <option value="workspace">{t("schemaBuilder.viewsStudio.workspace")}</option>
                <option value="private">{t("schemaBuilder.viewsStudio.private")}</option>
              </select>
            </label>
          </div>

          <fieldset className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-3">
            <legend className="px-1 text-xs font-semibold">{t("schemaBuilder.viewsStudio.columns")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {availableFields.map((field) => (
                <label key={field.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs">
                  <input type="checkbox" checked={draft.config.columns.includes(field.key)} onChange={(event) => toggleColumn(field.key, event.target.checked)} />
                  <span className="truncate">{field.label_ar}</span>
                  <span className="ms-auto truncate text-[10px] text-[var(--text-secondary)]" dir="ltr">{field.label_en}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {draft.view_type === "kanban" && (
            <FieldSelector
              label={t("schemaBuilder.viewsStudio.groupField")}
              value={draft.config.group_field || ""}
              fields={availableFields.filter((field) => field.type === "list" || field.type === "text")}
              onChange={(value) => setDraft({ ...draft, config: { ...draft.config, group_field: value } })}
            />
          )}
          {draft.view_type === "calendar" && (
            <FieldSelector
              label={t("schemaBuilder.viewsStudio.calendarField")}
              value={draft.config.calendar_field || ""}
              fields={availableFields.filter((field) => field.type === "date" || field.type === "datetime")}
              onChange={(value) => setDraft({ ...draft, config: { ...draft.config, calendar_field: value } })}
            />
          )}
          {draft.view_type === "gallery" && (
            <FieldSelector
              label={t("schemaBuilder.viewsStudio.coverField")}
              value={draft.config.cover_field || ""}
              fields={availableFields.filter((field) => field.type === "file")}
              onChange={(value) => setDraft({ ...draft, config: { ...draft.config, cover_field: value } })}
            />
          )}

          <fieldset className="space-y-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-3">
            <legend className="px-1 text-xs font-semibold">{t("schemaBuilder.viewsStudio.filter")}</legend>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={Boolean(filter)}
                onChange={(event) =>
                  setFilter(event.target.checked ? { field: availableFields[0]?.key, op: "eq", value: "" } : null)
                }
              />
              {t("schemaBuilder.viewsStudio.enableFilter")}
            </label>
            {filter && (
              <div className="grid gap-2 sm:grid-cols-3">
                <select value={filter.field || ""} onChange={(event) => setFilter({ field: event.target.value })} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-xs">
                  {availableFields.map((field) => <option key={field.id} value={field.key}>{field.label_ar} / {field.label_en}</option>)}
                </select>
                <select value={filter.op || "eq"} onChange={(event) => setFilter({ op: event.target.value as RecordFilter["op"] })} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-xs">
                  {(["eq", "neq", "contains", "gt", "gte", "lt", "lte"] as const).map((operator) => (
                    <option key={operator} value={operator}>{t(`schemaBuilder.viewsStudio.operators.${operator}`)}</option>
                  ))}
                </select>
                <input value={String(filter.value ?? "")} onChange={(event) => setFilter({ value: event.target.value })} placeholder={t("schemaBuilder.viewsStudio.filterValue")} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-xs" />
              </div>
            )}
          </fieldset>

          <label className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-semibold">
            <input type="checkbox" checked={draft.is_default} onChange={(event) => setDraft({ ...draft, is_default: event.target.checked })} />
            {t("schemaBuilder.viewsStudio.default")}
          </label>

          <footer className="flex justify-between gap-2">
            <button type="button" onClick={() => void remove()} disabled={!draft.id || saving} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-30">
              <Trash2 className="size-3.5" aria-hidden />
              {t("schemaBuilder.viewsStudio.delete")}
            </button>
            <button type="button" onClick={() => void save()} disabled={saving || !draft.name_ar.trim() || !draft.name_en.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
              {t("schemaBuilder.viewsStudio.save")}
            </button>
          </footer>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--border-color)] p-8 text-center text-xs text-[var(--text-secondary)]">
          {t("schemaBuilder.viewsStudio.empty")}
        </p>
      )}
    </section>
  );
}

function LabeledInput({
  label,
  value,
  direction,
  onChange,
}: {
  label: string;
  value: string;
  direction?: "ltr";
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="font-semibold">{label}</span>
      <input
        value={value}
        dir={direction}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 outline-none focus:border-primary"
      />
    </label>
  );
}

function FieldSelector({
  label,
  value,
  fields,
  onChange,
}: {
  label: string;
  value: string;
  fields: FieldSchema[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="font-semibold">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2"
      >
        <option value="" />
        {fields.map((field) => (
          <option key={field.id} value={field.key}>{field.label_ar} / {field.label_en}</option>
        ))}
      </select>
    </label>
  );
}
