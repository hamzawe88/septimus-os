"use client";

import { KeyRound } from "lucide-react";
import type { FieldSchema } from "./types";

interface Props {
  definitionKey: string;
  labelAr: string;
  labelEn: string;
  titleFieldKey: string;
  currentVersion: number;
  fields: FieldSchema[];
  t: (key: string) => string;
  onDefinitionKeyChange: (value: string) => void;
  onLabelArChange: (value: string) => void;
  onLabelEnChange: (value: string) => void;
  onTitleFieldChange: (value: string) => void;
}

export default function SchemaIdentityPanel({
  definitionKey,
  labelAr,
  labelEn,
  titleFieldKey,
  currentVersion,
  fields,
  t,
  onDefinitionKeyChange,
  onLabelArChange,
  onLabelEnChange,
  onTitleFieldChange,
}: Props) {
  const textFields = fields.filter(
    (field) => field.type === "text" && field.lifecycle !== "hidden",
  );

  return (
    <section className="space-y-4" aria-labelledby="schema-identity-heading">
      <div>
        <h2 id="schema-identity-heading" className="text-sm font-bold">
          {t("schemaBuilder.identity.title")}
        </h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("schemaBuilder.identity.hint")}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-xs font-semibold">
            {t("schemaBuilder.identity.labelAr")}
          </span>
          <input
            dir="rtl"
            lang="ar"
            value={labelAr}
            onChange={(event) => onLabelArChange(event.target.value)}
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3 text-sm font-semibold outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder={t("schemaBuilder.identity.labelArPlaceholder")}
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-semibold">
            {t("schemaBuilder.identity.labelEn")}
          </span>
          <input
            dir="ltr"
            lang="en"
            value={labelEn}
            onChange={(event) => onLabelEnChange(event.target.value)}
            className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3 text-sm font-semibold outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
            placeholder={t("schemaBuilder.identity.labelEnPlaceholder")}
          />
        </label>
      </div>

      <label className="space-y-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 shrink-0 text-[var(--text-secondary)]" aria-hidden />
          <span>{t("schemaBuilder.technicalKey")}</span>
        </span>
        <input
          dir="ltr"
          value={definitionKey}
          disabled={currentVersion > 0}
          onChange={(event) => onDefinitionKeyChange(event.target.value)}
          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3 font-mono text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          placeholder={t("schemaBuilder.technicalKeyPlaceholder")}
        />
        <span className="block text-xs text-[var(--text-secondary)]">
          {currentVersion > 0
            ? t("schemaBuilder.technicalKeyLocked")
            : t("schemaBuilder.technicalKeyHint")}
        </span>
      </label>

      <label className="space-y-2">
        <span className="text-sm font-semibold">
          {t("schemaBuilder.identity.titleField")}
        </span>
        <select
          value={titleFieldKey}
          onChange={(event) => onTitleFieldChange(event.target.value)}
          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3 text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="">{t("schemaBuilder.identity.noTitleField")}</option>
          {textFields.map((field) => (
            <option key={field.id} value={field.key}>
              {field.label_ar} / {field.label_en}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
