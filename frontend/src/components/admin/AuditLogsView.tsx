/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState, useCallback } from "react";
import { 
  Shield, 
  Search, 
  RefreshCw, 
  Calendar, 
  Clock, 
  Database, 
  User as UserIcon, 
  Filter, 
  Download, 
  Eye, 
  ChevronLeft, 
  ChevronRight
} from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { format } from "date-fns";
import AuditLogDetailsModal from "./AuditLogDetailsModal";
import { useLocalization } from "@/contexts/LocalizationContext";

const ENTITY_TYPES = [
  { label: "All Entities", value: "all" },
  { label: "Users", value: "User" },
  { label: "Departments", value: "Department" },
  { label: "Roles", value: "Role" },
  { label: "Permissions", value: "Permission" },
  { label: "Integrations", value: "Integration" },
  { label: "Workflows", value: "Workflow" },
];

export default function AuditLogsView() {
  const { t } = useLocalization();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("all");
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const fetchLogs = useCallback(async (isRefresh = false) => {
    if (isRefresh || logs.length === 0) setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        search: search.trim(),
        entity_type: entityType,
      });

      const res = await fetchWithAuth(`${API_BASE_URL}/admin/audit-logs?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const logsArray = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        setLogs(logsArray);
        setTotal(typeof data.total === "number" ? data.total : logsArray.length);
      }
    } catch (error) {
      console.error("Failed to fetch audit logs", error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, entityType, logs.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLogs();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleEntityTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setEntityType(e.target.value);
    setPage(1);
  };

  const handleExportCSV = () => {
    if (logs.length === 0) return;

    const headers = ["ID", "Action", "EntityType", "EntityID", "UserID", "IPAddress", "CreatedAt", "Details"];
    const rows = logs.map(log => [
      `"${String(log.ID || "")}"`,
      `"${String(log.Action || log.action || "")}"`,
      `"${String(log.EntityType || log.entity_type || "")}"`,
      `"${String(log.EntityID || log.entity_id || "")}"`,
      `"${String(log.UserID || log.user_id || "")}"`,
      `"${String(log.IPAddress || log.ip_address || "")}"`,
      `"${String(log.CreatedAt || log.created_at || "")}"`,
      `"${JSON.stringify(log.Details || log.details || {}).replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `audit_logs_${format(new Date(), "yyyyMMdd_HHmmss")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-[#0f0f0f] transition-colors">
      {/* Header */}
      <div className="bg-white dark:bg-[#121212] border-b border-slate-200 dark:border-slate-800 px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm z-10 transition-colors">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-rose-50 dark:bg-rose-500/10 text-rose-600 rounded-xl flex items-center justify-center border border-rose-100 dark:border-rose-500/20 shadow-sm">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">{t("admin.auditLogs.title")}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">{t("admin.auditLogs.subtitle")}</p>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute end-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder={t("admin.auditLogs.searchPlaceholder")} 
              value={search}
              onChange={handleSearchChange}
              className="pe-9 ps-4 py-2 bg-[#f8fafc] dark:bg-[#1a1a1a] border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 dark:focus:border-rose-700 transition-all w-64 text-slate-700 dark:text-slate-300 font-medium placeholder:text-slate-400"
            />
          </div>

          {/* Entity Type Filter */}
          <div className="relative flex items-center">
            <Filter className="w-4 h-4 text-slate-400 absolute end-3 pointer-events-none" />
            <select
              value={entityType}
              onChange={handleEntityTypeChange}
              title="Filter by Entity Type"
              aria-label="Filter by Entity Type"
              className="pe-9 ps-4 py-2 bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-300 font-medium focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 dark:focus:border-rose-700 transition-all appearance-none cursor-pointer"
            >
              {ENTITY_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {t(`admin.auditLogs.entityTypes.${type.value}`, type.label)}
                </option>
              ))}
            </select>
          </div>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            disabled={loading || logs.length === 0}
            title={t("admin.auditLogs.exportTooltip")}
            aria-label={t("admin.auditLogs.exportTooltip")}
            className="px-4 py-2 bg-white dark:bg-[#1a1a1a] hover:bg-slate-50 dark:hover:bg-[#2a2a2a] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-medium text-sm flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>{t("admin.auditLogs.exportCsv")}</span>
          </button>

          {/* Refresh Button */}
          <button 
            onClick={() => fetchLogs(true)}
            disabled={loading}
            title={t("admin.auditLogs.refresh")}
            aria-label={t("admin.auditLogs.refresh")}
            className="p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1a1a1a] hover:bg-slate-50 dark:hover:bg-[#2a2a2a] text-slate-600 dark:text-slate-400 rounded-xl flex items-center justify-center transition-all shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content Table */}
      <div className="flex-1 overflow-auto p-8">
        <div className="bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[450px] transition-colors">
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-end border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                  <th className="px-6 py-4">{t("admin.auditLogs.colAction")}</th>
                  <th className="px-6 py-4">{t("admin.auditLogs.colEntity")}</th>
                  <th className="px-6 py-4">{t("admin.auditLogs.colUser")}</th>
                  <th className="px-6 py-4">{t("admin.auditLogs.colTimestamp")}</th>
                  <th className="px-6 py-4">{t("admin.auditLogs.colIp")}</th>
                  <th className="px-6 py-4 text-center">{t("admin.auditLogs.colDetails")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400 dark:text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-rose-500" />
                        <span>{t("admin.auditLogs.loading")}</span>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center text-slate-400 dark:text-slate-500">
                      <Shield className="w-10 h-10 mx-auto mb-3 opacity-20 text-slate-600 dark:text-slate-400" />
                      <p className="font-semibold text-slate-600 dark:text-slate-300">{t("admin.auditLogs.noRecords")}</p>
                      <p className="text-xs text-slate-400 mt-1">{t("admin.auditLogs.tryDifferentFilter")}</p>
                    </td>
                  </tr>
                ) : (
                  logs.map((log, idx) => {
                    const actionName = String(log.Action || log.action || "-");
                    const entityName = String(log.EntityType || log.entity_type || "-");
                    const entityIdStr = String(log.EntityID || log.entity_id || "");
                    const userIdStr = String(log.UserID || log.user_id || "System");
                    const ipStr = String(log.IPAddress || log.ip_address || "-");
                    const dateVal = log.CreatedAt || log.created_at || new Date();
                    const userObj = log.User;

                    return (
                      <tr 
                        key={String(log.ID || log.id || `${actionName}-${idx}`)} 
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                        onClick={() => setSelectedLog(log)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2.5 font-bold text-slate-800 dark:text-slate-200">
                            <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                            <span>{t(`admin.auditLogs.actions.${actionName}`, actionName)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                            <Database className="w-4 h-4 text-slate-400" />
                            <span className="font-semibold">{t(`admin.auditLogs.entityTypes.${entityName}`, entityName)}</span>
                            {entityIdStr && (
                              <span className="text-slate-400 font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                                {entityIdStr.substring(0, 8)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                            <UserIcon className="w-4 h-4 text-slate-400" />
                            <span>
                              {userObj && userObj.email 
                                ? userObj.email 
                                : userObj && userObj.name 
                                ? userObj.name 
                                : userIdStr.length > 15 ? `${userIdStr.substring(0, 8)}...` : userIdStr}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>{format(new Date(String(dateVal)), "yyyy-MM-dd")}</span>
                            <span className="text-slate-300 dark:text-slate-600">|</span>
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-mono">{format(new Date(String(dateVal)), "HH:mm:ss")}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">
                          {ipStr}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors inline-flex items-center justify-center"
                            title="View Details"
                            aria-label="View Log Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-600 dark:text-slate-400 transition-colors">
            <div>
              {total > 0 ? (
                <span>
                  {t("common.paginationShowing")} <span className="font-bold text-slate-800 dark:text-slate-200">{(page - 1) * limit + 1}</span> {t("common.paginationTo")} <span className="font-bold text-slate-800 dark:text-slate-200">{Math.min(page * limit, total)}</span> {t("common.paginationOf")} <span className="font-bold text-slate-800 dark:text-slate-200">{total}</span> {t("common.paginationRecords")}
                </span>
              ) : (
                <span>{t("common.paginationEmpty")}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-2 bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600 dark:text-slate-300"
                title={t("common.previousPage")}
                aria-label={t("common.previousPage")}
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="px-3 py-1.5 bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 font-bold transition-colors">
                {page} / {totalPages}
              </span>

              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="p-2 bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-slate-600 dark:text-slate-300"
                title={t("common.nextPage")}
                aria-label={t("common.nextPage")}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Details Modal */}
      <AuditLogDetailsModal 
        log={selectedLog} 
        onClose={() => setSelectedLog(null)} 
      />
    </div>
  );
}
