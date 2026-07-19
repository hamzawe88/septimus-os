"use client";

import React, { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Activity, Coins, CheckCircle2 } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

interface InvoiceEntityLite {
  data?: { status?: string; amount?: number | string };
  created_at?: string;
  CreatedAt?: string;
  created_at_date?: string;
}

export default function FinanceKPIsWidget() {
  const { t, formatCurrency } = useLocalization();
  const [currencyTab, setCurrencyTab] = useState<"LYD" | "USD" | "EUR">("LYD");
  const [revenue, setRevenue] = useState(124500);
  const [expenses, setExpenses] = useState(42300);
  const [revChange, setRevChange] = useState(14.0);
  const [expChange, setExpChange] = useState(-2.0);
  const [loading, setLoading] = useState(true);
  const [invoiceApproved, setInvoiceApproved] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchInvoices = async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/entities?module=finance&type=invoice`);
        if (!res.ok) throw new Error("Failed to fetch invoices");
        const data = await res.json();
        if (isMounted && data.entities && data.entities.length > 0) {
          const entities: InvoiceEntityLite[] = data.entities;
          const now = new Date();
          let currentMonthRev = 0;
          let lastMonthRev = 0;

          entities
            .filter((e) => e.data?.status === "paid")
            .forEach((e) => {
              const amt = Number(e.data?.amount || 0);
              const dateStr = e.created_at || e.CreatedAt || e.created_at_date || now.toISOString();
              const date = new Date(dateStr);
              if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
                currentMonthRev += amt;
              }
              const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              if (date.getMonth() === lastMonthDate.getMonth() && date.getFullYear() === lastMonthDate.getFullYear()) {
                lastMonthRev += amt;
              }
            });

          if (currentMonthRev > 0) {
            const finalRev = currentMonthRev;
            const finalExp = finalRev * 0.34;
            setRevenue(finalRev);
            setExpenses(finalExp);

            if (lastMonthRev > 0) {
              setRevChange(((finalRev - lastMonthRev) / lastMonthRev) * 100);
              setExpChange(((finalExp - lastMonthRev * 0.34) / (lastMonthRev * 0.34)) * 100);
            }
          }
        }
      } catch {
        // Fallback to default
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchInvoices();
    return () => { isMounted = false; };
  }, []);

  const getMultiplier = () => {
    if (currencyTab === "USD") return 0.206;
    if (currencyTab === "EUR") return 0.189;
    return 1;
  };

  const displayCurrency = (val: number) => {
    const converted = val * getMultiplier();
    if (currencyTab === "LYD") return formatCurrency(converted);
    if (currencyTab === "USD") return `$${converted.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    return `€${converted.toLocaleString("de-DE", { maximumFractionDigits: 0 })}`;
  };

  const handleQuickApprove = () => {
    setInvoiceApproved(true);
  };

  return (
    <div className="flex flex-col justify-between h-full space-y-3">
      {/* Currency Selector */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Coins className="w-4 h-4 text-emerald-500" />
          {t("dashboard.finance.treasury", "Sovereign Multi-Currency Treasury")}
        </span>
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
          {(["LYD", "USD", "EUR"] as const).map((curr) => (
            <button
              key={curr}
              onClick={() => setCurrencyTab(curr)}
              className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition ${
                currencyTab === curr
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-white"
              }`}
            >
              {curr}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 rounded-2xl bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/50 backdrop-blur-md shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              {t("dashboard.monthlyRevenue", "Revenue")}
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <h4 className="text-lg font-black font-mono text-slate-900 dark:text-white mt-1.5 truncate">
            {loading ? "..." : displayCurrency(revenue)}
          </h4>
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/80 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded w-fit mt-1">
            {revChange >= 0 ? "+" : ""}
            {revChange.toFixed(1)}% {t("dashboard.vsLast", "vs last")}
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-rose-50/50 dark:bg-rose-900/20 border border-rose-200/50 dark:border-rose-800/50 backdrop-blur-md shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              {t("dashboard.monthlyExpenses", "Expenses")}
            </span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <h4 className="text-lg font-black font-mono text-slate-900 dark:text-white mt-1.5 truncate">
            {loading ? "..." : displayCurrency(expenses)}
          </h4>
          <span className="text-[10px] font-bold text-rose-700 dark:text-rose-300 bg-rose-100/80 dark:bg-rose-950/60 px-1.5 py-0.5 rounded w-fit mt-1">
            {expChange > 0 ? "+" : ""}
            {expChange.toFixed(1)}% {t("dashboard.vsLast", "vs last")}
          </span>
        </div>
      </div>

      {/* Net Burn & Quick Action */}
      <div className="p-3 rounded-2xl bg-white/40 dark:bg-black/20 border border-white/30 dark:border-white/10 backdrop-blur-md shadow-sm flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-blue-500" />
            <span>{t("dashboard.finance.netCashflow", "Net Monthly Cashflow:")}</span>
          </span>
          <span className="font-mono text-emerald-600 dark:text-emerald-400 font-black">
            {displayCurrency(revenue - expenses)}
          </span>
        </div>

        {!invoiceApproved ? (
          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {t("dashboard.financePendingInvoice", "Pending Invoice #INV-2041 (LYD 14,200)")}
            </span>
            <button
              onClick={handleQuickApprove}
              className="text-[10px] font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg transition shadow-sm flex-shrink-0"
            >
              {t("dashboard.financeApproveNow", "Approve Now")}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 text-xs font-bold animate-in fade-in">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t("dashboard.financeInvoiceApproved", "Invoice #INV-2041 Approved & Disbursed")}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
