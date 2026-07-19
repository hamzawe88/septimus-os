"use client";

import React, { useState, useEffect } from "react";
import { Key, Server, Save, CheckCircle2, Bot, ChevronDown, Cpu } from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

// Available models per provider
const PROVIDER_MODELS: Record<string, { id: string; label: string; tier: string }[]> = {
  openai: [
    { id: "gpt-4o", label: "GPT-4o", tier: "strong" },
    { id: "gpt-4o-mini", label: "GPT-4o Mini", tier: "fast" },
    { id: "gpt-4-turbo", label: "GPT-4 Turbo", tier: "strong" },
    { id: "gpt-5", label: "GPT-5", tier: "strong" },
    { id: "gpt-5-mini", label: "GPT-5 Mini", tier: "fast" },
    { id: "o3", label: "o3 (Reasoning)", tier: "strong" },
    { id: "o3-mini", label: "o3 Mini", tier: "fast" },
    { id: "o4-mini", label: "o4 Mini", tier: "fast" },
  ],
  gemini: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "strong" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "fast" },
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", tier: "fast" },
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", tier: "strong" },
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", tier: "fast" },
  ],
  anthropic: [
    { id: "claude-sonnet-5", label: "Claude Sonnet 5", tier: "strong" },
    { id: "claude-opus-3-7", label: "Claude Opus 3.7", tier: "strong" },
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", tier: "strong" },
    { id: "claude-opus-4-20250514", label: "Claude Opus 4", tier: "strong" },
    { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", tier: "strong" },
    { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", tier: "fast" },
  ],
  ollama: [
    { id: "qwen3:8b", label: "Qwen 3 (8B)", tier: "strong" },
    { id: "qwen2.5-coder:7b", label: "Qwen 2.5 Coder (7B)", tier: "strong" },
    { id: "llama3.2:3b", label: "Llama 3.2 (3B)", tier: "fast" },
    { id: "llama3.3", label: "Llama 3.3 (70B)", tier: "strong" },
    { id: "deepseek-r1:14b", label: "DeepSeek R1 (14B)", tier: "strong" },
    { id: "mistral", label: "Mistral (7B)", tier: "fast" },
    { id: "phi3", label: "Phi-3 (3.8B)", tier: "fast" },
  ],
};

interface ModelConfig {
  id: string;
  name: string;
  provider: "openai" | "gemini" | "anthropic" | "ollama";
  icon: string;
  description: string;
  apiKey?: string;
  baseUrl?: string;
  isActive: boolean;
  hasApiKey?: boolean;
  selectedModel?: string; // legacy single selection (kept in sync with strong)
  selectedModelStrong?: string; // reasoning/chat tier
  selectedModelFast?: string; // light high-volume tasks tier
}

const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    provider: "openai",
    icon: "O",
    description: "ai_settings.openai_desc",
    apiKey: "",
    isActive: true,
    selectedModel: "gpt-4o",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    provider: "gemini",
    icon: "G",
    description: "ai_settings.gemini_desc",
    apiKey: "",
    isActive: false,
    selectedModel: "gemini-2.5-pro",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    provider: "anthropic",
    icon: "A",
    description: "ai_settings.anthropic_desc",
    apiKey: "",
    isActive: false,
    selectedModel: "claude-sonnet-5",
  },
  {
    id: "ollama",
    name: "Ollama",
    provider: "ollama",
    icon: "L",
    description: "ai_settings.ollama_desc",
    baseUrl: "http://localhost:11434",
    isActive: false,
    selectedModel: "qwen3:8b",
    selectedModelStrong: "qwen3:8b",
    selectedModelFast: "llama3.2:3b",
  }
];

