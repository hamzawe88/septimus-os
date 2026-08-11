"use client";

import React, { useState, useEffect } from "react";
import { Key, Plus, Trash2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface ApiKey {
  ID: string;
  Name: string;
  KeyHash: string;
  Scopes: string[];
  IsActive: boolean;
  LastUsedAt: string | null;
  CreatedAt: string;
}

export default function ApiKeysTab() {
  const { t } = useLocalization();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState("");
  const [copied, setCopied] = useState(false);
  
  const fetchApiKeys = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/apikeys`);
      if (res.ok) {
        const data = await res.json();
        setKeys(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch API keys:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const loadKeys = async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/apikeys`);
        if (res.ok && mounted) {
          const data = await res.json();
          setKeys(data.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch API keys:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void loadKeys();
    return () => { mounted = false; };
  }, []);

  const handleAddKey = async () => {
    if (!newKeyName) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/apikeys`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newKeyName,
          scopes: ["*"] // Default to all scopes for now
        })
      });
      if (res.ok) {
        const data = await res.json();
        setGeneratedKey(data.api_key); // Show the raw key only once
        setNewKeyName("");
        fetchApiKeys();
      }
    } catch (err) {
      console.error("Failed to create API key:", err);
    }
  };

  const handleRevokeKey = async (id: string) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/apikeys/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchApiKeys();
      }
    } catch (err) {
      console.error("Failed to revoke API key:", err);
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full h-full p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="bg-card dark:bg-[#1a1d21] rounded-2xl border border-border dark:border-slate-800 shadow-sm overflow-hidden mb-8">
          <div className="p-6 border-b border-border dark:border-slate-800 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-foreground dark:text-white">
              {t("apiKeys.activeKeys")}
            </h2>
            <Button className="bg-brand hover:bg-brand-hover text-white border-0" onClick={() => { setIsAdding(true); setGeneratedKey(""); }}>
              <Plus className="w-4 h-4 me-2" /> {t("apiKeys.generateNew")}
            </Button>
          </div>

          {isAdding && (
            <div className="p-6 border-b border-border dark:border-slate-800 bg-muted dark:bg-[#222529]">
              {!generatedKey ? (
                <>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-foreground dark:text-slate-200">
                      {t("apiKeys.generateTitle")}
                    </h3>
                    <Button variant="ghost" size="sm" className="text-muted-foreground dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-foreground dark:hover:text-white" onClick={() => setIsAdding(false)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                  <div className="mb-4">
                    <label htmlFor="keyName" className="block text-sm font-medium text-foreground dark:text-slate-300 mb-1">
                      {t("apiKeys.keyName")}
                    </label>
                    <input 
                      id="keyName"
                      type="text" 
                      className="w-full p-2 border border-border dark:border-slate-700 bg-card dark:bg-[#1a1d21] text-foreground dark:text-white rounded-md" 
                      placeholder={t("apiKeys.keyNamePlaceholder")} 
                      value={newKeyName} 
                      onChange={e => setNewKeyName(e.target.value)} 
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleAddKey} className="bg-brand hover:bg-brand-hover text-white">
                      {t("apiKeys.generateBtn")}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="bg-green-50 dark:bg-green-950/40 p-6 rounded-lg border border-green-200 dark:border-green-800">
                  <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">
                    {t("apiKeys.successTitle")}
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-400 mb-4">
                    {t("apiKeys.successDesc")}
                  </p>
                  <div className="flex items-center gap-2 mb-4">
                    <input 
                      aria-label="Generated API Key"
                      type="text" 
                      readOnly 
                      value={generatedKey} 
                      className="flex-1 p-3 bg-card dark:bg-[#1a1d21] border border-green-300 dark:border-green-700 text-foreground dark:text-white rounded-md font-mono text-sm"
                    />
                    <Button aria-label="Copy to clipboard" onClick={handleCopyKey} className="bg-card dark:bg-[#1a1d21] border border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 h-full py-3">
                      {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </Button>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => { setIsAdding(false); setGeneratedKey(""); }} variant="outline" className="text-foreground dark:text-slate-300 border-border dark:border-slate-700 hover:bg-muted dark:hover:bg-slate-800 bg-card dark:bg-[#1a1d21]">
                      {t("common.done")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="divide-y divide-border dark:divide-slate-800">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground dark:text-muted-foreground">
                {t("apiKeys.loading")}
              </div>
            ) : keys.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground dark:text-muted-foreground">
                {t("apiKeys.noKeys")}
              </div>
            ) : (
              keys.map(key => (
                <div key={key.ID} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-background dark:hover:bg-[#222529] transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`w-2 h-2 rounded-full ${key.IsActive ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      <h3 className="font-semibold text-foreground dark:text-white">{key.Name}</h3>
                    </div>
                    <div className="flex items-center gap-2 mt-2 ms-5 text-sm text-muted-foreground dark:text-muted-foreground font-mono">
                      <Key className="w-4 h-4" />
                      {key.KeyHash.substring(0, 8)}... (Hash)
                    </div>
                    <div className="ms-5 mt-1 text-xs text-muted-foreground">
                      {t("apiKeys.created")} {new Date(key.CreatedAt).toLocaleDateString()} | 
                      {t("apiKeys.lastUsed")} {key.LastUsedAt ? new Date(key.LastUsedAt).toLocaleString() : t("apiKeys.never")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:border-slate-700 dark:hover:bg-red-950/30" onClick={() => handleRevokeKey(key.ID)}>
                      <Trash2 className="w-4 h-4 me-2" /> {t("apiKeys.revoke")}
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
