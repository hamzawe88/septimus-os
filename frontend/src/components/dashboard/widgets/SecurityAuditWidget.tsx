"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, RefreshCw, ShieldCheck, Terminal } from "lucide-react";

import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tag } from "@/components/ui/tag";

interface AuditLog {
  ID?: string;
  id?: string;
  Action?: string;
  action?: string;
  CreatedAt?: string;
  created_at?: string;
}

export default function SecurityAuditWidget() {
  const { t, language } = useLocalization();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [logs, setLogs] = useState<AuditLog[]>([]);

  const fetchSecurityLogs = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await fetchWithAuth(
        `${API_BASE_URL}/admin/audit-logs?filter_type=security&limit=5`,
      );
      if (response.ok) {
        const body = await response.json();
        setLogs(
          Array.isArray(body.data)
            ? body.data
            : Array.isArray(body)
              ? body
              : [],
        );
      }
    } catch (error) {
      console.error("Failed to fetch security logs", error);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(fetchSecurityLogs, 0);
    return () => window.clearTimeout(timer);
  }, [fetchSecurityLogs]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between rounded-[var(--radius-surface)] border border-success/20 bg-success/10 p-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-success text-brand-foreground">
            <ShieldCheck className="size-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-xs font-bold">
              {t("dashboard.security.title")}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {t("dashboard.security.uptime")}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={fetchSecurityLogs}
          disabled={isRefreshing}
          title={t("common.refresh")}
          aria-label={t("common.refresh")}
        >
          <RefreshCw className={isRefreshing ? "animate-spin" : ""} />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-bold">
          <Terminal className="size-3.5 text-info" aria-hidden />
          {t("dashboard.security.recentEvents")}
        </h4>
        <div className="flex max-h-[160px] flex-col gap-2 overflow-y-auto">
          {logs.length ? (
            logs.map((log, index) => {
              const actionName = String(log.Action || log.action || "-");
              const date = new Date(
                log.CreatedAt || log.created_at || new Date(),
              );
              const isWarning = /failure|error/i.test(actionName);
              return (
                <article
                  key={log.ID || log.id || `${actionName}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border bg-muted/35 p-2.5 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`size-2 shrink-0 rounded-full ${
                        isWarning ? "bg-warning" : "bg-success"
                      }`}
                    />
                    <span className="truncate font-semibold">
                      {t(`admin.auditLogs.actions.${actionName}`, actionName)}
                    </span>
                  </span>
                  <time className="shrink-0 text-muted-foreground">
                    {date.toLocaleTimeString(language, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </article>
              );
            })
          ) : (
            <EmptyState
              className="min-h-28 p-3"
              icon={<ShieldCheck />}
              title={t("dashboard.security.noEvents")}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <Lock className="size-3.5 shrink-0 text-success" aria-hidden />
        <span className="flex-1 truncate">
          {t("dashboard.security.encryption")}
        </span>
        <Tag tone="neutral" className="font-mono">
          {t("dashboard.security.node")}
        </Tag>
      </div>
    </div>
  );
}
