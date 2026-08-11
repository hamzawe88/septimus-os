"use client"

import Image from "next/image"
import React, { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle,
  Eye,
  FileText,
  GitBranch,
  QrCode,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Stamp,
  X,
} from "lucide-react"

import { useLocalization } from "@/contexts/LocalizationContext"
import { useBranding } from "@/lib/useBranding"
import { sanitizeHtml } from "@/lib/sanitizeHtml"
import { useCorrespondenceStore } from "@/store/useCorrespondenceStore"
import { ProvenanceSurface } from "@/components/ui/provenance"

type Feedback = { tone: "success" | "error"; message: string } | null

// Company identity comes from the workspace branding API — see useBranding.
// It used to be read from this browser's localStorage, so a letterhead was
// blank for every user except the one who typed it, and the uploaded logo was
// never on the letter at all.

export const LetterCanvas: React.FC = () => {
  const { t, formatDate } = useLocalization()
  const {
    templates,
    fetchTemplates,
    selectedCorrespondence,
    createCorrespondence,
    signCorrespondence,
    forwardCorrespondence,
    archiveCorrespondence,
    aiRewrite,
    aiAudit,
    loading,
  } = useCorrespondenceStore()

  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [templateId, setTemplateId] = useState("")
  const [confidentiality, setConfidentiality] = useState("public")
  const [urgent, setUrgent] = useState(false)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [serialNumber, setSerialNumber] = useState("")
  const [status, setStatus] = useState("draft")
  const [qrCode, setQrCode] = useState("")
  const [signedAt, setSignedAt] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [auditScore, setAuditScore] = useState<number | null>(null)
  const [auditRisks, setAuditRisks] = useState<string[]>([])
  const [auditSuggestions, setAuditSuggestions] = useState<string[]>([])
  const [rewriteSuggestions, setRewriteSuggestions] = useState<string[]>([])
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [toUserId, setToUserId] = useState("")
  const [toNodePath, setToNodePath] = useState("top.ministry.diwan.legal")
  const [forwardNote, setForwardNote] = useState("")
  const [actionRequired, setActionRequired] = useState("review_and_endorse")
  const [feedback, setFeedback] = useState<Feedback>(null)
  const { branding } = useBranding()
  const company = {
    name: branding.company_name,
    nameEn: branding.company_name_en,
    address: branding.address,
    logo: branding.logo_url,
  }

  const resetAiOutput = useCallback(() => {
    setAuditScore(null)
    setAuditRisks([])
    setAuditSuggestions([])
    setRewriteSuggestions([])
  }, [])

  const handleCreateNew = useCallback(() => {
    setCurrentId(null)
    setTitle("")
    setContent("")
    setTemplateId(templates[0]?.id ?? "")
    setConfidentiality("public")
    setUrgent(false)
    setSerialNumber("")
    setStatus("draft")
    setQrCode("")
    setSignedAt("")
    setFeedback(null)
    resetAiOutput()
  }, [resetAiOutput, templates])

  useEffect(() => {
    void fetchTemplates()
  }, [fetchTemplates])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      if (selectedCorrespondence) {
        setCurrentId(selectedCorrespondence.id)
        setTitle(selectedCorrespondence.title ?? "")
        setContent(selectedCorrespondence.content ?? "")
        setTemplateId(selectedCorrespondence.template_id ?? "")
        setConfidentiality(selectedCorrespondence.confidentiality || "public")
        setUrgent(Boolean(selectedCorrespondence.urgent))
        setSerialNumber(selectedCorrespondence.serial_number ?? "")
        setStatus(selectedCorrespondence.status || "draft")
        setQrCode(selectedCorrespondence.qr_code ?? "")
        setSignedAt(selectedCorrespondence.signed_at ?? "")
        setFeedback(null)
        resetAiOutput()
      } else {
        handleCreateNew()
      }
    })
    return () => {
      cancelled = true
    }
  }, [handleCreateNew, resetAiOutput, selectedCorrespondence])

  const handleSaveDraft = async (): Promise<string | null> => {
    if (!title.trim() || !content.trim()) {
      setFeedback({ tone: "error", message: t("correspondence.editor.validationRequired") })
      return null
    }
    try {
      const saved = await createCorrespondence({
        title: title.trim(),
        content: content.trim(),
        template_id: templateId || templates[0]?.id,
        confidentiality,
        urgent,
        status: "pending_signature",
      })
      setCurrentId(saved.id)
      setSerialNumber(saved.serial_number ?? "")
      setStatus(saved.status || "pending_signature")
      setFeedback({ tone: "success", message: t("correspondence.editor.saved") })
      return saved.id
    } catch (error) {
      console.error("Save letter failed:", error)
      setFeedback({ tone: "error", message: t("correspondence.editor.saveFailed") })
      return null
    }
  }

  const handleAiRewrite = async () => {
    if (!title.trim() || !content.trim()) return
    setAiLoading(true)
    setFeedback(null)
    try {
      const result = await aiRewrite(title, content, "formal_institutional")
      if (!result.rewritten_title || !result.rewritten_content) {
        throw new Error("AI rewrite response is incomplete")
      }
      setTitle(result.rewritten_title)
      setContent(result.rewritten_content)
      setRewriteSuggestions(result.suggestions ?? [])
      setFeedback({ tone: "success", message: t("correspondence.editor.rewriteReady") })
    } catch (error) {
      console.error("AI rewrite failed:", error)
      setFeedback({ tone: "error", message: t("correspondence.editor.aiFailed") })
    } finally {
      setAiLoading(false)
    }
  }

  const handleAiAudit = async () => {
    if (!title.trim() || !content.trim()) return
    setAiLoading(true)
    setFeedback(null)
    resetAiOutput()
    try {
      const result = await aiAudit(title, content)
      if (!Number.isFinite(result.compliance_score)) {
        throw new Error("AI audit response does not contain a score")
      }
      setAuditScore(result.compliance_score)
      setAuditRisks(result.legal_risks ?? [])
      setAuditSuggestions(result.formatting_suggestions ?? [])
    } catch (error) {
      console.error("AI audit failed:", error)
      setFeedback({ tone: "error", message: t("correspondence.editor.aiFailed") })
    } finally {
      setAiLoading(false)
    }
  }

  const handleSignAndSeal = async () => {
    const targetId = currentId ?? (await handleSaveDraft())
    if (!targetId) return
    try {
      const result = await signCorrespondence(targetId)
      if (!result.qr_code || !result.signed_at) {
        throw new Error("Seal response is incomplete")
      }
      setStatus("signed")
      setQrCode(result.qr_code)
      setSignedAt(result.signed_at)
      setFeedback({ tone: "success", message: t("correspondence.editor.sealed") })
    } catch (error) {
      console.error("Sign and seal failed:", error)
      setFeedback({ tone: "error", message: t("correspondence.editor.sealFailed") })
    }
  }

  const handleForward = async () => {
    if (!currentId || !toUserId.trim()) {
      setFeedback({ tone: "error", message: t("correspondence.editor.forwardRecipientRequired") })
      return
    }
    try {
      await forwardCorrespondence(currentId, {
        to_user_id: toUserId.trim(),
        to_node_path: toNodePath,
        note: forwardNote.trim(),
        action_required: actionRequired,
      })
      setShowForwardModal(false)
      setFeedback({ tone: "success", message: t("correspondence.editor.forwarded") })
    } catch (error) {
      console.error("Forward failed:", error)
      setFeedback({ tone: "error", message: t("correspondence.editor.forwardFailed") })
    }
  }

  const handleArchive = async () => {
    if (!currentId) return
    try {
      await archiveCorrespondence(currentId)
      setStatus("archived")
      setFeedback({ tone: "success", message: t("correspondence.editor.archived") })
    } catch (error) {
      console.error("Archive failed:", error)
      setFeedback({ tone: "error", message: t("correspondence.editor.archiveFailed") })
    }
  }

  const activeTemplate = templates.find((template) => template.id === templateId) ?? templates[0]
  const statusLabel = t(`correspondence.editor.status.${status}`)
  const classificationLabel = t(`correspondence.editor.classification.${confidentiality}`)

  return (
    <div data-testid="correspondence-editor" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <section className="space-y-6 lg:col-span-7">
        <div className="rounded-[var(--radius-surface)] border border-border bg-card p-6 shadow-sm">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                <FileText className="size-5 text-brand" />
                {t("correspondence.editor.title")}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {currentId
                  ? `${t("correspondence.serialNumber")}: ${serialNumber || t("correspondence.editor.notAvailable")}`
                  : t("correspondence.editor.newDocument")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCreateNew}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent"
              >
                <RefreshCw className="size-4" />
                {t("correspondence.editor.new")}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveDraft()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                <Save className="size-4" />
                {t("correspondence.editor.saveAndIssue")}
              </button>
            </div>
          </header>

          {feedback && (
            <div
              role={feedback.tone === "error" ? "alert" : "status"}
              className={`mb-6 flex items-center gap-2 rounded-lg border p-3 text-xs font-semibold ${
                feedback.tone === "error"
                  ? "border-destructive/20 bg-destructive/10 text-destructive"
                  : "border-success/20 bg-success/10 text-success"
              }`}
            >
              {feedback.tone === "error" ? <AlertTriangle className="size-4" /> : <Check className="size-4" />}
              {feedback.message}
            </div>
          )}

          <div className="mb-6 space-y-3 rounded-[var(--radius-surface)] border border-brand/20 bg-brand-light p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-brand">
                <Sparkles className="size-4" />
                {t("correspondence.editor.aiAssistant")}
              </span>
              {aiLoading && <span className="text-xs text-brand">{t("correspondence.editor.processing")}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleAiRewrite()}
                disabled={aiLoading || !title.trim() || !content.trim()}
                className="inline-flex min-w-48 flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                <Sparkles className="size-4" />
                {t("correspondence.aiRewriteBtn")}
              </button>
              <button
                type="button"
                onClick={() => void handleAiAudit()}
                disabled={aiLoading || !title.trim() || !content.trim()}
                className="inline-flex min-w-48 flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2 text-xs font-semibold text-success-foreground disabled:opacity-50"
              >
                <ShieldCheck className="size-4" />
                {t("correspondence.aiAuditBtn")}
              </button>
            </div>

            {(auditScore !== null || rewriteSuggestions.length > 0) && (
              <ProvenanceSurface level="assumption">
                <p className="font-semibold">{t("correspondence.editor.aiProvenance")}</p>
                {auditScore !== null && (
                  <div className="mt-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{t("correspondence.editor.estimatedCompliance")}</span>
                      <span className="rounded-full bg-warning/15 px-2 py-1 font-bold text-warning">
                        {auditScore}%
                      </span>
                    </div>
                    {auditRisks.map((risk, index) => (
                      <p key={`risk-${index}`} className="flex items-start gap-2 text-muted-foreground">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                        {risk}
                      </p>
                    ))}
                    {auditSuggestions.map((suggestion, index) => (
                      <p key={`suggestion-${index}`} className="flex items-start gap-2 text-muted-foreground">
                        <CheckCircle className="mt-0.5 size-4 shrink-0 text-success" />
                        {suggestion}
                      </p>
                    ))}
                  </div>
                )}
                {rewriteSuggestions.length > 0 && (
                  <div className="mt-3 space-y-1 border-t border-brand/20 pt-3">
                    <p className="font-semibold">{t("correspondence.editor.rewriteNotes")}</p>
                    {rewriteSuggestions.map((note, index) => (
                      <p key={`rewrite-${index}`} className="text-muted-foreground">• {note}</p>
                    ))}
                  </div>
                )}
              </ProvenanceSurface>
            )}
          </div>

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="space-y-2 text-xs font-bold text-foreground">
              <span>{t("correspondence.selectTemplate")}</span>
              <select
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium"
              >
                {templates.length === 0 && <option value="">{t("correspondence.editor.noTemplates")}</option>}
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name} ({template.type})</option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-xs font-bold text-foreground">
              <span>{t("correspondence.confidentiality")}</span>
              <select
                value={confidentiality}
                onChange={(event) => setConfidentiality(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 font-medium"
              >
                <option value="public">{t("correspondence.confPublic")}</option>
                <option value="confidential">{t("correspondence.confConfidential")}</option>
                <option value="top_secret">{t("correspondence.confTopSecret")}</option>
              </select>
            </label>

            <label className="flex items-center gap-3 pt-7 text-xs font-bold text-destructive">
              <input
                type="checkbox"
                checked={urgent}
                onChange={(event) => setUrgent(event.target.checked)}
                className="size-4 rounded border-border text-destructive"
              />
              <AlertTriangle className="size-4" />
              {t("correspondence.urgent")}
            </label>
          </div>

          <div className="space-y-4">
            <label className="block space-y-2 text-xs font-bold text-foreground">
              <span>{t("correspondence.letterTitle")}</span>
              <input
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  resetAiOutput()
                }}
                placeholder={t("correspondence.editor.titlePlaceholder")}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm"
              />
            </label>
            <label className="block space-y-2 text-xs font-bold text-foreground">
              <span>{t("correspondence.letterContent")}</span>
              <textarea
                rows={11}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value)
                  resetAiOutput()
                }}
                placeholder={t("correspondence.editor.contentPlaceholder")}
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm leading-relaxed"
              />
            </label>
          </div>

          <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-muted-foreground">{t("correspondence.statusLabel")}:</span>
              <span className="rounded-full bg-brand/10 px-3 py-1 font-bold text-brand">{statusLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowForwardModal(true)}
                disabled={!currentId}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-2 text-xs font-semibold text-foreground disabled:opacity-50"
              >
                <GitBranch className="size-4 text-brand" />
                {t("correspondence.forwardBtn")}
              </button>
              <button
                type="button"
                onClick={() => void handleSignAndSeal()}
                disabled={status === "signed" || status === "archived"}
                className="inline-flex items-center gap-2 rounded-lg bg-success px-4 py-2 text-xs font-bold text-success-foreground disabled:opacity-50"
              >
                <QrCode className="size-4" />
                {t("correspondence.signAndSealBtn")}
              </button>
              <button
                type="button"
                onClick={() => void handleArchive()}
                disabled={status !== "signed"}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                <Archive className="size-4" />
                {t("correspondence.archiveBtn")}
              </button>
            </div>
          </footer>
        </div>
      </section>

      <aside className="space-y-4 lg:col-span-5">
        <div className="sticky top-6 rounded-[var(--radius-surface)] border border-border bg-card p-6 shadow-sm">
          <header className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
            <span className="flex items-center gap-2 text-xs font-bold uppercase text-muted-foreground">
              <Eye className="size-4 text-brand" />
              {t("correspondence.editor.livePreview")}
            </span>
            <span className="rounded border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] font-bold text-warning">
              {t("correspondence.editor.previewOnly")}
            </span>
          </header>

          <div
            style={{
              fontFamily: activeTemplate?.layout_config?.font_family || "Cairo, sans-serif",
              color: activeTemplate?.layout_config?.font_color || "var(--color-ink)",
            }}
            className="relative flex min-h-[580px] flex-col justify-between overflow-hidden rounded-lg border border-border bg-[var(--color-paper-raised)] p-7 text-[var(--color-ink)] shadow-lg"
          >
            <div>
              {activeTemplate?.header_html ? (
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(activeTemplate.header_html) }} />
              ) : (
                <div className="mb-4 flex items-center justify-center gap-3 border-b-2 border-brand pb-3 text-center">
                  {company.logo && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={company.logo}
                      alt={company.name || t("correspondence.editor.previewOrganization")}
                      className="h-12 w-12 flex-shrink-0 object-contain"
                    />
                  )}
                  <div>
                    <h2 className="m-0 text-base font-bold">
                      {company.name || t("correspondence.editor.previewOrganization")}
                    </h2>
                    <p className="m-0 text-[11px] text-muted-foreground">
                      {company.address || t("correspondence.editor.previewHeader")}
                    </p>
                  </div>
                </div>
              )}

              <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-[11px] text-muted-foreground">
                <span>{t("correspondence.serialNumber")}: <strong>{serialNumber || t("correspondence.editor.unissued")}</strong></span>
                <span>{t("correspondence.editor.date")}: {formatDate(new Date())}</span>
                <span>{t("correspondence.confidentiality")}: <strong>{classificationLabel}</strong></span>
              </div>

              <h3
                style={{
                  fontSize: `${Math.max(14, (activeTemplate?.layout_config?.font_size_body || 14) + 2)}px`,
                  fontWeight: activeTemplate?.layout_config?.font_weight === "black"
                    ? 900
                    : activeTemplate?.layout_config?.font_weight === "bold" ? 700 : 600,
                }}
                className="mb-5 text-center underline decoration-border underline-offset-4"
              >
                {title || t("correspondence.editor.previewSubject")}
              </h3>
              <div
                style={{
                  fontSize: `${activeTemplate?.layout_config?.font_size_body || 14}px`,
                  fontWeight: activeTemplate?.layout_config?.font_weight === "medium" ? 500 : 400,
                  fontStyle: activeTemplate?.layout_config?.font_style || "normal",
                }}
                className="whitespace-pre-wrap text-start leading-relaxed"
              >
                {content || t("correspondence.editor.previewBody")}
              </div>
            </div>

            <footer className="mt-8 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 rounded border border-border bg-muted p-3">
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-[var(--color-paper-raised)]">
                    {qrCode ? (
                      <Image src={qrCode} alt={t("correspondence.editor.qrAlt")} width={56} height={56} unoptimized />
                    ) : (
                      <QrCode className="size-9 text-muted-foreground" />
                    )}
                  </div>
                  <div className="text-[10px]">
                    <p className="flex items-center gap-1 font-bold">
                      <Stamp className="size-3 text-success" />
                      {qrCode ? t("correspondence.editor.sealMetadataAvailable") : t("correspondence.editor.sealPending")}
                    </p>
                    <p className="text-muted-foreground">{t("correspondence.editor.verifyWithPayload")}</p>
                    {signedAt && <p className="mt-1 font-mono text-brand">{formatDate(signedAt)}</p>}
                  </div>
                </div>
                <div className="text-end text-[11px] text-muted-foreground">
                  <p className="font-bold text-foreground">{company.nameEn || company.name || t("correspondence.editor.previewOrganization")}</p>
                  <p>{t("correspondence.editor.previewDocument")}</p>
                </div>
              </div>
              {activeTemplate?.footer_html ? (
                <div className="mt-3 text-center text-[10px]" dangerouslySetInnerHTML={{ __html: sanitizeHtml(activeTemplate.footer_html) }} />
              ) : (
                <p className="mt-3 text-center text-[10px] text-muted-foreground">{t("correspondence.editor.previewFooter")}</p>
              )}
            </footer>
          </div>
        </div>
      </aside>

      {showForwardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="forward-title" className="w-full max-w-lg space-y-4 rounded-[var(--radius-surface)] border border-border bg-card p-6 shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <h4 id="forward-title" className="flex items-center gap-2 font-bold text-foreground">
                <GitBranch className="size-5 text-brand" />
                {t("correspondence.editor.forwardTitle")}
              </h4>
              <button type="button" onClick={() => setShowForwardModal(false)} aria-label={t("common.close")} className="rounded p-1 text-muted-foreground hover:bg-muted">
                <X className="size-4" />
              </button>
            </header>

            <div className="space-y-4 text-xs">
              <label className="block space-y-2 font-bold text-foreground">
                <span>{t("correspondence.forwardNodePath")}</span>
                <select value={toNodePath} onChange={(event) => setToNodePath(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono">
                  <option value="top.ministry.diwan.legal">{t("correspondence.editor.routes.legal")}</option>
                  <option value="top.ministry.diwan.exec">{t("correspondence.editor.routes.executive")}</option>
                  <option value="top.ministry.finance.budget">{t("correspondence.editor.routes.finance")}</option>
                  <option value="top.ministry.hr.personnel">{t("correspondence.editor.routes.hr")}</option>
                </select>
              </label>
              <label className="block space-y-2 font-bold text-foreground">
                <span>{t("correspondence.forwardToUser")}</span>
                <input value={toUserId} onChange={(event) => setToUserId(event.target.value)} placeholder={t("correspondence.editor.recipientPlaceholder")} className="w-full rounded-lg border border-border bg-background px-3 py-2" />
              </label>
              <label className="block space-y-2 font-bold text-foreground">
                <span>{t("correspondence.actionRequired")}</span>
                <select value={actionRequired} onChange={(event) => setActionRequired(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2">
                  <option value="review_and_endorse">{t("correspondence.editor.actions.review")}</option>
                  <option value="for_information">{t("correspondence.editor.actions.information")}</option>
                  <option value="urgent_action">{t("correspondence.editor.actions.urgent")}</option>
                </select>
              </label>
              <label className="block space-y-2 font-bold text-foreground">
                <span>{t("correspondence.forwardNote")}</span>
                <textarea rows={3} value={forwardNote} onChange={(event) => setForwardNote(event.target.value)} placeholder={t("correspondence.editor.notePlaceholder")} className="w-full rounded-lg border border-border bg-background px-3 py-2" />
              </label>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <button type="button" onClick={() => setShowForwardModal(false)} className="rounded-lg border border-border bg-muted px-4 py-2 text-xs font-semibold">{t("common.cancel")}</button>
              <button type="button" onClick={() => void handleForward()} className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2 text-xs font-bold text-primary-foreground">
                <Send className="size-4" />
                {t("correspondence.editor.executeForward")}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}
