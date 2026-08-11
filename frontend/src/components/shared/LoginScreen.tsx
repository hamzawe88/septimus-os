/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Palette, Sparkles } from "lucide-react";
import { useThemeStore, THEME_PRESETS, ThemePreset } from "@/store/useThemeStore";
import { API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import WorkspaceOnboardingWizard from "./WorkspaceOnboardingWizard";

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const { isRtl, t } = useLocalization();
  const { logoUrl, theme, setTheme } = useThemeStore();
  const companyName = "Septimus OS";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user, password: pass }),
        credentials: 'include',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isRtl ? "فشل تسجيل الدخول" : "Login failed"));
      }

      // Signing into a (possibly different) account on this device: wipe any
      // previous account's brand + personal identity keys so the new session
      // never shows the old name/avatar/company, then store the new session.
      useThemeStore.getState().resetBrandIdentity();
      [
        "septimus_brand", "septimus_avatar", "septimus_display_name",
        "septimus_company_profile",
      ].forEach((k) => localStorage.removeItem(k));

      localStorage.setItem("septimus_user", JSON.stringify(data.user));
      localStorage.setItem("currentWorkspaceId", data.user.workspace_id);

      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main 
      className="login-screen relative flex items-center justify-center min-h-screen bg-gradient-to-br from-[var(--sb-bg)] to-[var(--primary-hex)] p-4 overflow-y-auto"
    >
      {/* Theme Switcher on Login */}
      <div className="absolute top-4 end-4 flex items-center gap-2 bg-white/10 backdrop-blur p-2 rounded-lg border border-white/20 shadow-sm z-10">
        <Palette className="w-4 h-4 text-white" />
        <select 
          title={isRtl ? "اختيار الثيم" : "Select Theme"}
          value={theme} 
          onChange={(e) => setTheme(e.target.value as ThemePreset)}
          className="bg-transparent text-white text-sm outline-none border-none cursor-pointer"
        >
          {Object.keys(THEME_PRESETS).map(preset => (
            <option key={preset} value={preset} className="text-foreground">
              {t(THEME_PRESETS[preset as ThemePreset].labelKey)}
            </option>
          ))}
        </select>
      </div>

      {mode === "signup" ? (
        <div className="w-full max-w-xl my-8">
          <WorkspaceOnboardingWizard 
            onLogin={onLogin} 
            onSwitchToLogin={() => setMode("login")} 
          />
        </div>
      ) : (
        <div className="login-card shadow-2xl">
          {/* Header */}
          <div className="login-header">
            {logoUrl ? (
               
              <img src={logoUrl} alt="Logo" className="w-16 h-16 mx-auto mb-4 object-contain" />
            ) : (
              <div className="login-logo bg-brand">
                {companyName ? companyName.charAt(0).toUpperCase() : "S"}
              </div>
            )}
            <h1 className="login-title">{isRtl ? "تسجيل الدخول إلى" : "Sign in to"} {companyName || "Septimus OS"}</h1>
            <p className="login-subtitle">{isRtl ? "منصة ذكاء المؤسسات" : "Enterprise Intelligence Platform"}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="login-email" className="form-label">{isRtl ? "البريد الإلكتروني أو اسم المستخدم" : "Email or username"}</label>
              <Input
                id="login-email"
                name="email"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                className="login-input"
                autoComplete="username"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="login-password" className="form-label">{isRtl ? "كلمة المرور" : "Password"}</label>
              <Input
                id="login-password"
                name="password"
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className="login-input"
                autoComplete="current-password"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button 
              type="submit" 
              className="login-btn w-full mt-4 flex items-center justify-center font-bold text-white transition-colors rounded-lg py-3 bg-brand" 
              disabled={isLoading}
            >
              {isLoading ? (isRtl ? "جارِ تسجيل الدخول..." : "Signing in...") : (isRtl ? "تسجيل الدخول" : "Sign In")}
            </button>
          </form>

          {/* Switch to Signup / Create Workspace */}
          <div className="mt-6 pt-5 border-t border-border dark:border-slate-800 text-center text-sm text-muted-foreground dark:text-muted-foreground">
            <span>{isRtl ? "مؤسسة جديدة؟" : "Don't have an enterprise workspace yet?"} </span>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="text-brand font-bold hover:underline inline-flex items-center gap-1 mt-1 sm:mt-0"
            >
              <Sparkles className="w-3.5 h-3.5 inline" />
              <span>{isRtl ? "تأسيس مساحة عمل جديدة (Sign Up)" : "Create Workspace (Sign Up)"}</span>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
