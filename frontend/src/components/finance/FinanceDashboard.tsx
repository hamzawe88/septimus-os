"use client";

import React, { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import DashboardKPIs from "./DashboardKPIs";
import CashFlowChart from "./charts/CashFlowChart";
import ExpensesDonutChart from "./charts/ExpensesDonutChart";
import ForecastChart from "./charts/ForecastChart";
import RecentTransactions from "./RecentTransactions";

interface Entity {
  ID: string;
  CreatedAt: string;
  data?: Record<string, unknown>;
}

interface ForecastData {
  month: string;
  revenue: number;
  expenses: number;
  isForecast?: boolean;
}

interface ForecastResponse {
  forecast?: ForecastData[];
  insight?: string;
}

export default function FinanceDashboard() {
  const { t } = useLocalization();
  const [invoices, setInvoices] = useState<Entity[]>([]);
  const [expenses, setExpenses] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [forecastData, setForecastData] = useState<ForecastData[]>([]);
  const [forecastInsight, setForecastInsight] = useState("");
  const [generatingForecast, setGeneratingForecast] = useState(false);

  useEffect(() => {
    const fetchFinanceData = async () => {
      try {
        setLoading(true);
        const invRes = await apiGet("/entities?type=finance_invoice");
        const expRes = await apiGet("/entities?type=finance_expense");
        setInvoices(Array.isArray(invRes) ? invRes : []);
        setExpenses(Array.isArray(expRes) ? expRes : []);
      } catch (err) {
        console.error("Failed to fetch finance data", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFinanceData();
  }, []);

  // Calculate totals
  const totalRevenue = invoices.reduce((sum, inv) => sum + (Number(inv.data?.amount) || 0), 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + (Number(exp.data?.amount) || 0), 0);
  const netIncome = totalRevenue - totalExpenses;
  const outstandingInvoices = invoices.filter(i => i.data?.status === "pending").length;

  // Mock cash flow data for demonstration until real dates are bucketed
  const cashFlowData = [
    { month: "Jan", revenue: 4000, expenses: 2400 },
    { month: "Feb", revenue: 3000, expenses: 1398 },
    { month: "Mar", revenue: 2000, expenses: 9800 },
    { month: "Apr", revenue: 2780, expenses: 3908 },
    { month: "May", revenue: 1890, expenses: 4800 },
    { month: "Jun", revenue: 2390, expenses: 3800 },
    { month: "Jul", revenue: totalRevenue > 0 ? totalRevenue : 3490, expenses: totalExpenses > 0 ? totalExpenses : 4300 },
  ];

  // Dynamic categorization of expenses based on actual data
  const calculateExpenseBreakdown = () => {
    if (expenses.length === 0) {
      // Mock data if no real expenses
      return [
        { name: "salaries", label: t("finance.categories.salaries"), value: 4000 },
        { name: "marketing", label: t("finance.categories.marketing"), value: 3000 },
        { name: "rent", label: t("finance.categories.rent"), value: 2000 },
        { name: "operations", label: t("finance.categories.operations"), value: 2780 },
        { name: "other", label: t("finance.categories.other"), value: 1890 }
      ];
    }
    
    const breakdown: Record<string, number> = {};
    expenses.forEach(exp => {
      const cat = (exp.data?.category as string) || "other";
      const amount = Number(exp.data?.amount) || 0;
      breakdown[cat] = (breakdown[cat] || 0) + amount;
    });

    return Object.keys(breakdown).map(key => ({
      name: key,
      label: t(`finance.categories.${key.toLowerCase()}`, key),
      value: breakdown[key]
    })).sort((a, b) => b.value - a.value).slice(0, 5); // top 5
  };

  const expenseBreakdownData = calculateExpenseBreakdown();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 dark:bg-[#121212]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8 bg-slate-50 dark:bg-[#121212] transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* Header */}
        <div className="flex justify-between items-end mb-2">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{t("finance.dashboardTitle")}</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">{t("finance.dashboardSubtitle")}</p>
          </div>
          <button 
            onClick={async () => {
              try {
                setGeneratingForecast(true);
                const res = await apiGet("/reports/finance-forecast") as ForecastResponse;
                if (res && res.forecast) {
                  // Merge historical cash flow with forecast
                  const combined = [
                    ...cashFlowData.map(d => ({ ...d, isForecast: false })),
                    ...res.forecast.map((d: ForecastData) => ({ ...d, isForecast: true }))
                  ];
                  setForecastData(combined);
                  setForecastInsight(res.insight || "");
                }
              } catch (e) {
                console.error("Forecast error", e);
              } finally {
                setGeneratingForecast(false);
              }
            }}
            disabled={generatingForecast}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-4 py-2 rounded-lg shadow-md transition-all duration-300 disabled:opacity-50"
          >
            {generatingForecast ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white"></div>
            ) : (
              <span>🔮</span>
            )}
            {t("finance.generateForecast")}
          </button>
        </div>

        {/* KPIs */}
        <DashboardKPIs 
          totalRevenue={totalRevenue}
          totalExpenses={totalExpenses}
          netIncome={netIncome}
          outstandingInvoices={outstandingInvoices}
        />

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {forecastData.length > 0 ? (
              <ForecastChart data={forecastData} insight={forecastInsight} />
            ) : (
              <CashFlowChart data={cashFlowData} />
            )}
          </div>
          <div className="lg:col-span-1">
            <ExpensesDonutChart data={expenseBreakdownData} />
          </div>
        </div>

        {/* Secondary Row (Transactions) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4">
          <div className="lg:col-span-2">
            {/* Future expansion for more detailed analytics can go here */}
          </div>
          <div className="lg:col-span-3">
            <RecentTransactions invoices={invoices} expenses={expenses} />
          </div>
        </div>
        
      </div>
    </div>
  );
}
