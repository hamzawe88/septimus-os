"use client";

import React, { useState } from "react";
import { BookOpen, Search, FileText, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function KnowledgeVaultWidget() {
  const { t } = useLocalization();
  const [query, setQuery] = useState("");
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);

  const docs = [
    { id: "d1", title: t("dashboard.knowledge.d1Title", "Libya National Switch SOP (ISO-8583)"), category: t("dashboard.knowledge.d1Cat", "Payment Core"), updated: t("dashboard.knowledge.2daysAgo", "2 days ago") },
    { id: "d2", title: t("dashboard.knowledge.d2Title", "Corporate HR Leave Policy & Benefits"), category: t("dashboard.knowledge.d2Cat", "HR Regulations"), updated: t("dashboard.knowledge.3daysAgo", "3 days ago") },
    { id: "d3", title: t("dashboard.knowledge.d3Title", "Treasury Multi-Currency Reconciliation Guide"), category: t("dashboard.knowledge.d3Cat", "Finance SOP"), updated: t("dashboard.knowledge.1weekAgo", "1 week ago") },
  ];

  const filtered = docs.filter((d) => d.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col justify-between h-full space-y-3">
      {/* Header & Search */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-cyan-500" />
            {t("dashboard.knowledge.title", "Sovereign Knowledge Vault")}
          </span>
          <span className="text-[10px] font-extrabold bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 px-2 py-0.5 rounded-full">
            {docs.length} {t("dashboard.knowledge.sops", "SOPs")}
          </span>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute ltr:left-3 rtl:right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t("dashboard.knowledge.search", "Search policies, specs & guides...")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full ltr:pl-9 ltr:pr-3 rtl:pr-9 rtl:pl-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition"
          />
        </div>
      </div>

      {/* Docs List */}
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1 max-h-[160px]">
        {filtered.map((doc) => (
          <div
            key={doc.id}
            onClick={() => setPreviewDoc(doc.title)}
            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/30 border border-slate-200/80 dark:border-slate-700 cursor-pointer transition flex items-center justify-between group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-800 dark:text-white truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition">
                  {doc.title}
                </h4>
                <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                  <span>{doc.category}</span> • <span>{doc.updated}</span>
                </span>
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-cyan-600 transition flex-shrink-0" />
          </div>
        ))}
      </div>

      {previewDoc && (
        <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800 text-xs font-medium text-cyan-800 dark:text-cyan-300 flex items-center justify-between animate-in fade-in duration-200">
          <span className="truncate flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 flex-shrink-0" />
            <span>{t("dashboard.knowledge.previewing", "Previewing:")} {previewDoc}</span>
          </span>
          <button onClick={() => setPreviewDoc(null)} className="text-[10px] font-bold underline ml-2">
            {t("dashboard.knowledge.close", "Close")}
          </button>
        </div>
      )}
    </div>
  );
}
