import React from "react";
import { Check, CheckSquare, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProvenanceSurface } from "@/components/ui/provenance";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";
import type { AIProposal } from "@/types";

interface AIAutoPlanModalProps {
  isOpen: boolean;
  proposal: AIProposal | null;
  isAssigning: boolean;
  onClose: () => void;
  onAccept: () => void;
  priorities: { label: string; value: number; badge?: string }[];
}

export function AIAutoPlanModal({
  isOpen,
  proposal,
  isAssigning,
  onClose,
  onAccept,
  priorities,
}: AIAutoPlanModalProps) {
  const { t } = useLocalization();
  if (!proposal) return null;

  const totalLoad = proposal.selectedTasks.reduce(
    (sum, task) => sum + (task.StoryPoints || 0),
    0,
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-brand" aria-hidden />
            {t("pm.autoPlan.title")}
          </DialogTitle>
          <DialogDescription>
            {t("pm.autoPlan.description")} {proposal.targetSprint.Name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto">
          <ProvenanceSurface level="assumption">
            <p className="font-semibold">{t("pm.autoPlan.rationale")}</p>
            <p>{proposal.rationale}</p>
            <p className="mt-2 text-xs">{t("pm.autoPlan.reviewWarning")}</p>
          </ProvenanceSurface>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              {t("pm.autoPlan.proposedItems")} ({proposal.selectedTasks.length})
            </h3>
            <Tag tone={totalLoad > proposal.capacityPoints ? "warning" : "brand"}>
              {t("pm.autoPlan.totalLoad")}: {totalLoad} / {proposal.capacityPoints} {t("pm.autoPlan.points")}
            </Tag>
          </div>

          <div className="max-h-64 space-y-2 overflow-y-auto pe-1">
            {proposal.selectedTasks.map((task) => {
              const priority =
                priorities.find((item) => item.value === (task.Priority || 0)) ||
                priorities[priorities.length - 1];
              const priorityTone =
                (task.Priority || 0) === 1
                  ? "danger"
                  : (task.Priority || 0) === 2
                    ? "warning"
                    : (task.Priority || 0) === 3
                      ? "brand"
                      : "neutral";
              return (
                <article
                  key={task.ID}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-surface-subtle p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <CheckSquare className="size-4 shrink-0 text-brand" aria-hidden />
                    <span className="shrink-0 font-mono text-xs font-bold text-muted-foreground">
                      T-{task.ID.substring(0, 4)}
                    </span>
                    <span className="truncate text-sm font-semibold">{task.Title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tag tone={priorityTone}>{priority?.label}</Tag>
                    <Tag tone="neutral">
                      {task.StoryPoints || 0} {t("pm.autoPlan.points")}
                    </Tag>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isAssigning}>
            {t("pm.autoPlan.discard")}
          </Button>
          <Button onClick={onAccept} disabled={isAssigning}>
            {isAssigning ? <Loader2 className="animate-spin" /> : <Check />}
            {isAssigning
              ? t("pm.autoPlan.assigning")
              : `${t("pm.autoPlan.accept")} (${proposal.selectedTasks.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
