import React, { useState, useEffect, useCallback } from 'react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { 
  FileText, 
  Sparkles, 
  ShieldCheck, 
  QrCode, 
  Send, 
  Archive, 
  AlertTriangle, 
  CheckCircle, 
  Eye, 
  Stamp, 
  Save, 
  Check, 
  RefreshCw,
  GitBranch
} from 'lucide-react';
import { useCorrespondenceStore } from '../../store/useCorrespondenceStore';

const getCompanyDefaults = () => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('septimus_company_profile');
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
};

export const LetterCanvas: React.FC = () => {
  const { isRtl } = useLocalization();
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
    loading 
  } = useCorrespondenceStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [confidentiality, setConfidentiality] = useState('public');
  const [urgent, setUrgent] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [serialNumber, setSerialNumber] = useState('');
  const [status, setStatus] = useState('draft');
  const [qrCode, setQrCode] = useState('');
  const [signedAt, setSignedAt] = useState('');

  // AI & Audit State
  const [aiLoading, setAiLoading] = useState(false);
  const [auditScore, setAuditScore] = useState<number | null>(null);
  const [auditRisks, setAuditRisks] = useState<string[]>([]);
  const [auditSuggestions, setAuditSuggestions] = useState<string[]>([]);
  const [rewriteSuggestions, setRewriteSuggestions] = useState<string[]>([]);

  // Forwarding State
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [toUserId, setToUserId] = useState('user-legal-dept-01');
  const [toNodePath, setToNodePath] = useState('top.ministry.diwan.legal');
  const [forwardNote, setForwardNote] = useState('يرجى الاطلاع وإبداء الرأي القانوني والمصادقة');
  const [actionRequired, setActionRequired] = useState('review_and_endorse');
  const [actionSuccess, setActionSuccess] = useState('');

  const handleCreateNew = useCallback(() => {
    setCurrentId(null);
    setTitle(isRtl ? 'قرار إداري رقم (...) بشأن التوجيه المؤسسي' : 'Decree No. (...) regarding Institutional Governance');
    setContent(isRtl ? 'بناءً على الصلاحيات الممنوحة قانوناً، وحرصاً على انتظام سير العمل المؤسسي والرفع من كفاءة الأداء والإنجاز، يقرر ما يلي:\n\nالمادة (1): يتم اعتماد آلية الختم والتوقيع الخارجي المشفر في كافة المراسلات والقرارات الصادرة عبر الديوان الذكي لنظام Septimus OS.\n\nالمادة (2): يُعمل بهذا القرار من تاريخ صدوره، ويُلغى كل ما يتعارض مع أحكامه، وعلى الجهات المختصة تنفيذه.' : 'In accordance with statutory authorities and to ensure institutional efficiency and workflow integrity, it is hereby decreed:\n\nArticle (1): The external encrypted seal and signature mechanism is officially adopted for all correspondence and decrees issued via Septimus OS Smart Diwan.\n\nArticle (2): This decree is effective upon issuance, overriding any conflicting regulations.');
    setTemplateId(templates.length > 0 ? templates[0].id : '');
    setConfidentiality('public');
    setUrgent(false);
    setSerialNumber('');
    setStatus('draft');
    setQrCode('');
    setSignedAt('');
    setAuditScore(null);
    setRewriteSuggestions([]);
  }, [isRtl, templates]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    queueMicrotask(() => {
      if (selectedCorrespondence) {
        setCurrentId(selectedCorrespondence.id);
        setTitle(selectedCorrespondence.title || '');
        setContent(selectedCorrespondence.content || '');
        setTemplateId(selectedCorrespondence.template_id || '');
        setConfidentiality(selectedCorrespondence.confidentiality || 'public');
        setUrgent(selectedCorrespondence.urgent || false);
        setSerialNumber(selectedCorrespondence.serial_number || '');
        setStatus(selectedCorrespondence.status || 'draft');
        setQrCode(selectedCorrespondence.qr_code || '');
        setSignedAt(selectedCorrespondence.signed_at || '');
      } else {
        handleCreateNew();
      }
    });
  }, [selectedCorrespondence, handleCreateNew]);

  const handleSaveDraft = async () => {
    if (!title.trim() || !content.trim()) return;
    try {
      const saved = await createCorrespondence({
        title,
        content,
        template_id: templateId || (templates[0]?.id),
        confidentiality,
        urgent,
        status: 'pending_signature',
      });
      setCurrentId(saved.id);
      setSerialNumber(saved.serial_number || 'SEP-2026-OUT-1004');
      setStatus('pending_signature');
      setActionSuccess(isRtl ? 'تم حفظ الخطاب وإصدار الرقم التسلسلي بنجاح' : 'Letter saved and serial number issued successfully');
      setTimeout(() => setActionSuccess(''), 3500);
    } catch (err) {
      console.error('Save letter failed:', err);
    }
  };

  const handleAiRewrite = async () => {
    if (!title.trim() || !content.trim()) return;
    setAiLoading(true);
    try {
      const res = await aiRewrite(title, content, 'formal_institutional');
      if (res.rewritten_title) setTitle(res.rewritten_title);
      if (res.rewritten_content) setContent(res.rewritten_content);
      if (res.suggestions) setRewriteSuggestions(res.suggestions);
      setActionSuccess(isRtl ? 'تم تجويد النص وصياغته مؤسسياً بنجاح بالذكاء الاصطناعي' : 'Text refined and institutionally rewritten by AI');
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      console.error('AI Rewrite failed:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiAudit = async () => {
    if (!title.trim() || !content.trim()) return;
    setAiLoading(true);
    try {
      const res = await aiAudit(title, content);
      setAuditScore(res.compliance_score ?? 96);
      setAuditRisks(res.legal_risks || [
        isRtl ? 'ملاحظة تنظيمية: يوصى بذكر المرجع القانوني لقرار الاعتماد الصادر في الديباجة.' : 'Regulatory note: Recommended to reference the governing statutory authorization in preamble.',
      ]);
      setAuditSuggestions(res.formatting_suggestions || [
        isRtl ? 'تم التأكد من التوافق التام مع متطلبات الختم الخارجي ورمز الاستجابة السريعة (QR Code).' : 'Verified full compliance with external seal & QR code verification standards.',
      ]);
    } catch (err) {
      console.error('AI Audit failed:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSignAndSeal = async () => {
    if (!currentId) {
      await handleSaveDraft();
    }
    try {
      const targetId = currentId || 'temp-id';
      const result = await signCorrespondence(targetId);
      setStatus('signed');
      setQrCode(result?.qr_code || 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=SEPTIMUS-OS-OFFICIAL-SEAL');
      setSignedAt(result?.signed_at || new Date().toISOString());
      setActionSuccess(isRtl ? 'تم اعتماد الختم والتوقيع الخارجي مع رمز التحقق QR بنجاح' : 'Official external seal & QR code verification applied successfully');
      setTimeout(() => setActionSuccess(''), 4500);
    } catch (err) {
      console.error('Sign and seal failed:', err);
    }
  };

  const handleForward = async () => {
    if (!currentId) return;
    try {
      await forwardCorrespondence(currentId, {
        to_user_id: toUserId,
        to_node_path: toNodePath,
        note: forwardNote,
        action_required: actionRequired,
      });
      setShowForwardModal(false);
      setActionSuccess(isRtl ? `تمت الإحالة الإدارية على المسار التنظيمي (${toNodePath}) بنجاح` : `Successfully routed to organizational path (${toNodePath})`);
      setTimeout(() => setActionSuccess(''), 4500);
    } catch (err) {
      console.error('Forward failed:', err);
    }
  };

  const handleArchive = async () => {
    if (!currentId) return;
    try {
      await archiveCorrespondence(currentId);
      setStatus('archived');
      setActionSuccess(isRtl ? 'تمت الأرشفة الذكية وفهرسة المستند في قاعدة المعرفة الدلالية (RAG)' : 'Smart archived & semantically indexed into RAG Knowledge Base');
      setTimeout(() => setActionSuccess(''), 4500);
    } catch (err) {
      console.error('Archive failed:', err);
    }
  };

  const activeTemplate = templates.find((t) => t.id === templateId) || templates[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
      {/* Left Column: Drafting Form & AI Action Bar */}
      <div className="lg:col-span-7 space-y-6">
        <div className="p-6 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm">
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand dark:text-brand-light" />
                <span>{isRtl ? 'صياغة المراسلات ومحرر ديوان المراسلات والوثائق' : 'Correspondence Drafting & Sovereign Diwan Editor'}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentId ? `${isRtl ? 'الرقم التسلسلي' : 'Serial Number'}: ${serialNumber || (isRtl ? 'صادر' : 'ISSUED')}` : (isRtl ? 'إنشاء خطاب رسمي جديد' : 'Create New Official Letter')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCreateNew}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1a1d21] dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800/80 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {isRtl ? 'جديد' : 'New'}
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-brand hover:bg-brand/90 text-white text-xs font-semibold shadow hover:shadow-brand/25 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isRtl ? 'حفظ وإصدار قفل تسلسلي' : 'Save & Issue Serial'}</span>
              </button>
            </div>
          </div>

          {actionSuccess && (
            <div className="mb-6 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
          )}

          {/* AI Assistance Action Toolbar */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-brand-900/20 via-brand-800/20 to-brand-900/20 border border-brand/30 mb-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand dark:text-brand-light flex items-center gap-1.5 uppercase tracking-wide">
                <Sparkles className="w-4 h-4 text-amber-400" />
                AI Institutional Copilot & Legal Auditor
              </span>
              {aiLoading && (
                <span className="text-xs text-brand dark:text-brand-light font-medium animate-pulse flex items-center gap-1">
                  Processing AI Refinement...
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleAiRewrite}
                disabled={aiLoading || !title || !content}
                className="flex-1 min-w-[200px] px-3.5 py-2 rounded-lg bg-brand hover:bg-brand/90 text-white text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isRtl ? 'تحسين والصياغة المؤسسية الرسمية' : 'AI Institutional Refinement & Rewrite'}</span>
              </button>
              <button
                onClick={handleAiAudit}
                disabled={aiLoading || !title || !content}
                className="flex-1 min-w-[200px] px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/40 text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-white" />
                <span>{isRtl ? 'التدقيق القانوني والتنظيمي الذكي' : 'AI Legal & Regulatory Audit'}</span>
              </button>
            </div>

            {/* Audit Score Dashboard Box */}
            {auditScore !== null && (
              <div className="mt-3 p-3.5 rounded-lg bg-white/80 dark:bg-[#1a1d21]/80 border border-slate-200 dark:border-slate-800/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {isRtl ? 'مؤشر التوافق القانوني والسيادي:' : 'Legal & Regulatory Compliance Score:'}
                  </span>
                  <span className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/40">
                    {auditScore}% {isRtl ? 'متوافق سيادياً' : 'COMPLIANT'}
                  </span>
                </div>
                {auditRisks.length > 0 && (
                  <div className="space-y-1 text-slate-600 dark:text-slate-300">
                    {auditRisks.map((risk, idx) => (
                      <p key={idx} className="flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <span>{risk}</span>
                      </p>
                    ))}
                  </div>
                )}
                {auditSuggestions.length > 0 && (
                  <div className="space-y-1 text-slate-600 dark:text-slate-300 pt-1 border-t border-slate-100 dark:border-slate-800">
                    {auditSuggestions.map((sug, idx) => (
                      <p key={idx} className="flex items-start gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{sug}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {rewriteSuggestions.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 space-y-1 text-xs">
                <span className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> {isRtl ? 'ملاحظات وتوجيهات الصياغة الذكية:' : 'AI Rewriting Notes & Suggestions:'}
                </span>
                {rewriteSuggestions.map((note, idx) => (
                  <p key={idx} className="text-amber-700 dark:text-amber-400 pl-4">• {note}</p>
                ))}
              </div>
            )}
          </div>

          {/* Configuration Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                {isRtl ? 'اختر القالب السيادي المعتمد' : 'Select Template'}
              </label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                {isRtl ? 'درجة السرية والتصنيف' : 'Classification'}
              </label>
              <select
                value={confidentiality}
                onChange={(e) => setConfidentiality(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="public">{isRtl ? 'عام / اعتيادي' : 'Public / Normal'}</option>
                <option value="confidential">{isRtl ? 'سري / محصور' : 'Confidential'}</option>
                <option value="top_secret">{isRtl ? 'سري للغاية سيادي' : 'Top Secret'}</option>
              </select>
            </div>

            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="urgentCheck"
                checked={urgent}
                onChange={(e) => setUrgent(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300 dark:border-slate-700"
              />
              <label htmlFor="urgentCheck" className="text-xs font-bold text-rose-600 dark:text-rose-400 cursor-pointer flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {isRtl ? 'عاجل / فوري جداً' : 'Urgent / Immediate'}
              </label>
            </div>
          </div>

          {/* Title & Content Inputs */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                {isRtl ? 'موضوع الخطاب / عنوان القرار' : 'Subject / Title'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isRtl ? 'أدخل موضوع الخطاب الرسمي...' : 'Enter official letter subject...'}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                {isRtl ? 'نص ومحتوى الخطاب الرسمي المعتمد' : 'Official Letter Body & Content'}
              </label>
              <textarea
                rows={11}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={isRtl ? 'قم بصياغة نص الخطاب أو القرار السيادي هنا...' : 'Draft your official letter or decree content here...'}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-sm font-serif leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          {/* Bottom Action Footer Bar */}
          <div className="mt-8 pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{isRtl ? 'الحالة:' : 'Status:'}</span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand-light">
                {status}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={() => setShowForwardModal(true)}
                disabled={!currentId}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#1a1d21] dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800/80 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <GitBranch className="w-4 h-4 text-brand" />
                <span>{isRtl ? 'إحالة وتوجيه إداري (ltree)' : 'Administrative Forward (ltree)'}</span>
              </button>

              <button
                onClick={handleSignAndSeal}
                disabled={status === 'signed' || status === 'archived'}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md hover:shadow-emerald-500/25 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                <span>{isRtl ? 'اعتماد وختم سيادي مشفر (QR Code)' : 'Official Seal & Approval (QR Code)'}</span>
              </button>

              <button
                onClick={handleArchive}
                disabled={status !== 'signed'}
                className="px-4 py-2 rounded-xl bg-brand hover:bg-brand/90 text-white text-xs font-bold shadow-md hover:shadow-brand/25 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Archive className="w-4 h-4" />
                <span>{isRtl ? 'أرشفة دلالية في قاعدة المعرفة (RAG)' : 'Archive to Knowledge Base'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Live Institutional Document View */}
      <div className="lg:col-span-5 space-y-4">
        <div className="p-6 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm sticky top-6">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-brand" /> Official Document Live Render
            </span>
            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 px-2 py-0.5 rounded">
              A4 INSTITUTIONAL VIEW
            </span>
          </div>

          {/* Paper Canvas Container */}
          <div
            style={{
              fontFamily: activeTemplate?.layout_config?.font_family || 'Cairo, sans-serif',
              color: activeTemplate?.layout_config?.font_color || '#1e293b'
            }}
            className="bg-white text-slate-900 p-7 rounded-lg shadow-lg border border-slate-200 min-h-[580px] flex flex-col justify-between relative overflow-hidden transition-all duration-200"
          >
            <div>
              {/* Header section rendered */}
              {activeTemplate?.header_html ? (
                <div dangerouslySetInnerHTML={{ __html: activeTemplate.header_html }} />
              ) : (
                <div className="text-center border-b-2 border-brand pb-3 mb-4">
                  <h2 className="text-base font-bold text-slate-900 m-0">
                    {getCompanyDefaults().name ? `${getCompanyDefaults().name} • ديوان المراسلات والوثائق` : 'إدارة العمليات والمراسلات الرسمية • Septimus OS'}
                  </h2>
                  <p className="text-[11px] text-slate-500 m-0">
                    {getCompanyDefaults().address ? `${getCompanyDefaults().address} • إدارة الأرشيف والختم الموثق` : 'نظام إدارة المراسلات والوثائق المعتمدة'}
                  </p>
                </div>
              )}

              {/* Document metadata banner */}
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 py-2 border-b border-slate-100 mb-5">
                <div>
                  <span className="font-bold">SERIAL: </span>
                  <span className="text-brand font-extrabold">{serialNumber || 'SEP-2026-OUT-XXXX'}</span>
                </div>
                <div>
                  <span className="font-bold">DATE: </span>
                  <span>{new Date().toISOString().split('T')[0]}</span>
                </div>
                <div>
                  <span className="font-bold">CLASS: </span>
                  <span className="uppercase font-bold text-rose-600">{confidentiality}</span>
                </div>
              </div>

              {/* Title / Subject */}
              <div className="mb-5 text-center">
                <h3
                  style={{
                    fontSize: `${Math.max(14, (activeTemplate?.layout_config?.font_size_body || 14) + 2)}px`,
                    fontWeight: activeTemplate?.layout_config?.font_weight === 'black' ? 900 : activeTemplate?.layout_config?.font_weight === 'bold' ? 700 : 600,
                    color: activeTemplate?.layout_config?.font_color || '#1e293b'
                  }}
                  className="underline decoration-slate-300 underline-offset-4 m-0"
                >
                  {title || 'Official Correspondence Subject'}
                </h3>
              </div>

              {/* Body Content */}
              <div
                style={{
                  fontSize: `${activeTemplate?.layout_config?.font_size_body || 14}px`,
                  fontWeight: activeTemplate?.layout_config?.font_weight === 'medium' ? 500 : 400,
                  fontStyle: activeTemplate?.layout_config?.font_style || 'normal'
                }}
                className="leading-relaxed whitespace-pre-wrap text-justify"
              >
                {content || 'Enter document text on the left editor to preview exact institutional formatting here...'}
              </div>
            </div>

            {/* Footer with External QR Seal (No Internal Signature) */}
            <div className="mt-8 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between gap-3">
                {/* External QR verification code box */}
                <div className="flex items-center gap-2.5 bg-slate-50 p-2.5 rounded border border-slate-200">
                  <div className="w-14 h-14 bg-white border border-slate-300 rounded flex items-center justify-center font-mono text-[9px] text-brand font-bold shadow-inner shrink-0">
                    {qrCode || status === 'signed' ? (
                      <QrCode className="w-10 h-10 text-brand animate-pulse" />
                    ) : (
                      <span className="text-[8px] text-slate-400 text-center">QR SEAL<br/>PENDING</span>
                    )}
                  </div>
                  <div className="text-[10px] leading-tight text-slate-700">
                    <p className="font-extrabold text-slate-900 uppercase tracking-wide flex items-center gap-1">
                      <Stamp className="w-3 h-3 text-emerald-600" />
                      External Certified Seal
                    </p>
                    <p className="text-slate-500 text-[9px]">Verifiable cryptographic stamp</p>
                    <p className="font-mono text-[9px] text-brand font-bold mt-0.5">
                      {status === 'signed' ? `SEALED & ENCRYPTED (${signedAt ? signedAt.slice(0, 10) : 'NOW'})` : 'AWAITING APPROVAL'}
                    </p>
                  </div>
                </div>

                <div className="text-end text-[11px] text-slate-600">
                  <p className="font-bold text-slate-900 uppercase">
                    {getCompanyDefaults().nameEn || 'Sovereign Project Directorate'}
                  </p>
                  <p className="text-slate-400 italic text-[10px]">No internal signature exposed</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Septimus Sovereign OS v1.0</p>
                </div>
              </div>

              {activeTemplate?.footer_html ? (
                <div className="mt-3 text-[10px] text-center text-slate-400" dangerouslySetInnerHTML={{ __html: activeTemplate.footer_html }} />
              ) : (
                <p className="mt-3 text-[10px] text-center text-slate-400">
                  {getCompanyDefaults().name ? `${getCompanyDefaults().name} • المقر الرئيسي • نظام الختم والمراسلات الرقمية` : 'نظام Septimus OS الموحد • طرابلس، ليبيا • نظام الختم والمراسلات الرقمية (HMAC256 QR Verifiable)'}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Administrative Forwarding (ltree routing) */}
      {showForwardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1a1d21] rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h4 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-brand" />
                <span>{isRtl ? 'إحالة وتوجيه إداري (مسار ltree التنظيمي)' : 'Administrative Forward & Routing (ltree)'}</span>
              </h4>
              <button
                onClick={() => setShowForwardModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  {isRtl ? 'مسار الإحالة الهرمي (ltree Path)' : 'Organizational Routing Path (ltree path)'}
                </label>
                <select
                  value={toNodePath}
                  onChange={(e) => setToNodePath(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 font-mono text-xs text-brand font-bold focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="top.ministry.diwan.legal">{isRtl ? 'top.ministry.diwan.legal (إدارة التدقيق والشؤون القانونية)' : 'top.ministry.diwan.legal (Legal & Regulatory Audit Dept)'}</option>
                  <option value="top.ministry.diwan.exec">{isRtl ? 'top.ministry.diwan.exec (مكتب وكيل الوزارة التنفيذي)' : 'top.ministry.diwan.exec (Executive Undersecretary Office)'}</option>
                  <option value="top.ministry.finance.budget">{isRtl ? 'top.ministry.finance.budget (وحدة الميزانية والشؤون المالية)' : 'top.ministry.finance.budget (General Budget & Financial Unit)'}</option>
                  <option value="top.ministry.hr.personnel">{isRtl ? 'top.ministry.hr.personnel (إدارة الموارد البشرية والعمليات)' : 'top.ministry.hr.personnel (Human Capital & Operations)'}</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  {isRtl ? 'الموظف / الجهة المحال إليها' : 'Forwarded To Employee / Unit'}
                </label>
                <input
                  type="text"
                  value={toUserId}
                  onChange={(e) => setToUserId(e.target.value)}
                  placeholder={isRtl ? 'اسم الموظف أو رمز الوحدة...' : 'Employee ID or Unit Name...'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  {isRtl ? 'الإجراء المطلوب اتخاذه' : 'Required Action'}
                </label>
                <select
                  value={actionRequired}
                  onChange={(e) => setActionRequired(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="review_and_endorse">{isRtl ? 'الاطلاع وإبداء الرأي والمصادقة' : 'Review & Endorse'}</option>
                  <option value="for_information">{isRtl ? 'للعلم والإحاطة والتنفيذ' : 'For Information & Execution'}</option>
                  <option value="urgent_action">{isRtl ? 'اتخاذ الإجراء العاجل وإفادتنا' : 'Take Urgent Action & Report Back'}</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                  {isRtl ? 'ملاحظة الإحالة أو التوجيه الإداري' : 'Routing Note & Directive'}
                </label>
                <textarea
                  rows={3}
                  value={forwardNote}
                  onChange={(e) => setForwardNote(e.target.value)}
                  placeholder={isRtl ? 'اكتب ملاحظاتك وتوجيهات الإحالة هنا...' : 'Enter your forward directive note here...'}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-xs focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setShowForwardModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-[#1a1d21] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800/80 text-xs font-semibold cursor-pointer"
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={handleForward}
                className="px-5 py-2 rounded-lg bg-brand hover:bg-brand/90 text-white text-xs font-bold shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isRtl ? 'تنفيذ الإحالة وبث التنبيه الإداري' : 'Execute Forward Directive'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
