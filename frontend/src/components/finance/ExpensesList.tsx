"use client";

import React, { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { Plus, Filter, Search, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddExpenseModal from "./AddExpenseModal";
import { useLocalization } from "@/contexts/LocalizationContext";
import { LoadingState } from "@/components/ui/loading-state";

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
      case "approved": return "bg-success/10 text-success";
      case "pending": return "bg-warning/10 text-warning";
      case "rejected": return "bg-destructive/10 text-destructive";
      default: return "bg-muted text-foreground";
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
      <LoadingState />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8 relative">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("finance.expenses")}</h1>
          <p className="text-muted-foreground mt-1">{t("finance.expensesDesc")}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="text-muted-foreground gap-2 border-border" onClick={cycleFilterStatus}>
            <Filter className="w-4 h-4" />
            {filterStatus === "all" ? t("finance.filterAll") : `${t("finance.filterPrefix")} (${getStatusLabel(filterStatus)})`}
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand/90 gap-2">
            <Plus className="w-4 h-4" />
            {t("finance.addExpense")}
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder={t("finance.searchExpensePlaceholder")}
              className="w-full ps-4 pe-10 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-end">
            <thead className="bg-muted text-muted-foreground border-b border-border">
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
            <tbody className="divide-y divide-border">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <Receipt className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    {t("finance.noExpensesFound")}
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.ID} className="hover:bg-muted transition-colors">
                    <td className="px-6 py-4 text-muted-foreground">{exp.Data?.date}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-muted text-foreground rounded-lg text-xs font-medium">
                        {exp.Data?.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-foreground">{exp.Data?.title || exp.Data?.vendor}</td>
                    <td className="px-6 py-4 text-muted-foreground truncate max-w-[200px]">{exp.Data?.description}</td>
                    <td className="px-6 py-4 font-medium">${exp.Data?.amount?.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(exp.Data?.status)}`}>
                        {getStatusLabel(exp.Data?.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-start">
                      <button onClick={() => handleDelete(exp.ID)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors" title={t("common.delete")}>
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
