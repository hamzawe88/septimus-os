import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useThemeStore } from "@/store/useThemeStore";
import { useLocalization } from "@/contexts/LocalizationContext";

interface CashFlowChartProps {
  data: Record<string, unknown>[];
}

export default function CashFlowChart({ data }: CashFlowChartProps) {
  const { primaryColor } = useThemeStore();
  const { t } = useLocalization();

  return (
    <div className="bg-card dark:bg-card rounded-xl shadow-sm border border-border dark:border-border p-6 h-full flex flex-col transition-colors duration-300">
      <h3 className="font-bold text-foreground dark:text-muted-foreground mb-6">{t("finance.cashFlowTitle")}</h3>
      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={primaryColor || "var(--info)"} stopOpacity={0.3} />
                <stop offset="95%" stopColor={primaryColor || "var(--info)"} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--destructive)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--destructive)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              stroke="var(--muted-foreground)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${value}`}
            />
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.2} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(26, 26, 26, 0.9)',
                border: 'none',
                borderRadius: '8px',
                color: 'var(--color-paper)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              itemStyle={{ color: 'var(--color-paper)' }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              name={t("finance.revenueLabel")}
              stroke={primaryColor || "var(--info)"}
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorRevenue)"
              animationDuration={1500}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              name={t("finance.expensesLabel")}
              stroke="var(--destructive)"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorExpenses)"
              animationDuration={1500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
