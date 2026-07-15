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
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {t("settings.company_profile", "Company Profile")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t("settings.company_profile_desc", "Manage your business details and logo.")}
          </p>
        </div>
        <button 
          onClick={handleSave}
          className="btn-primary flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {isSaving ? t("common.saving", "Saving...") : t("common.save", "Save Changes")}
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
        
        {/* Logo Section */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            {t("settings.company_logo", "Company Logo")}
          </label>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50 overflow-hidden relative">
              {companyData.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={companyData.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />
              ) : (
                <Building2 className="w-8 h-8 text-slate-400" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLogoUpload}
                accept="image/png, image/jpeg, image/webp, image/svg+xml"
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <UploadCloud className="w-4 h-4 text-brand" />
                  {t("settings.upload_logo", "Upload Logo")}
                </button>
                {companyData.logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="p-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-md text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                    title={t("common.delete", "Remove Logo")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("settings.logo_requirements", "Recommended size: 512x512px. Max size: 2MB.")}
              </p>
            </div>
          </div>
        </div>

        <div className="h-px bg-slate-200 dark:bg-slate-800 w-full" />

        {/* Company Details */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="company-name">
              {t("settings.company_name", "Company Name")}
            </label>
            <input
              id="company-name"
              type="text"
              value={companyData.name}
              onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="tax-number">
              {t("settings.tax_number", "Tax Number (VAT)")}
            </label>
            <input
              id="tax-number"
              type="text"
              value={companyData.taxNumber}
              onChange={(e) => setCompanyData({ ...companyData, taxNumber: e.target.value })}
              className="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] text-slate-900 dark:text-slate-100 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1" htmlFor="company-address">
              {t("settings.company_address", "Company Address")}
            </label>
            <div className="relative">
              <MapPin className="absolute top-2.5 start-3 w-4 h-4 text-slate-400" />
              <textarea
                id="company-address"
                rows={3}
                value={companyData.address}
                onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                className="w-full ps-10 pe-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
