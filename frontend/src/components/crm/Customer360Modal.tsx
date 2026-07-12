"use client";

import React, { useEffect, useState } from "react";
import { X, Mail, Phone, Building, Receipt, MessageSquare, Ticket, Sparkles, Send, LifeBuoy } from "lucide-react";
import { apiPost, AI_BASE_URL, fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: string;
  value: number;
  lastContact: string;
  score?: number; // Added for AI Scoring
}

interface Customer360ModalProps {
  lead: Lead;
  onClose: () => void;
}

export default function Customer360Modal({ lead, onClose }: Customer360ModalProps) {
  const { t, isRtl } = useLocalization();
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "invoices">("overview");
  
  const [drafting, setDrafting] = useState(false);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);

  const [showWhatsAppComposer, setShowWhatsAppComposer] = useState(false);
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppResult, setWhatsAppResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [showTicketComposer, setShowTicketComposer] = useState(false);
  const [ticketSubject, setTicketSubject] = useState(`Support request — ${lead.name} (${lead.company})`);
  const [ticketDescription, setTicketDescription] = useState("");
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketResult, setTicketResult] = useState<{ ok: boolean; text: string } | null>(null);

  const createZendeskTicket = async () => {
    if (!ticketSubject.trim() || !ticketDescription.trim()) return;
    setCreatingTicket(true);
    setTicketResult(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/integrations/zendesk/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: ticketSubject,
          description: ticketDescription,
          requester_name: lead.name,
          requester_email: lead.email,
          entity_id: lead.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setTicketResult({ ok: true, text: `${t("integrations.zendeskSuccess", "Ticket created in Zendesk")} (#${data.ticket_id})` });
        setTicketDescription("");
      } else {
        setTicketResult({ ok: false, text: data.error || t("integrations.zendeskFailed", "Failed to create ticket.") });
      }
    } catch (err) {
      setTicketResult({ ok: false, text: err instanceof Error ? err.message : t("common.unexpectedError", "An unexpected error occurred.") });
    } finally {
      setCreatingTicket(false);
    }
  };

  const sendWhatsAppMessage = async () => {
    if (!whatsAppMessage.trim() || !lead.phone) return;
    setSendingWhatsApp(true);
    setWhatsAppResult(null);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/integrations/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: lead.phone, message: whatsAppMessage, entity_id: lead.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setWhatsAppResult({ ok: true, text: t("integrations.waSuccess", "Message sent successfully via WhatsApp!") });
        setWhatsAppMessage("");
      } else {
        setWhatsAppResult({ ok: false, text: data.error || t("integrations.waFailed", "Failed to send message.") });
      }
    } catch (err) {
      setWhatsAppResult({ ok: false, text: err instanceof Error ? err.message : t("common.unexpectedError", "An unexpected error occurred.") });
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const generateEmailDraft = async () => {
    setDrafting(true);
    setEmailDraft(null);
    try {
      const workspaceId = localStorage.getItem("currentWorkspaceId") || "";
      const response = await apiPost<{reply: string}>('/ai/chat', {
        agent_type: 'crm',
        message: `Please generate a professional sales email draft for the lead "${lead.name}" from company "${lead.company}". Current deal stage: ${lead.status}. Write the email so it's ready to copy and send.`,
        context: { workspace_id: workspaceId, lead, lang: isRtl ? 'ar' : 'en' }
      }, AI_BASE_URL);
      setEmailDraft(response.reply);
    } catch (err) {
      console.error(err);
      setEmailDraft(isRtl ? "عذراً، حدث خطأ أثناء إنشاء المسودة." : "Sorry, an error occurred while generating the draft.");
    } finally {
      setDrafting(false);
    }
  };

  // Prevent background scrolling
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xl font-bold">
              {lead.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                {lead.name}
                {lead.score && lead.score > 80 && (
                  <span className="flex items-center gap-1 text-xs font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full" title="Hot Lead">
                    <Sparkles className="w-3 h-3" />
                    Hot {lead.score}%
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                <span className="flex items-center gap-1"><Building className="w-3 h-3"/> {lead.company}</span>
                <span className="flex items-center gap-1"><Mail className="w-3 h-3"/> {lead.email}</span>
                <span className="flex items-center gap-1"><Phone className="w-3 h-3"/> {lead.phone}</span>
              </div>
            </div>
          </div>
          <button 
            title="Close"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 border-b border-slate-200 bg-white">
          <button 
            onClick={() => setActiveTab("overview")}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "overview" ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t("crm.c360Overview", "Overview")}
          </button>
          <button 
            onClick={() => setActiveTab("timeline")}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "timeline" ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t("crm.c360Timeline", "Timeline")}
          </button>
          <button 
            onClick={() => setActiveTab("invoices")}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "invoices" ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {t("crm.c360Invoices", "Invoices & Quotes")}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {activeTab === "overview" && (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-semibold text-slate-800 mb-4">Lead Deal Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">Deal Value</p>
                      <p className="font-bold text-emerald-600 text-lg">${lead.value.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">Current Stage</p>
                      <p className="font-bold text-slate-700">{lead.status}</p>
                    </div>
                    {lead.score !== undefined && (
                      <div className="p-3 bg-slate-50 rounded-lg col-span-2">
                        <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-brand" />
                          {t("crm.aiLeadScore", "AI Lead Score")}
                        </p>
                        <progress 
                          value={lead.score} 
                          max="100" 
                          className={`w-full h-2.5 rounded-full [&::-webkit-progress-bar]:bg-slate-200 [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full ${lead.score > 70 ? '[&::-webkit-progress-value]:bg-green-500 [&::-moz-progress-bar]:bg-green-500 text-green-500' : lead.score > 40 ? '[&::-webkit-progress-value]:bg-yellow-400 [&::-moz-progress-bar]:bg-yellow-400 text-yellow-400' : '[&::-webkit-progress-value]:bg-red-500 [&::-moz-progress-bar]:bg-red-500 text-red-500'}`}
                        />
                        <p className="text-xs text-slate-500 mt-1">{lead.score}% Closing Probability</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-semibold text-slate-800 mb-4">Notes</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Prospective client interested in our digital transformation services. Prefers email communication. Budget expected in Q3.
                  </p>
                </div>
              </div>

              <div className="col-span-1 space-y-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-center">
                  <h3 className="font-semibold text-slate-800 mb-3 text-end">Quick Actions (AI)</h3>
                  <button 
                    onClick={generateEmailDraft}
                    disabled={drafting}
                    className="w-full bg-brand text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-brand/90 transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    {drafting ? "Generating..." : "Generate Email Draft"}
                  </button>
                  
                  {emailDraft && (
                    <div className="mt-4 text-end">
                      <textarea
                        aria-label="Email Draft"
                        title="Email Draft"
                        className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto mb-2 focus:outline-none focus:ring-1 focus:ring-brand resize-none"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        rows={6}
                      />
                      <button
                        onClick={() => { navigator.clipboard.writeText(emailDraft); alert("Copied to clipboard!"); }}
                        className="text-xs text-brand font-medium hover:underline flex items-center gap-1 w-full justify-center bg-brand/5 py-2 rounded-lg"
                      >
                        <Mail className="w-3 h-3" /> Copy Draft
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => { setShowWhatsAppComposer((prev) => !prev); setWhatsAppResult(null); }}
                    disabled={!lead.phone}
                    title={!lead.phone ? t("integrations.waNoPhone", "This customer has no phone number") : undefined}
                    className="w-full mt-2 bg-emerald-600 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    {t("integrations.waSend", "Send WhatsApp Message")}
                  </button>

                  {showWhatsAppComposer && (
                    <div className="mt-3 text-end">
                      <textarea
                        aria-label="WhatsApp Message"
                        placeholder={t("integrations.waPlaceholder", "Type your message here...")}
                        className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm text-slate-700 mb-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                        value={whatsAppMessage}
                        onChange={(e) => setWhatsAppMessage(e.target.value)}
                        rows={4}
                      />
                      <button
                        onClick={sendWhatsAppMessage}
                        disabled={sendingWhatsApp || !whatsAppMessage.trim()}
                        className="text-xs font-medium flex items-center gap-1 w-full justify-center bg-emerald-50 text-emerald-700 py-2 rounded-lg hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="w-3 h-3" /> {sendingWhatsApp ? t("integrations.waSending", "Sending...") : t("integrations.waSendNow", "Send Now")}
                      </button>
                      {whatsAppResult && (
                        <p className={`text-xs mt-2 ${whatsAppResult.ok ? "text-emerald-600" : "text-red-600"}`}>
                          {whatsAppResult.text}
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => { setShowTicketComposer((prev) => !prev); setTicketResult(null); }}
                    className="w-full mt-2 bg-amber-500 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-amber-600 transition-colors"
                  >
                    <LifeBuoy className="w-4 h-4" />
                    {t("integrations.zendeskCreate", "Create Zendesk Ticket")}
                  </button>

                  {showTicketComposer && (
                    <div className="mt-3 text-end">
                      <input
                        aria-label="Ticket Subject"
                        type="text"
                        placeholder={t("integrations.zendeskSubjectPlaceholder", "Ticket subject")}
                        className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-slate-700 mb-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        value={ticketSubject}
                        onChange={(e) => setTicketSubject(e.target.value)}
                      />
                      <textarea
                        aria-label="Ticket Description"
                        placeholder={t("integrations.zendeskDescPlaceholder", "Describe the issue or request...")}
                        className="w-full bg-slate-50 border border-slate-200 p-3 rounded-lg text-sm text-slate-700 mb-2 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
                        value={ticketDescription}
                        onChange={(e) => setTicketDescription(e.target.value)}
                        rows={3}
                      />
                      <button
                        onClick={createZendeskTicket}
                        disabled={creatingTicket || !ticketSubject.trim() || !ticketDescription.trim()}
                        className="text-xs font-medium flex items-center gap-1 w-full justify-center bg-amber-50 text-amber-700 py-2 rounded-lg hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Ticket className="w-3 h-3" /> {creatingTicket ? t("integrations.zendeskCreating", "Creating...") : t("integrations.zendeskCreateBtn", "Create Ticket")}
                      </button>
                      {ticketResult && (
                        <p className={`text-xs mt-2 ${ticketResult.ok ? "text-emerald-600" : "text-red-600"}`}>
                          {ticketResult.text}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-semibold text-slate-800 mb-4">Quick Stats</h3>
                  <ul className="space-y-4">
                    <li className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><MessageSquare className="w-4 h-4"/></div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">12 conversations</p>
                        <p className="text-xs text-slate-500">Total Messages</p>
                      </div>
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center"><Ticket className="w-4 h-4"/></div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">2 Support Tickets</p>
                        <p className="text-xs text-slate-500">1 currently open</p>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <div className="space-y-6 relative before:absolute before:inset-0 before:ms-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
                
                {/* Timeline Item */}
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-brand text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-200 shadow-sm bg-white">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-slate-800 text-sm">Sales Automation</h4>
                      <span className="text-xs text-slate-400">Today 10:00 AM</span>
                    </div>
                    <p className="text-sm text-slate-600">Welcome message sent automatically and lead moved to the &quot;Contacted&quot; stage.</p>
                  </div>
                </div>

                {/* Timeline Item */}
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-slate-100 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-slate-200 shadow-sm bg-white">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-bold text-slate-800 text-sm">Initial Inquiry</h4>
                      <span className="text-xs text-slate-400">Yesterday 2:30 PM</span>
                    </div>
                    <p className="text-sm text-slate-600">Client sent an email requesting a quote for managed hosting services.</p>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === "invoices" && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-semibold text-slate-800">Associated Invoices</h3>
              </div>
              <div className="p-6 flex flex-col items-center justify-center text-slate-500">
                <Receipt className="w-12 h-12 text-slate-300 mb-3" />
                <p>No linked invoices for this client yet.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
