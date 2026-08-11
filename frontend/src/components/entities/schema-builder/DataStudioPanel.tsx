"use client";

import { Database } from "lucide-react";
import DynamicRecordsPanel from "@/components/entities/DynamicRecordsPanel";
import type { FieldSchema } from "./types";

interface Props {
  definitionId: string | null;
  definitionKey: string;
  fields: FieldSchema[];
  published: boolean;
  t: (key: string) => string;
}

export default function DataStudioPanel({
  definitionId,
  definitionKey,
  fields,
  published,
  t,
}: Props) {
  return (
    <section className="space-y-4" aria-labelledby="data-studio-heading">
      <div>
        <h2 id="data-studio-heading" className="flex items-center gap-2 text-sm font-bold">
          <Database className="size-4 shrink-0 text-brand" aria-hidden />
          <span>{t("schemaBuilder.dataStudio.title")}</span>
        </h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {t("schemaBuilder.dataStudio.hint")}
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)]">
        <DynamicRecordsPanel
          definitionId={definitionId}
          definitionKey={definitionKey}
          fields={fields}
          published={published}
        />
      </div>
    </section>
  );
}
