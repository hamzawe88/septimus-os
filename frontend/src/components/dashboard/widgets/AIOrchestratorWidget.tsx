"use client";

import React, { useState, useCallback } from "react";
import {
  Sparkles, Zap, ArrowRight, Activity, CheckCircle2,
  AlertTriangle, Brain, X, Send, ShieldAlert
} from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { apiPost } from "@/lib/apiClient";

/* ─── Types matching backend OrchestratorResponse ─── */
interface RequiredInput {
  title: string;
  description: string;
  required_field: string;
  field_label: string;
  input_type: string; // "text" | "number"
  target_persona: string;
  original_query: string;
}

interface OrchestratorResponse {
  status: "success" | "missing_parameters" | "error";
  message: string;
  active_persona?: string;
  output_prose?: string;
  required_input?: RequiredInput;
  deliverables?: {
    missing_parameters?: string[];
    [key: string]: unknown;
  };
  timestamp?: string;
}

/* ─── Persona display config ─── */
const PERSONA_MAP: Record<string, { label: string; emoji: string; color: string }> = {
  account_strategist: { label: "استراتيجي الحسابات", emoji: "📊", color: "from-blue-600 to-indigo-600" },
  diwan_legal_auditor: { label: "مدقق الديوان", emoji: "⚖️", color: "from-amber-600 to-orange-600" },
  pm_workflow_steward: { label: "مشرف المشاريع", emoji: "🎯", color: "from-emerald-600 to-teal-600" },
  sovereign_analytics_tracker: { label: "محلل البيانات", emoji: "📈", color: "from-purple-600 to-violet-600" },
};

