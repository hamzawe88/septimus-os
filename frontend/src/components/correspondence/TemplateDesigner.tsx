import React, { useState, useEffect } from 'react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { 
  FileSpreadsheet, 
  Plus, 
  Trash2, 
  Save, 
  Eye, 
  QrCode, 
  Check
} from 'lucide-react';
import { useCorrespondenceStore, CorrespondenceTemplate } from '../../store/useCorrespondenceStore';

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

export const TemplateDesigner: React.FC = () => {
  const { t, isRtl } = useLocalization();
  const { templates, fetchTemplates, createTemplate, updateTemplate, deleteTemplate, loading } = useCorrespondenceStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('external_letter');
  const [headerHtml, setHeaderHtml] = useState(() => {
    const d = getCompanyDefaults();
    const title = d.name ? `${d.name} • ديوان المراسلات والوثائق` : 'إدارة العمليات والمراسلات الرسمية • Septimus OS';
    const sub = d.address ? `${d.address} • إدارة الأرشيف والختم الموثق` : 'نظام إدارة المراسلات والوثائق المعتمدة';
    return `<div style="text-align: center; border-bottom: 2px solid #1E293B; padding-bottom: 15px; margin-bottom: 20px;">\n  <h2 style="margin: 0; color: #0F172A; font-family: serif;">${title}</h2>\n  <p style="margin: 5px 0 0; font-size: 13px; color: #64748B;">${sub}</p>\n</div>`;
  });
  const [footerHtml, setFooterHtml] = useState(() => {
    const d = getCompanyDefaults();
    const f = d.name ? `${d.name} • المقر الرئيسي • نظام الختم والمراسلات المعتمدة (HMAC256 QR Verifiable)` : 'نظام Septimus OS الموحد • طرابلس، ليبيا • نظام الختم والمراسلات الرقمية (HMAC256 QR Verifiable)';
    return `<div style="text-align: center; border-top: 1px solid #CBD5E1; padding-top: 15px; margin-top: 30px; font-size: 11px; color: #64748B;">\n  <p style="margin: 0;">${f}</p>\n</div>`;
  });
  const [logoUrl, setLogoUrl] = useState('');
  const [showQr, setShowQr] = useState(true);
  const [showSerial, setShowSerial] = useState(true);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSelect = (tpl: CorrespondenceTemplate) => {
    setSelectedId(tpl.id);
    setName(tpl.name || '');
    setType(tpl.type || 'external_letter');
    const d = getCompanyDefaults();
    const title = d.name ? `${d.name} • ديوان المراسلات والوثائق` : 'إدارة العمليات والمراسلات الرسمية • Septimus OS';
    const sub = d.address ? `${d.address} • إدارة الأرشيف والختم الموثق` : 'نظام إدارة المراسلات والوثائق المعتمدة';
    setHeaderHtml(tpl.header_html || `<div style="text-align: center; border-bottom: 2px solid #1E293B; padding-bottom: 15px; margin-bottom: 20px;">\n  <h2 style="margin: 0; color: #0F172A; font-family: serif;">${title}</h2>\n  <p style="margin: 5px 0 0; font-size: 13px; color: #64748B;">${sub}</p>\n</div>`);
    const f = d.name ? `${d.name} • المقر الرئيسي • نظام الختم والمراسلات المعتمدة (HMAC256 QR Verifiable)` : 'نظام Septimus OS الموحد • طرابلس، ليبيا • نظام الختم والمراسلات الرقمية (HMAC256 QR Verifiable)';
    setFooterHtml(tpl.footer_html || `<div style="text-align: center; border-top: 1px solid #CBD5E1; padding-top: 15px; margin-top: 30px; font-size: 11px; color: #64748B;">\n  <p style="margin: 0;">${f}</p>\n</div>`);
    setLogoUrl(tpl.layout_config?.logo_url || d.logoUrl || '');
    setShowQr(tpl.layout_config?.show_qr ?? true);
    setShowSerial(tpl.layout_config?.show_serial ?? true);
  };

  const handleCreateNew = () => {
    setSelectedId(null);
    setName(isRtl ? 'قالب رسمي جديد' : 'New Institutional Template');
    setType('external_letter');
    const d = getCompanyDefaults();
    const title = d.name ? `${d.name} • ديوان المراسلات والوثائق` : 'إدارة العمليات والمراسلات الرسمية • Septimus OS';
    const sub = d.address ? `${d.address} • إدارة الأرشيف والختم الموثق` : 'نظام إدارة المراسلات والوثائق المعتمدة';
    setHeaderHtml(`<div style="text-align: center; border-bottom: 2px solid #1E293B; padding-bottom: 15px; margin-bottom: 20px;">\n  <h2 style="margin: 0; color: #0F172A;">${title}</h2>\n  <p style="margin: 5px 0 0; font-size: 13px; color: #64748B;">${sub}</p>\n</div>`);
    const f = d.name ? `${d.name} • المقر الرئيسي • نظام الختم والمراسلات المعتمدة (HMAC256 QR Verifiable)` : 'نظام Septimus OS الموحد • طرابلس، ليبيا • نظام الختم والمراسلات الرقمية (HMAC256 QR Verifiable)';
    setFooterHtml(`<div style="text-align: center; border-top: 1px solid #CBD5E1; padding-top: 15px; margin-top: 30px; font-size: 11px; color: #64748B;">\n  <p style="margin: 0;">${f}</p>\n</div>`);
    setLogoUrl(d.logoUrl || '');
    setShowQr(true);
    setShowSerial(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const data = {
      name,
      type,
      header_html: headerHtml,
      footer_html: footerHtml,
      layout_config: {
        logo_url: logoUrl,
        show_qr: showQr,
        show_serial: showSerial,
      },
    };

    try {
      if (selectedId) {
        await updateTemplate(selectedId, data);
        setSuccessMsg(isRtl ? 'تم تحديث القالب المؤسسي بنجاح' : 'Template updated successfully');
      } else {
        const created = await createTemplate(data);
        setSelectedId(created.id);
        setSuccessMsg(isRtl ? 'تم إنشاء القالب المؤسسي بنجاح' : 'Template created successfully');
      }
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Save template failed:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(isRtl ? 'هل أنت متأكد من حذف هذا القالب؟' : 'Are you sure you want to delete this template?')) return;
    try {
      await deleteTemplate(id);
      if (selectedId === id) handleCreateNew();
    } catch (err) {
      console.error('Delete template failed:', err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
      {/* Left List: Existing Templates */}
      <div className="lg:col-span-4 space-y-4">
        <div className="p-5 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-brand dark:text-brand-light" />
              <span>{t('correspondence.tabTemplates', 'Template & Brand Designer')}</span>
            </h3>
            <button
              onClick={handleCreateNew}
              className="p-2 rounded-lg bg-brand/10 text-brand hover:bg-brand/20 dark:bg-brand/20 dark:text-brand-light transition-colors"
              title={t('correspondence.newTemplate', 'Design New Institutional Template')}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
            {loading && templates.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs border border-dashed rounded-lg border-slate-200 dark:border-slate-800">
                No templates saved yet. Click + to create one.
              </div>
            ) : (
              templates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => handleSelect(tpl)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    selectedId === tpl.id
                      ? 'bg-brand/10 border-brand/50 dark:bg-brand/20 dark:border-brand/40 shadow-sm'
                      : 'bg-slate-50/50 border-slate-200 hover:bg-slate-100/60 dark:bg-slate-800/40 dark:border-slate-700/60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{tpl.name}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                      {tpl.type || 'external_letter'}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(tpl.id);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Middle/Right: Template Editor & Live Preview */}
      <div className="lg:col-span-8 space-y-6">
        <div className="p-6 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
            <div>
              <h4 className="font-bold text-lg text-slate-900 dark:text-white">
                {selectedId ? (isRtl ? 'تعديل القالب المؤسسي' : 'Edit Institutional Template') : (isRtl ? 'تصميم قالب مؤسسي جديد' : 'New Institutional Template')}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">Define your official letterhead, footer, and seal settings</p>
            </div>
            <div className="flex items-center gap-2">
              {successMsg && (
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-lg flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> {successMsg}
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand/90 text-white text-sm font-semibold shadow-md hover:shadow-brand/25 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{t('correspondence.saveTemplate', 'Save Template')}</span>
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                {t('correspondence.templateName', 'Institutional Template Name')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ministry Official Outgoing Letterhead"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                {t('correspondence.templateType', 'Correspondence Type')}
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="external_letter">{t('correspondence.typeExternalLetter', 'External Outgoing Letter')}</option>
                <option value="internal_memo">{t('correspondence.typeInternalMemo', 'Internal Memo')}</option>
                <option value="decree">{t('correspondence.typeDecree', 'Administrative Decree')}</option>
                <option value="circular">{t('correspondence.typeCircular', 'Public Circular')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                {t('correspondence.logoUrl', 'Organization Logo URL')}
              </label>
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://.../logo.png"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-brand font-mono"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="showSerial"
                checked={showSerial}
                onChange={(e) => setShowSerial(e.target.checked)}
                className="w-4 h-4 rounded text-brand focus:ring-brand border-slate-300 dark:border-slate-700"
              />
              <label htmlFor="showSerial" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                {t('correspondence.showSerial', 'Show Unique Serial Number')}
              </label>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="showQr"
                checked={showQr}
                onChange={(e) => setShowQr(e.target.checked)}
                className="w-4 h-4 rounded text-brand focus:ring-brand border-slate-300 dark:border-slate-700"
              />
              <label htmlFor="showQr" className="text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-brand" />
                {t('correspondence.showQr', 'Show QR Verification Code')}
              </label>
            </div>
          </div>

          {/* HTML Editors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                {t('correspondence.headerHtml', 'Letter Header (HTML / Brand Identity)')}
              </label>
              <textarea
                rows={6}
                value={headerHtml}
                onChange={(e) => setHeaderHtml(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-800 dark:bg-[#1a1d21]/80 text-emerald-400 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                {t('correspondence.footerHtml', 'Letter Footer & Contact Info')}
              </label>
              <textarea
                rows={6}
                value={footerHtml}
                onChange={(e) => setFooterHtml(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-800 dark:bg-[#1a1d21]/80 text-emerald-400 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          {/* Live Institutional Preview Box */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-6 bg-slate-50 dark:bg-[#1a1d21]/60">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Eye className="w-4 h-4" /> Live Institutional Document Preview
              </span>
              {showSerial && (
                <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand-light">
                  SEP-2026-OUT-0001
                </span>
              )}
            </div>

            <div className="max-w-2xl mx-auto bg-white text-slate-900 p-8 rounded-lg shadow-md border border-slate-200 min-h-[380px] flex flex-col justify-between font-serif relative">
              {/* Header section rendered */}
              <div>
                <div dangerouslySetInnerHTML={{ __html: headerHtml }} />
                <div className="my-6">
                  <h3 className="font-bold text-base text-center mb-4 underline">SUBJECT: SAMPLE INSTITUTIONAL DECREE OR LETTER</h3>
                  <p className="text-sm leading-relaxed text-slate-700 text-justify">
                    This is a live representation of your institutional template. All official letters generated using this template will automatically inherit the custom HTML header and footer configured above. Furthermore, our smart diwan applies a strictly certified external seal and verification stamp without relying on internal signatures.
                  </p>
                </div>
              </div>

              {/* Footer and QR Seal preview */}
              <div className="mt-8 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between gap-4">
                  {showQr && (
                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded border border-slate-200 text-slate-800">
                      <div className="w-12 h-12 bg-white border border-slate-300 rounded flex items-center justify-center font-mono text-[9px] text-center font-bold text-brand shadow-inner">
                        <QrCode className="w-8 h-8 text-brand" />
                      </div>
                      <div className="text-[10px] leading-tight">
                        <p className="font-bold text-slate-900 uppercase">External Certified Seal</p>
                        <p className="text-slate-500">Scan to verify authenticity</p>
                        <p className="font-mono text-[9px] text-brand font-semibold">VERIFIED-SEPTIMUS-OS</p>
                      </div>
                    </div>
                  )}
                  <div className="text-end text-xs text-slate-500">
                    <p className="font-bold text-slate-800">SOVEREIGN ENTERPRISE AUTHORITY</p>
                    <p className="italic">Official Electronic Document</p>
                  </div>
                </div>
                <div className="mt-4" dangerouslySetInnerHTML={{ __html: footerHtml }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
