// ═══════════════════════════════════════════════════════════════
// Septimus OS — Pure i18n helpers
// Stateless translation + formatting logic extracted from
// LocalizationContext so the provider only owns state and side effects.
// ═══════════════════════════════════════════════════════════════

import ar from "../locales/ar.json";
import en from "../locales/en.json";

export type Language = "ar" | "en";
export type NumberFormat = "comma" | "dot";

// Turns a translation key (or camelCase leaf) into a readable English label.
// Used as the English-mode safeguard so an Arabic fallback never leaks through.
function humanizeKey(lastKey: string): string {
  return lastKey.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
}

// Simple keypath translator (e.g. "sidebar.dashboard").
export function translate(language: Language, keyPath: string, fallback?: string): string {
  const dictionary = language === "ar" ? ar : en;
  const keys = keyPath.split(".");
  let value: unknown = dictionary;
  for (const key of keys) {
    if (typeof value !== "object" || value === null || !(key in value)) {
      if (language === "en" && fallback && /[\u0600-\u06FF]/.test(fallback)) {
        // Constitutional Safeguard: In English mode, NEVER return an Arabic fallback!
        return humanizeKey(keys[keys.length - 1]);
      }
      return fallback || keyPath;
    }
    value = (value as Record<string, unknown>)[key];
  }
  if (typeof value !== "string" && typeof value !== "number") {
    if (language === "en" && fallback && /[\u0600-\u06FF]/.test(fallback)) {
      return humanizeKey(keys[keys.length - 1]);
    }
    return fallback || keyPath;
  }
  return String(value);
}

// To enforce Western Arabic digits (1234) even in Arabic, we pick the locale by
// the desired grouping: en-US for 'comma' grouping, de-DE for 'dot' grouping.
function localeFor(numberFormat: NumberFormat): string {
  return numberFormat === "comma" ? "en-US" : "de-DE";
}

export function formatCurrencyValue(amount: number, currency: string, numberFormat: NumberFormat): string {
  return new Intl.NumberFormat(localeFor(numberFormat), {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumberValue(amount: number, numberFormat: NumberFormat): string {
  return new Intl.NumberFormat(localeFor(numberFormat)).format(amount);
}

export function formatDateValue(date: Date | string, dateFormat: string): string {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();

  if (dateFormat === "MM/DD/YYYY") {
    return `${month}/${day}/${year}`;
  }
  return `${day}/${month}/${year}`;
}
