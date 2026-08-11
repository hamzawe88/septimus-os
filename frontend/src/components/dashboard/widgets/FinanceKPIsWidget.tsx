"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Coins,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";

interface InvoiceEntityLite {
  data?: { status?: string; amount?: number | string };
  created_at?: string;
  CreatedAt?: string;
  created_at_date?: string;
}

const CURRENCIES = ["LYD", "USD", "EUR"] as const;
type Currency = (typeof CURRENCIES)[number];

const CURRENCY_MULTIPLIER: Record<Currency, number> = {
  LYD: 1,
  USD: 0.206,
  EUR: 0.189,
};

export default function FinanceKPIsWidget() {
  const { t, language } = useLocalization();
  const [currency, setCurrency] = useState<Currency>("LYD");
  const [revenue, setRevenue] = useState(124_500);
  const [expenses, setExpenses] = useState(42_300);
  const [revenueChange, setRevenueChange] = useState(14);
  const [expenseChange, setExpenseChange] = useState(-2);
  const [loading, setLoading] = useState(true);
  const [invoiceApproved, setInvoiceApproved] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchInvoices = async () => {
      try {
        const response = await fetchWithAuth(
          `${API_BASE_URL}/entities?module=finance&type=invoice`,
        );
        if (!response.ok) return;
        const body = await response.json();
        if (!mounted || !Array.isArray(body.entities)) return;

        const now = new Date();
        const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        let currentRevenue = 0;
        let previousRevenue = 0;
        (body.entities as InvoiceEntityLite[])
          .filter((entity) => entity.data?.status === "paid")
          .forEach((entity) => {
            const amount = Number(entity.data?.amount || 0);
            const date = new Date(
              entity.created_at ||
                entity.CreatedAt ||
                entity.created_at_date ||
                now,
            );
            if (
              date.getMonth() === now.getMonth() &&
              date.getFullYear() === now.getFullYear()
            ) {
              currentRevenue += amount;
            }
            if (
              date.getMonth() === previousMonth.getMonth() &&
              date.getFullYear() === previousMonth.getFullYear()
            ) {
              previousRevenue += amount;
            }
          });

        if (currentRevenue > 0) {
          const currentExpenses = currentRevenue * 0.34;
          setRevenue(currentRevenue);
          setExpenses(currentExpenses);
          if (previousRevenue > 0) {
            setRevenueChange(
              ((currentRevenue - previousRevenue) / previousRevenue) * 100,
            );
            setExpenseChange(
              ((currentExpenses - previousRevenue * 0.34) /
                (previousRevenue * 0.34)) *
                100,
            );
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    fetchInvoices();
    return () => {
      mounted = false;
    };
  }, []);

  const displayCurrency = (value: number) =>
    new Intl.NumberFormat(language, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value * CURRENCY_MULTIPLIER[currency]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-bold">
          <Coins className="size-4 shrink-0 text-success" aria-hidden />
          <span className="truncate">{t("dashboard.finance.treasury")}</span>
        </h3>
        <div className="flex items-center gap-0.5 rounded-[var(--radius-control)] bg-muted p-0.5">
          {CURRENCIES.map((item) => (
            <Button
              type="button"
              key={item}
              variant={currency === item ? "default" : "ghost"}
              size="xs"
              onClick={() => setCurrency(item)}
              aria-pressed={currency === item}
            >
              {item}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          padding="sm"
          label={t("dashboard.monthlyRevenue")}
          value={loading ? "…" : displayCurrency(revenue)}
          detail={`${revenueChange >= 0 ? "+" : ""}${revenueChange.toFixed(1)}% ${t("dashboard.vsLast")}`}
          icon={<TrendingUp />}
          className="border-success/20 bg-success/10"
        />
        <StatTile
          padding="sm"
          label={t("dashboard.monthlyExpenses")}
          value={loading ? "…" : displayCurrency(expenses)}
          detail={`${expenseChange > 0 ? "+" : ""}${expenseChange.toFixed(1)}% ${t("dashboard.vsLast")}`}
          icon={<TrendingDown />}
          className="border-destructive/20 bg-destructive/10"
        />
      </div>

      <section className="flex flex-col gap-3 rounded-[var(--radius-surface)] border border-border bg-muted/35 p-3">
        <div className="flex items-center justify-between gap-2 text-xs font-bold">
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            <Activity className="size-3.5 shrink-0 text-info" aria-hidden />
            <span className="truncate">
              {t("dashboard.finance.netCashflow")}
            </span>
          </span>
          <strong className="shrink-0 font-mono text-success">
            {displayCurrency(revenue - expenses)}
          </strong>
        </div>

        {!invoiceApproved ? (
          <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
            <span className="truncate text-xs text-muted-foreground">
              {t("dashboard.financePendingInvoice")}
            </span>
            <Button
              type="button"
              size="xs"
              onClick={() => setInvoiceApproved(true)}
            >
              {t("dashboard.financeApproveNow")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1 border-t border-border pt-2 text-xs font-bold text-success">
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
            <span>{t("dashboard.financeInvoiceApproved")}</span>
          </div>
        )}
      </section>
    </div>
  );
}
