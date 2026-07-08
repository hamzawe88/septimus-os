"use client";

import React, { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { Plus, Filter, Search, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddExpenseModal from "./AddExpenseModal";
import { useLocalization } from "@/contexts/LocalizationContext";

interface ExpenseData {
  category: string;
  vendor?: string;
  title?: string;
  amount: number;
  date: string;
  description?: string;
  created_at?: string;
  status: "approved" | "pending" | "rejected";
}

interface Entity {
  ID: string;
  EntityType: string;
  Data: ExpenseData;
  CreatedAt: string;
}

export default function ExpensesList() {
  const { t } = useLocalization();
  const [expenses, setExpenses] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const res = await apiGet("/entities?type=finance_expense");
      setExpenses(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error("Failed to fetch expenses", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    apiGet("/entities?type=finance_expense")
      .then((res) => {
        if (!cancelled) setExpenses(Array.isArray(res) ? res : []);
      })
      .catch((err) => console.error("Failed to fetch expenses", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(t("finance.confirmDeleteExpense"))) return;
    try {
      const { apiDelete } = await import('@/lib/apiClient');
      await apiDelete(`/entities/${id}`);
      fetchExpenses();
    } catch (err) {
      console.error("Failed to delete expense", err);
      alert(t("finance.deleteExpenseError"));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved": return "bg-green-100 text-green-700";
      case "pending": return "bg-orange-100 text-orange-700";
      case "rejected": return "bg-red-100 text-red-700";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "approved": return t("finance.statusApproved");
      case "pending": return t("finance.statusPendingReview");
      case "rejected": return t("finance.statusRejected");
      default: return status;
    }
  };

  const cycleFilterStatus = () => {
    const statuses = ["all", "approved", "pending", "rejected"];
    const currentIndex = statuses.indexOf(filterStatus);
    setFilterStatus(statuses[(currentIndex + 1) % statuses.length]);
  };

  const filteredExpenses = expenses.filter(exp => {
    const matchesSearch = (exp.Data?.vendor?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
                          (exp.Data?.category?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
                          (exp.Data?.title?.toLowerCase() || "").includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || exp.Data?.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8 relative">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t("finance.expenses")}</h1>
          <p className="text-slate-500 mt-1">{t("finance.expensesDesc")}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="text-slate-600 gap-2 border-slate-200" onClick={cycleFilterStatus}>
            <Filter className="w-4 h-4" />
            {filterStatus === "all" ? t("finance.filterAll") : `${t("finance.filterPrefix")} (${getStatusLabel(filterStatus)})`}
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand/90 gap-2">
            <Plus className="w-4 h-4" />
            {t("finance.addExpense")}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder={t("finance.searchExpensePlaceholder")}
              className="w-full ps-4 pe-10 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-end">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-medium">{t("finance.dateLabel")}</th>
                <th className="px-6 py-4 font-medium">{t("finance.categoryLabel")}</th>
                <th className="px-6 py-4 font-medium">{t("finance.vendorLabel")}</th>
                <th className="px-6 py-4 font-medium">{t("finance.descriptionLabel")}</th>
                <th className="px-6 py-4 font-medium">{t("finance.amountLabel")}</th>
                <th className="px-6 py-4 font-medium">{t("finance.statusLabel")}</th>
                <th className="px-6 py-4 font-medium text-start">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    <Receipt className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                    {t("finance.noExpensesFound")}
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.ID} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-500">{exp.Data?.date}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium">
                        {exp.Data?.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">{exp.Data?.title || exp.Data?.vendor}</td>
                    <td className="px-6 py-4 text-slate-500 truncate max-w-[200px]">{exp.Data?.description}</td>
                    <td className="px-6 py-4 font-medium">${exp.Data?.amount?.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(exp.Data?.status)}`}>
                        {getStatusLabel(exp.Data?.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-start">
                      <button onClick={() => handleDelete(exp.ID)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title={t("common.delete")}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {isAddModalOpen && (
        <AddExpenseModal 
          isOpen={isAddModalOpen} 
          onClose={() => setIsAddModalOpen(false)} 
          onSuccess={fetchExpenses} 
        />
      )}
    </div>
  );
}
