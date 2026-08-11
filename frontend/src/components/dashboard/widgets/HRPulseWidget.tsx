"use client";

import { useState } from "react";
import { Calendar, Check, Clock, UserCheck, X } from "lucide-react";

import { useLocalization } from "@/contexts/LocalizationContext";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { Tag } from "@/components/ui/tag";

const INITIAL_LEAVES = [
  { id: "l1", nameKey: "emp1Name", typeKey: "emp1Type", daysKey: "emp1Days" },
  { id: "l2", nameKey: "emp2Name", typeKey: "emp2Type", daysKey: "emp2Days" },
] as const;

export default function HRPulseWidget() {
  const { t } = useLocalization();
  const [isCheckedIn, setIsCheckedIn] = useState(true);
  const [pendingLeaveIds, setPendingLeaveIds] = useState<string[]>(
    INITIAL_LEAVES.map((leave) => leave.id),
  );

  const resolveLeave = (id: string) =>
    setPendingLeaveIds((current) => current.filter((item) => item !== id));

  const pendingLeaves = INITIAL_LEAVES.filter((leave) =>
    pendingLeaveIds.includes(leave.id),
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          padding="sm"
          label={t("dashboard.hr.present")}
          value="42"
          className="border-success/20 bg-success/10"
        />
        <StatTile
          padding="sm"
          label={t("dashboard.hr.remote")}
          value="12"
          className="border-info/20 bg-info/10"
        />
        <StatTile
          padding="sm"
          label={t("dashboard.hr.onLeave")}
          value="3"
          className="border-warning/20 bg-warning/10"
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-bold">
            <Calendar className="size-3.5 text-info" aria-hidden />
            {t("dashboard.hr.pendingLeaves")}
          </h3>
          <Tag tone="info">{pendingLeaves.length}</Tag>
        </div>

        {pendingLeaves.length ? (
          <div className="flex max-h-[145px] flex-col gap-2 overflow-y-auto">
            {pendingLeaves.map((leave) => (
              <article
                key={leave.id}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border bg-muted/35 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">
                    {t(`dashboard.hr.${leave.nameKey}`)}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    {t(`dashboard.hr.${leave.typeKey}`)} ·{" "}
                    <strong>{t(`dashboard.hr.${leave.daysKey}`)}</strong>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    className="text-success"
                    onClick={() => resolveLeave(leave.id)}
                    title={t("common.approve")}
                    aria-label={t("common.approve")}
                  >
                    <Check />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="destructive"
                    onClick={() => resolveLeave(leave.id)}
                    title={t("common.reject")}
                    aria-label={t("common.reject")}
                  >
                    <X />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            className="min-h-32 flex-1 p-4"
            icon={<UserCheck />}
            title={t("dashboard.hr.allClear")}
            description={t("dashboard.hr.allClearDesc")}
          />
        )}
      </div>

      <Button
        type="button"
        variant={isCheckedIn ? "secondary" : "default"}
        className="w-full"
        onClick={() => setIsCheckedIn((current) => !current)}
      >
        <Clock />
        {isCheckedIn
          ? t("dashboard.hr.checkedIn")
          : t("dashboard.hr.checkInNow")}
      </Button>
    </div>
  );
}
