/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Sparkles, Palette } from "lucide-react";
import { useThemeStore, THEME_PRESETS, ThemePreset } from "@/store/useThemeStore";
import { API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const { isRtl } = useLocalization();
  const { logoUrl, theme, setTheme } = useThemeStore();
  const companyName = "Septimus OS";
  const [user, setUser] = useState("admin@septimus.local");
  const [pass, setPass] = useState("admin123");
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
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || (isRtl ? "فشل تسجيل الدخول" : "Login failed"));
      }

      // Save token
      localStorage.setItem("septimus_token", data.token);
      localStorage.setItem("septimus_user", JSON.stringify(data.user));
      
      onLogin();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main 
      className="login-screen relative flex items-center justify-center min-h-screen bg-gradient-to-br from-[var(--sb-bg)] to-[var(--primary-hex)]"
    >
      {/* Theme Switcher on Login */}
      <div className="absolute top-4 end-4 flex items-center gap-2 bg-white/10 backdrop-blur p-2 rounded-lg border border-white/20 shadow-sm">
        <Palette className="w-4 h-4 text-white" />
        <select 
          title={isRtl ? "اختيار الثيم" : "Select Theme"}
          value={theme} 
          onChange={(e) => setTheme(e.target.value as ThemePreset)}
          className="bg-transparent text-white text-sm outline-none border-none cursor-pointer"
        >
          {Object.keys(THEME_PRESETS).map(preset => (
            <option key={preset} value={preset} className="text-slate-900">
              {preset.replace('theme-', '')}
            </option>
          ))}
        </select>
      </div>
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
            <label className="form-label">{isRtl ? "البريد الإلكتروني أو اسم المستخدم" : "Email or username"}</label>
            <Input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className="login-input"
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label className="form-label">{isRtl ? "كلمة المرور" : "Password"}</label>
            <Input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              className="login-input"
              autoComplete="current-password"
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
          <p className="login-hint mt-4">
            <Sparkles className="inline w-3 h-3 me-1 opacity-60" />
            {isRtl ? "استخدم:" : "Use:"} <span dir="ltr">admin@septimus.local / admin123</span>
          </p>
        </form>
      </div>
    </main>
  );
}
