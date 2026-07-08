"use client";

import React, { useState, useEffect } from "react";
import { Plus, Save, Trash2, Power, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface WebhookItem {
  ID: string;
  TargetURL: string;
  Events: string[];
  IsActive: boolean;
  Secret?: string;
}

export default function WebhooksTab() {
  const { t } = useLocalization();
  const [hooks, setHooks] = useState<WebhookItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newHookUrl, setNewHookUrl] = useState("");
  const [newHookSecret, setNewHookSecret] = useState("");
  const [newHookEvents, setNewHookEvents] = useState("events.tasks.created");

  const fetchWebhooks = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/workspaces/me/webhooks`);
      if (res.ok) {
        const data = await res.json();
        setHooks(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch webhooks:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchWebhooks();
    };
    loadData();
  }, []);

  const handleAddWebhook = async () => {
    if (!newHookUrl) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/workspaces/me/webhooks`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          target_url: newHookUrl,
          events: newHookEvents.split(",").map(e => e.trim()),
          secret: newHookSecret,
        })
      });
      if (res.ok) {
        setIsAdding(false);
        setNewHookUrl("");
        setNewHookSecret("");
        setNewHookEvents("events.tasks.created");
        fetchWebhooks();
      }
    } catch (err) {
      console.error("Failed to add webhook:", err);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/workspaces/me/webhooks/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchWebhooks();
      }
    } catch (err) {
      console.error("Failed to delete webhook:", err);
    }
  };

  return (
    <div className="w-full p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white dark:bg-[#1a1d21] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
              {t("webhooks.endpoints")}
            </h2>
            <Button className="bg-brand hover:bg-brand-hover text-white" onClick={() => setIsAdding(true)}>
              <Plus className="w-4 h-4 me-2" /> {t("webhooks.addEndpoint")}
            </Button>
          </div>

          {isAdding && (
            <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#222529]">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200">
                  {t("webhooks.addNew")}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t("webhooks.targetUrl")}
                  </label>
                  <input 
                    type="text" 
                    className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1d21] text-slate-900 dark:text-white rounded-md" 
                    placeholder="https://webhook.site/..." 
                    value={newHookUrl} 
                    onChange={e => setNewHookUrl(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t("webhooks.events")}
                  </label>
                  <input 
                    type="text" 
                    className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1d21] text-slate-900 dark:text-white rounded-md" 
                    placeholder="events.tasks.created" 
                    value={newHookEvents} 
                    onChange={e => setNewHookEvents(e.target.value)} 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t("webhooks.secret")}
                  </label>
                  <input 
                    type="password" 
                    className="w-full p-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1a1d21] text-slate-900 dark:text-white rounded-md" 
                    placeholder="Your secret key" 
                    value={newHookSecret} 
                    onChange={e => setNewHookSecret(e.target.value)} 
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleAddWebhook} className="bg-green-600 hover:bg-green-700 text-white">
                  <Save className="w-4 h-4 me-2" /> {t("webhooks.save")}
                </Button>
              </div>
            </div>
          )}
          
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                {t("webhooks.loading")}
              </div>
            ) : hooks.length === 0 ? (
              <div className="p-8 text-center text-slate-500 dark:text-slate-400">
                {t("webhooks.noHooks")}
              </div>
            ) : (
              hooks.map(hook => (
                <div key={hook.ID} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#f8fafc] dark:hover:bg-[#222529] transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`w-2 h-2 rounded-full ${hook.IsActive ? 'bg-green-500' : 'bg-slate-300'}`}></span>
                      <h3 className="font-semibold text-slate-800 dark:text-white font-mono text-sm">{hook.TargetURL}</h3>
                    </div>
                    <div className="flex items-center gap-2 mt-2 ms-5">
                      {hook.Events && hook.Events.map((ev: string) => (
                        <span key={ev} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded font-medium border border-slate-200 dark:border-slate-700">
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700">
                      <Power className="w-4 h-4 me-1" /> {hook.IsActive ? t("webhooks.disable") : t("webhooks.enable")}
                    </Button>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-950/30" onClick={() => handleDeleteWebhook(hook.ID)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
