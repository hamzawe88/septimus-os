"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  FileText,
  Search,
} from "lucide-react";

import { useLocalization } from "@/contexts/LocalizationContext";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";

const DOCUMENTS = [
  { id: "d1", title: "d1Title", category: "d1Cat", updated: "2daysAgo" },
  { id: "d2", title: "d2Title", category: "d2Cat", updated: "3daysAgo" },
  { id: "d3", title: "d3Title", category: "d3Cat", updated: "1weekAgo" },
] as const;

export default function KnowledgeVaultWidget() {
  const { t } = useLocalization();
  const [query, setQuery] = useState("");
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);
  const documents = DOCUMENTS.map((document) => ({
    ...document,
    titleLabel: t(`dashboard.knowledge.${document.title}`),
    categoryLabel: t(`dashboard.knowledge.${document.category}`),
    updatedLabel: t(`dashboard.knowledge.${document.updated}`),
  }));
  const filtered = documents.filter((document) =>
    document.titleLabel.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-bold">
            <BookOpen className="size-4 text-info" aria-hidden />
            {t("dashboard.knowledge.title")}
          </h3>
          <Tag tone="info">
            {documents.length} {t("dashboard.knowledge.sops")}
          </Tag>
        </div>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("dashboard.knowledge.search")}
            aria-label={t("dashboard.knowledge.search")}
            className="ps-9"
          />
        </div>
      </div>

      <div className="flex max-h-[170px] flex-1 flex-col gap-2 overflow-y-auto">
        {filtered.length ? (
          filtered.map((document) => (
            <button
              type="button"
              key={document.id}
              onClick={() => setPreviewDoc(document.titleLabel)}
              className="group flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border bg-muted/35 p-2.5 text-start transition-colors hover:border-info/30 hover:bg-info/10"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-info/10 text-info">
                  <FileText className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-xs">
                    {document.titleLabel}
                  </strong>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    {document.categoryLabel} · {document.updatedLabel}
                  </span>
                </span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-info" />
            </button>
          ))
        ) : (
          <EmptyState
            className="min-h-32 p-4"
            icon={<Search />}
            title={t("dashboard.knowledge.noResults")}
          />
        )}
      </div>

      {previewDoc ? (
        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-info/20 bg-info/10 p-2.5 text-xs text-info">
          <span className="flex min-w-0 items-center gap-1.5">
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {t("dashboard.knowledge.previewing")} {previewDoc}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setPreviewDoc(null)}
          >
            {t("dashboard.knowledge.close")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
