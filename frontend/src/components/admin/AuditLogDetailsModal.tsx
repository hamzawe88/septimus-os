/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState } from "react";
import { X, Shield, Database, User as UserIcon, Calendar, Clock, Globe, Copy, Check, FileText } from "lucide-react";
import { format } from "date-fns";
import { useLocalization } from "@/contexts/LocalizationContext";

interface AuditLogDetailsModalProps {
  log: any | null;
  onClose: () => void;
}

export default function AuditLogDetailsModal({ log, onClose }: AuditLogDetailsModalProps) {
  const { t } = useLocalization();
  const [copied, setCopied] = useState(false);

  if (!log) return null;

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(log.Details || log.details || {}, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const detailsObj = log.Details || log.details || null;
  const hasDetails = detailsObj && (typeof detailsObj === "object" ? Object.keys(detailsObj).length > 0 : String(detailsObj) !== "");

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-log-modal-title"
    >
      <div className="bg-white dark:bg-[#1a1a1a] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 flex items-center justify-center text-rose-600">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 id="audit-log-modal-title" className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {t("admin.auditLogs.modalTitle")}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">ID: {String(log.ID || "")}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={t("common.close")}
            aria-label={t("common.close")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Main Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                {t("admin.auditLogs.colAction")}
              </span>
              <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200 text-base">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                {t(`admin.auditLogs.actions.${String(log.Action || log.action || "-")}`, String(log.Action || log.action || "-"))}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                {t("admin.auditLogs.colEntity")}
              </span>
              <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-300 text-sm">
                <Database className="w-4 h-4 text-slate-400" />
                <span>{t(`admin.auditLogs.entityTypes.${String(log.EntityType || log.entity_type || "-")}`, String(log.EntityType || log.entity_type || "-"))}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  {String(log.EntityID || log.entity_id || "-")}
                </span>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                {t("admin.auditLogs.colUser")}
              </span>
              <div className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300 text-sm">
                <UserIcon className="w-4 h-4 text-slate-400" />
                <span>
                  {log.User && log.User.email 
                    ? log.User.email 
                    : log.User && log.User.name 
                    ? log.User.name 
                    : String(log.UserID || log.user_id || "System / Automated")}
                </span>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                {t("admin.auditLogs.colIp")}
              </span>
              <div className="flex items-center gap-2 font-mono text-sm text-slate-700 dark:text-slate-300">
                <Globe className="w-4 h-4 text-slate-400" />
                <span>{String(log.IPAddress || log.ip_address || "-")}</span>
              </div>
            </div>
          </div>

          {/* Timestamp Banner */}
          <div className="bg-rose-50/50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/20 p-3.5 rounded-xl flex items-center justify-between text-sm text-slate-700 dark:text-slate-300">
            <div className="flex items-center gap-2 font-medium">
              <Calendar className="w-4 h-4 text-rose-500" />
              <span>{t("admin.auditLogs.dateLabel")}</span>
              <span className="font-semibold">{format(new Date(String(log.CreatedAt || log.created_at || new Date())), "yyyy-MM-dd")}</span>
            </div>
            <div className="flex items-center gap-2 font-medium">
              <Clock className="w-4 h-4 text-rose-500" />
              <span>{t("admin.auditLogs.timeLabel")}</span>
              <span className="font-mono font-semibold">{format(new Date(String(log.CreatedAt || log.created_at || new Date())), "HH:mm:ss")}</span>
            </div>
          </div>

          {/* Details / Payload JSON */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                {t("admin.auditLogs.payloadLabel")}
              </label>
              {hasDetails && (
                <button
                  onClick={handleCopyJson}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-2.5 py-1 rounded-md transition-colors"
                  title={t("admin.auditLogs.copyJson")}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-600 dark:text-emerald-400">{t("common.copied")}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{t("admin.auditLogs.copyJson")}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="bg-slate-900 dark:bg-black text-slate-100 rounded-xl p-4 overflow-x-auto font-mono text-xs border border-slate-800 dark:border-slate-800 shadow-inner max-h-64">
              {hasDetails ? (
                <pre className="whitespace-pre-wrap leading-relaxed">
                  {typeof detailsObj === "object"
                    ? JSON.stringify(detailsObj, null, 2)
                    : String(detailsObj)}
                </pre>
              ) : (
                <div className="text-slate-500 text-center py-6 italic">
                  {t("admin.auditLogs.noPayload")}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 dark:bg-white hover:bg-slate-900 dark:hover:bg-slate-200 text-white dark:text-slate-900 font-bold rounded-xl text-sm shadow-sm transition-all focus:ring-2 focus:ring-slate-800 dark:focus:ring-white focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          >
            {t("common.closeWindow")}
          </button>
        </div>
      </div>
    </div>
  );
}
