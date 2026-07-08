"use client";

import React, { useState } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Save, UploadCloud, Building2, MapPin } from "lucide-react";

export default function CompanyProfileSettings() {
  const { t } = useLocalization();
  const [isSaving, setIsSaving] = useState(false);

  const [companyData, setCompanyData] = useState({
    name: "Septimus Tech",
    taxNumber: "300123456789012",
    address: "Riyadh, Saudi Arabia",
    logoUrl: ""
  });

  const handleSave = () => {
    setIsSaving(true);
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
            <div className="w-24 h-24 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center bg-slate-50 dark:bg-slate-800/50">
              {companyData.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={companyData.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <Building2 className="w-8 h-8 text-slate-400" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2">
                <UploadCloud className="w-4 h-4" />
                {t("settings.upload_logo", "Upload Logo")}
              </button>
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
