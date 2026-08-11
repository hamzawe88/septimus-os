"use client";

import React, { createContext, useCallback, useContext, useState, useEffect } from "react";
import {
  Language,
  translate,
  formatCurrencyValue,
  formatNumberValue,
  formatDateValue,
} from "@/lib/i18n";

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
  const [baseCurrency, setBaseCurrencyState] = useState("SAR");
  const [secondaryCurrency, setSecondaryCurrencyState] = useState("USD");
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
    if (savedBaseCurr) {
      setBaseCurrencyState(savedBaseCurr);
    } else if (savedCountry === "SA" || !savedCountry) {
      setBaseCurrencyState("SAR");
    }

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

  // Thin closures binding the pure i18n helpers to the current provider state.
  const t = useCallback(
    (keyPath: string, fallback?: string) => translate(language, keyPath, fallback),
    [language],
  );

  const formatCurrency = useCallback(
    (amount: number, useSecondary: boolean = false) =>
      formatCurrencyValue(amount, useSecondary ? secondaryCurrency : baseCurrency, numberFormat),
    [baseCurrency, numberFormat, secondaryCurrency],
  );

  const formatNumber = useCallback(
    (amount: number) => formatNumberValue(amount, numberFormat),
    [numberFormat],
  );

  const formatDate = useCallback(
    (date: Date | string) => formatDateValue(date, dateFormat),
    [dateFormat],
  );

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
