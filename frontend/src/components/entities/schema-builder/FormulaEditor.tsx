"use client";

import { useMemo, useState } from "react";
import { Calculator, Loader2, Plus } from "lucide-react";
import { schemaRequest } from "./schemaApi";
import type { FieldSchema, FormulaPreviewResponse } from "./types";
import type { Language } from "@/lib/i18n";

interface Props {
  definitionId: string | null;
  field: FieldSchema;
  fields: FieldSchema[];
  language: Language;
  t: (key: string) => string;
  onChange: (expression: string) => void;
}

export default function FormulaEditor({
  definitionId,
  field,
  fields,
  language,
  t,
  onChange,
}: Props) {
  const [values, setValues] = useState<Record<string, number>>({});
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const numericFields = useMemo(
    () =>
      fields.filter(
        (candidate) =>
          candidate.id !== field.id &&
          (candidate.type === "number" ||
            candidate.type === "integer" ||
            candidate.type === "formula"),
      ),
    [field.id, fields],
  );

  const preview = async () => {
    if (!definitionId) {
      setError(t("schemaBuilder.formulaStudio.saveFirst"));
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await schemaRequest<FormulaPreviewResponse>(
        `/schema-definitions/${definitionId}/formula-preview`,
        "POST",
        {
          expression: field.formula?.expression || "",
          values,
        },
      );
      setResult(response.result);
    } catch {
      setError(t("schemaBuilder.formulaStudio.previewFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-2 space-y-3 ps-[4.625rem]">
      <label
        htmlFor={`formula-${field.id}`}
        className="text-[11px] font-semibold text-[var(--text-secondary)]"
      >
        {t("schemaBuilder.formulaExpression")}
      </label>
      <input
        id={`formula-${field.id}`}
        dir="ltr"
        value={field.formula?.expression || ""}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
        placeholder={t("schemaBuilder.formulaPlaceholder")}
        aria-describedby={`formula-help-${field.id}`}
      />
      <p id={`formula-help-${field.id}`} className="text-[10px] text-[var(--text-secondary)]">
        {t("schemaBuilder.formulaHint")}
      </p>

      {numericFields.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-bold text-[var(--text-secondary)]">
            {t("schemaBuilder.formulaStudio.availableFields")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {numericFields.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() =>
                  onChange(
                    `${field.formula?.expression || ""}${field.formula?.expression ? " " : ""}[${candidate.key}]`,
                  )
                }
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 font-mono text-[10px] transition-all duration-200 hover:border-primary/40 hover:bg-brand-light"
                title={language === "ar" ? candidate.label_ar : candidate.label_en}
              >
                <Plus className="size-3 shrink-0" aria-hidden />
                <span dir="ltr">{candidate.key}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {numericFields
          .filter((candidate) => candidate.type !== "formula")
          .map((candidate) => (
            <label key={candidate.id} className="space-y-1">
              <span className="block truncate text-[10px] text-[var(--text-secondary)]">
                {language === "ar" ? candidate.label_ar : candidate.label_en}
              </span>
              <input
                type="number"
                dir="ltr"
                step="any"
                value={values[candidate.key] ?? 0}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [candidate.key]: Number(event.target.value),
                  }))
                }
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs outline-none focus:border-primary"
              />
            </label>
          ))}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-2.5">
        <div className="min-w-0" aria-live="polite">
          <p className="text-[10px] text-[var(--text-secondary)]">
            {t("schemaBuilder.formulaStudio.result")}
          </p>
          <p className={`truncate font-mono text-sm font-bold ${error ? "text-destructive" : "text-brand"}`}>
            {error || (result === null ? t("schemaBuilder.formulaStudio.noResult") : String(result))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void preview()}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-light px-3 py-2 text-xs font-bold text-brand transition-all duration-200 hover:bg-primary/15 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Calculator className="size-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">{t("schemaBuilder.formulaStudio.preview")}</span>
        </button>
      </div>
    </section>
  );
}
