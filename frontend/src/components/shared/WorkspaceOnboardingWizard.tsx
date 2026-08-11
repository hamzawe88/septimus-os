"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useThemeStore } from "@/store/useThemeStore";
import { 
  Building2, 
  User, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Sparkles, 
  ShieldCheck, 
  Zap,
  Globe
} from "lucide-react";

interface WorkspaceOnboardingWizardProps {
  onLogin: () => void;
  onSwitchToLogin: () => void;
}

export default function WorkspaceOnboardingWizard({ onLogin, onSwitchToLogin }: WorkspaceOnboardingWizardProps) {
  const { isRtl } = useLocalization();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1: Workspace
  const [workspaceName, setWorkspaceName] = useState("");
  const [slug, setSlug] = useState("");

  // Step 2: Owner
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 3: Plan
  const [planId, setPlanId] = useState("plan_starter");

  const handleWorkspaceNameChange = (val: string) => {
    setWorkspaceName(val);
    const generatedSlug = val
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    setSlug(generatedSlug);
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (step === 1) {
      if (!workspaceName.trim() || !slug.trim()) {
        setError(isRtl ? "يرجى إدخال اسم المؤسسة والنطاق الفرعي" : "Please provide a workspace name and slug");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!fullName.trim() || !email.trim() || !password.trim()) {
        setError(isRtl ? "يرجى إدخال جميع بيانات الحساب الإداري" : "Please fill in all owner account details");
        return;
      }
      if (password.length < 12 || password.length > 72) {
        setError(isRtl ? "كلمة المرور يجب أن تكون بين 12 و72 حرفاً" : "Password must be between 12 and 72 characters");
        return;
      }
      setStep(3);
    }
  };

  const handleSubmit = async () => {
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup-workspace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The API uses an HttpOnly session cookie. This must be explicit because
        // the development UI (3000) and API (4000) use different origins.
        credentials: "include",
        body: JSON.stringify({
          workspace_name: workspaceName,
          slug,
          full_name: fullName,
          email,
          password,
          plan_id: planId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isRtl ? "فشل إنشاء مساحة العمل" : "Failed to onboard workspace"));
      }

      // A brand-new workspace must start with a clean identity — never inherit
      // a previous account's brand that may still be in this device's storage.
      useThemeStore.getState().resetBrandIdentity();
      // Purge any previous account's brand AND personal identity keys before
      // storing the new owner's, so the fresh workspace never shows an old
      // name/avatar/company inherited from this device's storage.
      [
        "septimus_brand", "septimus_avatar", "septimus_display_name",
        "septimus_company_profile",
      ].forEach((k) => localStorage.removeItem(k));

      // The backend sets the HttpOnly session cookie; persist only display data.
      localStorage.setItem("septimus_user", JSON.stringify(data.user));
      localStorage.setItem("currentWorkspaceId", data.user.workspace_id);

      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-border dark:border-slate-800 p-8 text-foreground dark:text-slate-100">
      {/* Header & Steps Indicator */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-brand/10 text-brand mb-3">
          <Sparkles className="w-6 h-6 text-brand animate-pulse" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">
          {isRtl ? "تأسيس مساحة عمل جديدة" : "Create Your Enterprise Workspace"}
        </h2>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground mt-1">
          {isRtl ? "ابدأ رحلتك مع منصة Septimus OS في أقل من دقيقة" : "Bootstrapping your B2B SaaS tenant in less than 60 seconds"}
        </p>

        {/* Step Progress Bar */}
        <div className="flex items-center justify-center gap-2 mt-6">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div 
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  step === s 
                    ? "bg-brand text-white shadow-lg shadow-brand/30 scale-110" 
                    : step > s 
                    ? "bg-emerald-500 text-white" 
                    : "bg-muted dark:bg-slate-800 text-muted-foreground"
                }`}
              >
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && (
                <div className={`w-8 h-1 rounded transition-colors ${step > s ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-800"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-sm font-medium">
          {error}
        </div>
      )}

      {/* STEP 1: WORKSPACE DETAILS */}
      {step === 1 && (
        <form onSubmit={handleNext} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-1">
              {isRtl ? "اسم المؤسسة / الشركة" : "Company / Workspace Name"}
            </label>
            <div className="relative">
              <Building2 className="absolute top-3.5 start-3.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={workspaceName}
                onChange={(e) => handleWorkspaceNameChange(e.target.value)}
                placeholder={isRtl ? "مثال: شركة الآفاق الذكية" : "e.g., Acme Corporation"}
                className="ps-10 py-5 bg-muted dark:bg-slate-800/60"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              {isRtl ? "معرّف النطاق (Workspace Subdomain Slug)" : "Workspace Subdomain Slug"}
            </label>
            <div className="flex items-center rounded-lg border border-border dark:border-slate-700 overflow-hidden bg-muted dark:bg-slate-800/60 focus-within:ring-2 focus-within:ring-brand">
              <div className="ps-3 pe-2 py-2.5 text-muted-foreground flex items-center gap-1.5 border-e border-border dark:border-slate-700 text-sm font-mono">
                <Globe className="w-4 h-4" />
                <span>slug :</span>
              </div>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="acme-corp"
                className="w-full px-3 py-2.5 bg-transparent outline-none text-sm font-mono font-medium"
                required
              />
              <span className="pe-3 text-muted-foreground text-xs font-mono">.septimus.app</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {isRtl 
                ? "سيكون هذا المعرف الفريد لمساحة العمل وعنوان العزل الخاص ببياناتك." 
                : "This unique slug identifies your tenant and enforces row-level data isolation."}
            </p>
          </div>

          <button
            type="submit"
            className="w-full mt-6 py-3.5 bg-brand hover:bg-brand/90 text-white font-bold rounded-xl shadow-lg shadow-brand/20 transition-all flex items-center justify-center gap-2"
          >
            <span>{isRtl ? "التالي: بيانات حساب المالك" : "Next: Owner Account Details"}</span>
            {isRtl ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      )}

      {/* STEP 2: OWNER DETAILS */}
      {step === 2 && (
        <form onSubmit={handleNext} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-1">
              {isRtl ? "الاسم الكامل لمدير النظام" : "Full Name (Workspace Owner)"}
            </label>
            <div className="relative">
              <User className="absolute top-3.5 start-3.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={isRtl ? "المهندس أحمد زايد" : "Ahmed Zayed"}
                className="ps-10 py-5 bg-muted dark:bg-slate-800/60"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              {isRtl ? "البريد الإلكتروني المؤسسي" : "Work Email Address"}
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ahmed@acme-corp.com"
              className="py-5 bg-muted dark:bg-slate-800/60"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              {isRtl ? "كلمة المرور الإدارية" : "Admin Password"}
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="py-5 bg-muted dark:bg-slate-800/60"
              required
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-1/3 py-3.5 border border-border dark:border-slate-700 rounded-xl font-semibold text-muted-foreground dark:text-slate-300 hover:bg-muted dark:hover:bg-slate-800 transition-colors"
            >
              {isRtl ? "السابق" : "Back"}
            </button>
            <button
              type="submit"
              className="w-2/3 py-3.5 bg-brand hover:bg-brand/90 text-white font-bold rounded-xl shadow-lg shadow-brand/20 transition-all flex items-center justify-center gap-2"
            >
              <span>{isRtl ? "التالي: اختيار الخطة" : "Next: Choose Plan"}</span>
              {isRtl ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: PLAN SELECTION */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Starter Plan */}
            <div
              onClick={() => setPlanId("plan_starter")}
              className={`cursor-pointer rounded-xl p-4 border-2 transition-all relative flex flex-col justify-between ${
                planId === "plan_starter"
                  ? "border-brand bg-brand/5 dark:bg-brand/10 shadow-md"
                  : "border-border dark:border-slate-800 hover:border-border"
              }`}
            >
              <div>
                <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">
                  {isRtl ? "تجربة مجانية" : "14-Day Trial"}
                </div>
                <h4 className="font-bold text-lg">Starter</h4>
                <div className="text-2xl font-extrabold mt-2">$0 <span className="text-xs font-normal text-muted-foreground">/14 days</span></div>
                <ul className="text-xs text-muted-foreground dark:text-muted-foreground mt-3 space-y-1.5">
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {isRtl ? "حتى 10 مستخدمين" : "Up to 10 users"}</li>
                  <li className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {isRtl ? "إدارة المشاريع والموارد" : "Core CRM & HR modules"}</li>
                </ul>
              </div>
            </div>

            {/* Business Plan */}
            <div
              onClick={() => setPlanId("plan_business")}
              className={`cursor-pointer rounded-xl p-4 border-2 transition-all relative flex flex-col justify-between ${
                planId === "plan_business"
                  ? "border-brand bg-brand/5 dark:bg-brand/10 shadow-md"
                  : "border-border dark:border-slate-800 hover:border-border"
              }`}
            >
              <div className="absolute -top-2.5 end-3 bg-brand text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shadow">
                {isRtl ? "الأكثر طلباً" : "Popular"}
              </div>
              <div>
                <div className="text-xs font-bold text-brand uppercase tracking-wider mb-1">
                  {isRtl ? "الأعمال والشركات" : "Business"}
                </div>
                <h4 className="font-bold text-lg">Pro AI</h4>
                <div className="text-2xl font-extrabold mt-2">$199 <span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                <ul className="text-xs text-muted-foreground dark:text-muted-foreground mt-3 space-y-1.5">
                  <li className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-brand shrink-0" /> {isRtl ? "حتى 50 مستخدم" : "Up to 50 users"}</li>
                  <li className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-brand shrink-0" /> {isRtl ? "مساعد AI Sidecar" : "AI Sidecar Proxy & Reports"}</li>
                </ul>
              </div>
            </div>

            {/* Enterprise Plan */}
            <div
              onClick={() => setPlanId("plan_enterprise")}
              className={`cursor-pointer rounded-xl p-4 border-2 transition-all relative flex flex-col justify-between ${
                planId === "plan_enterprise"
                  ? "border-brand bg-brand/5 dark:bg-brand/10 shadow-md"
                  : "border-border dark:border-slate-800 hover:border-border"
              }`}
            >
              <div>
                <div className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-1">
                  {isRtl ? "المؤسسات الكبرى" : "Enterprise"}
                </div>
                <h4 className="font-bold text-lg">Orchestrator</h4>
                <div className="text-2xl font-extrabold mt-2">$899 <span className="text-xs font-normal text-muted-foreground">/mo</span></div>
                <ul className="text-xs text-muted-foreground dark:text-muted-foreground mt-3 space-y-1.5">
                  <li className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-purple-500 shrink-0" /> {isRtl ? "مستخدمين غير محدودين" : "Unlimited Users & SLA"}</li>
                  <li className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-purple-500 shrink-0" /> {isRtl ? "الوكلاء المتعددون AI" : "Full Multi-Agent Orchestrator"}</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => setStep(2)}
              className="w-1/3 py-3.5 border border-border dark:border-slate-700 rounded-xl font-semibold text-muted-foreground dark:text-slate-300 hover:bg-muted dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {isRtl ? "السابق" : "Back"}
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleSubmit}
              className="w-2/3 py-3.5 bg-gradient-to-r from-brand to-purple-600 hover:opacity-95 text-white font-bold rounded-xl shadow-lg shadow-brand/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <span>{isRtl ? "جارِ تأسيس المساحة وقاعدة البيانات..." : "Bootstrapping Tenant & DB..."}</span>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>{isRtl ? "إتمام التسجيل والدخول الفوري" : "Launch Enterprise Workspace"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Switch to Login Link */}
      <div className="mt-8 pt-6 border-t border-border dark:border-slate-800 text-center text-sm text-muted-foreground">
        <span>{isRtl ? "لديك مساحة عمل مسجلة بالفعل؟" : "Already have an active workspace?"} </span>
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-brand font-bold hover:underline ms-1"
        >
          {isRtl ? "تسجيل الدخول من هنا" : "Sign in directly"}
        </button>
      </div>
    </div>
  );
}
