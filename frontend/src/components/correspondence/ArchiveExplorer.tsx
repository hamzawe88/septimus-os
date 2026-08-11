"use client";

import React, { useEffect, useState } from "react";
import {
  Archive,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Filter,
  GitBranch,
  QrCode,
  Search,
  ShieldCheck,
  Stamp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";
import {
  Correspondence,
  useCorrespondenceStore,
} from "@/store/useCorrespondenceStore";
import { cn } from "@/lib/utils";

type TagTone = "neutral" | "warning" | "success" | "brand";

export const ArchiveExplorer: React.FC = () => {
  const { t } = useLocalization();
  const {
    correspondences,
    fetchCorrespondences,
    setSelectedCorrespondence,
    setActiveTab,
    loading,
  } = useCorrespondenceStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<Correspondence | null>(null);

  useEffect(() => {
    void fetchCorrespondences({
      status: statusFilter !== "all" ? statusFilter : undefined,
      search: search || undefined,
    });
  }, [fetchCorrespondences, search, statusFilter]);

  const filtered = correspondences.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    const query = search.trim().toLocaleLowerCase();
    if (!query) return true;
    return [item.title, item.serial_number, item.content].some((value) =>
      (value || "").toLocaleLowerCase().includes(query),
    );
  });

  const statusConfig: Record<
    string,
    { label: string; tone: TagTone; icon: React.ReactNode }
  > = {
    draft: {
      label: t("correspondence.archive.status.draft"),
      tone: "neutral",
      icon: <Clock />,
    },
    pending_signature: {
      label: t("correspondence.archive.status.pending"),
      tone: "warning",
      icon: <Stamp />,
    },
    signed: {
      label: t("correspondence.archive.status.signed"),
      tone: "success",
      icon: <CheckCircle2 />,
    },
    archived: {
      label: t("correspondence.archive.status.archived"),
      tone: "brand",
      icon: <Archive />,
    },
  };

  const statusTag = (status?: string) => {
    const config = statusConfig[status || "draft"] || statusConfig.draft;
    return (
      <Tag tone={config.tone}>
        {config.icon}
        {config.label}
      </Tag>
    );
  };

  const filters = [
    { key: "all", label: t("correspondence.archive.filters.all") },
    { key: "draft", label: t("correspondence.archive.filters.draft") },
    {
      key: "pending_signature",
      label: t("correspondence.archive.filters.pending"),
    },
    { key: "signed", label: t("correspondence.archive.filters.signed") },
    { key: "archived", label: t("correspondence.archive.filters.archived") },
  ];

  return (
    <div data-testid="correspondence-archive" className="space-y-6">
      <Surface className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div className="relative w-full md:w-96">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("correspondence.archive.searchPlaceholder")}
            aria-label={t("correspondence.archive.search")}
            className="ps-9"
          />
        </div>
        <div className="flex w-full items-center gap-2 overflow-x-auto md:w-auto">
          <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-muted-foreground">
            <Filter className="size-3.5" />
            {t("correspondence.archive.filterLabel")}
          </span>
          {filters.map((filter) => (
            <Button
              key={filter.key}
              type="button"
              size="xs"
              variant={statusFilter === filter.key ? "default" : "outline"}
              onClick={() => setStatusFilter(filter.key)}
              aria-pressed={statusFilter === filter.key}
            >
              {filter.label}
            </Button>
          ))}
        </div>
      </Surface>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Surface className="space-y-4 lg:col-span-8">
          <header className="flex items-center gap-2 border-b border-border pb-4">
            <Archive className="size-5 text-brand" />
            <h3 className="font-bold">{t("correspondence.archive.title")}</h3>
            <Tag tone="brand">{filtered.length}</Tag>
          </header>

          {loading && filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("correspondence.archive.loading")}
            </p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FileText />}
              title={t("correspondence.archive.empty")}
              description={t("correspondence.archive.emptyDescription")}
            />
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((item) => (
                <article
                  key={item.id}
                  className={cn(
                    "flex cursor-pointer flex-col justify-between gap-3 rounded-[var(--radius-control)] border border-transparent px-3 py-4 transition-colors sm:flex-row sm:items-center",
                    selectedItem?.id === item.id
                      ? "border-brand/20 bg-brand-light"
                      : "hover:bg-muted",
                  )}
                  onClick={() => setSelectedItem(item)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Tag tone="info">
                        {item.serial_number || t("correspondence.archive.draftSerial")}
                      </Tag>
                      {statusTag(item.status)}
                      {item.urgent ? (
                        <Tag tone="danger">{t("correspondence.archive.urgent")}</Tag>
                      ) : null}
                    </div>
                    <h4 className="truncate text-sm font-bold">
                      {item.title || t("correspondence.archive.untitled")}
                    </h4>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {item.content}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedCorrespondence(item);
                      setActiveTab("editor");
                    }}
                  >
                    <Eye data-icon="inline-start" />
                    {t("correspondence.archive.viewDocument")}
                  </Button>
                </article>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="space-y-4 self-start lg:sticky lg:top-6 lg:col-span-4">
          <header className="flex items-center gap-2 border-b border-border pb-3">
            <GitBranch className="size-5 text-brand" />
            <h4 className="font-bold">{t("correspondence.archive.routingTitle")}</h4>
          </header>

          {!selectedItem ? (
            <EmptyState
              icon={<GitBranch />}
              title={t("correspondence.archive.selectRecord")}
              description={t("correspondence.archive.selectRecordDescription")}
            />
          ) : (
            <div className="space-y-6 text-xs">
              <div className="space-y-2 rounded-[var(--radius-control)] border border-border bg-muted p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-bold text-info">
                    {selectedItem.serial_number ||
                      t("correspondence.archive.draftSerial")}
                  </span>
                  {statusTag(selectedItem.status)}
                </div>
                <p className="truncate font-bold">
                  {selectedItem.title || t("correspondence.archive.untitled")}
                </p>
                <p className="line-clamp-2 text-muted-foreground">
                  {selectedItem.content}
                </p>
              </div>

              {selectedItem.status === "signed" ||
              selectedItem.status === "archived" ||
              selectedItem.qr_code ? (
                <div className="space-y-2 rounded-[var(--radius-control)] border border-success/20 bg-success/10 p-4">
                  <p className="flex items-center gap-2 font-bold text-success">
                    <QrCode className="size-5" />
                    <ShieldCheck className="size-4" />
                    {t("correspondence.archive.sealAvailable")}
                  </p>
                  <p className="text-success">
                    {t("correspondence.archive.sealedAt")}:{" "}
                    {selectedItem.signed_at || t("common.na")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("correspondence.archive.sealDescription")}
                  </p>
                </div>
              ) : null}

              <div className="space-y-3">
                <h5 className="font-bold text-foreground">
                  {t("correspondence.archive.routingHistory")}
                </h5>
                {!selectedItem.forward_logs ||
                selectedItem.forward_logs.length === 0 ? (
                  <EmptyState
                    title={t("correspondence.archive.noRouting")}
                    description={t("correspondence.archive.noRoutingDescription")}
                    className="min-h-36"
                  />
                ) : (
                  selectedItem.forward_logs.map((log, index) => (
                    <div
                      key={log.id || index}
                      className="relative ps-6 before:absolute before:start-2 before:bottom-0 before:top-2 before:w-0.5 before:bg-brand last:before:hidden"
                    >
                      <span className="absolute start-0.5 top-1.5 size-3.5 rounded-full border-2 border-background bg-brand" />
                      <div className="space-y-1 rounded-[var(--radius-control)] border border-border bg-muted p-3">
                        <div className="flex items-center justify-between gap-2 font-mono text-[10px] font-bold text-brand">
                          <span className="truncate">{log.to_node_path}</span>
                          <span>{log.action_required || t("correspondence.archive.routed")}</span>
                        </div>
                        <p className="font-bold">
                          {t("correspondence.archive.to")}: {log.to_user_id}
                        </p>
                        {log.note ? (
                          <p className="rounded border border-border bg-card p-2 text-muted-foreground">
                            &quot;{log.note}&quot;
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
};
