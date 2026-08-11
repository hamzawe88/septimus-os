"use client";

import React from "react";
import {
  Archive,
  Edit3,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  QrCode,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useCorrespondenceStore } from "@/store/useCorrespondenceStore";

import { ArchiveExplorer } from "./ArchiveExplorer";
import { CorrespondenceDashboard } from "./CorrespondenceDashboard";
import { LetterCanvas } from "./LetterCanvas";
import { TemplateDesigner } from "./TemplateDesigner";

export const CorrespondenceView: React.FC = () => {
  const { t } = useLocalization();
  const { activeTab, setActiveTab } = useCorrespondenceStore();
  const tabs = [
    {
      id: "dashboard" as const,
      label: t("correspondence.tabDashboard"),
      icon: LayoutDashboard,
    },
    {
      id: "designer" as const,
      label: t("correspondence.tabTemplates"),
      icon: FileSpreadsheet,
    },
    {
      id: "editor" as const,
      label: t("correspondence.tabEditor"),
      icon: Edit3,
    },
    {
      id: "archive" as const,
      label: t("correspondence.tabArchive"),
      icon: Archive,
    },
  ];

  return (
    <section
      data-testid="correspondence-view"
      className="flex h-full flex-1 flex-col space-y-6 overflow-y-auto p-6 text-foreground"
    >
      <header className="flex flex-col justify-between gap-4 border-b border-border pb-4 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-brand/20 bg-brand-light text-brand">
            <FileText className="size-6" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold sm:text-2xl">
                {t("correspondence.title")}
              </h1>
              <Tag tone="brand">{t("correspondence.dashboard.moduleBadge")}</Tag>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("correspondence.subtitle")}
            </p>
          </div>
        </div>
        <Tag tone="success">
          <QrCode />
          {t("correspondence.dashboard.sealMetadata")}
        </Tag>
      </header>

      <nav
        className="flex flex-wrap items-center gap-2 border-b border-border pb-3"
        aria-label={t("correspondence.dashboard.navigation")}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.id}
              type="button"
              variant={activeTab === tab.id ? "default" : "outline"}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <Icon data-icon="inline-start" />
              {tab.label}
            </Button>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1">
        {activeTab === "dashboard" ? <CorrespondenceDashboard /> : null}
        {activeTab === "designer" ? <TemplateDesigner /> : null}
        {activeTab === "editor" ? <LetterCanvas /> : null}
        {activeTab === "archive" ? <ArchiveExplorer /> : null}
      </div>
    </section>
  );
};