export default function AIOrchestratorWidget() {
  const { t, isRtl } = useLocalization();

  const [promptInput, setPromptInput] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [response, setResponse] = useState<OrchestratorResponse | null>(null);

  // Stop-Gate Modal state
  const [showParamModal, setShowParamModal] = useState(false);
  const [modalSpec, setModalSpec] = useState<RequiredInput | null>(null);
  const [modalInput, setModalInput] = useState("");
  const [pendingParams, setPendingParams] = useState<Record<string, string>>({});

  const executeQuery = useCallback(async (
    query: string,
    persona: string,
    params: Record<string, string> = {}
  ) => {
    setIsProcessing(true);
    setResponse(null);
    try {
      const res = await apiPost<OrchestratorResponse>("/ai/orchestrator/query", {
        query,
        target_persona: persona || undefined,
        context_parameters: params,
      });

      if (res.status === "missing_parameters" && res.required_input) {
        // Stop-Gate fired → show interactive modal
        setModalSpec(res.required_input);
        setPendingParams(params);
        setShowParamModal(true);
        setResponse(res);
      } else {
        setResponse(res);
        setShowParamModal(false);
        setModalSpec(null);
      }
    } catch (err) {
      setResponse({
        status: "error",
        message: err instanceof Error ? err.message : "Orchestrator request failed",
        output_prose: "⚠️ حدث خطأ في الاتصال بالعقل المركزي. تأكد من تشغيل الخدمات.",
      });
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleRunCommand = (text?: string) => {
    const cmd = text || promptInput;
    if (!cmd.trim()) return;
    executeQuery(cmd, selectedPersona, {});
    if (!text) setPromptInput("");
  };

  const handleModalSubmit = () => {
    if (!modalSpec || !modalInput.trim()) return;
    const updatedParams = { ...pendingParams, [modalSpec.required_field]: modalInput };
    setPendingParams(updatedParams);
    setShowParamModal(false);
    setModalInput("");
    // Re-execute with the supplied parameter
    executeQuery(modalSpec.original_query, modalSpec.target_persona, updatedParams);
  };

  const personaInfo = response?.active_persona
    ? PERSONA_MAP[response.active_persona] || { label: response.active_persona, emoji: "🤖", color: "from-slate-600 to-slate-700" }
    : null;

  const quickPrompts = [
    { text: t("dashboard.ai.prompt1", "حلل مخاطر حساب العميل"), persona: "ACCOUNT_STRATEGIST" },
    { text: t("dashboard.ai.prompt2", "دقق الخطاب الرسمي الأخير"), persona: "DIWAN_LEGAL_AUDITOR" },
    { text: t("dashboard.ai.prompt3", "راجع تقدم السبرنت الحالي"), persona: "PM_WORKFLOW_STEWARD" },
    { text: t("dashboard.ai.prompt4", "تقرير تحليلي شامل"), persona: "SOVEREIGN_ANALYTICS_TRACKER" },
  ];

  return (
    <div className="flex flex-col justify-between h-full space-y-3">
      {/* ── Header with Neural Mesh Status ── */}
      <div className="flex items-center justify-between p-3 rounded-2xl glass-card bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/20 dark:border-indigo-500/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                {t("dashboard.ai.sidecar", "Sovereign AI Brain")}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              {t("dashboard.ai.status", "العقل المركزي • 4 شخصيات مؤسسية نشطة")}
            </p>
          </div>
        </div>
        <div className="text-end">
          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
            {t("dashboard.ai.latency", "ReAct Engine")}
          </span>
        </div>
      </div>

      {/* ── Persona Selector Chips ── */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          {t("dashboard.ai.quickCommands", "الشخصيات المؤسسية السيادية:")}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {quickPrompts.map((p, idx) => {
            const pKey = p.persona.toLowerCase();
            const meta = PERSONA_MAP[pKey] || { emoji: "🤖", label: p.persona };
            const isActive = selectedPersona === p.persona;
            return (
              <button
                key={idx}
                onClick={() => {
                  setSelectedPersona(isActive ? "" : p.persona);
                  handleRunCommand(p.text);
                }}
                disabled={isProcessing}
                className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border transition flex items-center gap-1.5 ${
                  isActive
                    ? "bg-indigo-100 dark:bg-indigo-950/50 border-indigo-400 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300"
                    : "glass-card bg-white/40 dark:bg-slate-800/40 hover:bg-white/60 dark:hover:bg-slate-800/60 hover:border-indigo-400 dark:hover:border-indigo-500 border-slate-200/50 dark:border-slate-700/50 text-slate-700 dark:text-slate-300"
                }`}
              >
                <span>{meta.emoji}</span>
                <span>{p.text}</span>
                <ArrowRight className="w-3 h-3 opacity-60" />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Input Box ── */}
      <div className="relative">
        <input
          type="text"
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleRunCommand()}
          placeholder={t("dashboard.ai.placeholder", "اسأل العقل المركزي أو اختر شخصية مؤسسية...")}
          className="w-full ltr:pl-3.5 ltr:pr-24 rtl:pr-3.5 rtl:pl-24 py-2.5 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 rounded-xl text-xs text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition font-medium shadow-inner"
        />
        <button
          onClick={() => handleRunCommand()}
          disabled={isProcessing || !promptInput.trim()}
          className={`absolute ${isRtl ? "left-1.5" : "right-1.5"} top-1/2 -translate-y-1/2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-sm`}
        >
          {isProcessing ? <Activity className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          <span>{t("dashboard.ai.run", "تنفيذ")}</span>
        </button>
      </div>

      {/* ── Response Display ── */}
      {response && (
        <div className={`p-3 rounded-xl border text-xs font-medium flex flex-col gap-2 animate-in fade-in duration-200 ${
          response.status === "success"
            ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300"
            : response.status === "missing_parameters"
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300"
            : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/60 text-red-800 dark:text-red-300"
        }`}>
          {/* Active Persona Badge */}
          {personaInfo && (
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-gradient-to-r ${personaInfo.color} text-white text-[10px] font-bold`}>
                <span>{personaInfo.emoji}</span>
                <span>{personaInfo.label}</span>
              </span>
              {response.status === "success" && (
                <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> تم التنفيذ
                </span>
              )}
              {response.status === "missing_parameters" && (
                <span className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="w-3 h-3" /> Stop-Gate
                </span>
              )}
            </div>
          )}
          {/* Prose Output */}
          <div className="whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto text-[11px]">
            {response.output_prose}
          </div>
        </div>
      )}

      {/* ── Stop-Gate Parameter Modal ── */}
      {showParamModal && modalSpec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border-b border-amber-200/50 dark:border-amber-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-white">
                    {modalSpec.title}
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                    Sovereign Stop-Gate Guardrail
                  </p>
                </div>
              </div>
              <button onClick={() => setShowParamModal(false)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                {modalSpec.description}
              </p>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {modalSpec.field_label}
                </label>
                <input
                  type={modalSpec.input_type === "number" ? "number" : "text"}
                  value={modalInput}
                  onChange={(e) => setModalInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleModalSubmit()}
                  placeholder={`أدخل ${modalSpec.field_label}...`}
                  autoFocus
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition font-medium"
                />
              </div>

              {/* Missing params list */}
              {response?.deliverables?.missing_parameters && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  <span className="font-bold">البارامترات المفقودة: </span>
                  {response.deliverables!.missing_parameters!.map((p, i, arr) => (
                    <span key={p} className={`font-mono px-1.5 py-0.5 rounded ${
                      p === modalSpec.required_field
                        ? "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}>
                      {p}{i < arr.length - 1 ? " " : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowParamModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                {t("common.cancel", "إلغاء")}
              </button>
              <button
                onClick={handleModalSubmit}
                disabled={!modalInput.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:opacity-40 rounded-xl transition flex items-center gap-1.5 shadow-md"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t("common.submit", "إرسال وتنفيذ")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
