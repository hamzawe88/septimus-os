"use client";

import React, { useState, useEffect } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import FinanceDashboard from "@/components/finance/FinanceDashboard";
import InvoicesTable from "@/components/finance/InvoicesTable";
import ExpensesList from "@/components/finance/ExpensesList";
import VATReturnDashboard from "@/components/finance/VATReturnDashboard";
import { LayoutGrid, FileText, CreditCard, ShieldCheck, Sparkles } from "lucide-react";
import AgentChatDrawer from "@/components/ai/AgentChatDrawer";
import { apiGet } from "@/lib/apiClient";
import { InvoiceEntity } from "@/components/plugins/FinanceInvoicesView";

interface RawExpenseEntity {
  id: string;
  created_at: string;
  data: {
    entity_type?: string;
    expense_type?: string;
    total_amount?: number | string;
    vat_amount?: number | string;
    subtotal?: number | string;
    amount?: number | string;
    status?: string;
    [key: string]: unknown;
  };
}

export default function FinancePage() {
  const { t, isRtl } = useLocalization();
  const [activeTab, setActiveTab] = useState<"dashboard" | "invoices" | "expenses" | "vat">("dashboard");
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceEntity[]>([]);
  const [expenses, setExpenses] = useState<RawExpenseEntity[]>([]);

  useEffect(() => {
    if (activeTab === "vat") {
      const fetchVATData = async () => {
        try {
          const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
          // Fetch invoices for output VAT
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const invRes = await apiGet<{ data: any[] }>(`/entities?workspace_id=${workspaceId}&type=finance_invoice&limit=200`);
          if (invRes.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mapped: InvoiceEntity[] = invRes.data.map((e: any) => ({
              id: e.id || e.ID,
              created_at: e.created_at || e.CreatedAt || "",
              data: e.data || e.Data || {},
            }));
            setInvoices(mapped);
          }
          // Fetch expenses for input VAT
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const expRes = await apiGet<{ data: any[] }>(`/entities?workspace_id=${workspaceId}&type=finance_expense&limit=200`);
          if (expRes.data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mappedExp: RawExpenseEntity[] = expRes.data.map((e: any) => ({
              id: e.id || e.ID,
              created_at: e.created_at || e.CreatedAt || "",
              data: { ...(e.data || e.Data || {}), entity_type: "finance_expense" },
            }));
            setExpenses(mappedExp);
          }
        } catch (err) {
          console.error("Failed to fetch VAT data:", err);
        }
      };
      fetchVATData();
    }
  }, [activeTab]);

  const tabs: Array<{
    id: "dashboard" | "invoices" | "expenses" | "vat";
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: "dashboard", label: t("finance.tabs.dashboard"), icon: <LayoutGrid className="w-4 h-4" /> },
    { id: "invoices",  label: t("finance.tabs.invoices"),        icon: <FileText className="w-4 h-4" /> },
    { id: "expenses",  label: t("finance.tabs.expenses"),       icon: <CreditCard className="w-4 h-4" /> },
    { id: "vat",       label: t("finance.tabs.vat"), icon: <ShieldCheck className="w-4 h-4" /> },
  ];

  return (
    <div className="flex flex-col w-full h-full bg-[#f8fafc]" dir={isRtl ? "rtl" : "ltr"}>
      {/* Sub-navigation Tabs */}
      <div className="flex-none px-8 py-4 border-b border-slate-200 bg-white flex items-center gap-6">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 pb-4 -mb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === tab.id
                ? tab.id === "vat"
                  ? "border-emerald-600 text-emerald-700"
                  : "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "dashboard" && <FinanceDashboard />}
        {activeTab === "invoices"  && <InvoicesTable />}
        {activeTab === "expenses"  && <ExpensesList />}
        {activeTab === "vat" && (
          <div className="h-full overflow-y-auto p-8">
            <VATReturnDashboard invoices={invoices} expenses={expenses} />
          </div>
        )}
      </div>

      {/* Floating Action Button for AI Assistant */}
      <button
        onClick={() => setIsAgentOpen(true)}
        className="fixed bottom-8 end-8 w-14 h-14 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center group z-30"
        title={t("finance.aiAssistant")}
        aria-label={t("finance.aiAssistant")}
      >
        <Sparkles className="w-6 h-6 group-hover:scale-110 transition-transform" />
      </button>

      <AgentChatDrawer
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        agentType="finance"
        title={t("finance.aiAssistant")}
      />
    </div>
  );
}
