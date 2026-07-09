// ═══════════════════════════════════════════════════════════════
// Septimus OS — Integrations catalog (backed by GET /integrations)
// The backend (backend-core/handlers/integrations.go) is the single
// source of truth for the available providers and their connected state.
// ═══════════════════════════════════════════════════════════════

import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

export type IntegrationStatus = "connected" | "disconnected";

export interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  status: IntegrationStatus;
}

// Fetches the live integration catalog with per-workspace connection status.
export async function fetchIntegrations(signal?: AbortSignal): Promise<Integration[]> {
  const res = await fetchWithAuth(`${API_BASE_URL}/integrations`, { signal });
  if (!res.ok) throw new Error(`Failed to load integrations (${res.status})`);
  const data = await res.json();
  const list = Array.isArray(data?.integrations) ? data.integrations : [];
  return list as Integration[];
}

// The backend serves provider names/descriptions in a single (mixed) language.
// This bilingual map lets the UI display the right language; unknown ids fall
// back to whatever the backend returned.
const PROVIDER_TEXT: Record<string, { nameAr: string; nameEn: string; descAr: string; descEn: string }> = {
  whatsapp: {
    nameAr: "إشعارات WhatsApp", nameEn: "WhatsApp Notifications",
    descAr: "إرسال التنبيهات والأحداث الهامة للمدراء والموظفين عبر واتساب بشكل فوري.",
    descEn: "Send real-time alerts and important events to managers and staff over WhatsApp.",
  },
  zendesk: {
    nameAr: "Zendesk Helpdesk", nameEn: "Zendesk Helpdesk",
    descAr: "إنشاء تذاكر صيانة تلقائياً عند تعطل أجهزة الـ POS أو فقدان الاتصال بالمحطات.",
    descEn: "Automatically open maintenance tickets when POS terminals fail or lose connectivity.",
  },
  odoo: {
    nameAr: "Odoo ERP Sync", nameEn: "Odoo ERP Sync",
    descAr: "مزامنة التسويات المالية (Settlements) والحركات اليومية مع نظام المحاسبة.",
    descEn: "Sync financial settlements and daily transactions with your accounting system.",
  },
  ai_analytics: {
    nameAr: "مساعد Septimus الذكي", nameEn: "Septimus AI Assistant",
    descAr: "مساعد ذكي لتحليل العمليات واكتشاف محاولات الاحتيال وتقديم تقارير دورية.",
    descEn: "A smart assistant for operations analysis, fraud detection, and periodic reports.",
  },
  google_drive: {
    nameAr: "Google Drive", nameEn: "Google Drive",
    descAr: "مزامنة مستندات العمل وإنشاء مجلدات المشاريع تلقائياً.",
    descEn: "Automatically sync WorkDocs and create project folders.",
  },
  google_calendar: {
    nameAr: "Google Calendar", nameEn: "Google Calendar",
    descAr: "مزامنة المواعيد النهائية والاجتماعات وتوفّر الفريق.",
    descEn: "Sync deadlines, meetings, and team availability.",
  },
  google_sheets: {
    nameAr: "Google Sheets", nameEn: "Google Sheets",
    descAr: "تصدير كشوف الحضور والرواتب ومهام الكانبان الحيّة.",
    descEn: "Export attendance payroll and live Kanban tasks.",
  },
};

export function integrationName(item: Integration, isRtl: boolean): string {
  const t = PROVIDER_TEXT[item.id];
  if (!t) return item.name;
  return isRtl ? t.nameAr : t.nameEn;
}

export function integrationDescription(item: Integration, isRtl: boolean): string {
  const t = PROVIDER_TEXT[item.id];
  if (!t) return item.description;
  return isRtl ? t.descAr : t.descEn;
}
