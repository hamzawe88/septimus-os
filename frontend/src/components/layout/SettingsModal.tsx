/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import { X, Moon, Sun, BellRing, User, Laptop, MessageSquare, CheckCircle2, MapPin, Globe, Upload, Sparkles, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { useThemeStore } from "@/store/useThemeStore";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";
import InteractiveAvatarBuilder from "./InteractiveAvatarBuilder";
import { LOCAL_EXECUTIVE_PRESETS } from "@/lib/avatarEngine";

const CORPORATE_AVATAR_PRESETS = LOCAL_EXECUTIVE_PRESETS;


interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: "account" | "appearance" | "notifications" | "brand" | "attendance" | "currency";
}

export default function SettingsModal({ isOpen, onClose, initialTab }: SettingsModalProps) {
  const { t, baseCurrency, setBaseCurrency, secondaryCurrency, setSecondaryCurrency, language, setLanguage } = useLocalization();
  const [activeTab, setActiveTab] = useState<"account" | "appearance" | "notifications" | "brand" | "attendance" | "currency">(initialTab || "account");

  useEffect(() => {
    if (isOpen && initialTab) {
      queueMicrotask(() => {
        setActiveTab(initialTab);
      });
    }
  }, [isOpen, initialTab]);
  // Appearance mode is driven by useThemeStore (mode/setMode) below — the
  // ThemeProvider reads that store to actually apply light/dark, so these
  // buttons must use it (next-themes alone did not stick).
  const [mounted, setMounted] = useState(false);

  // Account State
  const [displayName, setDisplayName] = useState("Hamza Admin");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const email = "admin@septimus.local";

  // Notifications State
  const [notifDm, setNotifDm] = useState(true);
  const [notifMentions, setNotifMentions] = useState(true);
  const [notifAgile, setNotifAgile] = useState(true);

  // Brand State from store
  const { mode, setMode, companyName: storeCompanyName, logoUrl: storeLogoUrl, faviconUrl: storeFaviconUrl, primaryColor: storePrimaryColor, fontFamily: storeFontFamily, sidebarBg: storeSidebarBg, setBrandIdentity, setFaviconUrl } = useThemeStore();
  const [companyName, setCompanyName] = useState(storeCompanyName || "Septimus Workspace");
  const [primaryColor, setPrimaryColor] = useState(storePrimaryColor || "#8d4592");
  const [sidebarBg, setSidebarBg] = useState(storeSidebarBg || "#0f172a");
  const [textColor, setTextColor] = useState("#1e293b");
  const [fontFamily, setFontFamily] = useState(storeFontFamily || "Cairo");
  const [logoUrl, setLogoUrl] = useState(storeLogoUrl || "");
  const [faviconUrlLocal, setFaviconUrlLocal] = useState(storeFaviconUrl || "");

  const processAndCompressLogo = (file: File, callback: (base64: string) => void) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 320;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
        }
        const dataUrl = canvas.toDataURL("image/webp", 0.85);
        callback(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAndCompressLogo(file, (compressedBase64) => {
        setLogoUrl(compressedBase64);
        setBrandIdentity(companyName, compressedBase64, primaryColor, fontFamily, sidebarBg, faviconUrlLocal || null);
        const payload = { companyName, primaryColor, sidebarBg, textColor, fontFamily, logoUrl: compressedBase64, faviconUrl: faviconUrlLocal || null };
        try {
          localStorage.setItem("septimus_brand", JSON.stringify(payload));
          window.dispatchEvent(new Event("septimus_brand_updated"));
        } catch { }
      });
    }
  };

  const processAndCompressFavicon = (file: File, callback: (base64: string) => void) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (file.type.includes("svg") || file.name.endsWith(".ico")) {
        callback(dataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const maxDim = 128;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
        }
        const compressedDataUrl = canvas.toDataURL("image/png");
        callback(compressedDataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAndCompressFavicon(file, (compressedBase64) => {
        setFaviconUrlLocal(compressedBase64);
        setFaviconUrl(compressedBase64);
        setBrandIdentity(companyName, logoUrl, primaryColor, fontFamily, sidebarBg, compressedBase64);
        const payload = { companyName, primaryColor, sidebarBg, textColor, fontFamily, logoUrl, faviconUrl: compressedBase64 };
        try {
          localStorage.setItem("septimus_brand", JSON.stringify(payload));
          window.dispatchEvent(new Event("septimus_brand_updated"));
        } catch { }
      });
    }
  };

  // Attendance Admin State
  const [officeLat, setOfficeLat] = useState("32.8872");
  const [officeLng, setOfficeLng] = useState("13.1913");
  const [radiusM, setRadiusM] = useState("50");
  const [allowRemote, setAllowRemote] = useState(false);
  const [officeId, setOfficeId] = useState("");
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert(t("settings.noGeolocation"));
      return;
    }
    setIsFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOfficeLat(position.coords.latitude.toFixed(6));
        setOfficeLng(position.coords.longitude.toFixed(6));
        setIsFetchingLocation(false);
      },
      (error) => {
        alert(t("settings.locationError") + error.message);
        setIsFetchingLocation(false);
      }
    );
  };

  // Load from Local Storage on Mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
      const savedName = localStorage.getItem("septimus_display_name");
      if (savedName) setDisplayName(savedName);
      
      const savedAvatar = localStorage.getItem("septimus_avatar");
      if (savedAvatar) setAvatarUrl(savedAvatar);

      const savedNotifs = localStorage.getItem("septimus_notifs");
      if (savedNotifs) {
        try {
          const parsed = JSON.parse(savedNotifs);
          setNotifDm(parsed.notifDm ?? true);
          setNotifMentions(parsed.notifMentions ?? true);
          setNotifAgile(parsed.notifAgile ?? true);
        } catch {
          // ignore parsing error
        }
      }

      const savedBrand = localStorage.getItem("septimus_brand");
      if (savedBrand) {
        try {
          const parsed = JSON.parse(savedBrand);
          if (parsed.companyName) setCompanyName(parsed.companyName);
          if (parsed.primaryColor) setPrimaryColor(parsed.primaryColor);
          if (parsed.sidebarBg) setSidebarBg(parsed.sidebarBg);
          if (parsed.textColor) setTextColor(parsed.textColor);
          if (parsed.fontFamily) setFontFamily(parsed.fontFamily);
          if (parsed.logoUrl) setLogoUrl(parsed.logoUrl);
          if (parsed.faviconUrl) setFaviconUrlLocal(parsed.faviconUrl);
        } catch {
          // ignore parsing error
        }
      }

      const savedAttendance = localStorage.getItem("septimus_attendance_settings");
      if (savedAttendance) {
        try {
          const parsed = JSON.parse(savedAttendance);
          if (parsed.allowRemote !== undefined) setAllowRemote(parsed.allowRemote);
        } catch { }
      }

      fetchWithAuth(`${API_BASE_URL}/attendance/offices`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            const firstOffice = data[0];
            setOfficeLat((firstOffice.Latitude || firstOffice.latitude || 32.8872).toString());
            setOfficeLng((firstOffice.Longitude || firstOffice.longitude || 13.1913).toString());
            setRadiusM((firstOffice.RadiusMeters || firstOffice.radius_meters || 50).toString());
            setOfficeId(firstOffice.ID || firstOffice.id || "");
          }
        })
        .catch(console.error);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setAvatarUrl(result);
        localStorage.setItem("septimus_avatar", result);
        const { currentUser, setCurrentUser } = useAppStore.getState();
        if (currentUser) {
          setCurrentUser({ ...currentUser, avatarUrl: result });
        } else {
          setCurrentUser({ id: "current-user", name: displayName || "Admin", email: "admin@septimus.local", avatarUrl: result } as unknown as Parameters<typeof setCurrentUser>[0]);
        }
        window.dispatchEvent(new Event("septimus_avatar_updated"));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectPresetAvatar = (url: string) => {
    setAvatarUrl(url);
    localStorage.setItem("septimus_avatar", url);
    const { currentUser, setCurrentUser } = useAppStore.getState();
    if (currentUser) {
      setCurrentUser({ ...currentUser, avatarUrl: url });
    } else {
      setCurrentUser({ id: "current-user", name: displayName || "Admin", email: "admin@septimus.local", avatarUrl: url } as unknown as Parameters<typeof setCurrentUser>[0]);
    }
    window.dispatchEvent(new Event("septimus_avatar_updated"));
  };

  // Save Account Profile
  const handleSaveProfile = async () => {
    localStorage.setItem("septimus_display_name", displayName);
    window.dispatchEvent(new Event("septimus_display_name_updated"));
    if (avatarUrl) {
      localStorage.setItem("septimus_avatar", avatarUrl);
      window.dispatchEvent(new Event("septimus_avatar_updated"));
    }
    const { currentUser, setCurrentUser } = useAppStore.getState();
    if (currentUser) {
      setCurrentUser({ ...currentUser, name: displayName, avatarUrl: avatarUrl || currentUser.avatarUrl });
    } else {
      setCurrentUser({ id: "current-user", name: displayName || "Admin", email: "admin@septimus.local", avatarUrl } as unknown as Parameters<typeof setCurrentUser>[0]);
    }

    const payload: Record<string, string> = {};
    if (avatarUrl) payload.avatar = avatarUrl;
    if (newPassword) {
      if (newPassword !== confirmPassword) {
        alert(t("settings.passwordMismatch"));
        return;
      }
      payload.password = newPassword;
    }

    if (Object.keys(payload).length > 0) {
      try {
        await fetchWithAuth(`${API_BASE_URL}/auth/profile`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        alert(t("settings.profileUpdated"));
        setNewPassword("");
        setConfirmPassword("");
      } catch (e) {
        console.error("Failed to update profile", e);
        alert(t("settings.profileUpdateFailed"));
      }
    } else {
      alert(t("settings.profileSavedLocally"));
    }
  };

  const handleSaveBrand = async () => {
    setFaviconUrl(faviconUrlLocal || null);
    setBrandIdentity(companyName, logoUrl, primaryColor, fontFamily, sidebarBg, faviconUrlLocal || null);
    const payload = { companyName, primaryColor, sidebarBg, textColor, fontFamily, logoUrl, faviconUrl: faviconUrlLocal || null };
    try {
      localStorage.setItem("septimus_brand", JSON.stringify(payload));
      window.dispatchEvent(new Event("septimus_brand_updated"));
    } catch { }
    try {
      await fetchWithAuth(`${API_BASE_URL}/settings/brand?workspace_id=${localStorage.getItem("currentWorkspaceId") || ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      alert(t("settings.brandSaved"));
    } catch (e) {
      console.error("Failed to persist brand settings", e);
      alert(t("settings.brandSaved"));
    }
  };

  const handleSaveAttendance = async () => {
    localStorage.setItem("septimus_attendance_settings", JSON.stringify({ officeLat, officeLng, radiusM, allowRemote }));
    try {
      const payload = {
        name: "Head Office",
        latitude: parseFloat(officeLat),
        longitude: parseFloat(officeLng),
        radius_meters: parseInt(radiusM, 10)
      };
      let res;
      if (officeId) {
        res = await fetchWithAuth(`${API_BASE_URL}/attendance/offices/${officeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetchWithAuth(`${API_BASE_URL}/attendance/offices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }
      if (res.ok) {
        const data = await res.json();
        if (data.id) setOfficeId(data.id);
        alert(t("settings.attendanceSaved"));
      } else {
        alert(t("settings.dbSaveError"));
      }
    } catch (e) {
      console.error("Failed to persist attendance settings", e);
      alert(t("settings.serverConnectionError"));
    }
  };
  if (!isOpen || !mounted) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col h-[600px] border border-slate-200 ">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 ">
          <h2 className="text-xl font-bold text-[var(--sb-bg)] [var(--sb-bg)]">{t("settings.preferences")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5 text-gray-500" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-56 shrink-0 bg-white border-e border-slate-100 p-4 space-y-1 overflow-y-auto">
            <button 
              onClick={() => setActiveTab("account")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-start ${
                activeTab === "account" ? "bg-slate-100 text-[var(--sb-bg)] [var(--sb-bg)]" : "hover:bg-slate-200 :bg-slate-100 text-[var(--sb-bg)]/80 [var(--sb-bg)]/70"
              }`}
            >
              <User className="w-4 h-4 shrink-0" />
              <span className="truncate">{t("settings.account")}</span>
            </button>
            <button 
              onClick={() => setActiveTab("brand")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-start ${
                activeTab === "brand" ? "bg-slate-100 text-[var(--sb-bg)] [var(--sb-bg)]" : "hover:bg-slate-200 :bg-slate-100 text-[var(--sb-bg)]/80 [var(--sb-bg)]/70"
              }`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate">{t("settings.brand_customization")}</span>
            </button>
            <button 
              onClick={() => setActiveTab("currency")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-start ${
                activeTab === "currency" ? "bg-slate-100 text-[var(--sb-bg)] [var(--sb-bg)]" : "hover:bg-slate-200 :bg-slate-100 text-[var(--sb-bg)]/80 [var(--sb-bg)]/70"
              }`}
            >
              <Globe className="w-4 h-4 shrink-0" />
              <span className="truncate">{t("settings.localizationAndCurrency")}</span>
            </button>
            <button 
              onClick={() => setActiveTab("appearance")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-start ${
                activeTab === "appearance" ? "bg-slate-100 text-[var(--sb-bg)] [var(--sb-bg)]" : "hover:bg-slate-200 :bg-slate-100 text-[var(--sb-bg)]/80 [var(--sb-bg)]/70"
              }`}
            >
              <Moon className="w-4 h-4 shrink-0" />
              <span className="truncate">{t("settings.appearance")}</span>
            </button>
            <button 
              onClick={() => setActiveTab("notifications")}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-start ${
                activeTab === "notifications" ? "bg-gray-200 text-[var(--sb-bg)] [var(--sb-bg)]" : "hover:bg-gray-200 :bg-gray-800 text-gray-600 "
              }`}
            >
              <BellRing className="w-4 h-4 shrink-0" />
              <span className="truncate">{t("settings.notifications")}</span>
            </button>
            <div className="pt-4 mt-4 border-t border-gray-200 ">
              <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t("settings.workspace_management")}</p>
              <button 
                onClick={() => setActiveTab("attendance")}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "attendance" ? "bg-brand-light text-brand [var(--sb-bg)]" : "hover:bg-gray-200 :bg-gray-800 text-gray-600 "
                }`}
              >
                <MapPin className="w-4 h-4" />
                <span>{t("settings.attendance")}</span>
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 p-8 overflow-y-auto bg-white ">
            {activeTab === "account" && (
              <>
                <h3 className="text-lg font-bold text-[var(--sb-bg)] [var(--sb-bg)] mb-6">{t("settings.account_settings")}</h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-brand" />
                      {language === "ar" ? "الصورة الشخصية واستوديو الأفتار المؤسسي ✨" : "Profile Picture & Sovereign Avatar Studio ✨"}
                    </label>

                    {/* Active Avatar + Upload Area */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/80 shadow-sm mb-6">
                      <div className="relative shrink-0">
                        <div className="w-18 h-18 rounded-lg border border-slate-200 shadow-md overflow-hidden bg-white dark:bg-slate-900 flex items-center justify-center">
                          {avatarUrl ? (
                            <img src={avatarUrl} alt="Active Avatar" className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2563EB] to-[#60A5FA] text-white text-2xl font-bold rounded-lg shadow-inner">
                              {displayName ? displayName.charAt(0).toUpperCase() : "A"}
                            </div>
                          )}
                        </div>
                        <span className="absolute bottom-[-4px] end-[-4px] w-4 h-4 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full shadow-sm" title={language === "ar" ? "متصل الآن" : "Online Now"} />
                      </div>

                      <div className="flex-1 space-y-2.5">
                        <div className="flex flex-wrap gap-2.5 items-center">
                          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white font-semibold text-xs shadow-sm transition-all">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{language === "ar" ? "رفع صورة شخصية حقيقية 📁" : "Upload Custom Photo 📁"}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleAvatarUpload}
                              className="hidden"
                            />
                          </label>
                          {avatarUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setAvatarUrl("");
                                localStorage.removeItem("septimus_avatar");
                                window.dispatchEvent(new Event("septimus_avatar_updated"));
                              }}
                              className="px-3 py-2 rounded-lg bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-all"
                            >
                              {language === "ar" ? "إلغاء وتعيين الافتراضي (A)" : "Reset to Default (A)"}
                            </button>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          {language === "ar"
                            ? "تتزامن صورتك الشخصية المرفوعة أو الأفتار المختار فوراً في القائمة الجانبية وكافة شاشات المحادثة."
                            : "Your custom photo or selected avatar synchronizes instantly across the sidebar and all chat screens."}
                        </p>
                      </div>
                    </div>

                    {/* Interactive Customizer Button */}
                    <div className="p-3 bg-gradient-to-r from-brand/15 to-brand/5 dark:from-brand/20 dark:to-brand/5 border border-brand/30 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <Sliders className="w-5 h-5 text-brand shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {language === "ar" ? "صانع الأفتار التفاعلي المخصص 🎨" : "Interactive Custom Avatar Builder 🎨"}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                            {language === "ar"
                              ? "صمم شخصيتك بالكامل: غير لون البشرة، تسريحة الشعر، النظارات، الملابس الرسمية، والخلفية."
                              : "Fully design your sovereign executive profile: skin complexion, hairstyle, eyewear, professional attire, and brand background."}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        onClick={() => setIsBuilderOpen(true)}
                        className="bg-brand hover:bg-brand-dark text-white font-bold text-xs h-9 px-3.5 rounded-lg shadow-md flex items-center gap-1.5 shrink-0 transition-transform active:scale-95"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-yellow-300 animate-pulse" />
                        <span>{language === "ar" ? "تصميم وتخصيص أفتاري 🎛️" : "Launch Avatar Builder 🎛️"}</span>
                      </Button>
                    </div>

                    {/* Corporate Presets Gallery Grid */}
                    <div className="space-y-2.5">
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        {language === "ar"
                          ? "أو اختر من أفتارات الشخصيات المؤسسية الـ 16 الجاهزة (انقر للتطبيق الفوري ⚡):"
                          : "Or select from 16 sovereign executive presets (Click to apply instantly ⚡):"}
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {CORPORATE_AVATAR_PRESETS.map((preset) => {
                          const isSelected = avatarUrl === preset.url;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => handleSelectPresetAvatar(preset.url)}
                              className={`group relative flex flex-col items-center gap-2 p-2.5 rounded-xl border text-center transition-all duration-150 ${
                                isSelected
                                  ? "bg-brand/10 border-brand ring-2 ring-brand/50 shadow-md"
                                  : "bg-white dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700/80 hover:border-brand/40 hover:shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                              }`}
                            >
                              <div className="w-12 h-12 rounded-lg border border-slate-200/80 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-900 shadow-sm transition-transform group-hover:scale-105">
                                <img src={preset.url} alt={language === "ar" ? preset.name : preset.nameEn} className="w-full h-full object-cover rounded-lg" />
                              </div>
                              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight line-clamp-1">
                                {language === "ar" ? preset.name : preset.nameEn}
                              </span>
                              {isSelected && (
                                <span className="absolute top-1.5 end-1.5 w-4 h-4 rounded-full bg-brand text-white flex items-center justify-center text-[9px] font-bold shadow-sm">
                                  ✓
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.display_name")}</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        title={t("settings.display_name")}
                        placeholder={t("settings.display_name")}
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="flex-1 p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-sm text-[var(--sb-bg)] [var(--sb-bg)]"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.email")}</label>
                    <input 
                      type="email" 
                      title={t("settings.email")}
                      placeholder={t("settings.email")}
                      value={email}
                      disabled
                      className="w-full p-2.5 bg-[#f8fafc] border border-slate-200 rounded-lg text-[var(--sb-bg)]/70 [var(--sb-bg)]/70 cursor-not-allowed"
                    />
                  </div>

                  <div className="pt-6 border-t border-slate-100 ">
                    <h4 className="font-bold mb-4 text-[var(--sb-bg)] [var(--sb-bg)]">{t("settings.change_password")}</h4>
                    <div className="space-y-3">
                      <input 
                        type="password" 
                        title={t("settings.new_password")}
                        placeholder={t("settings.new_password")}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-sm text-[var(--sb-bg)] [var(--sb-bg)]"
                      />
                      <input 
                        type="password" 
                        title={t("settings.confirm_password")}
                        placeholder={t("settings.confirm_password")}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-sm text-[var(--sb-bg)] [var(--sb-bg)]"
                      />
                      <Button onClick={handleSaveProfile} size="sm" className="bg-brand hover:bg-brand-light text-white">{t("settings.update_account_password")}</Button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100 ">
                    <h4 className="text-red-600 font-bold mb-4">{t("settings.danger_zone")}</h4>
                    <button className="w-full sm:w-auto px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md shadow-red-500/20 transition-all active:scale-[0.98]">{t("settings.disable_account")}</button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "appearance" && (
              <>
                <h3 className="text-lg font-bold text-[var(--sb-bg)] [var(--sb-bg)] mb-6">{t("settings.appearance", "Appearance")}</h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.theme_label", "Theme")}</label>
                    <div className="grid grid-cols-3 gap-4">
                      <button 
                        onClick={() => setMode("dark")}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                          mode === 'dark' 
                            ? 'border-primary bg-primary/5 text-primary' 
                            : 'border-gray-200 text-gray-500 hover:border-gray-300 :border-gray-700'
                        }`}
                      >
                        <Moon className="w-6 h-6 mb-2" />
                        <span className="text-sm font-medium">{t("settings.theme_dark")} {mode === 'dark' && `(${t("settings.theme_active")})`}</span>
                      </button>
                      <button 
                        onClick={() => setMode("light")}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                          mode === 'light' 
                            ? 'border-primary bg-primary/5 text-primary' 
                            : 'border-gray-200 text-gray-500 hover:border-gray-300 :border-gray-700'
                        }`}
                      >
                        <Sun className="w-6 h-6 mb-2" />
                        <span className="text-sm font-medium">{t("settings.theme_light")} {mode === 'light' && `(${t("settings.theme_active")})`}</span>
                      </button>
                      <button 
                        onClick={() => setMode("system")}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                          mode === 'system' 
                            ? 'border-primary bg-primary/5 text-primary' 
                            : 'border-gray-200 text-gray-500 hover:border-gray-300 :border-gray-700'
                        }`}
                      >
                        <Laptop className="w-6 h-6 mb-2" />
                        <span className="text-sm font-medium">{t("settings.theme_system")} {mode === 'system' && `(${t("settings.theme_active")})`}</span>
                      </button>
                    </div>
                  </div>
                  
                  {/* Redirect to dedicated Appearance Settings page */}
                  <div className="pt-6 border-t border-gray-100">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center">
                      <p className="text-sm text-slate-600 mb-3">{t("settings.go_to_appearance_desc")}</p>
                      <button 
                        onClick={() => { onClose(); useAppStore.getState().setCurrentView('appearance_settings'); }}
                        className="px-6 py-2.5 bg-brand text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all"
                      >
                        {t("settings.go_to_appearance")}
                      </button>
                    </div>
                  </div>

                </div>
              </>
            )}

            {activeTab === "notifications" && (
              <>
                <h3 className="text-lg font-bold text-[var(--sb-bg)] [var(--sb-bg)] mb-6">{t("settings.notifications", "Notifications")}</h3>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <label htmlFor="notif-dm" className="flex items-center gap-2 cursor-pointer">
                      <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center">
                        <MessageSquare className="w-4 h-4 text-[var(--sb-bg)]" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{t("settings.direct_messages")}</p>
                        <p className="text-xs text-gray-500 ">{t("settings.direct_messages_desc")}</p>
                      </div>
                    </label>
                    <input 
                      id="notif-dm"
                      type="checkbox" 
                      title="Direct Messages Notification"
                      checked={notifDm}
                      onChange={(e) => setNotifDm(e.target.checked)}
                      className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="notif-mentions" className="flex items-center gap-2 cursor-pointer">
                      <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center">
                        <BellRing className="w-4 h-4 text-rose-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{t("settings.mentions_replies")}</p>
                        <p className="text-xs text-gray-500 ">{t("settings.mentions_replies_desc")}</p>
                      </div>
                    </label>
                    <input 
                      id="notif-mentions"
                      type="checkbox" 
                      title="Mentions Notification"
                      checked={notifMentions}
                      onChange={(e) => setNotifMentions(e.target.checked)}
                      className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="notif-agile" className="flex items-center gap-2 cursor-pointer">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{t("settings.agile_updates")}</p>
                        <p className="text-xs text-gray-500 ">{t("settings.agile_updates_desc")}</p>
                      </div>
                    </label>
                    <input 
                      id="notif-agile"
                      type="checkbox" 
                      title="Agile Updates Notification"
                      checked={notifAgile}
                      onChange={(e) => setNotifAgile(e.target.checked)}
                      className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                    />
                  </div>
                </div>
              </>
            )}

            {activeTab === "brand" && (
              <>
                <h3 className="text-lg font-bold text-brand-dark mb-2">{t("settings.company_brand_title")}</h3>
                <p className="text-sm text-gray-500 mb-6">{t("settings.company_brand_desc")}</p>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.company_name")}</label>
                    <input 
                      type="text" 
                      title="Company Name"
                      placeholder={t("settings.company_name_placeholder")}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none text-sm text-[var(--sb-bg)]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.workspace_logo_upload")}</label>
                    <input 
                      type="file" 
                      accept="image/*"
                      title="Brand Logo File Upload"
                      onChange={handleLogoUpload}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm text-[var(--sb-bg)] file:me-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:bg-brand-light file:text-brand"
                    />
                    {logoUrl && (
                      <div className="mt-2 p-2 border border-gray-200 rounded bg-white flex items-center justify-between">
                        <img src={logoUrl} alt="Logo" className="h-8 object-contain" />
                        <Button variant="ghost" size="sm" onClick={() => setLogoUrl("")} className="text-red-500 text-xs">{t("settings.delete")}</Button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {language === "ar" ? "أيقونة تبويب المتصفح (Favicon)" : "Browser Tab Icon (Favicon)"}
                    </label>
                    <input 
                      type="file" 
                      accept="image/*,.ico"
                      title="Browser Favicon File Upload"
                      onChange={handleFaviconUpload}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm text-[var(--sb-bg)] file:me-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:bg-brand-light file:text-brand"
                    />
                    {faviconUrlLocal && (
                      <div className="mt-2 p-2 border border-gray-200 rounded bg-white flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img src={faviconUrlLocal} alt="Favicon" className="w-6 h-6 object-contain rounded border border-slate-200 p-0.5 bg-slate-50" />
                          <span className="text-xs text-slate-600">{language === "ar" ? "الأيقونة المخصصة نشطة" : "Custom Favicon Active"}</span>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => { setFaviconUrlLocal(""); setFaviconUrl(null); }} className="text-red-500 text-xs">{t("settings.delete")}</Button>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">{t("settings.primary_color")}</label>
                      <input 
                        type="color" 
                        title={t("settings.primary_color", "Brand Primary Color")}
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-full h-10 p-1 bg-white border border-slate-200 rounded cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">{t("settings.system_font")}</label>
                      <select
                        title={t("settings.system_font", "Brand Font Family")}
                        value={fontFamily}
                        onChange={(e) => setFontFamily(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded text-xs text-[var(--sb-bg)]"
                      >
                        <option value="Cairo">Cairo ({t("settings.font_cairo")})</option>
                        <option value="Tajawal">Tajawal ({t("settings.font_tajawal")})</option>
                        <option value="Inter">Inter ({t("settings.font_inter")})</option>
                        <option value="Outfit">Outfit ({t("settings.font_outfit")})</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <Button onClick={handleSaveBrand} className="bg-brand hover:bg-brand text-white">{t("settings.save_company_brand")}</Button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "attendance" && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-lg font-bold text-brand-dark mb-1">{t("settings.attendance_admin")}</h3>
                    <p className="text-sm text-gray-500">{t("settings.attendance_rules_desc")}</p>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex items-center gap-2 border-slate-200 text-[var(--sb-bg)] hover:bg-[#f8fafc] :bg-slate-800"
                    onClick={handleGetLocation}
                    disabled={isFetchingLocation}
                  >
                    <MapPin className="w-4 h-4" />
                    {isFetchingLocation ? t("settings.fetching", "Fetching...") : t("settings.get_current_location")}
                  </Button>
                </div>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.office_latitude", "Office Latitude")}</label>
                      <input 
                        type="text" 
                        title={t("settings.office_latitude", "Office Latitude")}
                        value={officeLat}
                        onChange={(e) => setOfficeLat(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none text-sm text-[var(--sb-bg)] [var(--sb-bg)]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.office_longitude", "Office Longitude")}</label>
                      <input 
                        type="text" 
                        title={t("settings.office_longitude", "Office Longitude")}
                        value={officeLng}
                        onChange={(e) => setOfficeLng(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none text-sm text-[var(--sb-bg)] [var(--sb-bg)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.radius_in_meters", "Radius in Meters")}</label>
                    <input 
                      type="number" 
                      title={t("settings.radius_in_meters", "Radius in Meters")}
                      value={radiusM}
                      onChange={(e) => setRadiusM(e.target.value)}
                      className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none text-sm text-[var(--sb-bg)] [var(--sb-bg)]"
                    />
                  </div>

                  <div className="pt-4 border-t border-gray-200 ">
                    <div className="flex items-center justify-between">
                      <label htmlFor="allow-remote" className="flex items-center gap-2 cursor-pointer">
                        <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center">
                          <Laptop className="w-4 h-4 text-brand" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{t("settings.allow_remote")}</p>
                          <p className="text-xs text-gray-500 ">{t("settings.allow_remote_desc")}</p>
                        </div>
                      </label>
                      <input 
                        id="allow-remote"
                        type="checkbox" 
                        title={t("settings.allow_remote_title", "Allow Remote Work")}
                        checked={allowRemote}
                        onChange={(e) => setAllowRemote(e.target.checked)}
                        className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <Button onClick={handleSaveAttendance} className="bg-brand hover:bg-brand text-white">{t("settings.save_attendance_rules")}</Button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "currency" && (
              <>
                <h3 className="text-lg font-bold text-[var(--sb-bg)] [var(--sb-bg)] mb-6">
                  {language === "ar" ? "العملة والتوطين" : "Currency & Localization"}
                </h3>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {language === "ar" ? "العملة الأساسية" : "Base Currency"}
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                      {language === "ar"
                        ? "العملة التي تظهر بها جميع الرواتب والميزانيات في النظام"
                        : "The currency in which all salaries, budgets, and invoices are displayed."}
                    </p>
                    <select
                      value={baseCurrency}
                      onChange={(e) => setBaseCurrency(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-primary focus:outline-none shadow-2xs"
                    >
                      <option value="SAR">{language === "ar" ? "SAR - الريال السعودي" : "SAR - Saudi Riyal"}</option>
                      <option value="USD">{language === "ar" ? "USD - الدولار الأمريكي ($)" : "USD - US Dollar ($)"}</option>
                      <option value="AED">{language === "ar" ? "AED - الدرهم الإماراتي" : "AED - UAE Dirham"}</option>
                      <option value="EUR">{language === "ar" ? "EUR - اليورو (€)" : "EUR - Euro (€)"}</option>
                      <option value="EGP">{language === "ar" ? "EGP - الجنيه المصري" : "EGP - Egyptian Pound"}</option>
                      <option value="LYD">{language === "ar" ? "LYD - الدينار الليبي" : "LYD - Libyan Dinar"}</option>
                      <option value="GBP">{language === "ar" ? "GBP - الجنيه الإسترليني (£)" : "GBP - British Pound (£)"}</option>
                      <option value="KWD">{language === "ar" ? "KWD - الدينار الكويتي" : "KWD - Kuwaiti Dinar"}</option>
                      <option value="BHD">{language === "ar" ? "BHD - الدينار البحريني" : "BHD - Bahraini Dinar"}</option>
                      <option value="OMR">{language === "ar" ? "OMR - الريال العماني" : "OMR - Omani Riyal"}</option>
                      <option value="QAR">{language === "ar" ? "QAR - الريال القطري" : "QAR - Qatari Riyal"}</option>
                      <option value="JOD">{language === "ar" ? "JOD - الدينار الأردني" : "JOD - Jordanian Dinar"}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {language === "ar" ? "العملة الثانوية" : "Secondary Currency"}
                    </label>
                    <select
                      value={secondaryCurrency}
                      onChange={(e) => setSecondaryCurrency(e.target.value)}
                      className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-primary focus:outline-none shadow-2xs"
                    >
                      <option value="USD">{language === "ar" ? "USD - الدولار الأمريكي ($)" : "USD - US Dollar ($)"}</option>
                      <option value="SAR">{language === "ar" ? "SAR - الريال السعودي" : "SAR - Saudi Riyal"}</option>
                      <option value="AED">{language === "ar" ? "AED - الدرهم الإماراتي" : "AED - UAE Dirham"}</option>
                      <option value="EUR">{language === "ar" ? "EUR - اليورو (€)" : "EUR - Euro (€)"}</option>
                      <option value="LYD">{language === "ar" ? "LYD - الدينار الليبي" : "LYD - Libyan Dinar"}</option>
                    </select>
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {language === "ar" ? "لغة واجهة النظام" : "System Interface Language"}
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setLanguage("ar")}
                        className={`p-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 transition-all ${language === "ar" ? "border-primary bg-primary/10 text-primary" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                      >
                        <span>{language === "ar" ? "العربية" : "Arabic"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setLanguage("en")}
                        className={`p-3 rounded-xl border-2 font-bold flex items-center justify-center gap-2 transition-all ${language === "en" ? "border-primary bg-primary/10 text-primary" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                      >
                        <span>{language === "ar" ? "الإنجليزية" : "English"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Avatar Builder Modal */}
      <InteractiveAvatarBuilder
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        onApply={handleSelectPresetAvatar}
        isRtl={language === "ar"}
      />
    </div>
  );
}
