"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useState } from "react";
import { X, Mail, Phone, Building, Receipt, Clock, Ticket, Sparkles, Send, LifeBuoy } from "lucide-react";
import { apiGet, apiPost, AI_BASE_URL, fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";
import { EmptyState } from "@/components/ui/empty-state";
import { ProvenanceBadge, ProvenanceSurface } from "@/components/ui/provenance";

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
  const { t, language } = useLocalization();
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "invoices">("overview");
	const [customer360, setCustomer360] = useState<any>(null);
	const [note, setNote] = useState("");
	const [savingNote, setSavingNote] = useState(false);

  const [drafting, setDrafting] = useState(false);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [emailDraftError, setEmailDraftError] = useState<string | null>(null);
  const [draftCopied, setDraftCopied] = useState(false);

  const [showWhatsAppComposer, setShowWhatsAppComposer] = useState(false);
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [whatsAppResult, setWhatsAppResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [showTicketComposer, setShowTicketComposer] = useState(false);
  const [ticketSubject, setTicketSubject] = useState(
    `${t("crm.customer360.supportRequest")} — ${lead.name} (${lead.company})`,
  );
  const [ticketDescription, setTicketDescription] = useState("");
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [ticketResult, setTicketResult] = useState<{ ok: boolean; text: string } | null>(null);

	const loadCustomer360 = async () => {
	  try {
		setCustomer360(await apiGet(`/crm/opportunities/${lead.id}/customer-360`));
	  } catch (error) {
		console.error("Failed to load Customer 360", error);
	  }
	};

	const saveNote = async () => {
	  if (!note.trim()) return;
	  setSavingNote(true);
	  try {
		await apiPost(`/crm/opportunities/${lead.id}/activities`, {
		  subject: note.trim().slice(0, 120), activity_type: "note", status: "completed", notes: note.trim(),
		});
		setNote("");
		await loadCustomer360();
	  } finally {
		setSavingNote(false);
	  }
	};

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
        setTicketResult({ ok: true, text: `${t("integrations.zendeskSuccess")} (#${data.ticket_id})` });
        setTicketDescription("");
      } else {
        setTicketResult({ ok: false, text: data.error || t("integrations.zendeskFailed") });
      }
    } catch (err) {
      setTicketResult({ ok: false, text: err instanceof Error ? err.message : t("common.unexpectedError") });
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
        setWhatsAppResult({ ok: true, text: t("integrations.waSuccess") });
        setWhatsAppMessage("");
      } else {
        setWhatsAppResult({ ok: false, text: data.error || t("integrations.waFailed") });
      }
    } catch (err) {
      setWhatsAppResult({ ok: false, text: err instanceof Error ? err.message : t("common.unexpectedError") });
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const generateEmailDraft = async () => {
    setDrafting(true);
    setEmailDraft(null);
    setEmailDraftError(null);
    setDraftCopied(false);
    try {
      const response = await apiPost<{reply: string}>('/ai/chat', {
        agent_type: 'crm',
        message: t("crm.customer360.emailPrompt"),
        context: {
          purpose: "crm_email_draft",
          entity_ref: { definition_key: "crm_opportunity", record_id: lead.id },
          lang: language,
        },
      }, AI_BASE_URL);
      setEmailDraft(response.reply);
    } catch (err) {
      console.error(err);
      setEmailDraftError(t("crm.customer360.emailDraftFailed"));
    } finally {
      setDrafting(false);
    }
  };

  // Prevent background scrolling
  useEffect(() => {
	const loadTimer = window.setTimeout(() => void loadCustomer360(), 0);
    document.body.style.overflow = "hidden";
    return () => {
	  window.clearTimeout(loadTimer);
      document.body.style.overflow = "auto";
    };
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [lead.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ink)]/40 p-4 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

        {/* Header */}
		<div className="flex items-start justify-between gap-3 border-b border-border bg-muted px-4 py-4 sm:px-6">
		  <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 rounded-full bg-brand/10 text-brand flex items-center justify-center text-xl font-bold">
              {lead.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                {lead.name}
                {lead.score && lead.score > 80 && (
                  <span className="flex items-center gap-1 text-xs font-bold bg-warning/10 text-warning px-2 py-0.5 rounded-full" title={t("crm.customer360.hotLead")}>
                    <Sparkles className="w-3 h-3" />
                    {t("crm.customer360.hotLead")} {lead.score}%
                  </span>
                )}
              </h2>
			  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground sm:gap-3">
                <span className="flex items-center gap-1"><Building className="w-3 h-3"/> {lead.company}</span>
                <span className="flex items-center gap-1"><Mail className="w-3 h-3"/> {lead.email}</span>
                <span className="flex items-center gap-1"><Phone className="w-3 h-3"/> {lead.phone}</span>
              </div>
            </div>
          </div>
          <button
            title={t("common.close")}
            aria-label={t("common.close")}
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-muted-foreground hover:bg-muted rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 border-b border-border bg-card">
          <button
            onClick={() => setActiveTab("overview")}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "overview" ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t("crm.c360Overview")}
          </button>
          <button
            onClick={() => setActiveTab("timeline")}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "timeline" ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t("crm.c360Timeline")}
          </button>
          <button
            onClick={() => setActiveTab("invoices")}
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "invoices" ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t("crm.c360Invoices")}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-muted/50">
          {activeTab === "overview" && (
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
			  <div className="space-y-6 lg:col-span-2">
                <div className="bg-card p-5 rounded-xl border border-border shadow-sm">
                  <h3 className="font-semibold text-foreground mb-4">{t("crm.customer360.dealDetails")}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">{t("crm.customer360.dealValue")}</p>
                      <p className="font-bold text-success text-lg">${lead.value.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">{t("crm.customer360.currentStage")}</p>
                      <p className="font-bold text-foreground">{lead.status}</p>
                    </div>
                    {lead.score !== undefined && (
                      <div className="p-3 bg-muted rounded-lg col-span-2">
                        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-brand" />
                          {t("crm.aiLeadScore")}
                          <ProvenanceBadge level="assumption" />
                        </p>
                        <progress
                          value={lead.score}
                          max="100"
                          className={`w-full h-2.5 rounded-full [&::-webkit-progress-bar]:bg-muted [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full ${lead.score > 70 ? '[&::-webkit-progress-value]:bg-success [&::-moz-progress-bar]:bg-success text-success' : lead.score > 40 ? '[&::-webkit-progress-value]:bg-warning [&::-moz-progress-bar]:bg-warning text-warning' : '[&::-webkit-progress-value]:bg-destructive [&::-moz-progress-bar]:bg-destructive text-destructive'}`}
                        />
                        <p className="text-xs text-muted-foreground mt-1">{lead.score}% {t("crm.customer360.closingProbability")}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-card p-5 rounded-xl border border-border shadow-sm">
                  <h3 className="font-semibold text-foreground mb-4">{t("crm.customer360.notes")}</h3>
				  <div className="space-y-3">
					{(customer360?.activities || []).filter((activity: any) => activity.data?.activity_type === "note").map((activity: any) => (
					  <div key={activity.id} className="rounded-lg border border-border bg-muted p-3">
						<p className="text-sm text-foreground whitespace-pre-wrap">{activity.data?.notes || activity.data?.subject}</p>
						<p className="mt-1 text-xs text-muted-foreground">{new Date(activity.created_at).toLocaleString(language === "ar" ? "ar-SA" : "en-US")}</p>
					  </div>
					))}
					{!(customer360?.activities || []).some((activity: any) => activity.data?.activity_type === "note") && (
					  <EmptyState title={t("crm.customer360.noNotes")} description={t("crm.customer360.noNotesDescription")} />
					)}
					<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} maxLength={10000}
					  aria-label={t("crm.customer360.notes")} className="w-full resize-none rounded-lg border border-border bg-card p-3 text-sm" />
					<button type="button" onClick={saveNote} disabled={savingNote || !note.trim()}
					  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-50">
					  {savingNote ? t("common.saving") : t("common.save")}
					</button>
				  </div>
                </div>
              </div>

			  <div className="space-y-6 lg:col-span-1">
                <div className="bg-card p-5 rounded-xl border border-border shadow-sm text-center">
                  <h3 className="font-semibold text-foreground mb-3 text-end">{t("crm.customer360.aiActions")}</h3>
                  <button
                    onClick={generateEmailDraft}
                    disabled={drafting}
                    className="w-full bg-brand text-brand-foreground py-2 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-brand-hover transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    {drafting ? t("crm.customer360.generating") : t("crm.customer360.generateEmail")}
                  </button>

                  {emailDraft && (
                    <ProvenanceSurface level="assumption" className="mt-4 text-start">
                      <textarea
                        aria-label={t("crm.customer360.emailDraft")}
                        title={t("crm.customer360.emailDraft")}
                        className="w-full bg-muted border border-border p-3 rounded-lg text-sm text-foreground whitespace-pre-wrap max-h-48 overflow-y-auto mb-2 focus:outline-none focus:ring-1 focus:ring-brand resize-none"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        rows={6}
                      />
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(emailDraft);
                          setDraftCopied(true);
                        }}
                        className="text-xs text-brand font-medium hover:underline flex items-center gap-1 w-full justify-center bg-brand/5 py-2 rounded-lg"
                      >
                        <Mail className="w-3 h-3" /> {draftCopied ? t("common.copied") : t("crm.customer360.copyDraft")}
                      </button>
                      <p className="text-xs text-muted-foreground">{t("crm.customer360.emailProvenance")}</p>
                    </ProvenanceSurface>
                  )}
                  {emailDraftError ? (
                    <p className="mt-3 text-xs text-destructive">{emailDraftError}</p>
                  ) : null}

                  <button
                    onClick={() => { setShowWhatsAppComposer((prev) => !prev); setWhatsAppResult(null); }}
                    disabled={!lead.phone}
                    title={!lead.phone ? t("integrations.waNoPhone") : undefined}
                    className="w-full mt-2 bg-success text-background py-2 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-success/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    {t("integrations.waSend")}
                  </button>

                  {showWhatsAppComposer && (
                    <div className="mt-3 text-end">
                      <textarea
                        aria-label="WhatsApp Message"
                        placeholder={t("integrations.waPlaceholder")}
                        className="w-full bg-muted border border-border p-3 rounded-lg text-sm text-foreground mb-2 focus:outline-none focus:ring-1 focus:ring-success/30 resize-none"
                        value={whatsAppMessage}
                        onChange={(e) => setWhatsAppMessage(e.target.value)}
                        rows={4}
                      />
                      <button
                        onClick={sendWhatsAppMessage}
                        disabled={sendingWhatsApp || !whatsAppMessage.trim()}
                        className="text-xs font-medium flex items-center gap-1 w-full justify-center bg-success/10 text-success py-2 rounded-lg hover:bg-success/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Send className="w-3 h-3" /> {sendingWhatsApp ? t("integrations.waSending") : t("integrations.waSendNow")}
                      </button>
                      {whatsAppResult && (
                        <p className={`text-xs mt-2 ${whatsAppResult.ok ? "text-success" : "text-destructive"}`}>
                          {whatsAppResult.text}
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => { setShowTicketComposer((prev) => !prev); setTicketResult(null); }}
                    className="w-full mt-2 bg-warning text-background py-2 px-4 rounded-lg flex items-center justify-center gap-2 hover:bg-warning/90 transition-colors"
                  >
                    <LifeBuoy className="w-4 h-4" />
                    {t("integrations.zendeskCreate")}
                  </button>

                  {showTicketComposer && (
                    <div className="mt-3 text-end">
                      <input
                        aria-label="Ticket Subject"
                        type="text"
                        placeholder={t("integrations.zendeskSubjectPlaceholder")}
                        className="w-full bg-muted border border-border p-2.5 rounded-lg text-sm text-foreground mb-2 focus:outline-none focus:ring-1 focus:ring-warning/30"
                        value={ticketSubject}
                        onChange={(e) => setTicketSubject(e.target.value)}
                      />
                      <textarea
                        aria-label="Ticket Description"
                        placeholder={t("integrations.zendeskDescPlaceholder")}
                        className="w-full bg-muted border border-border p-3 rounded-lg text-sm text-foreground mb-2 focus:outline-none focus:ring-1 focus:ring-warning/30 resize-none"
                        value={ticketDescription}
                        onChange={(e) => setTicketDescription(e.target.value)}
                        rows={3}
                      />
                      <button
                        onClick={createZendeskTicket}
                        disabled={creatingTicket || !ticketSubject.trim() || !ticketDescription.trim()}
                        className="text-xs font-medium flex items-center gap-1 w-full justify-center bg-warning/10 text-warning py-2 rounded-lg hover:bg-warning/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Ticket className="w-3 h-3" /> {creatingTicket ? t("integrations.zendeskCreating") : t("integrations.zendeskCreateBtn")}
                      </button>
                      {ticketResult && (
                        <p className={`text-xs mt-2 ${ticketResult.ok ? "text-success" : "text-destructive"}`}>
                          {ticketResult.text}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-card p-5 rounded-xl border border-border shadow-sm">
                  <h3 className="font-semibold text-foreground mb-4">{t("crm.customer360.quickStats")}</h3>
				  <dl className="space-y-3 text-sm">
					<div className="flex justify-between"><dt>{t("crm.c360Timeline")}</dt><dd className="font-bold">{customer360?.activities?.length || 0}</dd></div>
					<div className="flex justify-between"><dt>{t("crm.ticketsTitle")}</dt><dd className="font-bold">{customer360?.tickets?.length || 0}</dd></div>
					<div className="flex justify-between"><dt>{t("crm.quote")}</dt><dd className="font-bold">{customer360?.quotes?.length || 0}</dd></div>
				  </dl>
                </div>
              </div>
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="bg-card p-6 rounded-xl border border-border shadow-sm">
			  {(customer360?.activities || []).length === 0 ? <EmptyState
				icon={<Clock />} title={t("crm.customer360.noTimeline")} description={t("crm.customer360.noTimelineDescription")}
			  /> : <div className="space-y-4">{customer360.activities.map((activity: any) => (
				<div key={activity.id} className="border-s-2 border-brand ps-4">
				  <p className="font-semibold text-foreground">{activity.data?.subject}</p>
				  <p className="text-sm text-muted-foreground">{activity.data?.notes}</p>
				  <p className="text-xs text-muted-foreground">{new Date(activity.created_at).toLocaleString(language === "ar" ? "ar-SA" : "en-US")}</p>
				</div>
			  ))}</div>}
            </div>
          )}

          {activeTab === "invoices" && (
            <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="p-4 bg-muted border-b border-border flex justify-between items-center">
                <h3 className="font-semibold text-foreground">{t("crm.customer360.associatedInvoices")}</h3>
              </div>
			  {(customer360?.quotes || []).length === 0 ? <div className="p-6 flex flex-col items-center justify-center text-muted-foreground">
				<Receipt className="w-12 h-12 text-muted-foreground mb-3" /><p>{t("crm.customer360.noInvoices")}</p>
			  </div> : <div className="divide-y divide-border">{customer360.quotes.map((quote: any) => (
				<div key={quote.id} className="flex items-center justify-between p-4">
				  <span className="font-medium">{quote.data?.quote_number}</span>
				  <span>{quote.data?.total} {quote.data?.currency}</span>
				</div>
			  ))}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
