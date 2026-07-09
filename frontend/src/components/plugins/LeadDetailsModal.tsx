"use client";

import React, { useState } from "react";
import { X, Save, FileText, Zap, MessageSquare, Phone, Mail, Brain } from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";
import { LeadEntity } from "./CRMLeadsView";
import AddQuoteModal from "./AddQuoteModal";

interface LeadDetailsModalProps {
  lead: LeadEntity;
  onClose: () => void;
  onSuccess: () => void;
}

export default function LeadDetailsModal({ lead, onClose, onSuccess }: LeadDetailsModalProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [formData, setFormData] = useState<Record<string, any>>(lead.data || {});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "copilot">("details");
  const [showQuote, setShowQuote] = useState(false);
  const { t, isRtl } = useLocalization();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";
      
      const res = await fetchWithAuth(`${API_BASE_URL}/entities/${lead.id}?workspace_id=${workspaceId}`, {
        method: 'PUT',
        body: JSON.stringify({
          data: formData
        })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server responded with status ${res.status}`);
      }
      
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to update lead:", err);
      alert(t("plugins.updateLeadFailed"));
    } finally {
      setLoading(false);
    }
  };

  // AI Copilot calculations
  const val = Number(formData.value || 0);
  const stage = String(formData.status || "new");
  const stagePriority: Record<string, number> = {
    "new": 1, "contacted": 2, "quote_sent": 3,
    "negotiation": 4, "closed_won": 5, "closed_lost": 0,
  };
  const priorityScore = stagePriority[stage] ?? 1;
  const isHighValue = val > 5000;
  const priorityLabel = isHighValue && priorityScore >= 3
    ? t("plugins.crm.highPriority")
    : priorityScore >= 3
    ? t("plugins.crm.mediumPriority")
    : t("plugins.crm.normalPriority");

  const suggestedActions: string[] = [];
  if (stage === "new") suggestedActions.push("Send introductory email and schedule discovery call", "Share company profile / brochure");
  if (stage === "contacted") suggestedActions.push("Follow up within 48 hours", "Prepare and send a customized quotation");
  if (stage === "quote_sent") suggestedActions.push("Call to review quote together", "Address objections proactively", "Offer a limited-time discount");
  if (stage === "negotiation") suggestedActions.push("Finalize pricing and payment terms", "Request signed agreement", "Prepare invoice");
  if (stage === "closed_won") suggestedActions.push("Send welcome onboarding kit", "Schedule kickoff meeting", "Request a review/testimonial");
  if (stage === "closed_lost") suggestedActions.push("Send a follow-up in 3 months", "Ask for feedback on why deal was lost");

  const contactPerson = formData.contact_person || (isRtl ? "العميل المحترم" : "Valued Customer");
  const company = formData.company || (isRtl ? "شركتكم" : "your company");
  const waMessage = isRtl
    ? `السلام عليكم ${contactPerson}،\n\nبخصوص ${company} - نود متابعة ${stage === "quote_sent" ? "عرض السعر المرسل" : "الفرصة التجارية"}. هل لديكم أي استفسارات؟\n\nنحن في خدمتكم دائماً.`
    : `Hello ${contactPerson},\n\nRegarding ${company} - we'd like to follow up on ${stage === "quote_sent" ? "the quote we sent" : "the business opportunity"}. Do you have any questions?\n\nWe're always at your service.`;
  const emailSubject = `Follow-up: ${formData.company || "Your Project"} - Next Steps`;
  const emailBody = `Dear ${formData.contact_person || "Team"},\n\nThank you for your continued interest. Regarding ${formData.company || "your project"}, we wanted to follow up on the ${stage === "quote_sent" ? "quotation we sent" : "business opportunity"}.\n\nPlease let us know if you have any questions.\n\nBest regards`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white text-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {t("plugins.crm.leadDetails")} {formData.company || t("common.unknown")}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{t("common.id")} {lead.id.slice(0, 8)}…</p>
          </div>
          <button aria-label="Close modal" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6">
          <button
            type="button"
            onClick={() => setActiveTab("details")}
            className={`py-3 px-1 ltr:me-6 rtl:ms-6 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "details" ? "border-brand text-slate-800" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <FileText className="w-4 h-4" />
            {t("plugins.crm.details")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("copilot")}
            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === "copilot" ? "border-purple-500 text-purple-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Brain className="w-4 h-4" />
            {t("plugins.crm.aiSalesCopilot")}
          </button>
        </div>

        {/* Details Tab */}
        {activeTab === "details" && (
          <div className="p-6 overflow-y-auto">
            <form id="update-lead-form" onSubmit={handleSubmit} className="space-y-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="company" className="block text-sm font-medium text-slate-700 mb-1">{t("plugins.crm.companyName")}</label>
                  <input id="company" required name="company" type="text" value={formData.company || ""} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-slate-700 mb-1">{t("plugins.crm.status")}</label>
                  <select id="status" name="status" value={formData.status || "new"} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange}>
                    <option value="new">{t("plugins.crm.newLead")}</option>
                    <option value="contacted">{t("plugins.crm.contacted")}</option>
                    <option value="quote_sent">{t("plugins.crm.quoteSent")}</option>
                    <option value="negotiation">{t("plugins.crm.negotiating")}</option>
                    <option value="closed_won">{t("plugins.crm.closedWon")}</option>
                    <option value="closed_lost">{t("plugins.crm.closedLost")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="contact_person" className="block text-sm font-medium text-slate-700 mb-1">{t("plugins.crm.contactPerson")}</label>
                  <input id="contact_person" required name="contact_person" type="text" value={formData.contact_person || ""} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">{t("plugins.crm.contactEmail")}</label>
                  <input id="email" required name="email" type="email" value={formData.email || ""} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">{t("plugins.crm.phoneNumber")}</label>
                  <input id="phone" name="phone" type="tel" value={formData.phone || ""} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow text-start" dir="ltr" onChange={handleInputChange} />
                </div>
                <div>
                  <label htmlFor="value" className="block text-sm font-medium text-slate-700 mb-1">{t("plugins.crm.estimatedValue")}</label>
                  <input id="value" required name="value" type="number" value={formData.value || ""} className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-shadow" onChange={handleInputChange} />
                </div>
              </div>

              {/* Activity Log / Notes Section */}
              <div className="pt-4 border-t border-slate-200">
                <h3 className="text-sm font-semibold flex items-center text-slate-700 mb-3">
                  <FileText className="w-4 h-4 ltr:me-2 rtl:ms-2" />
                  {t("plugins.crm.notesLog")}
                </h3>
                <textarea 
                  name="notes" 
                  rows={4}
                  value={formData.notes || ""}
                  onChange={handleInputChange}
                  placeholder={t("plugins.crm.notesPlaceholder")}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 text-slate-900 focus:bg-white focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all resize-none"
                />
              </div>

            </form>
          </div>
        )}

        {/* AI Copilot Tab */}
        {activeTab === "copilot" && (
          <div className="p-6 overflow-y-auto space-y-5">
            {/* Priority Score Card */}
            <div className={`p-4 rounded-xl border ${
              isHighValue && priorityScore >= 3
                ? "bg-amber-50 border-amber-200"
                : priorityScore >= 3
                ? "bg-blue-50 border-blue-200"
                : "bg-slate-50 border-slate-200"
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{t("plugins.crm.aiLeadPriority")}</p>
                  <p className="text-xl font-bold text-slate-800">
                    {isHighValue && priorityScore >= 3 ? "🔥 " : priorityScore >= 3 ? "⚡ " : "📋 "}{priorityLabel}
                  </p>
                </div>
                <div className="text-end">
                  <p className="text-xs text-slate-500">{t("plugins.crm.dealValue")}</p>
                  <p className="text-lg font-mono font-bold text-emerald-600">${val.toLocaleString()}</p>
                </div>
              </div>
              <div className="mt-3 bg-white/60 rounded-lg p-2.5 text-xs text-slate-600">
                <span className="font-semibold">{t("plugins.crm.stage")}</span> {t(`plugins.crm.${stage}`, stage.replace(/_/g, " ").toUpperCase())} &nbsp;|&nbsp;
                <span className="font-semibold">{t("plugins.crm.contact")}</span> {formData.contact_person || t("common.unknown")} &nbsp;|&nbsp;
                <span className="font-semibold">{t("plugins.crm.email")}</span> {formData.email || t("common.unknown")}
              </div>
            </div>

            {/* Strategic Recommendations */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-purple-600" />
                {t("plugins.crm.aiRecommendations")}
              </h4>
              <ul className="space-y-2">
                {suggestedActions.map((action, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>

            {/* Message Generator */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                {t("plugins.crm.aiMessages")}
              </h4>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold text-slate-600 uppercase">{t("plugins.crm.whatsappMessage")}</span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-slate-800 whitespace-pre-wrap text-end" dir="rtl">
                  {waMessage}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Mail className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-semibold text-slate-600 uppercase" dir="ltr">{t("plugins.crm.emailSubject", "Email (English) — Subject: ")} {emailSubject}</span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-slate-800 whitespace-pre-wrap">
                  {emailBody}
                </div>
              </div>
            </div>

            {/* Quick Action: Open Quote Engine */}
            <button
              type="button"
              onClick={() => setShowQuote(true)}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all"
            >
              {t("plugins.crm.openQuotation")}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 gap-3">
          <button
            type="button"
            onClick={() => setShowQuote(true)}
            className="px-4 py-2 text-sm font-semibold text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors flex items-center gap-2"
          >
            {t("plugins.crm.quote")}
          </button>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} disabled={loading} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              {t("common.cancel")}
            </button>
            <button 
              type="submit" 
              form="update-lead-form"
              disabled={loading || activeTab === "copilot"}
              className="flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors hover:opacity-90 disabled:opacity-50 bg-brand"
            >
              <Save className="w-4 h-4 ltr:me-2 rtl:ms-2" />
              {loading ? t("common.saving") : t("common.saveChanges")}
            </button>
          </div>
        </div>

        {/* Quote Modal Nested */}
        {showQuote && (
          <AddQuoteModal
            lead={lead}
            onClose={() => setShowQuote(false)}
            onSuccess={() => {
              setShowQuote(false);
              onSuccess();
              onClose();
            }}
          />
        )}

      </div>
    </div>
  );
}
