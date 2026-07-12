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
    { id: "llama3.3", label: "Llama 3.3 (70B)", tier: "strong" },
    { id: "llama3.2", label: "Llama 3.2 (3B)", tier: "fast" },
    { id: "mistral", label: "Mistral (7B)", tier: "fast" },
    { id: "mixtral", label: "Mixtral (8x7B)", tier: "strong" },
    { id: "codellama", label: "Code Llama (34B)", tier: "strong" },
    { id: "deepseek-r1", label: "DeepSeek R1", tier: "strong" },
    { id: "qwen2.5", label: "Qwen 2.5 (7B)", tier: "fast" },
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
  selectedModel?: string; // e.g. "gemini-2.5-pro"
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
    selectedModel: "llama3.3",
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

  const handleSelectModel = (providerId: string, modelId: string) => {
    setModels(models.map(m => m.id === providerId ? { ...m, selectedModel: modelId } : m));
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
    <div className="w-full p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Sticky Action Bar */}
        <div className="sticky top-0 z-20 bg-white/95 dark:bg-[#1a1a2e]/95 backdrop-blur-md py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 -mx-8 px-8 shadow-sm">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
              <Bot className="w-7 h-7 text-[var(--primary-hex)]" />
              {t("ai_settings.title")}
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              {t("ai_settings.subtitle")}
            </p>
          </div>
          <button 
            onClick={saveSettings}
            disabled={isSaving}
            className="px-6 py-3 bg-gradient-to-r from-[var(--primary-hex)] to-purple-600 text-white rounded-xl shadow-lg shadow-indigo-500/25 font-bold hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-70 transform hover:-translate-y-0.5 active:translate-y-0 shrink-0"
          >
            {isSaving ? (
              <span className="animate-pulse flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> {t("ai_settings.saving")}</span>
            ) : saveSuccess ? (
              <><CheckCircle2 className="w-5 h-5 text-green-300" /> {t("ai_settings.saved")}</>
            ) : (
              <><Save className="w-5 h-5" /> {t("ai_settings.save_btn")}</>
            )}
          </button>
        </div>

        {/* Model Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {models.map((model) => {
            const availableModels = PROVIDER_MODELS[model.provider] || [];
            const selectedLabel = availableModels.find(m => m.id === model.selectedModel)?.label || model.selectedModel;
            
            return (
              <div 
                key={model.id}
                className={`p-6 rounded-2xl border-2 transition-all relative overflow-hidden ${
                  model.isActive 
                    ? 'border-[var(--primary-hex)] bg-[var(--primary-hex)]/5 dark:bg-[var(--primary-hex)]/10 shadow-2xl shadow-[var(--primary-hex)]/10 ring-2 ring-[var(--primary-hex)]/20' 
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#1e1e2e] shadow-sm hover:shadow-md'
                }`}
              >
                {model.isActive && (
                  <div className="absolute top-0 end-0 bg-gradient-to-r from-[var(--primary-hex)] to-purple-600 text-white text-xs font-black px-3.5 py-1 rounded-es-xl shadow-md flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
                    {t("ai_settings.active_badge")}
                  </div>
                )}

                {/* Provider Header */}
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold shadow-sm transition-transform transform hover:scale-105 ${getProviderGradient(model.provider, model.isActive)}`}>
                      {model.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{model.name}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-0.5">{t(model.description)}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Model Selector Dropdown */}
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-[var(--primary-hex)]" /> {t("ai_settings.select_model")}
                    </label>
                    <div className="relative">
                      <select
                        value={model.selectedModel || ""}
                        onChange={(e) => handleSelectModel(model.id, e.target.value)}
                        className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 pe-10 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary-hex)]/50 focus:bg-white dark:focus:bg-slate-700 transition-all text-sm font-medium cursor-pointer"
                      >
                        {availableModels.map((am) => (
                          <option key={am.id} value={am.id}>
                            {am.label} {am.tier === "fast" ? `⚡` : `🧠`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {t("ai_settings.current_model")}: <span className="font-semibold text-slate-600 dark:text-slate-300">{selectedLabel}</span>
                    </p>
                  </div>

                  {/* API Key / Base URL */}
                  {model.provider !== 'ollama' ? (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <Key className="w-4 h-4 text-[var(--primary-hex)]" /> {t("ai_settings.api_key")}
                      </label>
                      <input
                        type="password"
                        value={model.apiKey}
                        onChange={(e) => handleUpdateKey(model.id, e.target.value)}
                        onFocus={() => handleFocusKey(model.id)}
                        placeholder={model.hasApiKey ? t("ai_settings.key_saved_placeholder") : `${t("ai_settings.enter_key")} ${model.name}`}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary-hex)]/50 focus:bg-white dark:focus:bg-slate-700 transition-all font-mono text-sm"
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                        <Server className="w-4 h-4 text-[var(--primary-hex)]" /> {t("ai_settings.base_url")}
                      </label>
                      <input 
                        type="text"
                        value={model.baseUrl}
                        onChange={(e) => handleUpdateUrl(model.id, e.target.value)}
                        placeholder="http://localhost:11434"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary-hex)]/50 focus:bg-white dark:focus:bg-slate-700 transition-all font-mono text-sm"
                      />
                    </div>
                  )}

                  {/* Set Active Button */}
                  <button 
                    onClick={() => handleSetActive(model.id)}
                    disabled={model.isActive}
                    className={`w-full py-3 rounded-xl font-bold text-sm transition-all border
                      ${model.isActive 
                        ? 'bg-[var(--primary-hex)] text-white shadow-md shadow-[var(--primary-hex)]/20 cursor-default border-[var(--primary-hex)]' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white active:scale-[0.99]'
                      }`}
                  >
                    {model.isActive ? `✓ ${t("ai_settings.active_model")}` : t("ai_settings.set_active")}
                  </button>
                </div>

              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
