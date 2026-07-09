"use client";

import React, { useState, useEffect } from "react";
import { 
  X, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Copy, 
  Check, 
  ExternalLink,
  ShieldCheck,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface IntegrationConfigModalProps {
  app: {
    id: string;
    name: string;
    description: string;
    category: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function IntegrationConfigModal({ app, isOpen, onClose, onSuccess }: IntegrationConfigModalProps) {
  const { t, isRtl } = useLocalization();
  const [accessToken, setAccessToken] = useState("");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ status: "success" | "error"; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && app) {
      const timer = setTimeout(() => {
        setTestResult(null);
        setSaveError(null);
        setLoading(true);
        
        const loadConfig = async () => {
          try {
            const res = await fetchWithAuth(`${API_BASE_URL}/integrations/${app.id}/config`);
            if (res.ok) {
              const data = await res.json();
              setAccessToken(data.access_token || "");
              const conf = data.config || {};
              const strConf: Record<string, string> = {};
              Object.keys(conf).forEach(k => {
                strConf[k] = String(conf[k] || "");
              });
              setConfig(strConf);
            }
          } catch (err) {
            console.error("Failed to load config:", err);
          } finally {
            setLoading(false);
          }
        };
        void loadConfig();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, app]);

  if (!isOpen || !app) return null;

  const handleConfigChange = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setTestResult(null); // reset test result on change
  };

  const handleCopyWebhook = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://septimus-os.com";
    const webhookUrl = `${origin}/api/public/v1/webhooks/${app.id === "zendesk" ? "zendesk" : app.id}`;
    void navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/integrations/${app.id}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          config: config
        })
      });
      const data = await res.json();
      if (res.ok && data.status === "success") {
        setTestResult({ status: "success", message: data.message || t("plugins.testSuccessMsg") });
      } else {
        setTestResult({ status: "error", message: data.message || data.error || t("plugins.testErrorMsg") });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ status: "error", message: t("plugins.testConnError") + msg });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveAndConnect = async () => {
    setLoading(true);
    setSaveError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/integrations/${app.id}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          config: config
        })
      });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await res.json();
        setSaveError(data.error || t("plugins.saveErrorMsg"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(t("plugins.saveConnError") + msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleOAuth = () => {
    window.location.href = `${API_BASE_URL}/auth/google/login`;
  };

  const renderFormFields = () => {
    if (app.id === "whatsapp") {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.waPhoneId")}</label>
            <input
              type="text"
              value={config.phone_number_id || ""}
              onChange={(e) => handleConfigChange("phone_number_id", e.target.value)}
              placeholder={isRtl ? "مثال: 10839281928392" : "e.g. 10839281928392"}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.waAccountId")}</label>
            <input
              type="text"
              value={config.business_account_id || ""}
              onChange={(e) => handleConfigChange("business_account_id", e.target.value)}
              placeholder={isRtl ? "مثال: 10928392839201" : "e.g. 10928392839201"}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.waToken")}</label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="EAA..."
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.waVerifyToken")}</label>
            <input
              type="text"
              value={config.verify_token || ""}
              onChange={(e) => handleConfigChange("verify_token", e.target.value)}
              placeholder="septimus_secret_verify_2026"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>
      );
    }

    if (app.id === "zendesk") {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.zendeskSubdomain")}</label>
            <div className="flex items-center">
              <input
                type="text"
                value={config.subdomain || ""}
                onChange={(e) => handleConfigChange("subdomain", e.target.value)}
                placeholder="mycompany"
                className="flex-1 px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-e-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-start dir-ltr"
              />
              <span className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-s-0 border-slate-300 dark:border-slate-700 rounded-s-xl text-xs font-mono text-slate-600 dark:text-slate-300">.zendesk.com</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.adminEmail")}</label>
            <input
              type="email"
              value={config.admin_email || ""}
              onChange={(e) => handleConfigChange("admin_email", e.target.value)}
              placeholder="admin@mycompany.com"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-start dir-ltr"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.apiToken")}</label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={t("plugins.enterZendeskToken")}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
            />
          </div>
        </div>
      );
    }

    if (app.id === "odoo") {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.odooUrl")}</label>
            <input
              type="url"
              value={config.server_url || ""}
              onChange={(e) => handleConfigChange("server_url", e.target.value)}
              placeholder="https://mycompany.odoo.com"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-start dir-ltr"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.dbName")}</label>
            <input
              type="text"
              value={config.database || ""}
              onChange={(e) => handleConfigChange("database", e.target.value)}
              placeholder="odoo_prod_db"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-start dir-ltr"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.usernameOrEmail")}</label>
            <input
              type="text"
              value={config.username || ""}
              onChange={(e) => handleConfigChange("username", e.target.value)}
              placeholder="admin@mycompany.com"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-start dir-ltr"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.apiKeyOrPass")}</label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={t("plugins.enterOdooKey")}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
            />
          </div>
        </div>
      );
    }

    if (app.id === "ai_analytics") {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.aiProvider")}</label>
            <select
              value={config.provider || "gemini"}
              onChange={(e) => handleConfigChange("provider", e.target.value)}
              aria-label={t("plugins.aiProvider")}
              title={t("plugins.aiProvider")}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="gemini">{t("plugins.geminiRec")}</option>
              <option value="openai">OpenAI (ChatGPT-4o)</option>
              <option value="anthropic">Anthropic Claude 3.5</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.apiKeyLabel")}</label>
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={isRtl ? "AIzaSy... أو sk-..." : "AIzaSy... or sk-..."}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.defaultModel")}</label>
            <input
              type="text"
              value={config.model || "gemini-2.5-pro"}
              onChange={(e) => handleConfigChange("model", e.target.value)}
              placeholder="gemini-2.5-pro"
              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-start dir-ltr"
            />
          </div>
        </div>
      );
    }

    if (app.id.includes("google") || app.id === "gdrive") {
      return (
        <div className="py-6 text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Zap className="w-8 h-8" />
          </div>
          <h4 className="font-bold text-slate-900 dark:text-white text-base">{t("plugins.googleConnectTitle")}</h4>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-sm mx-auto">
            {t("plugins.googleConnectDesc")}
          </p>
          <div className="pt-2">
            <Button
              onClick={handleGoogleOAuth}
              type="button"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 mx-auto shadow-md shadow-blue-200 dark:shadow-none"
            >
              <ExternalLink className="w-4 h-4" />
              {t("plugins.loginGoogle")}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">{t("plugins.genericKeyLabel")}</label>
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={t("plugins.genericKeyPlaceholder")}
            className="w-full px-3.5 py-2.5 bg-white dark:bg-[#222529] border border-slate-300 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono"
          />
        </div>
      </div>
    );
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "https://septimus-os.com";
  const webhookUrl = `${origin}/api/public/v1/webhooks/${app.id === "zendesk" ? "zendesk" : app.id}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-[#1a1d21] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-[#222529]/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 rounded-2xl text-indigo-600 dark:text-indigo-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{t("plugins.configTitle")} {app.name}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{app.category} Integration</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            aria-label={t("common.close")}
            title={t("common.close")}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mb-3 text-indigo-600 dark:text-indigo-400" />
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{t("plugins.loadingConfig")}</span>
            </div>
          ) : (
            <>
              {/* Description & Guide */}
              <div className="p-4 bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 rounded-2xl text-sm text-indigo-900 dark:text-indigo-300 leading-relaxed">
                <span className="font-bold block mb-1">{t("plugins.guideTitle")}</span>
                {app.description} {t("plugins.guideText")}
              </div>

              {/* Form Fields */}
              {renderFormFields()}

              {/* Inbound Webhook Section (for Zendesk & WhatsApp) */}
              {(app.id === "zendesk" || app.id === "whatsapp") && (
                <div className="p-4 bg-slate-50 dark:bg-[#222529] border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">{t("plugins.inboundWebhookLabel")}</span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t("plugins.inboundWebhookDesc", `انسخ هذا الرابط وضعه في لوحة تحكم ${app.name} لإرسال الأحداث والتذاكر فوراً إلى Septimus OS:`)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <input 
                      type="text" 
                      readOnly 
                      value={webhookUrl}
                      aria-label={t("plugins.inboundWebhookLabel")}
                      title={t("plugins.inboundWebhookLabel")}
                      placeholder="https://..."
                      className="flex-1 px-3 py-2 bg-white dark:bg-[#1a1d21] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-700 dark:text-slate-200 focus:outline-none text-start dir-ltr"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyWebhook}
                      className="flex items-center gap-1 text-xs px-3 h-9 bg-white dark:bg-[#1a1d21] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl border-slate-200 dark:border-slate-700"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />}
                      {copied ? t("common.done") : t("common.copy")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Test Result Alert */}
              {testResult && (
                <div className={`p-4 rounded-2xl border flex items-start gap-3 text-sm animate-fadeIn ${
                  testResult.status === "success" 
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300" 
                    : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
                }`}>
                  {testResult.status === "success" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-bold block mb-0.5">
                      {testResult.status === "success" ? t("plugins.testSuccess") : t("plugins.testFail")}
                    </span>
                    <p className="text-xs leading-relaxed">{testResult.message}</p>
                  </div>
                </div>
              )}

              {/* Save Error Alert */}
              {saveError && (
                <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 rounded-2xl flex items-center gap-3 text-sm">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#222529]/50 flex items-center justify-between">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            className="rounded-xl px-5 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
          >
            {t("common.close")}
          </Button>

          {!app.id.includes("google") && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testing || loading}
                className="rounded-xl px-4 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 flex items-center gap-2 font-semibold"
              >
                {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                {t("plugins.testLiveConnection")}
              </Button>

              <Button
                type="button"
                onClick={handleSaveAndConnect}
                disabled={loading || testing}
                className="bg-brand hover:bg-brand-hover text-white rounded-xl px-6 font-bold shadow-md shadow-indigo-200 dark:shadow-none flex items-center gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {t("plugins.saveAndActivate")}
              </Button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
