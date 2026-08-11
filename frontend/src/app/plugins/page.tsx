"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Database, FileText, Activity, ArrowLeft } from "lucide-react";
import CreateEntityModal from "@/components/plugins/CreateEntityModal";
import FinanceInvoicesView, { InvoiceEntity } from "@/components/plugins/FinanceInvoicesView";
import HRLeaveRequestsView, { LeaveRequestEntity } from "@/components/plugins/HRLeaveRequestsView";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

export default function PluginsPage() {
  const [activePlugin, setActivePlugin] = useState<"invoice" | "leave_request">("invoice");
  const [entities, setEntities] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const pluginTypes = [
    { id: "invoice", label: "Finance: Invoices", icon: FileText },
    { id: "leave_request", label: "HR: Leave Requests", icon: Activity },
  ];

  const fetchEntities = React.useCallback(async (type: string, signal?: AbortSignal) => {
    setTimeout(() => {
      if (!signal?.aborted) setLoading(true);
    }, 0);
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      
      const res = await fetchWithAuth(`${API_BASE_URL}/entities?workspace_id=${workspaceId}&type=${type}`, {
        signal
      });
      if (res.ok) {
        const data = await res.json();
        if (!signal?.aborted) setEntities(data.data || []);
      }
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (error?.name !== 'AbortError' && !signal?.aborted) {
        console.error("Failed to fetch entities:", error);
        setEntities([]);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    // eslint-disable-next-line
    void fetchEntities(activePlugin, abortController.signal);
    return () => abortController.abort();
  }, [activePlugin, fetchEntities]);

  return (
    <div className="flex h-full overflow-hidden bg-card text-foreground">
      {/* Sidebar for Plugins */}
      <div className="w-64 border-e border-black/10 p-4 shrink-0 bg-[var(--sb-bg)] text-[var(--sb-text)] flex flex-col">
        <h2 className="text-xl font-bold mb-6">Enterprise Plugins</h2>
        <nav className="space-y-2 flex-1">
          <Link href="/crm" className="w-full flex items-center p-3 rounded-lg transition-colors opacity-80 hover:bg-[var(--sb-hover)]">
            <Database className="w-5 h-5 me-3" />
            CRM
          </Link>
          {pluginTypes.map((plugin) => {
            const Icon = plugin.icon;
            const isActive = activePlugin === plugin.id;
            return (
              <button
                key={plugin.id}
                onClick={() => setActivePlugin(plugin.id as "invoice" | "leave_request")}
                className={`w-full flex items-center p-3 rounded-lg transition-colors ${
                  isActive ? "text-[var(--sb-text)] font-semibold bg-[var(--primary-hex)]" : "opacity-80 hover:bg-[var(--sb-hover)]"
                }`}
              >
                <Icon className="w-5 h-5 me-3" />
                {plugin.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-4 pt-4 border-t border-black/10">
          <Link 
            href="/"
            className="w-full flex items-center p-3 rounded-lg transition-colors opacity-80 hover:bg-[var(--sb-hover)] hover:opacity-100"
          >
            <ArrowLeft className="w-5 h-5 me-3" />
            Back to Home
          </Link>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-8 overflow-y-auto min-w-0">
        {activePlugin === "invoice" && (
          <FinanceInvoicesView
            entities={entities as InvoiceEntity[]}
            loading={loading} 
            onNewInvoice={() => setIsModalOpen(true)} 
            onRefresh={() => fetchEntities(activePlugin)}
          />
        )}

        {activePlugin === "leave_request" && (
          <HRLeaveRequestsView
            entities={entities as LeaveRequestEntity[]}
            loading={loading} 
            onNewRequest={() => setIsModalOpen(true)} 
            onRefresh={() => fetchEntities(activePlugin)}
          />
        )}
      </div>

      {isModalOpen && (
        <CreateEntityModal 
          pluginType={activePlugin} 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => fetchEntities(activePlugin)} 
        />
      )}
    </div>
  );
}
