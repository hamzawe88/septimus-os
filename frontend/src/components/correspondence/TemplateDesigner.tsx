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
import { sanitizeHtml } from '@/lib/sanitizeHtml';

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
  const { t } = useLocalization();
  const { templates, fetchTemplates, createTemplate, updateTemplate, deleteTemplate, loading } = useCorrespondenceStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('external_letter');
  const [headerHtml, setHeaderHtml] = useState(() => {
    const d = getCompanyDefaults();
    const title = d.name ? `${d.name} • ${t("correspondence.designer.diwan")}` : t("correspondence.designer.defaultHeader");
    const sub = d.address ? `${d.address} • ${t("correspondence.designer.archiveAndSeal")}` : t("correspondence.designer.defaultSubheader");
    return `<div style="text-align: center; border-bottom: 2px solid #1E293B; padding-bottom: 15px; margin-bottom: 20px;">\n  <h2 style="margin: 0; color: #0F172A; font-family: serif;">${title}</h2>\n  <p style="margin: 5px 0 0; font-size: 13px; color: #64748B;">${sub}</p>\n</div>`;
  });
  const [footerHtml, setFooterHtml] = useState(() => {
    const d = getCompanyDefaults();
    const f = d.name ? `${d.name} • ${t("correspondence.designer.defaultFooter")}` : t("correspondence.designer.defaultFooter");
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
    const title = d.name ? `${d.name} • ${t("correspondence.designer.diwan")}` : t("correspondence.designer.defaultHeader");
    const sub = d.address ? `${d.address} • ${t("correspondence.designer.archiveAndSeal")}` : t("correspondence.designer.defaultSubheader");
    setHeaderHtml(tpl.header_html || `<div style="text-align: center; border-bottom: 2px solid #1E293B; padding-bottom: 15px; margin-bottom: 20px;">\n  <h2 style="margin: 0; color: #0F172A; font-family: serif;">${title}</h2>\n  <p style="margin: 5px 0 0; font-size: 13px; color: #64748B;">${sub}</p>\n</div>`);
    const f = d.name ? `${d.name} • ${t("correspondence.designer.defaultFooter")}` : t("correspondence.designer.defaultFooter");
    setFooterHtml(tpl.footer_html || `<div style="text-align: center; border-top: 1px solid #CBD5E1; padding-top: 15px; margin-top: 30px; font-size: 11px; color: #64748B;">\n  <p style="margin: 0;">${f}</p>\n</div>`);
    setLogoUrl(tpl.layout_config?.logo_url || d.logoUrl || '');
    setShowQr(tpl.layout_config?.show_qr ?? true);
    setShowSerial(tpl.layout_config?.show_serial ?? true);
  };

  const handleCreateNew = () => {
    setSelectedId(null);
    setName(t("correspondence.designer.newTemplateName"));
    setType('external_letter');
    const d = getCompanyDefaults();
    const title = d.name ? `${d.name} • ${t("correspondence.designer.diwan")}` : t("correspondence.designer.defaultHeader");
    const sub = d.address ? `${d.address} • ${t("correspondence.designer.archiveAndSeal")}` : t("correspondence.designer.defaultSubheader");
    setHeaderHtml(`<div style="text-align: center; border-bottom: 2px solid #1E293B; padding-bottom: 15px; margin-bottom: 20px;">\n  <h2 style="margin: 0; color: #0F172A;">${title}</h2>\n  <p style="margin: 5px 0 0; font-size: 13px; color: #64748B;">${sub}</p>\n</div>`);
    const f = d.name ? `${d.name} • ${t("correspondence.designer.defaultFooter")}` : t("correspondence.designer.defaultFooter");
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
        setSuccessMsg(t("correspondence.designer.updated"));
      } else {
        const created = await createTemplate(data);
        setSelectedId(created.id);
        setSuccessMsg(t("correspondence.designer.created"));
      }
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Save template failed:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t("correspondence.designer.deleteConfirm"))) return;
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
        <div className="p-5 rounded-xl bg-card dark:bg-card border border-border dark:border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-base text-foreground dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-brand dark:text-brand-light" />
              <span>{t('correspondence.tabTemplates')}</span>
            </h3>
            <button
              onClick={handleCreateNew}
              className="p-2 rounded-lg bg-brand/10 text-brand hover:bg-brand/20 dark:bg-brand/20 dark:text-brand-light transition-colors"
              title={t('correspondence.newTemplate')}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="max-h-[520px] space-y-2.5 overflow-y-auto pe-1">
            {loading && templates.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">{t("correspondence.designer.loading")}</div>
            ) : templates.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs border border-dashed rounded-lg border-border dark:border-border">
                {t("correspondence.designer.empty")}
              </div>
            ) : (
              templates.map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => handleSelect(tpl)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    selectedId === tpl.id
                      ? 'bg-brand/10 border-brand/50 dark:bg-brand/20 dark:border-brand/40 shadow-sm'
                      : 'bg-muted/50 border-border hover:bg-muted/60 dark:bg-card/40 dark:border-border'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground dark:text-white truncate">{tpl.name}</p>
                    <span className="inline-block mt-1 px-2 py-0.5 rounded bg-muted/80 dark:bg-muted text-[10px] font-semibold text-muted-foreground dark:text-muted-foreground uppercase tracking-wide">
                      {tpl.type || 'external_letter'}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(tpl.id);
                    }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 transition-colors"
                    title={t("common.delete")}
                    aria-label={t("common.delete")}
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
        <div className="p-6 rounded-xl bg-card dark:bg-card border border-border dark:border-border shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border dark:border-border pb-4 mb-6">
            <div>
              <h4 className="font-bold text-lg text-foreground dark:text-white">
                {selectedId ? t("correspondence.designer.editTitle") : t("correspondence.designer.newTitle")}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">{t("correspondence.designer.description")}</p>
            </div>
            <div className="flex items-center gap-2">
              {successMsg && (
                <span className="text-xs font-semibold text-success bg-success/10 dark:bg-success/20 px-3 py-1.5 rounded-lg flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> {successMsg}
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand/90 text-white text-sm font-semibold shadow-md hover:shadow-brand/25 transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{t('correspondence.saveTemplate')}</span>
              </button>
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-foreground dark:text-muted-foreground uppercase tracking-wider mb-1.5">
                {t('correspondence.templateName')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("correspondence.designer.namePlaceholder")}
                className="w-full px-3.5 py-2.5 rounded-lg border border-border dark:border-border bg-muted dark:bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground dark:text-muted-foreground uppercase tracking-wider mb-1.5">
                {t('correspondence.templateType')}
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-border dark:border-border bg-muted dark:bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="external_letter">{t('correspondence.typeExternalLetter')}</option>
                <option value="internal_memo">{t('correspondence.typeInternalMemo')}</option>
                <option value="decree">{t('correspondence.typeDecree')}</option>
                <option value="circular">{t('correspondence.typeCircular')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-foreground dark:text-muted-foreground uppercase tracking-wider mb-1.5">
                {t('correspondence.logoUrl')}
              </label>
              <input
                type="text"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder={t("correspondence.designer.logoPlaceholder")}
                className="w-full px-3 py-2 rounded-lg border border-border dark:border-border bg-muted dark:bg-card text-xs focus:outline-none focus:ring-2 focus:ring-brand font-mono"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="showSerial"
                checked={showSerial}
                onChange={(e) => setShowSerial(e.target.checked)}
                className="w-4 h-4 rounded text-brand focus:ring-brand border-border dark:border-border"
              />
              <label htmlFor="showSerial" className="text-xs font-bold text-foreground dark:text-muted-foreground cursor-pointer">
                {t('correspondence.showSerial')}
              </label>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="showQr"
                checked={showQr}
                onChange={(e) => setShowQr(e.target.checked)}
                className="w-4 h-4 rounded text-brand focus:ring-brand border-border dark:border-border"
              />
              <label htmlFor="showQr" className="text-xs font-bold text-foreground dark:text-muted-foreground cursor-pointer flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-brand" />
                {t('correspondence.showQr')}
              </label>
            </div>
          </div>

          {/* HTML Editors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-foreground dark:text-muted-foreground uppercase tracking-wider mb-1.5">
                {t('correspondence.headerHtml')}
              </label>
              <textarea
                rows={6}
                value={headerHtml}
                onChange={(e) => setHeaderHtml(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-border dark:border-border bg-card dark:bg-card/80 text-success font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground dark:text-muted-foreground uppercase tracking-wider mb-1.5">
                {t('correspondence.footerHtml')}
              </label>
              <textarea
                rows={6}
                value={footerHtml}
                onChange={(e) => setFooterHtml(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-border dark:border-border bg-card dark:bg-card/80 text-success font-mono text-xs focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          {/* Live Institutional Preview Box */}
          <div className="border border-border dark:border-border rounded-xl p-6 bg-muted dark:bg-card/60">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-border dark:border-border">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Eye className="w-4 h-4" /> {t("correspondence.designer.livePreview")}
              </span>
              {showSerial && (
                <span className="font-mono text-xs font-bold px-2 py-1 rounded bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand-light">
                  {t("correspondence.designer.previewSerial")}
                </span>
              )}
            </div>

            <div className="relative mx-auto flex min-h-[380px] max-w-2xl flex-col justify-between rounded-lg border border-border bg-[var(--color-paper-raised)] p-8 font-serif text-[var(--color-ink)] shadow-md">
              {/* Header section rendered */}
              <div>
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(headerHtml) }} />
                <div className="my-6">
                  <h3 className="font-bold text-base text-center mb-4 underline">{t("correspondence.designer.previewSubject")}</h3>
                  <p className="text-sm leading-relaxed text-foreground text-justify">
                    {t("correspondence.designer.previewBody")}
                  </p>
                </div>
              </div>

              {/* Footer and QR Seal preview */}
              <div className="mt-8 pt-4 border-t border-border">
                <div className="flex items-center justify-between gap-4">
                  {showQr && (
                    <div className="flex items-center gap-2 bg-muted p-2 rounded border border-border text-foreground">
                      <div className="flex h-12 w-12 items-center justify-center rounded border border-border bg-[var(--color-paper-raised)] text-center font-mono text-[9px] font-bold text-brand shadow-inner">
                        <QrCode className="w-8 h-8 text-brand" />
                      </div>
                      <div className="text-[10px] leading-tight">
                        <p className="font-bold text-foreground">{t("correspondence.designer.sealPreview")}</p>
                        <p className="text-muted-foreground">{t("correspondence.designer.sealPreviewDescription")}</p>
                        <p className="font-mono text-[9px] text-brand font-semibold">{t("correspondence.designer.previewOnly")}</p>
                      </div>
                    </div>
                  )}
                  <div className="text-end text-xs text-muted-foreground">
                    <p className="font-bold text-foreground">{t("correspondence.designer.previewAuthority")}</p>
                    <p className="italic">{t("correspondence.designer.previewDocument")}</p>
                  </div>
                </div>
                <div className="mt-4" dangerouslySetInnerHTML={{ __html: sanitizeHtml(footerHtml) }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
