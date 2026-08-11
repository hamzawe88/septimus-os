"use client";

import React, { useEffect, useState } from "react";
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock,
  Eye,
  FileSpreadsheet,
  FileText,
  Plus,
  QrCode,
  ShieldCheck,
  Stamp,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { Surface } from "@/components/ui/surface";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";
import {
  Correspondence,
  useCorrespondenceStore,
} from "@/store/useCorrespondenceStore";

type TagTone =
  | "neutral"
  | "warning"
  | "success"
  | "brand"
  | "danger";

export const CorrespondenceDashboard: React.FC = () => {
  const { t } = useLocalization();
  const {
    correspondences,
    fetchCorrespondences,
    fetchTemplates,
    setActiveTab,
    setSelectedCorrespondence,
    signCorrespondence,
    loading,
  } = useCorrespondenceStore();
  const [signError, setSignError] = useState("");

  useEffect(() => {
    void Promise.all([fetchCorrespondences(), fetchTemplates()]);
  }, [fetchCorrespondences, fetchTemplates]);

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

  const renderStatus = (status?: string) => {
    const config = statusConfig[status || "draft"] || statusConfig.draft;
    return (
      <Tag tone={config.tone}>
        {config.icon}
        {config.label}
      </Tag>
    );
  };

  const renderClassification = (classification?: string) => {
    const key =
      classification === "top_secret"
        ? "topSecret"
        : classification === "confidential"
          ? "confidential"
          : "public";
    const tone: TagTone =
      key === "topSecret" ? "danger" : key === "confidential" ? "warning" : "neutral";
    return (
      <Tag tone={tone}>
        {t(`correspondence.dashboard.classification.${key}`)}
      </Tag>
    );
  };

  const handleQuickSign = async (item: Correspondence) => {
    setSignError("");
    try {
      await signCorrespondence(item.id);
    } catch (error) {
      console.error(error);
      setSignError(t("correspondence.dashboard.signFailed"));
    }
  };

  const stats = [
    {
      label: t("correspondence.statsTotal"),
      value: correspondences.length,
      icon: <FileText />,
    },
    {
      label: t("correspondence.statsDrafts"),
      value: correspondences.filter((item) => item.status === "draft").length,
      icon: <Clock />,
    },
    {
      label: t("correspondence.statsPendingSign"),
      value: correspondences.filter((item) => item.status === "pending_signature").length,
      icon: <Stamp />,
    },
    {
      label: t("correspondence.statsSigned"),
      value: correspondences.filter((item) => item.status === "signed").length,
      icon: <CheckCircle2 />,
    },
    {
      label: t("correspondence.statsArchived"),
      value: correspondences.filter((item) => item.status === "archived").length,
      icon: <Archive />,
    },
  ];

  return (
    <div data-testid="correspondence-dashboard" className="space-y-6">
      <Surface className="flex flex-col items-start justify-between gap-4 border-brand/20 bg-brand-light md:flex-row md:items-center">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand/10 text-brand">
            <ShieldCheck className="size-6" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold">
                {t("correspondence.dashboard.sealSystemTitle")}
              </h3>
              <Tag tone="success">
                <QrCode />
                {t("correspondence.dashboard.sealMetadata")}
              </Tag>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t("correspondence.externalSignatureNotice")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setActiveTab("editor")}>
            <Plus data-icon="inline-start" />
            {t("correspondence.newLetter")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setActiveTab("designer")}
          >
            <FileSpreadsheet data-icon="inline-start" />
            {t("correspondence.newTemplate")}
          </Button>
        </div>
      </Surface>

      {signError ? (
        <Alert tone="danger">
          <AlertCircle />
          <AlertDescription>{signError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => (
          <StatTile
            key={stat.label}
            icon={stat.icon}
            label={stat.label}
            value={stat.value}
          />
        ))}
      </div>

      <Surface className="space-y-5">
        <header className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <FileText className="size-5 text-brand" />
              {t("correspondence.dashboard.logTitle")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("correspondence.dashboard.logDescription")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setActiveTab("archive")}
          >
            <Archive data-icon="inline-start" />
            {t("correspondence.dashboard.openArchive")}
          </Button>
        </header>

        {loading && correspondences.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t("correspondence.dashboard.loading")}
          </p>
        ) : correspondences.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title={t("correspondence.noItems")}
            description={t("correspondence.dashboard.emptyDescription")}
            action={
              <Button type="button" onClick={() => setActiveTab("editor")}>
                <Plus data-icon="inline-start" />
                {t("correspondence.newLetter")}
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-start text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-bold text-muted-foreground">
                  <th className="px-4 py-3 text-start">
                    {t("correspondence.dashboard.serial")}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {t("correspondence.dashboard.subject")}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {t("correspondence.confidentiality")}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {t("correspondence.statusLabel")}
                  </th>
                  <th className="px-4 py-3 text-start">
                    {t("correspondence.signedByLabel")}
                  </th>
                  <th className="px-4 py-3 text-end">
                    {t("common.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {correspondences.slice(0, 8).map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-muted">
                    <td className="px-4 py-3 font-mono font-bold text-brand">
                      {item.serial_number ||
                        t("correspondence.dashboard.draftSerial")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 font-medium">
                        <span className="truncate">
                          {item.title ||
                            t("correspondence.dashboard.untitled")}
                        </span>
                        {item.urgent ? (
                          <Tag tone="danger">
                            <AlertCircle />
                            {t("correspondence.urgent")}
                          </Tag>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {item.content}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {renderClassification(item.confidentiality)}
                    </td>
                    <td className="px-4 py-3">{renderStatus(item.status)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {item.signed_by || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => {
                            setSelectedCorrespondence(item);
                            setActiveTab("editor");
                          }}
                          aria-label={t("correspondence.dashboard.viewEdit")}
                        >
                          <Eye />
                        </Button>
                        {item.status === "pending_signature" ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleQuickSign(item)}
                          >
                            <QrCode data-icon="inline-start" />
                            {t("correspondence.dashboard.seal")}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
};
