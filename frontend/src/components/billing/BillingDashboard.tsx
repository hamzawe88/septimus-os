"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  CreditCard, 
  Building2, 
  Zap, 
  RefreshCw,
  ArrowUpRight,
  Database,
  Users,
  FileText,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Settings,
  ChevronRight,
  Check,
  Download,
  Lock,
  Globe
} from "lucide-react";
import { apiGet, apiPost, API_BASE_URL } from "@/lib/apiClient";
import { BillingStatusResponse, CheckoutSessionResponse } from "@/types/billing";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useAppStore } from "@/store/useAppStore";


interface SaaSPlan {
  id?: string;
  tier_id: string;
  name_en: string;
  name_ar: string;
  price: number;
  currency: string;
  description_en: string;
  description_ar: string;
  features_en: string;
  features_ar: string;
  recommended: boolean;
  color: string;
  is_active: boolean;
}

export default function BillingDashboard() {
  const { t, isRtl } = useLocalization();
  const { isSidebarOpen } = useAppStore();
  const { setCurrentView, currentUser } = useAppStore();
  
  const [data, setData] = useState<BillingStatusResponse | null>(null);
  const [plans, setPlans] = useState<SaaSPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [gateway, setGateway] = useState<string>('stripe');
  const [loading, setLoading] = useState(true);
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'plans' | 'invoices' | 'security'>('overview');
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const isAdmin = currentUser?.role?.toLowerCase() === 'admin' || currentUser?.Role?.toLowerCase() === 'admin' || 
                  currentUser?.role?.toLowerCase() === 'owner' || currentUser?.Role?.toLowerCase() === 'owner';

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<BillingStatusResponse>("/billing/status");
      if (res) {
        setData(res);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load billing details";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const plansData = await apiGet("/billing/plans");
      setPlans((plansData as SaaSPlan[]) || []);
    } catch (err) {
      console.error("Failed to fetch plans", err);
    } finally {
      setLoadingPlans(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadStatus(), loadPlans()]);
    };
    init();
  }, [loadStatus, loadPlans]);

  // Check URL params for simulated stripe redirect & process instant upgrade
  useEffect(() => {
    const handleUrlUpgradeCheck = async () => {
      const params = new URLSearchParams(window.location.search);
      const isSimulated = params.get("simulated");
      const targetTier = params.get("tier");
      const wsId = params.get("workspace_id");

      if (isSimulated === "true" && targetTier && wsId) {
        try {
          await fetch(`${API_BASE_URL}/webhooks/stripe`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "simulated.tier.upgrade",
              workspace_id: wsId,
              tier: targetTier
            }),
          });

          setSuccessBanner(`${t('billingDashboard.upgradeSuccess')} (${targetTier.toUpperCase()})`);

          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err) {
          console.error("Upgrade webhook simulation error:", err);
        }
      }
      loadStatus();
    };

    handleUrlUpgradeCheck();
    window.addEventListener("septimus:subscription-refreshed", loadStatus);
    return () => {
      window.removeEventListener("septimus:subscription-refreshed", loadStatus);
    };
  }, [loadStatus, isRtl, t]);

  const handleUpgrade = async (tier: string) => {
    setUpgradingTier(tier);
    setError(null);
    try {
      const res = await apiPost<CheckoutSessionResponse>("/billing/checkout", {
        tier,
        gateway,
        return_url: window.location.href.split("?")[0],
        simulated: true
      });

      if (res && res.url) {
        window.location.assign(res.url);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initialize checkout session";
      setError(msg);
    } finally {
      setUpgradingTier(null);
    }
  };

  const handleOpenPortal = async () => {
    try {
      const res = await apiPost<{ url: string }>("/billing/portal", {
        return_url: window.location.href.split("?")[0]
      });
      if (res && res.url) {
        window.location.assign(res.url);
      }
    } catch {
      setError(t('billingDashboard.portalInitFailed'));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-3xl border border-border/50 dark:border-slate-800/50 p-8 shadow-sm">
        <RefreshCw className="w-8 h-8 animate-spin text-brand" />
        <span className="text-muted-foreground dark:text-muted-foreground font-medium text-sm">
          {t('billingDashboard.syncingData')}
        </span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-red-50/80 dark:bg-red-950/40 backdrop-blur-sm border border-red-200 dark:border-red-900/50 rounded-2xl flex items-center justify-between text-red-700 dark:text-red-300 shadow-sm">
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          <AlertTriangle className="w-6 h-6 text-red-500 shrink-0" />
          <span className="font-semibold text-sm">{error || (t('billingDashboard.connectionError'))}</span>
        </div>
        <Button onClick={loadStatus} variant="outline" className="border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/60 font-bold text-xs bg-white/50 dark:bg-transparent">
          {t('billingDashboard.retry')}
        </Button>
      </div>
    );
  }

  const currentTier = data.workspace.Tier || "free";
  const userPct = Math.min(100, ((data.usage?.users?.current ?? 0) / (data.usage?.users?.max || 1)) * 100);
  const storagePct = Math.min(100, ((data.usage?.storage_gb?.current ?? 0) / (data.usage?.storage_gb?.max || 1)) * 100);
  // Backend now reports real token consumption (ai_tokens) instead of the old
  // estimated ai_queries counter; a 0/unlimited cap must not divide by zero.
  const aiPct = Math.min(100, ((data.usage?.ai_tokens?.current ?? 0) / (data.usage?.ai_tokens?.max || 1)) * 100);

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className={`space-y-8 pb-12 text-foreground dark:text-slate-100 mx-auto transition-all duration-300 ${isSidebarOpen ? 'max-w-7xl' : 'max-w-full'}`}>
      
      {/* Success Notification Banner */}
      {successBanner && (
        <div className="p-4 bg-emerald-50/90 dark:bg-emerald-900/30 backdrop-blur-md border border-emerald-200 dark:border-emerald-800/50 rounded-2xl flex items-center justify-between text-emerald-800 dark:text-emerald-300 shadow-sm animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <span className="font-semibold text-sm">{successBanner}</span>
          </div>
          <button 
            onClick={() => setSuccessBanner(null)}
            className="text-xs font-bold opacity-70 hover:opacity-100 transition-opacity"
          >
            {t('billingDashboard.dismiss')}
          </button>
        </div>
      )}

      {/* Header Card - Premium Glassmorphism */}
      <div className="relative overflow-hidden rounded-[2rem] bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl border border-white/40 dark:border-slate-800/60 shadow-lg shadow-slate-200/20 dark:shadow-none p-8 md:p-10">
        {/* Subtle decorative glow */}
        <div className="absolute -top-40 -end-40 w-96 h-96 bg-brand/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-40 -start-40 w-96 h-96 bg-brand/5 dark:bg-brand/10 rounded-full blur-[100px] pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 relative z-10">
          <div className="space-y-4 max-w-3xl">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-muted/80 dark:bg-slate-800/80 backdrop-blur-sm border border-border/50 dark:border-slate-700/50 text-muted-foreground dark:text-slate-300 text-xs font-semibold tracking-wide shadow-sm">
                <Building2 className="w-3.5 h-3.5" />
                <span>{t('billingDashboard.workspaceTenant')} {data.workspace.Name}</span>
              </div>
              
              {isAdmin && (
                <button 
                  onClick={() => setCurrentView('admin_dashboard')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/10 hover:bg-brand/20 text-brand transition-colors text-xs font-bold cursor-pointer border border-brand/20 shadow-sm"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{t('admin.saasManager') || "إدارة الباقات (للمشرفين)"}</span>
                  <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </button>
              )}
            </div>
            
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight flex flex-wrap items-center gap-4 text-foreground dark:text-white">
              <span>{t('billingDashboard.controlCenter')}</span>
              <span className="px-4 py-1 rounded-xl text-lg font-bold uppercase bg-brand text-brand-foreground shadow-lg shadow-brand/25 ring-1 ring-white/20">
                {currentTier}
              </span>
            </h1>
            <p className="text-muted-foreground dark:text-muted-foreground text-base leading-relaxed max-w-2xl">
              {t('billingDashboard.controlCenterDesc')}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button
              onClick={loadStatus}
              variant="outline"
              className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-border/60 dark:border-slate-700/60 shadow-sm hover:bg-muted dark:hover:bg-slate-700 transition-all rounded-xl h-11 px-5"
            >
              <RefreshCw className="w-4 h-4 me-2 text-muted-foreground" />
              {t('billingDashboard.refresh')}
            </Button>
            <Button
              onClick={handleOpenPortal}
              className="bg-brand hover:bg-brand-hover text-brand-foreground shadow-md transition-all rounded-xl h-11 px-6 font-semibold"
            >
              <CreditCard className="w-4 h-4 me-2" />
              <span>{t('billingDashboard.stripePortal')}</span>
              <ArrowUpRight className="w-4 h-4 ms-1 opacity-70" />
            </Button>
          </div>
        </div>

        {/* Clean Line Tabs */}
        <div className="flex items-center gap-6 mt-10 border-b border-border/50 dark:border-slate-700/50 overflow-x-auto hide-scrollbar relative z-10">
          {[
            { id: 'overview', icon: Zap, label: t('billingDashboard.liveQuotas') },
            { id: 'plans', icon: Sparkles, label: t('billingDashboard.upgradePlans') },
            { id: 'invoices', icon: FileText, label: t('billingDashboard.stripeInvoices') },
            { id: 'security', icon: ShieldCheck, label: t('billingDashboard.rlsAudit') },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'overview' | 'plans' | 'invoices' | 'security')}
              className={`pb-4 text-sm font-bold transition-all flex items-center gap-2 shrink-0 border-b-2 ${
                activeTab === tab.id
                  ? "border-brand text-brand"
                  : "border-transparent text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-slate-200 hover:border-border dark:hover:border-slate-600"
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-brand' : 'opacity-70'}`} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: OVERVIEW & LIVE QUOTAS */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Active Seats Quota */}
          <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl rounded-3xl p-7 border border-white/40 dark:border-slate-800/60 shadow-sm space-y-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center text-brand ring-1 ring-brand/20">
                <Users className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">
                {t('billingDashboard.activeSeats')}
              </span>
            </div>
            <div>
              <div className="flex justify-between items-end mb-3">
                <span className="text-4xl font-black tracking-tight">{data.usage?.users?.current ?? 0}</span>
                <span className="text-sm font-semibold text-muted-foreground mb-1">
                  / {(data.usage?.users?.max ?? 0) > 10000 || (data.usage?.users?.max ?? 0) < 0 ? "∞" : data.usage?.users?.max ?? 0} {t('billingDashboard.usersCount')}
                </span>
              </div>
              <div className="w-full bg-muted dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-brand h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${userPct}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground leading-relaxed">
              {t('billingDashboard.seatsDesc')}
            </p>
          </div>

          {/* Encrypted Storage Quota */}
          <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl rounded-3xl p-7 border border-white/40 dark:border-slate-800/60 shadow-sm space-y-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center text-brand ring-1 ring-brand/20">
                <Database className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">
                {t('billingDashboard.encryptedStorage')}
              </span>
            </div>
            <div>
              <div className="flex justify-between items-end mb-3">
                <span className="text-4xl font-black tracking-tight">{Math.round((data.usage?.storage_gb?.current ?? 0) * 100) / 100}<span className="text-lg text-muted-foreground ms-1">GB</span></span>
                <span className="text-sm font-semibold text-muted-foreground mb-1">
                  / {data.usage?.storage_gb?.max ?? 0} GB
                </span>
              </div>
              <div className="w-full bg-muted dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-brand h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${storagePct}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground leading-relaxed">
              {t('billingDashboard.storageDesc')}
            </p>
          </div>

          {/* AI Queries Quota */}
          <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl rounded-3xl p-7 border border-white/40 dark:border-slate-800/60 shadow-sm space-y-5 hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="absolute top-0 end-0 w-32 h-32 bg-brand/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center justify-between relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center text-brand ring-1 ring-brand/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-muted-foreground dark:text-muted-foreground uppercase tracking-wider">
                {t('billingDashboard.aiTokens')}
              </span>
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-end mb-3">
                <span className="text-4xl font-black tracking-tight">{(data.usage?.ai_tokens?.current ?? 0).toLocaleString()}</span>
                <span className="text-sm font-semibold text-muted-foreground mb-1">
                  / {(data.usage?.ai_tokens?.max ?? 0) < 0 ? "∞" : (data.usage?.ai_tokens?.max ?? 0).toLocaleString()} {t('billingDashboard.tokensCount')}
                </span>
              </div>
              <div className="w-full bg-muted dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-brand h-full rounded-full transition-all duration-1000 ease-out"
                  style={{ width: `${aiPct}%` }}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground leading-relaxed relative z-10">
              {t('billingDashboard.aiDesc')}
            </p>
          </div>
        </div>
      )}

      {/* TAB 2: PLAN TIERS & UPGRADE */}
      {activeTab === 'plans' && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
            <div>
              <h2 className="text-2xl font-extrabold flex items-center gap-2">
                {t('billingDashboard.availablePlans')}
              </h2>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-2 max-w-lg">
                {t('billingDashboard.plansDesc')}
              </p>
            </div>
            
            <div className="flex items-center gap-3 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md p-1.5 rounded-2xl border border-border/60 dark:border-slate-800/60 shadow-sm">
              <span className="text-xs font-bold text-muted-foreground dark:text-muted-foreground ms-3 uppercase tracking-wider">{t('billingDashboard.gateway')}</span>
              <div className="flex items-center gap-1">
                {['stripe', 'moamalat', 'onepay'].map((g) => (
                  <button
                    key={g}
                    onClick={() => setGateway(g)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                      gateway === g 
                        ? 'bg-card dark:bg-slate-800 text-foreground dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-700' 
                        : 'text-muted-foreground hover:text-foreground dark:hover:text-slate-300'
                    }`}
                  >
                    {g === 'stripe' ? 'Stripe' : g === 'moamalat' ? 'Moamalat' : 'OnePay'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loadingPlans ? (
            <div className="flex justify-center items-center py-24">
              <RefreshCw className="w-8 h-8 text-brand animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
              {plans.map((plan) => {
                const isCurrent = currentTier === plan.tier_id;
                
                let parsedFeaturesEn: string[] = [];
                let parsedFeaturesAr: string[] = [];
                try { parsedFeaturesEn = JSON.parse(plan.features_en || "[]"); } catch {}
                try { parsedFeaturesAr = JSON.parse(plan.features_ar || "[]"); } catch {}

                return (
                  <div
                    key={plan.tier_id}
                    className={`relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-[2rem] p-8 border transition-all duration-300 flex flex-col h-full
                      ${plan.recommended 
                        ? "border-brand shadow-xl shadow-brand/10 md:-mt-4" 
                        : "border-border dark:border-slate-800 shadow-sm hover:shadow-md hover:border-border dark:hover:border-slate-700"
                      }
                      ${isCurrent ? "ring-2 ring-brand/50 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-950" : ""}
                    `}
                  >
                    {plan.recommended && (
                      <div className="absolute -top-4 start-1/2 rtl:-translate-x-1/2 ltr:-translate-x-1/2 bg-brand text-brand-foreground px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-md">
                        {t('billingDashboard.mostPopular')}
                      </div>
                    )}
                    
                    {isCurrent && (
                      <div className="absolute top-6 end-6 flex items-center gap-1.5 text-brand bg-brand/10 px-3 py-1 rounded-full text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t('billingDashboard.activeNow')}</span>
                      </div>
                    )}

                    <div className="mb-8 mt-2">
                      <h3 className="text-xl font-bold mb-2">
                        {isRtl ? plan.name_ar : plan.name_en}
                      </h3>
                      <p className="text-sm text-muted-foreground dark:text-muted-foreground min-h-[40px]">
                        {isRtl ? plan.description_ar : plan.description_en}
                      </p>
                    </div>

                    <div className="mb-8">
                      <div className="flex items-baseline gap-1">
                        <span className="text-5xl font-black tracking-tight text-foreground dark:text-white">
                          {plan.price === 0 ? t('billingDashboard.free') : plan.price}
                        </span>
                        {plan.price > 0 && (
                          <span className="text-muted-foreground font-semibold">{plan.currency}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-medium mt-1 block">
                        / {isRtl ? "شهرياً للشركة" : "month per tenant"}
                      </span>
                    </div>

                    <div className="space-y-4 mb-8 flex-1">
                      {(isRtl ? parsedFeaturesAr : parsedFeaturesEn).map((feat, idx) => (
                        <div key={idx} className="flex items-start gap-3">
                          <Check className={`w-5 h-5 shrink-0 mt-0.5 ${plan.recommended ? "text-brand" : "text-muted-foreground"}`} />
                          <span className="text-sm text-foreground dark:text-slate-300 font-medium">{feat}</span>
                        </div>
                      ))}
                    </div>

                    <Button
                      onClick={() => handleUpgrade(plan.tier_id)}
                      disabled={isCurrent || upgradingTier === plan.tier_id}
                      className={`w-full h-12 rounded-xl font-bold text-sm transition-all ${
                        isCurrent
                          ? "bg-muted dark:bg-slate-800 text-muted-foreground cursor-not-allowed border border-border dark:border-slate-700"
                          : plan.recommended
                            ? "bg-brand hover:bg-brand-hover text-brand-foreground shadow-lg shadow-brand/20"
                            : "bg-slate-900 hover:bg-slate-800 dark:bg-card dark:hover:bg-slate-200 text-white dark:text-foreground"
                      }`}
                    >
                      {upgradingTier === plan.tier_id ? (
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto" />
                      ) : isCurrent ? (
                        t('billingDashboard.currentPlan')
                      ) : (
                        `${t('billingDashboard.upgradeTo')} ${isRtl ? plan.name_ar : plan.name_en}`
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: INVOICES & HISTORY */}
      {activeTab === 'invoices' && (
        <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl rounded-[2rem] border border-white/40 dark:border-slate-800/60 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="p-8 border-b border-border dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand" />
                <span>{t('billingDashboard.recentInvoices')}</span>
              </h2>
              <div className="text-xs font-mono text-muted-foreground mt-2">
                CustomerID: {data.subscription?.stripe_customer_id || "None"}
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {data.invoices && data.invoices.length > 0 ? (
              <table className="w-full text-sm text-start">
                <thead className="bg-muted/50 dark:bg-slate-800/50 text-muted-foreground uppercase text-xs font-bold tracking-wider">
                  <tr>
                    <th className="px-8 py-5 text-start">{t('billingDashboard.invoiceId')}</th>
                    <th className="px-8 py-5 text-start">{t('billingDashboard.paidAt')}</th>
                    <th className="px-8 py-5 text-start">{t('billingDashboard.amount')}</th>
                    <th className="px-8 py-5 text-start">{t('billingDashboard.status')}</th>
                    <th className="px-8 py-5 text-start">{t('billingDashboard.receipt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border dark:divide-slate-800/50">
                  {(data.invoices || []).map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-8 py-5 font-mono text-brand font-medium">
                        {inv.stripe_invoice_id}
                      </td>
                      <td className="px-8 py-5 text-muted-foreground dark:text-muted-foreground font-mono text-xs">
                        {new Date(inv.paid_at).toLocaleString()}
                      </td>
                      <td className="px-8 py-5 font-bold font-mono">
                        {(inv.currency || "usd").toUpperCase()} ${(inv.amount_paid / 100).toFixed(2)}
                      </td>
                      <td className="px-8 py-5">
                        <span className="px-3 py-1 bg-brand/10 text-brand rounded-lg text-xs font-bold uppercase tracking-wider border border-brand/20">
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        {inv.invoice_pdf_url ? (
                          <a
                            href={inv.invoice_pdf_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-muted-foreground hover:text-brand font-medium transition-colors"
                          >
                            <Download className="w-4 h-4" />
                            <span>{t('billingDashboard.downloadPdf')}</span>
                          </a>
                        ) : (
                          <span className="flex items-center gap-1.5 text-brand text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t('billingDashboard.archived')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-20 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-muted dark:bg-slate-800 rounded-full flex items-center justify-center text-muted-foreground mb-4 ring-1 ring-slate-100 dark:ring-slate-700">
                  <FileText className="w-8 h-8 opacity-50" />
                </div>
                <p className="text-muted-foreground dark:text-muted-foreground font-medium mb-2">{t('billingDashboard.noInvoices')}</p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {t('billingDashboard.noInvoicesDesc')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: SECURITY & RLS AUDIT */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl rounded-[2rem] p-8 text-foreground dark:text-white border border-white/40 dark:border-slate-800/60 shadow-sm relative overflow-hidden">
            <div className="absolute -top-24 -end-24 w-64 h-64 bg-brand/10 dark:bg-brand/30 rounded-full blur-[80px] pointer-events-none" />
            <div className="flex items-start gap-4 relative z-10">
              <div className="p-3 bg-brand/10 dark:bg-white/10 rounded-2xl shrink-0 backdrop-blur-sm border border-brand/20 dark:border-white/10">
                <Lock className="w-6 h-6 text-brand" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2 text-foreground dark:text-white">{t('billingDashboard.rlsIsolation')}</h3>
                <p className="text-sm text-muted-foreground dark:text-slate-300 leading-relaxed">
                  {t('billingDashboard.rlsDesc')}
                </p>
              </div>
            </div>
            
            <div className="mt-8 bg-muted dark:bg-black/40 rounded-xl p-4 border border-border dark:border-white/10">
              <div className="text-xs font-mono text-brand mb-2"># RLS Verification Check</div>
              <div className="font-mono text-sm text-foreground dark:text-slate-300">
                <span className="text-brand">SELECT</span> current_setting(<span className="text-brand">&apos;app.current_workspace_id&apos;</span>);<br/>
                <span className="text-muted-foreground">-- Returns: {data.workspace.ID}</span>
              </div>
            </div>
          </div>

          <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl rounded-[2rem] p-8 text-foreground dark:text-white border border-white/40 dark:border-slate-800/60 shadow-sm relative overflow-hidden">
            <div className="absolute -bottom-24 -start-24 w-64 h-64 bg-brand/5 dark:bg-brand/10 rounded-full blur-[80px] pointer-events-none" />
            <div className="flex items-start gap-4 relative z-10">
              <div className="p-3 bg-brand/10 dark:bg-white/10 rounded-2xl shrink-0 backdrop-blur-sm border border-brand/20 dark:border-white/10">
                <Globe className="w-6 h-6 text-brand" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2 text-foreground dark:text-white">{t('billingDashboard.subdomainTelemetry')}</h3>
                <p className="text-sm text-muted-foreground dark:text-slate-300 leading-relaxed">
                  {t('billingDashboard.telemetryDesc')}
                </p>
              </div>
            </div>

            <div className="mt-8 bg-muted dark:bg-black/40 rounded-xl p-4 border border-border dark:border-white/10">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-muted-foreground dark:text-muted-foreground">Node Cluster</span>
                <span className="text-xs font-mono text-brand flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-brand animate-pulse"/>ONLINE</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground dark:text-muted-foreground">Workspace Hash</span>
                <span className="text-xs font-mono text-foreground dark:text-slate-300 truncate ms-4">{data.workspace.ID.split('-')[0]}***</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
