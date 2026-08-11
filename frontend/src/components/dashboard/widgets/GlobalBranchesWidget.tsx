"use client";

import { useEffect, useState } from "react";
import { Globe } from "lucide-react";

import { useLocalization } from "@/contexts/LocalizationContext";
import { Tag } from "@/components/ui/tag";

const BRANCHES = [
  { key: "hq", timeZone: "Africa/Tripoli", isOpen: true },
  { key: "dubai", timeZone: "Asia/Dubai", isOpen: true },
  { key: "london", timeZone: "Europe/London", isOpen: false },
  { key: "nyc", timeZone: "America/New_York", isOpen: false },
] as const;

export default function GlobalBranchesWidget() {
  const { t, language } = useLocalization();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setTime(new Date()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const formatBranchTime = (timeZone: string) => {
    try {
      return new Intl.DateTimeFormat(language, {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
      }).format(time);
    } catch {
      return t("dashboard.branches.timeUnavailable");
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-bold">
          <Globe className="size-4 text-info" aria-hidden />
          {t("dashboard.branches.title")}
        </h3>
        <Tag tone="info">
          {BRANCHES.length} {t("dashboard.branches.nodes")}
        </Tag>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto">
        {BRANCHES.map((branch) => (
          <article
            key={branch.key}
            className="flex min-w-0 flex-col justify-between gap-2 rounded-[var(--radius-surface)] border border-border bg-muted/35 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="truncate text-xs font-bold"
                title={t(`dashboard.branches.${branch.key}`)}
              >
                {t(`dashboard.branches.${branch.key}`)}
              </span>
              <span
                className={`size-2 shrink-0 rounded-full ${
                  branch.isOpen ? "bg-success" : "bg-warning"
                }`}
                title={
                  branch.isOpen
                    ? t("dashboard.branches.open")
                    : t("dashboard.branches.standby")
                }
              />
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <time className="font-mono text-sm font-bold">
                {formatBranchTime(branch.timeZone)}
              </time>
              <Tag tone={branch.isOpen ? "success" : "warning"}>
                {branch.isOpen
                  ? t("dashboard.branches.open")
                  : t("dashboard.branches.standby")}
              </Tag>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