export default function AISettings() {
  const { t } = useLocalization();
  const [models, setModels] = useState<ModelConfig[]>(DEFAULT_MODELS);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
        const res = await fetchWithAuth(`${API_BASE_URL}/settings/ai_providers?workspace_id=${workspaceId}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            // Merge fetched data with defaults to ensure new fields exist
            const merged = DEFAULT_MODELS.map(def => {
              const fetched = data.find((d: ModelConfig) => d.id === def.id);
              return fetched ? { ...def, ...fetched } : def;
            });
            setModels(merged);
          }
        }
      } catch (e) {
        console.error("Failed to fetch settings", e);
      }
    };
    fetchSettings();
  }, []);

  const handleUpdateKey = (id: string, key: string) => {
    setModels(models.map(m => m.id === id ? { ...m, apiKey: key } : m));
  };

  const handleFocusKey = (id: string) => {
    setModels(models.map(m => (m.id === id && m.apiKey?.includes("•")) ? { ...m, apiKey: "" } : m));
  };

  const handleUpdateUrl = (id: string, url: string) => {
    setModels(models.map(m => m.id === id ? { ...m, baseUrl: url } : m));
  };

  const handleSetActive = (id: string) => {
    setModels(models.map(m => ({ ...m, isActive: m.id === id })));
  };

  const handleSelectTierModel = (providerId: string, tier: "strong" | "fast", modelId: string) => {
    setModels(models.map(m => {
      if (m.id !== providerId) return m;
      // Keep the legacy single selection in sync with the strong tier so
      // older readers (AI Center display, sidecar fallback) stay correct.
      return tier === "strong"
        ? { ...m, selectedModelStrong: modelId, selectedModel: modelId }
        : { ...m, selectedModelFast: modelId };
    }));
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      
      const res = await fetchWithAuth(`${API_BASE_URL}/settings/ai_providers?workspace_id=${workspaceId}`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(models)
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert(t("ai_settings.save_failed"));
      }
    } catch (e) {
      console.error(e);
      alert(t("ai_settings.server_error"));
    } finally {
      setIsSaving(false);
    }
  };

  const getProviderGradient = (provider: string, isActive: boolean) => {
    if (!isActive) return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400";
    switch (provider) {
      case "openai": return "bg-gradient-to-br from-emerald-500 to-teal-600 text-white";
      case "gemini": return "bg-gradient-to-br from-blue-500 to-indigo-600 text-white";
      case "anthropic": return "bg-gradient-to-br from-amber-500 to-orange-600 text-white";
      case "ollama": return "bg-gradient-to-br from-purple-500 to-violet-600 text-white";
      default: return "bg-gradient-to-br from-indigo-600 to-purple-600 text-white";
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 dark:bg-[#0f0e13] overflow-y-auto">
      {/* Sticky Action Bar */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/80 dark:bg-[#121016]/80 border-b border-slate-200/60 dark:border-slate-800/60 px-8 py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <div className="p-2.5 bg-brand/10 dark:bg-brand/20 rounded-xl">
              <Bot className="w-6 h-6 text-brand" />
            </div>
            {t("ai_settings.title")}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {t("ai_settings.subtitle")}
          </p>
        </div>
        <button 
          onClick={saveSettings}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-brand hover:opacity-90 text-white rounded-xl font-bold shadow-lg shadow-brand/20 transition-all active:scale-95 disabled:opacity-70 shrink-0"
        >
          {isSaving ? (
            <span className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> {t("ai_settings.saving")}</span>
          ) : saveSuccess ? (
            <><CheckCircle2 className="w-5 h-5 text-white" /> {t("ai_settings.saved")}</>
          ) : (
            <><Save className="w-5 h-5" /> {t("ai_settings.save_btn")}</>
          )}
        </button>
      </div>

      <div className="p-8 max-w-5xl mx-auto w-full space-y-8">
        
        {/* Model Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {models.map((model) => {
            const availableModels = PROVIDER_MODELS[model.provider] || [];
            const strongValue = model.selectedModelStrong || model.selectedModel || "";
            const fastValue = model.selectedModelFast || "";
            
            return (
              <section 
                key={model.id}
                className={`bg-white/70 dark:bg-[#1a1d21]/70 backdrop-blur-xl p-8 rounded-[2rem] border transition-all relative overflow-hidden flex flex-col ${
                  model.isActive 
                    ? 'border-brand/40 shadow-xl shadow-brand/5 ring-1 ring-brand/20' 
                    : 'border-slate-200/60 dark:border-slate-800/60 shadow-sm hover:shadow-md'
                }`}
              >
                {model.isActive && (
                  <div className="absolute top-0 end-0 bg-brand text-white text-xs font-black px-4 py-1.5 rounded-es-2xl shadow-md flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    {t("ai_settings.active_badge")}
                  </div>
                )}

                {/* Provider Header */}
                <div className="flex items-start justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold shadow-inner ${getProviderGradient(model.provider, model.isActive)}`}>
                      {model.icon}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">{model.name}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{t(model.description)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-6 flex-1 flex flex-col justify-between">
                  <div className="space-y-6">
                    {/* Per-tier model selectors: strong (reasoning/chat) + fast (light tasks) */}
                    <div className="group">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-brand" /> {t("ai_settings.strong_model")} 🧠
                      </label>
                      <div className="relative flex items-center bg-white/50 dark:bg-[#1a1d21]/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand/50">
                        <select
                          value={strongValue}
                          onChange={(e) => handleSelectTierModel(model.id, "strong", e.target.value)}
                          className="w-full appearance-none bg-transparent border-none px-4 py-3 pe-10 text-slate-900 dark:text-white text-sm font-medium focus:outline-none cursor-pointer"
                        >
                          {availableModels.map((am) => (
                            <option key={am.id} value={am.id} className="dark:bg-[#1a1d21]">
                              {am.label} {am.tier === "fast" ? `⚡` : `🧠`}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute end-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("ai_settings.strong_model_hint")}</p>
                    </div>

                    <div className="group">
                      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-amber-500" /> {t("ai_settings.fast_model")} ⚡
                      </label>
                      <div className="relative flex items-center bg-white/50 dark:bg-[#1a1d21]/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand/50">
                        <select
                          value={fastValue}
                          onChange={(e) => handleSelectTierModel(model.id, "fast", e.target.value)}
                          className="w-full appearance-none bg-transparent border-none px-4 py-3 pe-10 text-slate-900 dark:text-white text-sm font-medium focus:outline-none cursor-pointer"
                        >
                          <option value="" className="dark:bg-[#1a1d21]">{t("ai_settings.fast_model_auto")}</option>
                          {availableModels.map((am) => (
                            <option key={am.id} value={am.id} className="dark:bg-[#1a1d21]">
                              {am.label} {am.tier === "fast" ? `⚡` : `🧠`}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute end-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("ai_settings.fast_model_hint")}</p>
                    </div>

                    {/* API Key / Base URL */}
                    {model.provider !== 'ollama' ? (
                      <div className="group">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                          <Key className="w-4 h-4 text-brand" /> {t("ai_settings.api_key")}
                        </label>
                        <div className="relative flex items-center bg-white/50 dark:bg-[#1a1d21]/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand/50">
                          <input
                            type="password"
                            value={model.apiKey}
                            onChange={(e) => handleUpdateKey(model.id, e.target.value)}
                            onFocus={() => handleFocusKey(model.id)}
                            placeholder={model.hasApiKey ? t("ai_settings.key_saved_placeholder") : `${t("ai_settings.enter_key")} ${model.name}`}
                            className="w-full bg-transparent border-none px-4 py-3 text-slate-900 dark:text-white font-mono text-sm focus:outline-none"
                            dir="ltr"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="group">
                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                          <Server className="w-4 h-4 text-brand" /> {t("ai_settings.base_url")}
                        </label>
                        <div className="relative flex items-center bg-white/50 dark:bg-[#1a1d21]/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand/50">
                          <input 
                            type="text"
                            value={model.baseUrl}
                            onChange={(e) => handleUpdateUrl(model.id, e.target.value)}
                            placeholder="http://localhost:11434"
                            className="w-full bg-transparent border-none px-4 py-3 text-slate-900 dark:text-white font-mono text-sm focus:outline-none"
                            dir="ltr"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-6">
                    {/* Set Active Button */}
                    <button 
                      onClick={() => handleSetActive(model.id)}
                      disabled={model.isActive}
                      className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all border
                        ${model.isActive 
                          ? 'bg-brand/10 text-brand border-brand/20 cursor-default' 
                          : 'bg-white/50 dark:bg-[#222529]/50 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-white dark:hover:bg-[#2a2d32] hover:text-slate-900 dark:hover:text-white active:scale-[0.98]'
                        }`}
                    >
                      {model.isActive ? `✓ ${t("ai_settings.active_model")}` : t("ai_settings.set_active")}
                    </button>
                  </div>
                </div>

              </section>
            );
          })}
        </div>

      </div>
    </div>
  );
}
