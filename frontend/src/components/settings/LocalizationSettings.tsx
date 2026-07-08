"use client";

import React, { useState } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Globe, Save, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LocalizationSettings() {
  const {
    language,
    setLanguage,
    country,
    setCountry,
    baseCurrency,
    setBaseCurrency,
    secondaryCurrency,
    setSecondaryCurrency,
    numberFormat,
    setNumberFormat,
    dateFormat,
    setDateFormat,
    formatNumber,
    formatDate,
    t,
  } = useLocalization();

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // Context already saves to localStorage automatically on change,
    // This is just to give visual feedback to the user
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto h-full overflow-y-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
          <Globe className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t("settings.localization")}</h1>
          <p className="text-slate-500 mt-1">Configure your region, language, and currency settings</p>
        </div>
      </div>

      <div className="space-y-8">
        {/* Language Selection */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">{t("settings.language")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setLanguage("ar")}
              className={`p-4 rounded-xl border-2 text-start transition-all ${
                language === "ar"
                  ? "border-blue-500 bg-blue-50/50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="font-semibold text-slate-800">Arabic</div>
              <div className="text-sm text-slate-500 mt-1">Arabic (RTL)</div>
            </button>
            <button
              onClick={() => setLanguage("en")}
              className={`p-4 rounded-xl border-2 text-start transition-all ${
                language === "en"
                  ? "border-blue-500 bg-blue-50/50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="font-semibold text-slate-800">English</div>
              <div className="text-sm text-slate-500 mt-1">English (LTR)</div>
            </button>
          </div>
        </section>

        {/* Region & Currency */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">{t("settings.country")}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="country-select" className="text-sm font-medium text-slate-700">{t("settings.country")}</label>
              <select
                id="country-select"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all bg-slate-50"
              >
                <option value="SA">Saudi Arabia (SA)</option>
                <option value="AE">United Arab Emirates (AE)</option>
                <option value="EG">Egypt (EG)</option>
                <option value="US">United States (US)</option>
                <option value="UK">United Kingdom (UK)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label htmlFor="base-currency-select" className="text-sm font-medium text-slate-700">{t("settings.baseCurrency")}</label>
              <select
                id="base-currency-select"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all bg-slate-50"
              >
                <option value="SAR">Saudi Riyal (SAR)</option>
                <option value="AED">UAE Dirham (AED)</option>
                <option value="EGP">Egyptian Pound (EGP)</option>
                <option value="USD">US Dollar (USD)</option>
                <option value="EUR">Euro (EUR)</option>
                <option value="LYD">Libyan Dinar (LYD)</option>
                <option value="GBP">British Pound (GBP)</option>
                <option value="JPY">Japanese Yen (JPY)</option>
                <option value="CNY">Chinese Yuan (CNY)</option>
                <option value="KWD">Kuwaiti Dinar (KWD)</option>
                <option value="BHD">Bahraini Dinar (BHD)</option>
                <option value="OMR">Omani Rial (OMR)</option>
                <option value="QAR">Qatari Riyal (QAR)</option>
                <option value="JOD">Jordanian Dinar (JOD)</option>
                <option value="MAD">Moroccan Dirham (MAD)</option>
                <option value="TND">Tunisian Dinar (TND)</option>
                <option value="DZD">Algerian Dinar (DZD)</option>
                <option value="CAD">Canadian Dollar (CAD)</option>
                <option value="AUD">Australian Dollar (AUD)</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <label htmlFor="secondary-currency-select" className="text-sm font-medium text-slate-700">{t("settings.secondaryCurrency")}</label>
              <select
                id="secondary-currency-select"
                value={secondaryCurrency}
                onChange={(e) => setSecondaryCurrency(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all bg-slate-50"
              >
                <option value="USD">US Dollar (USD)</option>
                <option value="EUR">Euro (EUR)</option>
                <option value="SAR">Saudi Riyal (SAR)</option>
                <option value="AED">UAE Dirham (AED)</option>
                <option value="EGP">Egyptian Pound (EGP)</option>
                <option value="LYD">Libyan Dinar (LYD)</option>
                <option value="GBP">British Pound (GBP)</option>
                <option value="JPY">Japanese Yen (JPY)</option>
                <option value="CNY">Chinese Yuan (CNY)</option>
                <option value="KWD">Kuwaiti Dinar (KWD)</option>
                <option value="BHD">Bahraini Dinar (BHD)</option>
                <option value="OMR">Omani Rial (OMR)</option>
                <option value="QAR">Qatari Riyal (QAR)</option>
                <option value="JOD">Jordanian Dinar (JOD)</option>
                <option value="MAD">Moroccan Dirham (MAD)</option>
                <option value="TND">Tunisian Dinar (TND)</option>
                <option value="DZD">Algerian Dinar (DZD)</option>
                <option value="CAD">Canadian Dollar (CAD)</option>
                <option value="AUD">Australian Dollar (AUD)</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">Used for dual-currency transactions (e.g. Invoicing)</p>
            </div>
          </div>
        </section>

        {/* Number & Date Formatting */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">{t("settings.formatting", "Number & Date Formatting")}</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="number-format-select" className="text-sm font-medium text-slate-700">{t("settings.numberFormat", "Number Format")}</label>
              <select
                id="number-format-select"
                value={numberFormat}
                onChange={(e) => setNumberFormat(e.target.value as "comma" | "dot")}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all bg-slate-50"
              >
                <option value="comma">1,234,567.89 (Comma separators)</option>
                <option value="dot">1.234.567,89 (Dot separators)</option>
              </select>
              <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100 flex items-center gap-2">
                <span className="text-sm text-blue-700 font-medium">Preview:</span>
                <span className="text-sm font-bold text-slate-800">{formatNumber(1234567.89)}</span>
                <span className="text-xs text-blue-600/70 ms-auto">Western Digits Enforced</span>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="date-format-select" className="text-sm font-medium text-slate-700">{t("settings.dateFormat", "Date Format")}</label>
              <select
                id="date-format-select"
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all bg-slate-50"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
              <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center gap-2">
                <span className="text-sm text-slate-500 font-medium">Preview:</span>
                <span className="text-sm font-bold text-slate-800">{formatDate(new Date())}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Save Actions */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSave}
            className={`h-11 px-6 rounded-xl transition-all ${
              saved ? "bg-emerald-500 hover:bg-emerald-600" : "bg-blue-600 hover:bg-blue-700"
            } text-white font-medium flex items-center gap-2`}
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t("settings.save")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
