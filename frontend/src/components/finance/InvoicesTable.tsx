"use client";

import React, { useEffect, useState } from "react";
import { apiGet, fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { FileText, Search, Filter, Printer, Plus, Trash2, Building2, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import AddInvoiceModal from "./AddInvoiceModal";
import InvoicePrintModal, { SMEInvoiceData } from "./InvoicePrintModal";
import { useLocalization } from "@/contexts/LocalizationContext";
import { LoadingState } from "@/components/ui/loading-state";

interface Entity {
  ID: string;
  EntityType: string;
  Data: SMEInvoiceData;
  CreatedAt: string;
}

export default function InvoicesTable() {
  const { t } = useLocalization();
  const [invoices, setInvoices] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedPrintInvoice, setSelectedPrintInvoice] = useState<Entity | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [pushingId, setPushingId] = useState<string | null>(null);

  // Push a settlement (draft journal entry) for this invoice to the connected Odoo ERP
  const pushToOdoo = async (inv: Entity) => {
    const reference = String(inv.Data?.invoiceNumber || inv.Data?.invoice_number || `INV-${inv.ID.slice(0, 6)}`);
    setPushingId(inv.ID);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/integrations/odoo/settlement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference,
          narration: `Settlement for invoice ${reference}`,
          entity_id: inv.ID,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(`${t("integrations.odooSuccess")} (#${data.record_id}).`);
      } else {
        alert(data.error || t("integrations.odooFailed"));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t("common.unexpectedError"));
    } finally {
      setPushingId(null);
    }
  };

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const res = await apiGet("/entities?type=finance_invoice");
      setInvoices(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error("Failed to fetch invoices", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    apiGet("/entities?type=finance_invoice")
      .then((res) => {
        if (!cancelled) setInvoices(Array.isArray(res) ? res : []);
      })
      .catch((err) => console.error("Failed to fetch invoices", err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(t("finance.confirmDeleteInvoice"))) return;
    try {
      const { apiDelete } = await import("@/lib/apiClient");
      await apiDelete(`/entities/${id}`);
      fetchInvoices();
    } catch (err) {
      console.error("Failed to delete invoice", err);
      alert(t("finance.deleteInvoiceError"));
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "paid": return "bg-success/10 text-success border-success/20";
      case "pending": return "bg-warning/10 text-warning border-warning/20";
      case "overdue": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-muted text-foreground border-border";
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case "paid": return t("finance.statusPaidFull");
      case "pending": return t("finance.statusPendingWait");
      case "overdue": return t("finance.statusOverdue");
      default: return status || t("finance.statusPending2");
    }
  };

  const cycleFilterStatus = () => {
    const statuses = ["all", "paid", "pending", "overdue"];
    const currentIndex = statuses.indexOf(filterStatus);
    setFilterStatus(statuses[(currentIndex + 1) % statuses.length]);
  };

  const filteredInvoices = invoices.filter((inv) => {
    const client = String(inv.Data?.clientName || inv.Data?.client_name || inv.Data?.clientCompany || "");
    const num = String(inv.Data?.invoiceNumber || inv.Data?.invoice_number || inv.ID || "");
    const matchesSearch =
      client.toLowerCase().includes(searchQuery.toLowerCase()) ||
      num.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || inv.Data?.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (loading && invoices.length === 0) {
    return (
      <LoadingState />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-8 relative">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-brand" />
            {t("finance.smeInvoicesTitle")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("finance.smeInvoicesDesc")}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="text-muted-foreground gap-2 border-border" onClick={cycleFilterStatus}>
            <Filter className="w-4 h-4" />
            {filterStatus === "all" ? t("finance.filterAll") : `${t("finance.filterPrefix")} (${getStatusLabel(filterStatus)})`}
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="bg-brand hover:bg-brand/90 text-white gap-2 shadow-md">
            <Plus className="w-4 h-4" />
            {t("finance.createNewInvoiceBtn")}
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex gap-4 bg-muted/50">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              title={t("finance.searchInvoices")}
              aria-label={t("finance.searchInvoices")}
              type="text"
              placeholder={t("finance.searchInvoicesPlaceholder")}
              className="w-full ps-4 pe-10 py-2 bg-card border border-border rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-end">
            <thead className="bg-muted text-muted-foreground border-b border-border font-bold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">{t("finance.invoiceNumberLabel")}</th>
                <th className="px-6 py-4">{t("finance.clientAndCompanyLabel")}</th>
                <th className="px-6 py-4">{t("finance.issueDateLabel")}</th>
                <th className="px-6 py-4">{t("finance.dueDateLabel")}</th>
                <th className="px-6 py-4">{t("finance.totalDueLabel")}</th>
                <th className="px-6 py-4">{t("finance.statusLabel")}</th>
                <th className="px-6 py-4 text-start">{t("finance.actionsAndPrintLabel")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    {t("finance.noInvoicesFound")}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => {
                  const num = String(inv.Data?.invoiceNumber || inv.Data?.invoice_number || `INV-${inv.ID.slice(0, 6)}`);
                  const name = String(inv.Data?.clientName || inv.Data?.client_name || t("finance.unspecifiedClient"));
                  const comp = String(inv.Data?.clientCompany || "");
                  const issue = String(inv.Data?.issueDate || inv.Data?.date || inv.CreatedAt.split("T")[0]);
                  const due = String(inv.Data?.dueDate || inv.Data?.due_date || issue);
                  const total = inv.Data?.amount !== undefined ? Number(inv.Data.amount) : 0;

                  return (
                    <tr key={inv.ID} className="hover:bg-muted/80 transition-colors">
                      <td className="px-6 py-4 font-mono font-bold text-foreground">{num}</td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-foreground">{name}</p>
                        {comp && <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mt-0.5"><Building2 className="w-3 h-3 text-brand" />{comp}</p>}
                      </td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{issue}</td>
                      <td className="px-6 py-4 font-mono text-muted-foreground">{due}</td>
                      <td className="px-6 py-4 font-mono font-bold text-brand text-base">${total.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(inv.Data?.status)}`}>
                          {getStatusLabel(inv.Data?.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-start">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedPrintInvoice(inv)}
                            className="p-2 text-brand bg-brand/10 hover:bg-brand hover:text-white rounded-lg transition-colors flex items-center gap-1 font-semibold text-xs"
                            title={t("finance.printExportPDF")}
                            aria-label={t("finance.printExportPDF")}
                          >
                            <Printer className="w-4 h-4" />
                            <span>{t("finance.printPDF")}</span>
                          </button>
                          <button
                            onClick={() => pushToOdoo(inv)}
                            disabled={pushingId === inv.ID}
                            className="p-2 text-muted-foreground hover:text-brand hover:bg-brand/10 rounded-lg transition-colors disabled:opacity-50"
                            title={t("integrations.odooPushTitle")}
                            aria-label="Push settlement to Odoo"
                          >
                            <Landmark className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(inv.ID)}
                            className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                            title={t("common.delete")}
                            aria-label={t("common.delete")}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && (
        <AddInvoiceModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={fetchInvoices}
        />
      )}

      {selectedPrintInvoice && (
        <InvoicePrintModal
          isOpen={!!selectedPrintInvoice}
          onClose={() => setSelectedPrintInvoice(null)}
          invoiceData={selectedPrintInvoice.Data}
          invoiceId={selectedPrintInvoice.ID}
        />
      )}
    </div>
  );
}
