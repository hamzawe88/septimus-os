"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { API_BASE_URL, fetchWithAuth } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useAppStore } from "@/store/useAppStore";
import type { PublicationContext } from "centrifuge";
import DynamicRecordInput, { type RecordInputOption } from "./schema-builder/DynamicRecordInput";
import type {
  DynamicFieldSchema,
  DynamicRecord,
  EntityForm,
  EntityView,
  QueryResponse,
  RecordFilter,
  SchemaResourceList,
} from "./schema-builder/types";
import { canReadField, canWriteField } from "./schema-builder/fieldPolicy";
import { schemaRequest } from "./schema-builder/schemaApi";

interface Props {
  definitionId?: string | null;
  definitionKey: string;
  fields: DynamicFieldSchema[];
  published: boolean;
}

async function dataRequest<T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
  const response = await fetchWithAuth(`${API_BASE_URL}${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
    };
    const error = new Error(payload.error || "REQUEST_FAILED");
    Object.assign(error, { code: payload.code });
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function readRequest<T>(path: string): Promise<T> {
  const response = await fetchWithAuth(`${API_BASE_URL}${path}`);
  if (!response.ok) throw new Error("REQUEST_FAILED");
  return (await response.json()) as T;
}

export default function DynamicRecordsPanel({ definitionId, definitionKey, fields, published }: Props) {
  const { language, t } = useLocalization();
  const centrifuge = useAppStore((state) => state.centrifuge);
  const currentUser = useAppStore((state) => state.currentUser);
  const [records, setRecords] = useState<DynamicRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DynamicRecord | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, RecordInputOption[]>>({});
  const [error, setError] = useState("");
  const [views, setViews] = useState<EntityView[]>([]);
  const [forms, setForms] = useState<EntityForm[]>([]);
  const [selectedViewId, setSelectedViewId] = useState("");
  const [nextCursor, setNextCursor] = useState("");

  const currentRole = currentUser?.role || currentUser?.Role;
  const selectedView = useMemo(
    () => views.find((view) => view.id === selectedViewId),
    [selectedViewId, views],
  );
  const allReadableFields = useMemo(
    () => fields.filter((field) => canReadField(field, currentRole)),
    [currentRole, fields],
  );
  const readableFields = useMemo(() => {
    const readable = allReadableFields;
    const columns = selectedView?.config.columns || [];
    if (columns.length === 0) return readable;
    const byKey = new Map(readable.map((field) => [field.key, field]));
    return columns.map((key) => byKey.get(key)).filter((field): field is DynamicFieldSchema => Boolean(field));
  }, [allReadableFields, selectedView]);
  const writableFormFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          canWriteField(field, currentRole) ||
          (field.type === "formula" && canReadField(field, currentRole)),
      ),
    [currentRole, fields],
  );
  const activeForm = useMemo(() => {
    const mode = editing ? "edit" : "create";
    return forms.find((form) => form.mode === mode && form.is_default && form.status === "active")
      || forms.find((form) => form.mode === mode && form.status === "active");
  }, [editing, forms]);
  const formFieldsByKey = useMemo(
    () => new Map(writableFormFields.map((field) => [field.key, field])),
    [writableFormFields],
  );
  const titleField = useMemo(
    () =>
      allReadableFields.find((field) => field.type === "text" && field.searchable) ||
      allReadableFields.find((field) => field.type === "text"),
    [allReadableFields],
  );

  const buildFilter = useCallback((): RecordFilter | undefined => {
    const searchFilter =
      search.trim() && titleField
        ? { field: titleField.key, op: "contains" as const, value: search.trim() }
        : undefined;
    if (selectedView?.query.filter && searchFilter) {
      return { and: [selectedView.query.filter, searchFilter] };
    }
    return selectedView?.query.filter || searchFilter;
  }, [search, selectedView, titleField]);

  const loadRecords = useCallback(async () => {
    if (!published || !definitionKey) return;
    setIsLoading(true);
    setError("");
    try {
      const result = await dataRequest<QueryResponse>(
        `/data/${definitionKey}/records/query`,
        "POST",
        { limit: selectedView?.query.limit || 30, filter: buildFilter() },
      );
      setRecords(result.data || []);
      setNextCursor(result.next_cursor || "");
    } catch {
      setError(t("schemaBuilder.records.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [buildFilter, definitionKey, published, selectedView, t]);

  const loadMore = async () => {
    if (!nextCursor || isLoading) return;
    setIsLoading(true);
    try {
      const result = await dataRequest<QueryResponse>(
        `/data/${definitionKey}/records/query`,
        "POST",
        {
          limit: selectedView?.query.limit || 30,
          cursor: nextCursor,
          filter: buildFilter(),
        },
      );
      setRecords((current) => [...current, ...(result.data || [])]);
      setNextCursor(result.next_cursor || "");
    } catch {
      setError(t("schemaBuilder.records.loadFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRecords(), 250);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  useEffect(() => {
    if (!definitionId) {
      return;
    }
    const timer = window.setTimeout(() => {
      void Promise.all([
        schemaRequest<SchemaResourceList<EntityView>>(
          `/schema-definitions/${definitionId}/views`,
          "GET",
        ),
        schemaRequest<SchemaResourceList<EntityForm>>(
          `/schema-definitions/${definitionId}/forms`,
          "GET",
        ),
      ])
        .then(([viewResponse, formResponse]) => {
          const nextViews = viewResponse.data || [];
          setViews(nextViews);
          setForms(formResponse.data || []);
          setSelectedViewId((current) => current || nextViews.find((view) => view.is_default)?.id || "");
        })
        .catch(() => {
          setViews([]);
          setForms([]);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [definitionId]);

  useEffect(() => {
    if (!centrifuge || !published) return;
    const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
    if (!workspaceId) return;
    const channel = `workspace_${workspaceId}`;
    const existing = centrifuge.getSubscription(channel);
    const subscription = existing ?? centrifuge.newSubscription(channel);
    const onPublication = (context: PublicationContext) => {
      const event = context.data as {
        type?: string;
        payload?: { definition_key?: string };
      };
      if (
        event.type?.startsWith("data.record.") &&
        event.payload?.definition_key === definitionKey
      ) {
        void loadRecords();
      }
    };
    subscription.on("publication", onPublication);
    if (!existing) subscription.subscribe();
    return () => {
      subscription.removeListener("publication", onPublication);
    };
  }, [centrifuge, definitionKey, loadRecords, published]);

  const openForm = async (record?: DynamicRecord) => {
    setEditing(record || null);
    setValues(record ? { ...record.data } : {});
    setError("");
    setModalOpen(true);
    const relationFields = fields.filter(
      (field) => field.type === "relation" && field.relation?.target_definition_key,
    );
    const loaded = await Promise.all(
      relationFields.map(async (field) => {
        try {
          const result = await dataRequest<QueryResponse>(
            `/data/${field.relation!.target_definition_key}/records/query`,
            "POST",
            { limit: 100 },
          );
          return [
            field.key,
            (result.data || []).map((item) => ({
              id: item.id,
              display_value: item.display_value || item.id,
            })),
          ] as const;
        } catch {
          return [field.key, []] as const;
        }
      }),
    );
    const options: Record<string, RecordInputOption[]> = Object.fromEntries(loaded);
    if (fields.some((field) => field.type === "user")) {
      try {
        const users = await readRequest<Array<{ id: string; email: string }>>("/users/search?q=");
        options.__users = users.map((user) => ({ id: user.id, display_value: user.email }));
      } catch {
        options.__users = [];
      }
    }
    if (fields.some((field) => field.type === "file")) {
      try {
        const files = await readRequest<Array<{ id: string; name: string }>>("/drive/files");
        options.__files = files.map((file) => ({ id: file.id, display_value: file.name }));
      } catch {
        options.__files = [];
      }
    }
    setRelationOptions(options);
  };

  const setFieldValue = (field: DynamicFieldSchema, raw: string | boolean | string[]) => {
    let value: unknown = raw;
    if ((field.type === "number" || field.type === "integer") && typeof raw === "string") {
      value = raw === "" ? undefined : Number(raw);
    }
    if (field.type === "datetime" && typeof raw === "string" && raw !== "") {
      value = new Date(raw).toISOString();
    }
    setValues((current) => ({ ...current, [field.key]: value }));
  };

  const saveRecord = async () => {
    setIsSaving(true);
    setError("");
    try {
      if (editing) {
        await dataRequest<DynamicRecord>(
          `/data/${definitionKey}/records/${editing.id}`,
          "PATCH",
          { data: values, expected_record_version: editing.record_version },
        );
      } else {
        await dataRequest<DynamicRecord>(`/data/${definitionKey}/records`, "POST", {
          data: values,
        });
      }
      setModalOpen(false);
      await loadRecords();
    } catch (requestError) {
      const code =
        requestError instanceof Error && "code" in requestError
          ? (requestError as Error & { code?: string }).code
          : undefined;
      setError(
        code === "FIELD_WRITE_FORBIDDEN"
          ? t("schemaBuilder.records.fieldWriteForbidden")
          : t("schemaBuilder.records.saveFailed"),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRecord = async (record: DynamicRecord) => {
    if (!window.confirm(t("schemaBuilder.records.deleteConfirm"))) return;
    try {
      await dataRequest<void>(`/data/${definitionKey}/records/${record.id}`, "DELETE");
      await loadRecords();
    } catch {
      setError(t("schemaBuilder.records.deleteFailed"));
    }
  };

  const groupedRecords = useMemo(() => {
    const field =
      selectedView?.view_type === "calendar"
        ? selectedView.config.calendar_field
        : selectedView?.config.group_field;
    const groups = new Map<string, DynamicRecord[]>();
    for (const record of records) {
      const raw = field ? record.data[field] : undefined;
      const key = raw == null || raw === "" ? t("schemaBuilder.records.ungrouped") : String(raw);
      groups.set(key, [...(groups.get(key) || []), record]);
    }
    return Array.from(groups.entries());
  }, [records, selectedView, t]);

  const recordActions = (record: DynamicRecord) => (
    <div className="flex gap-1">
      <button type="button" onClick={() => void openForm(record)} className="rounded-md p-2 text-[var(--text-secondary)] hover:bg-brand-light hover:text-brand" aria-label={t("schemaBuilder.records.edit")}>
        <Pencil className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={() => void deleteRecord(record)} className="rounded-md p-2 text-[var(--text-secondary)] hover:bg-destructive/10 hover:text-destructive" aria-label={t("schemaBuilder.records.delete")}>
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  );

  if (!published) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-2 p-8 text-center text-[var(--text-secondary)]">
        <p className="text-sm font-semibold">{t("schemaBuilder.emptyPreview")}</p>
        <p className="max-w-md text-xs">{t("schemaBuilder.emptyPreviewHint")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-color)] p-3">
        {views.length > 0 && (
          <label className="min-w-40">
            <span className="sr-only">{t("schemaBuilder.records.savedView")}</span>
            <select
              value={selectedViewId}
              onChange={(event) => setSelectedViewId(event.target.value)}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
            >
              <option value="">{t("schemaBuilder.records.allFieldsView")}</option>
              {views.map((view) => (
                <option key={view.id} value={view.id}>
                  {language === "ar" ? view.name_ar : view.name_en}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden />
          <span className="sr-only">{t("schemaBuilder.records.search")}</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] py-2 pe-3 ps-9 text-sm outline-none focus:border-primary"
            placeholder={t("schemaBuilder.records.search")}
          />
        </label>
        <button
          type="button"
          onClick={() => void openForm()}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
        >
          <Plus className="size-4" aria-hidden />
          {t("schemaBuilder.records.new")}
        </button>
      </div>

      {error && <p role="alert" className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto">
        {(!selectedView || selectedView.view_type === "table") && (
          <table className="w-full min-w-max border-collapse text-sm">
          <thead className="sticky top-0 bg-[var(--bg-secondary)] text-[var(--text-secondary)]">
            <tr>
              {readableFields.map((field) => (
                <th key={field.id} className="border-b border-e border-[var(--border-color)] px-4 py-3 text-start font-semibold last:border-e-0">
                  {language === "ar" ? field.label_ar : field.label_en}
                </th>
              ))}
              <th className="border-b border-[var(--border-color)] px-3 py-3 text-start">{t("schemaBuilder.records.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                {readableFields.map((field) => (
                  <td key={field.id} className="max-w-64 border-e border-[var(--border-color)] px-4 py-3 last:border-e-0">
                    <span className="block truncate">{formatValue(record.data[field.key], t)}</span>
                  </td>
                ))}
                <td className="px-3 py-2">
                  {recordActions(record)}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        )}
        {selectedView?.view_type === "kanban" && (
          <div className="flex min-w-max gap-3 p-4">
            {groupedRecords.map(([group, items]) => (
              <section key={group} className="w-64 shrink-0 rounded-xl bg-[var(--bg-secondary)] p-3">
                <h3 className="mb-3 flex justify-between gap-2 text-xs font-bold">
                  <span className="truncate">{group}</span>
                  <span>{items.length}</span>
                </h3>
                <div className="space-y-2">
                  {items.map((record) => (
                    <article key={record.id} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 shadow-sm">
                      <p className="truncate text-sm font-semibold">{record.display_value || record.id}</p>
                      <div className="mt-2">{recordActions(record)}</div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {selectedView?.view_type === "calendar" && (
          <div className="space-y-3 p-4">
            {groupedRecords.sort(([left], [right]) => left.localeCompare(right)).map(([date, items]) => (
              <section key={date} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
                <h3 className="mb-2 text-xs font-bold">{date}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {items.map((record) => (
                    <article key={record.id} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--bg-primary)] p-3">
                      <span className="truncate text-sm font-semibold">{record.display_value || record.id}</span>
                      {recordActions(record)}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {selectedView?.view_type === "gallery" && (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {records.map((record) => (
              <article key={record.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4 shadow-sm">
                <h3 className="truncate text-sm font-bold">{record.display_value || record.id}</h3>
                <dl className="mt-3 space-y-1 text-xs">
                  {readableFields.slice(0, 4).map((field) => (
                    <div key={field.id} className="flex justify-between gap-3">
                      <dt className="truncate text-[var(--text-secondary)]">{language === "ar" ? field.label_ar : field.label_en}</dt>
                      <dd className="truncate">{formatValue(record.data[field.key], t)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3">{recordActions(record)}</div>
              </article>
            ))}
          </div>
        )}
        {!isLoading && records.length === 0 && (
          <p className="p-10 text-center text-sm text-[var(--text-secondary)]">{t("schemaBuilder.records.empty")}</p>
        )}
        {isLoading && (
          <div className="flex justify-center p-10"><Loader2 className="size-5 animate-spin text-brand" aria-label={t("schemaBuilder.loading")} /></div>
        )}
        {!isLoading && nextCursor && (
          <div className="flex justify-center p-4">
            <button
              type="button"
              onClick={() => void loadMore()}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-2 text-xs font-semibold hover:bg-brand-light"
            >
              {t("schemaBuilder.records.loadMore")}
            </button>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="dynamic-record-title">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[var(--border-color)] p-5">
              <h3 id="dynamic-record-title" className="font-bold">
                {editing ? t("schemaBuilder.records.edit") : t("schemaBuilder.records.new")}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg p-2 hover:bg-[var(--bg-secondary)]" aria-label={t("schemaBuilder.records.close")}>
                <X className="size-5" aria-hidden />
              </button>
            </header>
            <div className="max-h-[65vh] space-y-5 overflow-y-auto p-5">
              {(activeForm?.layout.sections || [
                {
                  id: "default",
                  label_ar: "",
                  label_en: "",
                  columns: 2,
                  fields: writableFormFields.map((field) => field.key),
                },
              ]).map((section) => (
                <fieldset key={section.id} className="space-y-3">
                  {(section.label_ar || section.label_en) && (
                    <legend className="text-sm font-bold">
                      {language === "ar" ? section.label_ar : section.label_en}
                    </legend>
                  )}
                  <div
                    className={`grid grid-cols-1 gap-4 ${
                      section.columns === 3
                        ? "sm:grid-cols-3"
                        : section.columns === 2
                          ? "sm:grid-cols-2"
                          : ""
                    }`}
                  >
                    {section.fields.map((key) => formFieldsByKey.get(key)).filter((field): field is DynamicFieldSchema => Boolean(field)).map((field) => (
                      <DynamicRecordInput
                        key={field.id}
                        field={field}
                        value={values[field.key]}
                        options={
                          field.type === "user"
                            ? relationOptions.__users || []
                            : field.type === "file"
                              ? relationOptions.__files || []
                              : relationOptions[field.key] || []
                        }
                        language={language}
                        t={t}
                        onChange={(value) => setFieldValue(field, value)}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <footer className="flex justify-end gap-2 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-4 py-2 text-sm font-semibold">{t("schemaBuilder.records.cancel")}</button>
              <button type="button" onClick={() => void saveRecord()} disabled={isSaving} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {isSaving && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {t("schemaBuilder.records.save")}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown, t: (key: string) => string) {
  if (value === true) return t("schemaBuilder.records.yes");
  if (value === false) return t("schemaBuilder.records.no");
  if (Array.isArray(value)) return value.join(", ");
  return value == null || value === "" ? "—" : String(value);
}
