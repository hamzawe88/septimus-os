import React from "react";
import { TrendingUp, TrendingDown, DollarSign, FileText } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

interface DashboardKPIsProps {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  outstandingInvoices: number;
}

export default function DashboardKPIs({ 
  totalRevenue, 
  totalExpenses, 
  netIncome, 
  outstandingInvoices 
}: DashboardKPIsProps) {
  const { t } = useLocalization();

  const kpis = [
    {
      title: t("finance.totalRevenue"),
      value: `$${totalRevenue.toLocaleString()}`,
      trend: "+12.5%",
      trendUp: true,
      icon: <DollarSign className="w-5 h-5 text-white" />,
      color: "bg-blue-500",
      description: t("finance.vsLastMonth")
    },
    {
      title: t("finance.totalExpenses"),
      value: `$${totalExpenses.toLocaleString()}`,
      trend: "+5.2%",
      trendUp: false,
      icon: <TrendingDown className="w-5 h-5 text-white" />,
      color: "bg-red-500",
      description: t("finance.vsLastMonth")
    },
    {
      title: t("finance.netIncome"),
      value: `$${netIncome.toLocaleString()}`,
      trend: "+18.1%",
      trendUp: netIncome >= 0,
      icon: <TrendingUp className="w-5 h-5 text-white" />,
      color: "bg-emerald-500",
      description: t("finance.vsLastMonth")
    },
    {
      title: t("finance.outstandingInvoices"),
      value: outstandingInvoices.toString(),
      trend: "-2.4%",
      trendUp: true, // Lower outstanding is good
      icon: <FileText className="w-5 h-5 text-white" />,
      color: "bg-amber-500",
      description: t("finance.pendingInvoices")
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {kpis.map((kpi, index) => (
        <div 
          key={index}
          className="group bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 transition-all duration-300 hover:shadow-md hover:-translate-y-1 relative overflow-hidden"
        >
          {/* Subtle background glow effect on hover */}
          <div className={`absolute -end-6 -top-6 w-24 h-24 rounded-full opacity-0 group-hover:opacity-10 transition-opacity duration-500 ${kpi.color}`} />
          
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{kpi.title}</p>
              <h3 className="text-3xl font-bold text-slate-800 dark:text-slate-100">{kpi.value}</h3>
            </div>
            <div className={`p-3 rounded-xl shadow-sm ${kpi.color}`}>
              {kpi.icon}
            </div>
          </div>
          
          <div className="flex items-center text-sm mt-4 relative z-10">
            <span className={`font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 ${
              kpi.trendUp 
                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' 
                : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
            }`}>
              {kpi.trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {kpi.trend}
            </span>
            <span className="text-slate-500 dark:text-slate-400 ms-2 text-xs">{kpi.description}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
