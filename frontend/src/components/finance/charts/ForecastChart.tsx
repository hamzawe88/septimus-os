"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useThemeStore } from "@/store/useThemeStore";
import { useLocalization } from "@/contexts/LocalizationContext";
import { ProvenanceSurface } from "@/components/ui/provenance";

interface ForecastData {
  month: string;
  revenue: number;
  expenses: number;
  isForecast?: boolean;
}

interface ForecastChartProps {
  data: ForecastData[];
  insight: string;
}

// Custom dot to show dashed lines for forecast data
const CustomizedDot = (props: { cx?: number; cy?: number; stroke?: string; payload?: ForecastData; [key: string]: unknown }) => {
  const { cx = 0, cy = 0, stroke, payload } = props;
  if (payload && payload.isForecast) {
    return (
      <svg x={cx - 5} y={cy - 5} width={10} height={10} fill="white" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="4" stroke={stroke} strokeWidth="2" strokeDasharray="2 2" />
      </svg>
    );
  }
  return (
    <svg x={cx - 4} y={cy - 4} width={8} height={8} fill="white" viewBox="0 0 8 8">
      <circle cx="4" cy="4" r="4" stroke={stroke} strokeWidth="2" />
    </svg>
  );
};

export default function ForecastChart({ data, insight }: ForecastChartProps) {
  useThemeStore(); // using hook to trigger re-render on theme change if needed
  const { t } = useLocalization();

  return (
    <div className="bg-card dark:bg-card rounded-xl shadow-sm border border-border dark:border-border p-6 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-foreground dark:text-muted-foreground">
            {t("finance.aiForecastTitle")}
          </h2>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">
            {t("finance.aiForecastSubtitle")}
          </p>
        </div>
        <div className="bg-brand-light dark:bg-brand/20 text-brand dark:text-brand px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse"></span>
          {t("finance.aiGenerated")}
        </div>
      </div>

      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.2} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickFormatter={(value) => `$${value}`}
              dx={-10}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(15, 23, 42, 0.9)",
                border: "none",
                borderRadius: "8px",
                color: "var(--color-paper)",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
              itemStyle={{ color: "var(--color-paper)", fontSize: "14px", fontWeight: 500 }}
              labelStyle={{ color: "var(--muted-foreground)", marginBottom: "8px" }}
              formatter={(value) => [`$${Number(value || 0).toLocaleString()}`, ""]}
            />
            <Legend wrapperStyle={{ paddingTop: "20px" }} />
            <Line
              type="monotone"
              name={t("finance.revenueLabel")}
              dataKey="revenue"
              stroke="var(--info)"
              strokeWidth={3}
              dot={<CustomizedDot />}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              name={t("finance.expensesLabel")}
              dataKey="expenses"
              stroke="var(--destructive)"
              strokeWidth={3}
              dot={<CustomizedDot />}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {insight && (
        <ProvenanceSurface level="assumption" className="mt-6">
          <div className="flex gap-3">
            <span aria-hidden="true" className="text-2xl">💡</span>
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-foreground dark:text-muted-foreground mb-1">
                {t("finance.aiInsightLabel")}
              </h4>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground leading-relaxed">
                {insight}
              </p>
              <p className="text-xs text-warning">{t("finance.aiForecastProvenance")}</p>
            </div>
          </div>
        </ProvenanceSurface>
      )}
    </div>
  );
}
