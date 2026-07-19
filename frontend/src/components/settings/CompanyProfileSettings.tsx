"use client";

import React, { useState, useRef } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Save, UploadCloud, Building2, MapPin, Trash2 } from "lucide-react";

export default function CompanyProfileSettings() {
  const { t } = useLocalization();
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [companyData, setCompanyData] = useState(() => {
    if (typeof window === "undefined") {
      return {
        name: "Septimus Tech",
        taxNumber: "300123456789012",
        address: "Global Headquarters, Global Business Center",
        logoUrl: ""
      };
    }
    try {
      const saved = localStorage.getItem("septimus_company_profile");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.address && (parsed.address.includes("Riyadh") || parsed.address.includes("الرياض"))) {
          parsed.address = "Global Headquarters, Global Business Center";
        }
        return {
          name: parsed.name || "Septimus Tech",
          taxNumber: parsed.taxNumber || "300123456789012",
          address: parsed.address || "Global Headquarters, Global Business Center",
          logoUrl: parsed.logoUrl || ""
        };
      }
    } catch (e) {
      console.error("Failed to load company profile", e);
    }
    return {
      name: "Septimus Tech",
      taxNumber: "300123456789012",
      address: "Global Headquarters, Global Business Center",
      logoUrl: ""
    };
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert(t("settings.logo_too_large", "Image size exceeds 2MB. Please select a smaller square image."));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        const newData = { ...companyData, logoUrl: base64 };
        setCompanyData(newData);
        try {
          localStorage.setItem("septimus_company_profile", JSON.stringify(newData));
          window.dispatchEvent(new CustomEvent("septimus_company_profile_updated", { detail: newData }));
        } catch (err) {
          console.error("Failed to save logo to localStorage", err);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    const newData = { ...companyData, logoUrl: "" };
    setCompanyData(newData);
    try {
      localStorage.setItem("septimus_company_profile", JSON.stringify(newData));
      window.dispatchEvent(new CustomEvent("septimus_company_profile_updated", { detail: newData }));
    } catch (err) {
      console.error("Failed to remove logo from localStorage", err);
    }
  };

  const handleSave = () => {
    setIsSaving(true);
    try {
      localStorage.setItem("septimus_company_profile", JSON.stringify(companyData));
      window.dispatchEvent(new CustomEvent("septimus_company_profile_updated", { detail: companyData }));
    } catch (err) {
      console.error("Failed to save company profile", err);
    }
    setTimeout(() => setIsSaving(false), 800);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 dark:bg-[#0f0e13] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/80 dark:bg-[#121016]/80 border-b border-slate-200/60 dark:border-slate-800/60 px-8 py-5 flex items-center justify-between shadow-sm">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 dark:bg-brand/20 rounded-xl">
            <Building2 className="w-6 h-6 text-brand" />
          </div>
          {t("settings.company_profile", "Company Profile")}
        </h1>
        <button 
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 bg-brand hover:opacity-90 text-white rounded-xl font-bold shadow-lg shadow-brand/20 transition-all active:scale-95"
        >
          <Save className="w-5 h-5" />
          {isSaving ? t("common.saving", "Saving...") : t("common.save", "Save Changes")}
        </button>
      </div>

      <div className="p-8 max-w-5xl mx-auto w-full space-y-8">
        
        {/* Logo Section */}
        <section className="bg-white/70 dark:bg-[#1a1d21]/70 backdrop-blur-xl p-8 rounded-[2rem] shadow-sm border border-slate-200/60 dark:border-slate-800/60">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-8">
            <div className="relative group shrink-0">
              <div className="w-32 h-32 rounded-3xl border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-[#222529] shadow-inner flex items-center justify-center overflow-hidden">
                {companyData.logoUrl ? (
                  <img src={companyData.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLogoUpload}
                accept="image/png, image/jpeg, image/webp, image/svg+xml"
                className="hidden"
              />
            </div>
            
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t("settings.company_logo", "Company Logo")}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {t("settings.logo_requirements", "Recommended size: 512x512px. Max size: 2MB. Transparent PNG works best.")}
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-5 py-2.5 bg-white dark:bg-[#222529] border border-slate-200/60 dark:border-slate-700/60 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:border-brand/30 hover:bg-slate-50 dark:hover:bg-[#2a2d32] transition-all flex items-center gap-2"
                >
                  <UploadCloud className="w-4 h-4 text-brand" />
                  {t("settings.upload_logo", "Upload New Logo")}
                </button>
                {companyData.logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="p-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-all"
                    title={t("common.delete", "Remove Logo")}
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Company Details */}
        <section className="bg-white/70 dark:bg-[#1a1d21]/70 backdrop-blur-xl p-8 rounded-[2rem] shadow-sm border border-slate-200/60 dark:border-slate-800/60">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500/10 rounded-lg"><MapPin className="w-5 h-5 text-blue-500" /></div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t("settings.company_details", "Company Details")}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.company_details_desc", "Information used on invoices and official documents.")}</p>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="group">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2" htmlFor="company-name">
                {t("settings.company_name", "Company Name")}
              </label>
              <div className="relative flex items-center bg-white/50 dark:bg-[#1a1d21]/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand/50">
                <input
                  id="company-name"
                  type="text"
                  value={companyData.name}
                  onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                  className="w-full bg-transparent border-none px-4 py-3 text-slate-900 dark:text-white text-sm focus:outline-none"
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2" htmlFor="tax-number">
                {t("settings.tax_number", "Tax Number (VAT)")}
              </label>
              <div className="relative flex items-center bg-white/50 dark:bg-[#1a1d21]/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand/50">
                <input
                  id="tax-number"
                  type="text"
                  value={companyData.taxNumber}
                  onChange={(e) => setCompanyData({ ...companyData, taxNumber: e.target.value })}
                  className="w-full bg-transparent border-none px-4 py-3 text-slate-900 dark:text-white font-mono text-sm focus:outline-none"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2" htmlFor="company-address">
                {t("settings.company_address", "Company Address")}
              </label>
              <div className="relative bg-white/50 dark:bg-[#1a1d21]/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand/50">
                <textarea
                  id="company-address"
                  rows={3}
                  value={companyData.address}
                  onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                  className="w-full bg-transparent border-none px-4 py-3 text-slate-900 dark:text-white text-sm focus:outline-none resize-none"
                />
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
