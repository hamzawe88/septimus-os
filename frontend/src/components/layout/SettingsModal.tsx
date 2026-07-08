/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { X, Moon, Sun, BellRing, User, Laptop, MessageSquare, CheckCircle2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/useAppStore";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<"account" | "appearance" | "notifications" | "brand" | "attendance">("account");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Account State
  const [displayName, setDisplayName] = useState("Hamza Admin");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const email = "admin@septimus.local";

  // Notifications State
  const [notifDm, setNotifDm] = useState(true);
  const [notifMentions, setNotifMentions] = useState(true);
  const [notifAgile, setNotifAgile] = useState(true);

  // Brand State
  const [companyName, setCompanyName] = useState("Septimus Workspace");
  const [primaryColor, setPrimaryColor] = useState("#8d4592");
  const [sidebarBg, setSidebarBg] = useState("#0f172a");
  const [textColor, setTextColor] = useState("#1e293b");
  const [fontFamily, setFontFamily] = useState("Cairo");
  const [logoUrl, setLogoUrl] = useState("");

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
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
        setAvatarUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Save Account Profile
  const handleSaveProfile = async () => {
    localStorage.setItem("septimus_display_name", displayName);
    if (avatarUrl) {
      localStorage.setItem("septimus_avatar", avatarUrl);
      window.dispatchEvent(new Event("septimus_avatar_updated"));
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
    const payload = { companyName, primaryColor, sidebarBg, textColor, fontFamily, logoUrl };
    localStorage.setItem("septimus_brand", JSON.stringify(payload));
    window.dispatchEvent(new Event("septimus_brand_updated"));
    try {
      await fetchWithAuth(`${API_BASE_URL}/settings/brand?workspace_id=${localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      alert(t("settings.brandSaved"));
    } catch (e) {
      console.error("Failed to persist brand settings", e);
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
          <div className="w-48 bg-white border-e border-slate-100 p-4 space-y-1">
            <button 
              onClick={() => setActiveTab("account")}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "account" ? "bg-slate-100 text-[var(--sb-bg)] [var(--sb-bg)]" : "hover:bg-slate-200 :bg-slate-100 text-[var(--sb-bg)]/80 [var(--sb-bg)]/70"
              }`}
            >
              <User className="w-4 h-4" />
              <span>{t("settings.account")}</span>
            </button>
            <button 
              onClick={() => setActiveTab("appearance")}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "appearance" ? "bg-slate-100 text-[var(--sb-bg)] [var(--sb-bg)]" : "hover:bg-slate-200 :bg-slate-100 text-[var(--sb-bg)]/80 [var(--sb-bg)]/70"
              }`}
            >
              <Moon className="w-4 h-4" />
              <span>{t("settings.appearance")}</span>
            </button>
            <button 
              onClick={() => setActiveTab("notifications")}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "notifications" ? "bg-gray-200 text-[var(--sb-bg)] [var(--sb-bg)]" : "hover:bg-gray-200 :bg-gray-800 text-gray-600 "
              }`}
            >
              <BellRing className="w-4 h-4" />
              <span>{t("settings.notifications")}</span>
            </button>
            <div className="pt-4 mt-4 border-t border-gray-200 ">
              <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{t("settings.workspace_management")}</p>
              <button 
                onClick={() => setActiveTab("brand")}
                className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "brand" ? "bg-brand-light text-brand [var(--sb-bg)]" : "hover:bg-gray-200 :bg-gray-800 text-gray-600 "
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>{t("settings.company_identity")}</span>
              </button>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.profile_picture")}</label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-brand text-white text-xl font-bold">
                            {displayName.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/*"
                          aria-label={t("settings.upload_profile_picture")}
                          onChange={handleAvatarUpload}
                          className="block w-full text-sm text-slate-500 file:me-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-light file:text-brand hover:file:bg-brand-light/80"
                        />
                        <p className="text-xs text-slate-500 mt-1">{t("settings.avatar_hint")}</p>
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
                    <Button variant="destructive" className="w-full sm:w-auto text-white">{t("settings.disable_account")}</Button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "appearance" && (
              <>
                <h3 className="text-lg font-bold text-[var(--sb-bg)] [var(--sb-bg)] mb-6">Appearance</h3>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Theme</label>
                    <div className="grid grid-cols-3 gap-4">
                      <button 
                        onClick={() => setTheme("dark")}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                          theme === 'dark' 
                            ? 'border-primary bg-primary/5 text-primary' 
                            : 'border-gray-200 text-gray-500 hover:border-gray-300 :border-gray-700'
                        }`}
                      >
                        <Moon className="w-6 h-6 mb-2" />
                        <span className="text-sm font-medium">{t("settings.theme_dark")} {theme === 'dark' && `(${t("settings.theme_active")})`}</span>
                      </button>
                      <button 
                        onClick={() => setTheme("light")}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                          theme === 'light' 
                            ? 'border-primary bg-primary/5 text-primary' 
                            : 'border-gray-200 text-gray-500 hover:border-gray-300 :border-gray-700'
                        }`}
                      >
                        <Sun className="w-6 h-6 mb-2" />
                        <span className="text-sm font-medium">{t("settings.theme_light")} {theme === 'light' && `(${t("settings.theme_active")})`}</span>
                      </button>
                      <button 
                        onClick={() => setTheme("system")}
                        className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                          theme === 'system' 
                            ? 'border-primary bg-primary/5 text-primary' 
                            : 'border-gray-200 text-gray-500 hover:border-gray-300 :border-gray-700'
                        }`}
                      >
                        <Laptop className="w-6 h-6 mb-2" />
                        <span className="text-sm font-medium">{t("settings.theme_system")} {theme === 'system' && `(${t("settings.theme_active")})`}</span>
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
                    <h3 className="text-lg font-bold text-brand-dark mb-1">{t("settings.attendance_rules")}</h3>
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
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.office_latitude")}</label>
                      <input 
                        type="text" 
                        title={t("settings.office_latitude", "Office Latitude")}
                        value={officeLat}
                        onChange={(e) => setOfficeLat(e.target.value)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand focus:outline-none text-sm text-[var(--sb-bg)] [var(--sb-bg)]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.office_longitude")}</label>
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t("settings.attendance_radius")}</label>
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
          </div>
        </div>
      </div>
    </div>
  );
}
