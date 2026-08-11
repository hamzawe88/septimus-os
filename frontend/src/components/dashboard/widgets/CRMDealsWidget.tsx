"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Briefcase,
  DollarSign,
  Plus,
} from "lucide-react";

import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { Tag } from "@/components/ui/tag";
import {
  CRMLeadEntity,
  CRM_STAGE_LABEL_KEYS,
  CRM_STAGES,
  CRMStage,
  isClosedCRMStage,
  normalizeCRMStage,
} from "@/lib/crm";

const STAGE_COLORS: Record<CRMStage, string> = {
  new: "bg-info",
  contacted: "bg-brand",
  qualified: "bg-brand-hover",
  proposal: "bg-warning",
  negotiation: "bg-warning-hover",
  closed_won: "bg-success",
  closed_lost: "bg-danger",
};

export default function CRMDealsWidget() {
  const router = useRouter();
  const { t, formatCurrency } = useLocalization();
  const [leads, setLeads] = useState<CRMLeadEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchDeals = async () => {
      try {
        const response = await fetchWithAuth(
		  `${API_BASE_URL}/crm/opportunities?limit=100`,
        );
        if (!response.ok) {
          if (mounted) setFailed(true);
          return;
        }
        const body = await response.json();
        if (!mounted) return;
        setLeads(Array.isArray(body.data) ? body.data : []);
        setFailed(false);
      } catch {
        if (mounted) setFailed(true);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchDeals();
    return () => {
      mounted = false;
    };
  }, []);

  const active = leads.filter((lead) =>
    !isClosedCRMStage(normalizeCRMStage(lead.data?.stage || lead.data?.status)),
  );
  const activeDeals = active.length;
  const totalPipeline = active.reduce(
    (sum, lead) => sum + (Number(lead.data?.value) || 0),
    0,
  );
  const topDeals = [...active]
    .sort((left, right) => (Number(right.data?.value) || 0) - (Number(left.data?.value) || 0))
    .slice(0, 3);
  const stageCounts = CRM_STAGES.filter((stage) => !isClosedCRMStage(stage)).map((stage) => ({
    stage,
    count: active.filter(
      (lead) => normalizeCRMStage(lead.data?.stage || lead.data?.status) === stage,
    ).length,
  }));

  return (
    <div className="relative flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          padding="sm"
          label={t("dashboard.openDeals")}
          value={loading ? "…" : activeDeals}
          detail={failed ? t("common.unavailable") : t("crm.totalActiveLeads")}
          icon={<Briefcase />}
          className="border-info/20 bg-info/10"
        />
        <StatTile
          padding="sm"
          label={t("dashboard.value")}
          value={loading ? "…" : formatCurrency(totalPipeline)}
          detail={`${t("dashboard.crm.avgDeal")} ${formatCurrency(activeDeals ? totalPipeline / activeDeals : 0)}`}
          icon={<DollarSign />}
          className="border-warning/20 bg-warning/10"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-muted-foreground">
            {t("dashboard.crm.stages")}
          </span>
          <span className="font-mono">{activeDeals}</span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-[var(--radius-control)] bg-muted">
          {stageCounts.filter(({ count }) => count > 0).map(({ stage, count }) => (
            <span
              key={stage}
              className={STAGE_COLORS[stage]}
              style={{
                width: `${Math.round((count / activeDeals) * 100)}%`,
              }}
              title={`${t(CRM_STAGE_LABEL_KEYS[stage])}: ${count}`}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
          {stageCounts.filter(({ count }) => count > 0).map(({ stage, count }) => (
            <span key={stage} className="flex items-center gap-1 truncate">
              <span className={`size-1.5 shrink-0 rounded-full ${STAGE_COLORS[stage]}`} />
              {t(CRM_STAGE_LABEL_KEYS[stage])} ({count})
            </span>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold">
            {t("dashboard.crm.topDeals")}
          </h3>
          <Button type="button" size="xs" onClick={() => router.push("/crm")}>
            <Plus />
            {t("dashboard.crm.addLead")}
          </Button>
        </div>
        <div className="flex max-h-[135px] flex-col gap-2 overflow-y-auto">
          {!loading && topDeals.length === 0 ? (
            <p className="rounded-[var(--radius-control)] border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              {failed ? t("common.unavailable") : t("crm.noLeads")}
            </p>
          ) : null}
          {topDeals.map((deal) => {
            const stage = normalizeCRMStage(deal.data?.stage || deal.data?.status);
            return (
            <article
              key={deal.id}
              className="flex items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border bg-muted/35 p-2.5"
            >
              <div className="min-w-0">
                <h4 className="truncate text-xs font-bold">
                  {deal.data?.company || deal.data?.name || t("common.noName")}
                </h4>
                <Tag tone="warning">
                  {t(CRM_STAGE_LABEL_KEYS[stage])}
                </Tag>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <strong className="font-mono text-xs">
                  {formatCurrency(Number(deal.data?.value) || 0)}
                </strong>
                <ArrowUpRight className="size-3.5 text-muted-foreground" />
              </div>
            </article>
          )})}
        </div>
      </div>
    </div>
  );
}
