"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import ar from "../locales/ar.json";
import en from "../locales/en.json";

type Language = "ar" | "en";

interface LocalizationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  country: string;
  setCountry: (country: string) => void;
  baseCurrency: string;
  setBaseCurrency: (curr: string) => void;
  secondaryCurrency: string;
  setSecondaryCurrency: (curr: string) => void;
  t: (key: string, fallback?: string) => string;
  formatCurrency: (amount: number, useSecondary?: boolean) => string;
  formatNumber: (amount: number) => string;
  formatDate: (date: Date | string) => string;
  numberFormat: "comma" | "dot";
  setNumberFormat: (format: "comma" | "dot") => void;
  dateFormat: string;
  setDateFormat: (format: string) => void;
  isRtl: boolean;
}

const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

export function LocalizationProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("ar");
  const [country, setCountryState] = useState("SA");
  const [baseCurrency, setBaseCurrencyState] = useState("USD");
  const [secondaryCurrency, setSecondaryCurrencyState] = useState("SAR");
  const [numberFormat, setNumberFormatState] = useState<"comma" | "dot">("comma");
  const [dateFormat, setDateFormatState] = useState("DD/MM/YYYY");

  useEffect(() => {
    // Load from local storage on mount
    /* eslint-disable react-hooks/set-state-in-effect */
    const savedLang = localStorage.getItem("app_lang") as Language;
    if (savedLang) setLanguageState(savedLang);
    
    const savedCountry = localStorage.getItem("app_country");
    if (savedCountry) setCountryState(savedCountry);

    const savedBaseCurr = localStorage.getItem("app_base_currency");
    if (savedBaseCurr) setBaseCurrencyState(savedBaseCurr);

    const savedSecCurr = localStorage.getItem("app_sec_currency");
    if (savedSecCurr) setSecondaryCurrencyState(savedSecCurr);

    const savedNumFormat = localStorage.getItem("app_number_format") as "comma" | "dot";
    if (savedNumFormat) setNumberFormatState(savedNumFormat);

    const savedDateFormat = localStorage.getItem("app_date_format");
    if (savedDateFormat) setDateFormatState(savedDateFormat);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("app_lang", lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  };

  const setCountry = (val: string) => {
    setCountryState(val);
    localStorage.setItem("app_country", val);
  };

  const setBaseCurrency = (val: string) => {
    setBaseCurrencyState(val);
    localStorage.setItem("app_base_currency", val);
  };

  const setSecondaryCurrency = (val: string) => {
    setSecondaryCurrencyState(val);
    localStorage.setItem("app_sec_currency", val);
  };

  const setNumberFormat = (val: "comma" | "dot") => {
    setNumberFormatState(val);
    localStorage.setItem("app_number_format", val);
  };

  const setDateFormat = (val: string) => {
    setDateFormatState(val);
    localStorage.setItem("app_date_format", val);
  };

  // Sync HTML tag attributes when language changes (useful for initial load)
  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
  }, [language]);

  // Simple keypath translator (e.g. "sidebar.dashboard")
  const t = (keyPath: string, fallback?: string): string => {
    const dictionary = language === "ar" ? ar : en;
    const keys = keyPath.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any = dictionary;
    for (const key of keys) {
      if (!value || value[key] === undefined) {
        if (language === "en" && fallback && /[\u0600-\u06FF]/.test(fallback)) {
          // Constitutional Safeguard: In English mode, NEVER return an Arabic fallback!
          const lastKey = keys[keys.length - 1];
          return lastKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        }
        return fallback || keyPath;
      }
      value = value[key];
    }
    if (typeof value !== "string" && typeof value !== "number") {
      if (language === "en" && fallback && /[\u0600-\u06FF]/.test(fallback)) {
        const lastKey = keys[keys.length - 1];
        return lastKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
      }
      return fallback || keyPath;
    }
    return String(value);
  };

  // Currency formatter
  const formatCurrency = (amount: number, useSecondary: boolean = false) => {
    const currency = useSecondary ? secondaryCurrency : baseCurrency;
    // To enforce Western Arabic digits (1234) even in Arabic, use the 'latn' numbering system or force en-US
    // We will use en-US to respect the 'comma' format naturally, or switch to de-DE for 'dot'
    const locale = numberFormat === "comma" ? "en-US" : "de-DE";
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  // Number formatter
  const formatNumber = (amount: number) => {
    const locale = numberFormat === "comma" ? "en-US" : "de-DE";
    return new Intl.NumberFormat(locale).format(amount);
  };

  // Date formatter
  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    
    if (dateFormat === "MM/DD/YYYY") {
      return `${month}/${day}/${year}`;
    }
    return `${day}/${month}/${year}`;
  };

  return (
    <LocalizationContext.Provider
      value={{
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
        t,
        formatCurrency,
        formatNumber,
        formatDate,
        isRtl: language === "ar"
      }}
    >
      {children}
    </LocalizationContext.Provider>
  );
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (context === undefined) {
    throw new Error("useLocalization must be used within a LocalizationProvider");
  }
  return context;
}
