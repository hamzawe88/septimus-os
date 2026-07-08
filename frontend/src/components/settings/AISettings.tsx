"use client";

import React, { useState, useEffect } from "react";
import { Key, Server, Save, CheckCircle2, Bot } from "lucide-react";
import { fetchWithAuth,     API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface ModelConfig {
  id: string;
  name: string;
  provider: "openai" | "gemini" | "anthropic" | "ollama";
  icon: string; // just a label for now
  description: string;
  apiKey?: string;
  baseUrl?: string;
  isActive: boolean;
}

const DEFAULT_MODELS: ModelConfig[] = [
  {
    id: "openai",
    name: "OpenAI (GPT-4o)",
    provider: "openai",
    icon: "O",
    description: "Industry standard model. Requires an OpenAI API Key.",
    apiKey: "",
    isActive: true,
  },
  {
    id: "gemini",
    name: "Google Gemini (1.5 Pro)",
    provider: "gemini",
    icon: "G",
    description: "Google's most capable multimodal model. Requires a Google AI Studio Key.",
    apiKey: "",
    isActive: false,
  },
  {
    id: "anthropic",
    name: "Anthropic (Claude 3.5 Sonnet)",
    provider: "anthropic",
    icon: "A",
    description: "Excellent at coding and long-context reasoning. Requires an Anthropic Key.",
    apiKey: "",
    isActive: false,
  },
  {
    id: "ollama",
    name: "Local Models (Ollama)",
    provider: "ollama",
    icon: "L",
    description: "Run models locally for maximum privacy. Requires Ollama running on your machine.",
    baseUrl: "http://localhost:11434",
    isActive: false,
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
                const workspaceId = localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e"; // Mock workspace
        const res = await fetchWithAuth(`${API_BASE_URL}/settings/ai_providers?workspace_id=${workspaceId}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setModels(data);
          }
        } else {
          // Fallback to local storage if API fails
          const saved = localStorage.getItem("septimus_ai_models");
          if (saved) setModels(JSON.parse(saved));
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

  const handleUpdateUrl = (id: string, url: string) => {
    setModels(models.map(m => m.id === id ? { ...m, baseUrl: url } : m));
  };

  const handleSetActive = (id: string) => {
    setModels(models.map(m => ({ ...m, isActive: m.id === id })));
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
            const workspaceId = localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e"; // Mock workspace
      
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
        alert(t("settings.saveFailed"));
      }
      // Also save to localStorage as fallback
      localStorage.setItem("septimus_ai_models", JSON.stringify(models));
    } catch (e) {
      console.error(e);
      alert(t("settings.serverError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-full p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Sticky Action Bar */}
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md py-4 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 -mx-8 px-8 shadow-sm">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 flex items-center gap-3">
              <Bot className="w-7 h-7 text-indigo-600" />
              AI Providers & Models
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Configure LLM endpoints and authentication keys. The active model powers auto-triage and autonomous workflows.
            </p>
          </div>
          <button 
            onClick={saveSettings}
            disabled={isSaving}
            className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl shadow-lg shadow-indigo-500/25 font-bold hover:from-indigo-500 hover:to-purple-500 transition-all flex items-center gap-2 disabled:opacity-70 transform hover:-translate-y-0.5 active:translate-y-0 shrink-0"
          >
            {isSaving ? (
              <span className="animate-pulse flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Saving...</span>
            ) : saveSuccess ? (
              <><CheckCircle2 className="w-5 h-5 text-green-300" /> Saved Successfully!</>
            ) : (
              <><Save className="w-5 h-5" /> Save Configuration</>
            )}
          </button>
        </div>

        {/* Model Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {models.map((model) => (
            <div 
              key={model.id}
              className={`p-6 rounded-2xl border-2 transition-all relative overflow-hidden ${
                model.isActive 
                  ? 'border-indigo-600 bg-indigo-50/10 shadow-2xl shadow-indigo-500/10 ring-2 ring-indigo-500/20' 
                  : 'border-slate-200 hover:border-slate-300 bg-white shadow-sm hover:shadow-md'
              }`}
            >
              {model.isActive && (
                <div className="absolute top-0 end-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-black px-3.5 py-1 rounded-es-xl shadow-md flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
                  ACTIVE MODEL
                </div>
              )}

              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold shadow-sm transition-transform transform hover:scale-105
                    ${model.isActive ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {model.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{model.name}</h3>
                    <p className="text-xs text-slate-500 w-4/5 leading-relaxed mt-0.5">{model.description}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {model.provider !== 'ollama' ? (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Key className="w-4 h-4 text-indigo-500" /> API Key
                    </label>
                    <input 
                      type="password"
                      value={model.apiKey}
                      onChange={(e) => handleUpdateKey(model.id, e.target.value)}
                      placeholder={`Enter your ${model.name} API Key`}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all font-mono text-sm"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                      <Server className="w-4 h-4 text-indigo-500" /> Base URL
                    </label>
                    <input 
                      type="text"
                      value={model.baseUrl}
                      onChange={(e) => handleUpdateUrl(model.id, e.target.value)}
                      placeholder="http://localhost:11434"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white transition-all font-mono text-sm"
                    />
                  </div>
                )}

                <button 
                  onClick={() => handleSetActive(model.id)}
                  disabled={model.isActive}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-all border
                    ${model.isActive 
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20 cursor-default border-indigo-600' 
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 hover:text-slate-900 active:scale-[0.99]'
                    }`}
                >
                  {model.isActive ? "✓ Currently Active Model" : "Set as Active Model"}
                </button>
              </div>

            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
