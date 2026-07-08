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
    <div className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col h-full">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {t("finance.aiForecastTitle")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("finance.aiForecastSubtitle")}
          </p>
        </div>
        <div className="bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-400 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
          Gemini AI
        </div>
      </div>

      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748b", fontSize: 12 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#64748b", fontSize: 12 }}
              tickFormatter={(value) => `$${value}`}
              dx={-10}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "rgba(15, 23, 42, 0.9)",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
              itemStyle={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 500 }}
              labelStyle={{ color: "#94a3b8", marginBottom: "8px" }}
              formatter={(value) => [`$${Number(value || 0).toLocaleString()}`, ""]}
            />
            <Legend wrapperStyle={{ paddingTop: "20px" }} />
            <Line
              type="monotone"
              name={t("finance.revenueLabel")}
              dataKey="revenue"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={<CustomizedDot />}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              name={t("finance.expensesLabel")}
              dataKey="expenses"
              stroke="#ef4444"
              strokeWidth={3}
              dot={<CustomizedDot />}
              activeDot={{ r: 6, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {insight && (
        <div className="mt-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-100 dark:border-slate-700">
          <div className="flex gap-3">
            <div className="text-2xl">💡</div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
                {t("finance.aiInsightLabel")}
              </h4>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {insight}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
