"use client";

import { GitBranch, Plus } from "lucide-react";
import type { EntityDefinition, FieldSchema } from "./types";
import type { Language } from "@/lib/i18n";

interface Props {
  fields: FieldSchema[];
  definitions: EntityDefinition[];
  language: Language;
  t: (key: string) => string;
  onAddRelation: () => void;
}

export default function RelationStudioPanel({
  fields,
  definitions,
  language,
  t,
  onAddRelation,
}: Props) {
  const relations = fields.filter((field) => field.type === "relation");
  const definitionsByKey = new Map(
    definitions.map((definition) => [definition.key, definition]),
  );
  return (
    <section className="space-y-4" aria-labelledby="relation-studio-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="relation-studio-heading" className="text-sm font-bold">
            {t("schemaBuilder.relationStudio.title")}
          </h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {t("schemaBuilder.relationStudio.hint")}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddRelation}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-all duration-200 hover:bg-primary-hover"
        >
          <Plus className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{t("schemaBuilder.relationStudio.add")}</span>
        </button>
      </div>
      {relations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-color)] p-8 text-center">
          <GitBranch className="mx-auto size-8 text-[var(--text-secondary)]" aria-hidden />
          <p className="mt-3 text-sm font-semibold">
            {t("schemaBuilder.relationStudio.empty")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {relations.map((field) => {
            const target = definitionsByKey.get(
              field.relation?.target_definition_key || "",
            );
            return (
              <article
                key={field.id}
                className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4"
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="size-4 shrink-0 text-brand" aria-hidden />
                  <h3 className="min-w-0 flex-1 truncate text-sm font-bold">
                    {language === "ar" ? field.label_ar : field.label_en}
                  </h3>
                  <span className="shrink-0 rounded-full bg-[var(--bg-primary)] px-2 py-1 text-[10px] font-bold">
                    {t(`schemaBuilder.relationStudio.cardinality.${field.relation?.cardinality || "one"}`)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[var(--text-secondary)]">
                      {t("schemaBuilder.relationStudio.target")}
                    </p>
                    <p className="mt-1 truncate font-semibold">
                      {target
                        ? language === "ar"
                          ? target.label_ar
                          : target.label_en
                        : field.relation?.target_definition_key ||
                          t("schemaBuilder.relationStudio.notSelected")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[var(--text-secondary)]">
                      {t("schemaBuilder.onDelete")}
                    </p>
                    <p className="mt-1 font-semibold">
                      {t(`schemaBuilder.relationStudio.deletePolicy.${field.relation?.on_delete || "restrict"}`)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
