"use client";

import React, { useState } from "react";
import { Sparkles, Activity, BellRing, Settings, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/contexts/LocalizationContext";
import { API_BASE_URL, fetchWithAuth } from "@/lib/apiClient";

export default function AISettingsPage() {
  const { isRtl } = useLocalization();
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<{ message: string; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerAudit = async () => {
    setIsAuditing(true);
    setError(null);
    setAuditResult(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/agents/audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) throw new Error("Failed to trigger proactive audit");
      
      const data = await res.json();
      setAuditResult({
        message: data.message,
        count: data.alerts_posted || 0,
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred");
      }
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className={`p-8 space-y-8 max-w-5xl mx-auto ${isRtl ? 'text-end' : 'text-start'}`} dir={isRtl ? "rtl" : "ltr"}>
      
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold flex items-center gap-3 text-foreground">
          <Sparkles className="w-8 h-8 text-amber-500" />
          {isRtl ? "إعدادات الذكاء الاصطناعي الاستباقي" : "Proactive AI Settings"}
        </h1>
        <p className="text-muted-foreground">
          {isRtl 
            ? "تحكم في سلوك المدقق الاستباقي، والموجز الصباحي، ونماذج الذكاء الاصطناعي."
            : "Manage proactive auditor behavior, morning brief, and AI models."}
        </p>
      </div>

      {/* Proactive Auditor Card */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="bg-muted px-6 py-4 border-b border-border flex items-center gap-3">
          <Activity className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-semibold text-foreground">
            {isRtl ? "المدقق الاستباقي للكيانات" : "Entity Proactive Auditor"}
          </h2>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-1 space-y-4 text-muted-foreground">
              <p>
                {isRtl 
                  ? "يقوم المدقق الاستباقي بعمليات فحص دورية خلف الكواليس للمنظومة لاكتشاف المشكلات وعرضها في القنوات المناسبة، مثل:"
                  : "The proactive auditor runs periodic background scans to detect issues and surface them in appropriate channels, such as:"}
              </p>
              <ul className="space-y-2 list-disc list-inside">
                <li>{isRtl ? "المهام العالقة التي لم يتم تحديثها منذ أيام." : "Stuck tasks not updated for days."}</li>
                <li>{isRtl ? "الفواتير المتأخرة وغير المدفوعة لأكثر من 30 يوماً." : "Overdue unpaid invoices older than 30 days."}</li>
                <li>{isRtl ? "العملاء غير المتفاعلين (قريباً)." : "Inactive clients (coming soon)."}</li>
              </ul>
            </div>
            
            <div className="w-full md:w-1/3 bg-muted p-4 rounded-xl border border-border flex flex-col items-center justify-center text-center space-y-4">
              <ShieldCheck className="w-12 h-12 text-indigo-400" />
              <div>
                <h3 className="font-semibold text-foreground">{isRtl ? "تشغيل يدوي للتدقيق" : "Manual Audit Trigger"}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {isRtl ? "يمكنك إجبار المدقق على فحص المنظومة الآن بدلاً من انتظار الجدول الزمني." : "Force the auditor to scan the system now instead of waiting for the schedule."}
                </p>
              </div>
              <Button 
                onClick={triggerAudit} 
                disabled={isAuditing}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {isAuditing ? (
                  <span className="flex items-center gap-2"><Activity className="w-4 h-4 animate-spin" /> {isRtl ? "جاري الفحص..." : "Scanning..."}</span>
                ) : (
                  <span className="flex items-center gap-2"><Settings className="w-4 h-4" /> {isRtl ? "تشغيل المدقق الآن" : "Run Auditor Now"}</span>
                )}
              </Button>
            </div>
          </div>

          {/* Results Area */}
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">
              {error}
            </div>
          )}
          {auditResult && (
            <div className="p-4 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <div>
                <p className="font-medium">{auditResult.message}</p>
                <p className="text-sm opacity-90">
                  {isRtl ? `تم رصد ونشر ${auditResult.count} تنبيهات.` : `Detected and posted ${auditResult.count} alerts.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Morning Brief Settings */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="bg-muted px-6 py-4 border-b border-border flex items-center gap-3">
          <BellRing className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-foreground">
            {isRtl ? "إعدادات الموجز الصباحي" : "Morning Brief Settings"}
          </h2>
        </div>
        <div className="p-6">
          <p className="text-muted-foreground">
            {isRtl 
              ? "يتم تشغيل الموجز الصباحي لكل مستخدم تلقائياً في تمام الساعة 8:00 صباحاً بتوقيت الخادم. لتعطيل الميزة، يتطلب الأمر تغيير متغير البيئة MORNING_BRIEF_CRON وإعادة تشغيل الحاويات."
              : "Morning Brief is run automatically for each user at 8:00 AM server time. To disable, change the MORNING_BRIEF_CRON environment variable and restart containers."}
          </p>
        </div>
      </div>

    </div>
  );
}
