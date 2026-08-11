"use client";

import { useCallback, useEffect, useState } from "react";
import { FileInput, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { schemaRequest } from "./schemaApi";
import type {
  EntityForm,
  FieldSchema,
  SchemaFormSection,
  SchemaResourceList,
} from "./types";

interface Props {
  definitionId: string | null;
  fields: FieldSchema[];
  t: (key: string) => string;
  onError: () => void;
}

function newSection(t: (key: string) => string): SchemaFormSection {
  return {
    id: crypto.randomUUID(),
    label_ar: t("schemaBuilder.formsStudio.defaultSectionAr"),
    label_en: t("schemaBuilder.formsStudio.defaultSectionEn"),
    columns: 2,
    fields: [],
  };
}

function newForm(fields: FieldSchema[], t: (key: string) => string): EntityForm {
  return {
    id: "",
    name_ar: "",
    name_en: "",
    mode: "create",
    status: "active",
    layout: {
      sections: [{ ...newSection(t), fields: fields.filter((field) => field.lifecycle !== "hidden").map((field) => field.key) }],
    },
    visibility_rules: [],
    revision: 0,
    is_default: false,
    updated_at: "",
  };
}

export default function FormsStudioPanel({ definitionId, fields, t, onError }: Props) {
  const [forms, setForms] = useState<EntityForm[]>([]);
  const [draft, setDraft] = useState<EntityForm | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!definitionId) return;
    setLoading(true);
    try {
      const response = await schemaRequest<SchemaResourceList<EntityForm>>(
        `/schema-definitions/${definitionId}/forms`,
        "GET",
      );
      setForms(response.data || []);
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
    return <EmptyState t={t} />;
  }

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const payload = {
        name_ar: draft.name_ar,
        name_en: draft.name_en,
        mode: draft.mode,
        status: draft.status,
        layout: draft.layout,
        visibility_rules: draft.visibility_rules,
        is_default: draft.is_default,
        expected_revision: draft.revision,
      };
      const saved = await schemaRequest<EntityForm>(
        `/schema-definitions/${definitionId}/forms${draft.id ? `/${draft.id}` : ""}`,
        draft.id ? "PATCH" : "POST",
        payload,
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
    if (!draft?.id || !window.confirm(t("schemaBuilder.formsStudio.deleteConfirm"))) return;
    setSaving(true);
    try {
      await schemaRequest(
        `/schema-definitions/${definitionId}/forms/${draft.id}`,
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

  const updateSection = (sectionId: string, patch: Partial<SchemaFormSection>) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            layout: {
              sections: current.layout.sections.map((section) =>
                section.id === sectionId ? { ...section, ...patch } : section,
              ),
            },
          }
        : current,
    );
  };

  const assignField = (sectionId: string, fieldKey: string, checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        layout: {
          sections: current.layout.sections.map((section) => {
            const without = section.fields.filter((key) => key !== fieldKey);
            return section.id === sectionId && checked
              ? { ...section, fields: [...without, fieldKey] }
              : { ...section, fields: without };
          }),
        },
      };
    });
  };

  return (
    <section className="space-y-4" aria-labelledby="forms-studio-title">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id="forms-studio-title" className="flex items-center gap-2 text-sm font-bold">
            <FileInput className="size-4 text-primary" aria-hidden />
            {t("schemaBuilder.formsStudio.title")}
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {t("schemaBuilder.formsStudio.hint")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft(newForm(fields, t))}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          <Plus className="size-3.5" aria-hidden />
          {t("schemaBuilder.formsStudio.new")}
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="size-5 animate-spin text-primary" aria-label={t("schemaBuilder.loading")} />
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {forms.map((form) => (
            <button
              key={form.id}
              type="button"
              onClick={() => setDraft(form)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-start text-xs ${
                draft?.id === form.id
                  ? "border-primary bg-brand-light text-brand"
                  : "border-[var(--border-color)] bg-[var(--bg-primary)]"
              }`}
            >
              <span className="block font-semibold">{form.name_ar}</span>
              <span className="block text-[10px] text-[var(--text-secondary)]" dir="ltr">
                {form.name_en}
              </span>
            </button>
          ))}
        </div>
      )}

      {draft ? (
        <div className="space-y-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput
              label={t("schemaBuilder.identity.labelAr")}
              value={draft.name_ar}
              onChange={(value) => setDraft({ ...draft, name_ar: value })}
            />
            <LabeledInput
              label={t("schemaBuilder.identity.labelEn")}
              value={draft.name_en}
              direction="ltr"
              onChange={(value) => setDraft({ ...draft, name_en: value })}
            />
            <label className="space-y-1 text-xs">
              <span className="font-semibold">{t("schemaBuilder.formsStudio.mode")}</span>
              <select
                value={draft.mode}
                onChange={(event) => setDraft({ ...draft, mode: event.target.value as EntityForm["mode"] })}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2"
              >
                {(["create", "edit", "readonly"] as const).map((mode) => (
                  <option key={mode} value={mode}>{t(`schemaBuilder.formsStudio.modes.${mode}`)}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-semibold">
              <input
                type="checkbox"
                checked={draft.is_default}
                onChange={(event) => setDraft({ ...draft, is_default: event.target.checked })}
              />
              {t("schemaBuilder.formsStudio.default")}
            </label>
          </div>

          <div className="space-y-3">
            {draft.layout.sections.map((section) => (
              <div key={section.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_6rem_auto]">
                  <LabeledInput
                    label={t("schemaBuilder.formsStudio.sectionAr")}
                    value={section.label_ar}
                    onChange={(value) => updateSection(section.id, { label_ar: value })}
                  />
                  <LabeledInput
                    label={t("schemaBuilder.formsStudio.sectionEn")}
                    value={section.label_en}
                    direction="ltr"
                    onChange={(value) => updateSection(section.id, { label_en: value })}
                  />
                  <label className="space-y-1 text-xs">
                    <span className="font-semibold">{t("schemaBuilder.formsStudio.columns")}</span>
                    <select
                      value={section.columns}
                      onChange={(event) => updateSection(section.id, { columns: Number(event.target.value) })}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2"
                    >
                      {[1, 2, 3].map((count) => <option key={count} value={count}>{count}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        layout: { sections: draft.layout.sections.filter((item) => item.id !== section.id) },
                      })
                    }
                    disabled={draft.layout.sections.length === 1}
                    className="self-end rounded-lg p-2 text-destructive hover:bg-destructive/10 disabled:opacity-30"
                    aria-label={t("schemaBuilder.formsStudio.removeSection")}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
                <fieldset className="mt-3">
                  <legend className="mb-2 text-xs font-semibold">{t("schemaBuilder.formsStudio.sectionFields")}</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {fields.filter((field) => field.lifecycle !== "hidden").map((field) => (
                      <label key={field.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={section.fields.includes(field.key)}
                          onChange={(event) => assignField(section.id, field.key, event.target.checked)}
                        />
                        <span className="min-w-0 truncate">{field.label_ar}</span>
                        <span className="ms-auto truncate text-[10px] text-[var(--text-secondary)]" dir="ltr">{field.label_en}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  layout: { sections: [...draft.layout.sections, newSection(t)] },
                })
              }
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-semibold"
            >
              <Plus className="size-3.5" aria-hidden />
              {t("schemaBuilder.formsStudio.addSection")}
            </button>
          </div>

          <footer className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() => void remove()}
              disabled={!draft.id || saving}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-30"
            >
              <Trash2 className="size-3.5" aria-hidden />
              {t("schemaBuilder.formsStudio.delete")}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !draft.name_ar.trim() || !draft.name_en.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Save className="size-3.5" aria-hidden />}
              {t("schemaBuilder.formsStudio.save")}
            </button>
          </footer>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--border-color)] p-8 text-center text-xs text-[var(--text-secondary)]">
          {t("schemaBuilder.formsStudio.empty")}
        </p>
      )}
    </section>
  );
}

function EmptyState({ t }: { t: (key: string) => string }) {
  return (
    <p className="rounded-xl border border-dashed border-[var(--border-color)] p-8 text-center text-xs text-[var(--text-secondary)]">
      {t("schemaBuilder.formsStudio.saveSchemaFirst")}
    </p>
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
