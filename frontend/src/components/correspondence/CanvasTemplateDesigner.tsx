import React, { useState, useEffect } from 'react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { 
  FileSpreadsheet, 
  Plus, 
  Trash2, 
  Save, 
  Eye, 
  EyeOff, 
  QrCode, 
  Check, 
  Sliders, 
  Type, 
  Layout, 
  ShieldCheck, 
  FileText, 
  Stamp, 
  Building2, 
  Calendar, 
  Hash, 
  Sparkles,
  Upload,
  Image as ImageIcon,
  Palette,
  Bold,
  Italic
} from 'lucide-react';
import { useCorrespondenceStore, CorrespondenceTemplate } from '../../store/useCorrespondenceStore';

const getCompanyDefaults = () => {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('septimus_company_profile') : null;
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        nameAr: parsed.name ? `${parsed.name} • ديوان المراسلات والوثائق المعتمدة` : 'إدارة المراسلات والوثائق المعتمدة • Septimus OS',
        nameEn: parsed.nameEn || 'SEPTIMUS ENTERPRISE DIWAN • CERTIFIED CORRESPONDENCE',
        address: parsed.address || 'المقر الرئيسي العالمي • إدارة الأرشيف والختم الموثق',
        logo: parsed.logo || ''
      };
    }
  } catch (e) {
    console.error('Error loading company defaults', e);
  }
  return {
    nameAr: 'إدارة المراسلات والوثائق المعتمدة • Septimus OS',
    nameEn: 'SEPTIMUS ENTERPRISE DIWAN • CERTIFIED CORRESPONDENCE',
    address: 'المقر الرئيسي العالمي • إدارة الأرشيف والختم الموثق',
    logo: ''
  };
};

export const CanvasTemplateDesigner: React.FC = () => {
  const { isRtl } = useLocalization();
  const { templates, fetchTemplates, createTemplate, updateTemplate, deleteTemplate } = useCorrespondenceStore();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('external_letter');

  const defaults = getCompanyDefaults();

  // Sovereign Canvas configuration tokens
  const [fontFamily, setFontFamily] = useState('Cairo');
  const [headerTitleAr, setHeaderTitleAr] = useState(defaults.nameAr);
  const [headerTitleEn, setHeaderTitleEn] = useState(defaults.nameEn);
  const [headerSubtitle, setHeaderSubtitle] = useState(defaults.address);
  const [logoUrl, setLogoUrl] = useState('');
  const [headerBorder, setHeaderBorder] = useState(true);

  // Advanced Typography & Project Branding states (Font Size pt, Weight, Style, Color, Layout Preset)
  const [logoBase64, setLogoBase64] = useState(defaults.logo || '');
  const [fontSizeHeader, setFontSizeHeader] = useState<number>(18);
  const [fontSizeBody, setFontSizeBody] = useState<number>(14);
  const [fontSizeFooter, setFontSizeFooter] = useState<number>(10);
  const [fontWeight, setFontWeight] = useState<'normal' | 'medium' | 'bold' | 'black'>('bold');
  const [fontStyle, setFontStyle] = useState<'normal' | 'italic'>('normal');
  const [fontColor, setFontColor] = useState<string>('#1e293b');
  const [headerLayoutPreset, setHeaderLayoutPreset] = useState<'split_classic' | 'modern_banner' | 'minimalist_emblem'>('modern_banner');
  const [footerDisclaimerText, setFooterDisclaimerText] = useState('هذه المراسلة وثيقة سيادية معتمدة ومحمية بموجب بروتوكولات الأرشفة والتوقيع الرقمي للمشروع.');

  // Sovereign Header & Footer Styling Studio States
  const [headerBgType, setHeaderBgType] = useState<'transparent' | 'solid' | 'gradient' | 'boxed'>('transparent');
  const [headerBgColor, setHeaderBgColor] = useState('#1e3a8a');
  const [headerBgGradientStart, setHeaderBgGradientStart] = useState('#1e3a8a');
  const [headerBgGradientEnd, setHeaderBgGradientEnd] = useState('#0d9488');
  const [headerDividerStyle, setHeaderDividerStyle] = useState<'solid' | 'double' | 'dashed' | 'gradient'>('solid');
  const [headerDividerThickness, setHeaderDividerThickness] = useState<number>(2);
  const [headerLogoAlign, setHeaderLogoAlign] = useState<'start' | 'center' | 'end'>('start');
  const [headerFontSlant, setHeaderFontSlant] = useState<'normal' | 'italic'>('normal');
  const [footerFontSlant, setFooterFontSlant] = useState<'normal' | 'italic'>('normal');
  const [footerFontColor, setFooterFontColor] = useState('#64748b');

  // Dynamic Suppressor Toggles (Tax ID, Commercial Reg, Serial, Dates)
  const [showTaxId, setShowTaxId] = useState(false);
  const [taxIdValue, setTaxIdValue] = useState('30918472910003');
  const [showCommercialReg, setShowCommercialReg] = useState(false);
  const [commercialRegValue, setCommercialRegValue] = useState('48192-LY');
  const [showSerial, setShowSerial] = useState(true);
  const [showHijriDate, setShowHijriDate] = useState(true);
  const [showGregorianDate, setShowGregorianDate] = useState(true);

  // QR Seal & Signature Box
  const [showQr, setShowQr] = useState(true);
  const [qrPosition, setQrPosition] = useState<'bottom-left' | 'bottom-right' | 'bottom-center'>('bottom-left');
  const [qrSizeMm, setQrSizeMm] = useState<number>(26);
  const [showHmacChecksum, setShowHmacChecksum] = useState(true);
  const [showSignatureBox, setShowSignatureBox] = useState(true);
  const [signatoryTitle, setSignatoryTitle] = useState('الأمين العام للديوان / Secretary General');

  // Footer
  const [footerText, setFooterText] = useState('نظام Septimus OS الموحد • طرابلس، ليبيا • نظام الختم والمراسلات السيادية (HMAC256 QR Verifiable)');
  const [showPageNumbers, setShowPageNumbers] = useState(true);

  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'blocks' | 'styling' | 'seal'>('blocks');

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelect = (tpl: CorrespondenceTemplate) => {
    setSelectedId(tpl.id);
    setName(tpl.name || '');
    setType(tpl.type || 'external_letter');
    
    const defs = getCompanyDefaults();
    const cfg = tpl.layout_config || {};
    setFontFamily(cfg.font_family || 'Cairo');
    setHeaderTitleAr(cfg.header_title_ar || defs.nameAr);
    setHeaderTitleEn(cfg.header_title_en || defs.nameEn);
    setHeaderSubtitle(cfg.header_subtitle || defs.address);
    setLogoUrl(cfg.logo_url || '');
    setLogoBase64(cfg.logo_base64 || defs.logo || '');
    setHeaderBorder(cfg.header_border ?? true);

    setFontSizeHeader(cfg.font_size_header || 18);
    setFontSizeBody(cfg.font_size_body || 14);
    setFontSizeFooter(cfg.font_size_footer || 10);
    setFontWeight(cfg.font_weight || 'bold');
    setFontStyle(cfg.font_style || 'normal');
    setFontColor(cfg.font_color || '#1e293b');
    setHeaderLayoutPreset(cfg.header_layout_preset || 'modern_banner');
    setFooterDisclaimerText(cfg.footer_disclaimer_text || 'هذه المراسلة وثيقة سيادية معتمدة ومحمية بموجب بروتوكولات الأرشفة والتوقيع الرقمي للمشروع.');

    setHeaderBgType(cfg.header_bg_type || 'transparent');
    setHeaderBgColor(cfg.header_bg_color || '#1e3a8a');
    setHeaderBgGradientStart(cfg.header_bg_gradient_start || '#1e3a8a');
    setHeaderBgGradientEnd(cfg.header_bg_gradient_end || '#0d9488');
    setHeaderDividerStyle(cfg.header_divider_style || 'solid');
    setHeaderDividerThickness(cfg.header_divider_thickness ?? 2);
    setHeaderLogoAlign(cfg.header_logo_align || 'start');
    setHeaderFontSlant(cfg.header_font_slant || 'normal');
    setFooterFontSlant(cfg.footer_font_slant || 'normal');
    setFooterFontColor(cfg.footer_font_color || '#64748b');

    setShowTaxId(cfg.show_tax_id ?? false);
    setTaxIdValue(cfg.tax_id_value || '30918472910003');
    setShowCommercialReg(cfg.show_commercial_reg ?? false);
    setCommercialRegValue(cfg.commercial_reg_value || '48192-LY');
    setShowSerial(cfg.show_serial ?? true);
    setShowHijriDate(cfg.show_hijri_date ?? true);
    setShowGregorianDate(cfg.show_gregorian_date ?? true);

    setShowQr(cfg.show_qr ?? true);
    setQrPosition(cfg.qr_position || 'bottom-left');
    setQrSizeMm(cfg.qr_size_mm || 26);
    setShowHmacChecksum(cfg.show_hmac_checksum ?? true);
    setShowSignatureBox(cfg.show_signature_box ?? true);
    setSignatoryTitle(cfg.signatory_title || 'الأمين العام للديوان / Secretary General');

    setFooterText(cfg.footer_text || 'نظام Septimus OS الموحد • طرابلس، ليبيا • نظام الختم والمراسلات السيادية (HMAC256 QR Verifiable)');
    setShowPageNumbers(cfg.show_page_numbers ?? true);
  };

  const handleCreateNew = () => {
    const defs = getCompanyDefaults();
    setSelectedId(null);
    setName(isRtl ? 'قالب مراسلات سيادية (بدون رقم ضريبي)' : 'Sovereign External Template (Clean)');
    setType('external_letter');
    setFontFamily('Cairo');
    setHeaderTitleAr(defs.nameAr);
    setHeaderTitleEn(defs.nameEn);
    setHeaderSubtitle(defs.address);
    setLogoUrl('');
    setLogoBase64(defs.logo || '');
    setHeaderBorder(true);
    setFontSizeHeader(18);
    setFontSizeBody(14);
    setFontSizeFooter(10);
    setFontWeight('bold');
    setFontStyle('normal');
    setFontColor('#1e293b');
    setHeaderLayoutPreset('modern_banner');
    setFooterDisclaimerText('هذه المراسلة وثيقة سيادية معتمدة ومحمية بموجب بروتوكولات الأرشفة والتوقيع الرقمي للمشروع.');

    setHeaderBgType('transparent');
    setHeaderBgColor('#1e3a8a');
    setHeaderBgGradientStart('#1e3a8a');
    setHeaderBgGradientEnd('#0d9488');
    setHeaderDividerStyle('solid');
    setHeaderDividerThickness(2);
    setHeaderLogoAlign('start');
    setHeaderFontSlant('normal');
    setFooterFontSlant('normal');
    setFooterFontColor('#64748b');

    setShowTaxId(false);
    setShowCommercialReg(false);
    setShowSerial(true);
    setShowHijriDate(true);
    setShowGregorianDate(true);
    setShowQr(true);
    setQrPosition('bottom-left');
    setQrSizeMm(26);
    setShowHmacChecksum(true);
    setShowSignatureBox(true);
    setSignatoryTitle('الأمين العام للديوان / Secretary General');
    setFooterText('نظام Septimus OS الموحد • طرابلس، ليبيا • نظام الختم والمراسلات السيادية (HMAC256 QR Verifiable)');
    setShowPageNumbers(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    
    const taxHtml = showTaxId ? `<div style="font-size:11px;color:#475569;">الرقم الضريبي (Tax ID): <strong>${taxIdValue}</strong></div>` : '';
    const regHtml = showCommercialReg ? `<div style="font-size:11px;color:#475569;">السجل التجاري (CR): <strong>${commercialRegValue}</strong></div>` : '';
    const effectiveLogo = logoBase64 || logoUrl;
    const fontWeightCss = fontWeight === 'black' ? 900 : fontWeight === 'bold' ? 700 : fontWeight === 'medium' ? 500 : 400;
    const fontStyleCss = headerFontSlant === 'italic' || fontStyle === 'italic' ? 'italic' : 'normal';
    const footerStyleCss = footerFontSlant === 'italic' ? 'italic' : 'normal';

    const bgCss =
      headerBgType === 'gradient'
        ? `background: linear-gradient(135deg, ${headerBgGradientStart}, ${headerBgGradientEnd}); color: #ffffff; padding: 18px 22px; border-radius: 12px;`
        : headerBgType === 'solid'
        ? `background: ${headerBgColor}; color: #ffffff; padding: 18px 22px; border-radius: 12px;`
        : headerBgType === 'boxed'
        ? `background: #f8fafc; border: 1px solid #e2e8f0; padding: 18px 22px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);`
        : `background: transparent;`;

    const textColorCss = headerBgType === 'gradient' || headerBgType === 'solid' ? '#ffffff' : fontColor;
    const subtextColorCss = headerBgType === 'gradient' || headerBgType === 'solid' ? 'rgba(255,255,255,0.85)' : '#64748B';

    const dividerCss = !headerBorder
      ? 'margin-bottom: 20px;'
      : headerDividerStyle === 'gradient'
      ? `height: ${headerDividerThickness || 3}px; background: linear-gradient(to right, ${headerBgGradientStart || '#1e3a8a'}, ${headerBgGradientEnd || '#0d9488'}); border: none; margin: 16px 0 20px; border-radius: 4px;`
      : headerDividerStyle === 'double'
      ? `border-bottom: ${Math.max(3, (headerDividerThickness || 3) * 1.5)}px double ${textColorCss}; margin-bottom: 20px; padding-bottom: 12px;`
      : headerDividerStyle === 'dashed'
      ? `border-bottom: ${headerDividerThickness || 2}px dashed ${textColorCss}; margin-bottom: 20px; padding-bottom: 12px;`
      : `border-bottom: ${headerDividerThickness || 2}px solid ${textColorCss}; margin-bottom: 20px; padding-bottom: 12px;`;

    const logoImgHtml = effectiveLogo
      ? `<img src="${effectiveLogo}" alt="Logo" style="max-height: 70px; margin: ${
          headerLogoAlign === 'center' ? '0 auto 12px' : headerLogoAlign === 'end' ? '0 0 12px auto' : '0 auto 12px 0'
        }; display: block;" />`
      : '';

    let generatedHeaderHtml = '';
    if (headerLayoutPreset === 'split_classic') {
      generatedHeaderHtml = `
<div style="${bgCss} ${dividerCss} font-family: ${fontFamily}, sans-serif; color: ${textColorCss};">
  ${logoImgHtml}
  <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
    <div style="text-align: right; width: 45%;">
      <h2 style="margin: 0; font-size: ${fontSizeHeader}px; font-weight: ${fontWeightCss}; font-style: ${fontStyleCss}; color: ${textColorCss};">${headerTitleAr}</h2>
      ${headerSubtitle ? `<p style="margin: 4px 0 0; font-size: ${Math.max(10, fontSizeBody - 2)}px; color: ${subtextColorCss};">${headerSubtitle}</p>` : ''}
    </div>
    <div style="text-align: left; width: 45%; direction: ltr;">
      ${headerTitleEn ? `<h4 style="margin: 0; font-size: ${Math.max(10, fontSizeHeader - 4)}px; font-weight: 700; color: ${subtextColorCss}; letter-spacing: 0.5px;">${headerTitleEn}</h4>` : ''}
    </div>
  </div>
  ${showTaxId || showCommercialReg ? `<div style="display:flex; justify-content:center; gap:20px; margin-top:10px; font-size:11px; color:${subtextColorCss};">${taxHtml}${regHtml}</div>` : ''}
</div>`.trim();
    } else if (headerLayoutPreset === 'minimalist_emblem') {
      generatedHeaderHtml = `
<div style="text-align: center; ${bgCss} ${dividerCss} font-family: ${fontFamily}, sans-serif; color: ${textColorCss};">
  ${logoImgHtml}
  <h2 style="margin: 0; font-size: ${fontSizeHeader}px; font-weight: ${fontWeightCss}; font-style: ${fontStyleCss}; color: ${textColorCss}; letter-spacing: 0.5px;">${headerTitleAr}</h2>
  ${headerSubtitle ? `<p style="margin: 4px 0 0; font-size: ${Math.max(10, fontSizeBody - 2)}px; color: ${subtextColorCss};">${headerSubtitle}</p>` : ''}
  ${showTaxId || showCommercialReg ? `<div style="display:flex; justify-content:center; gap:20px; margin-top:10px; font-size:11px; color:${subtextColorCss};">${taxHtml}${regHtml}</div>` : ''}
</div>`.trim();
    } else {
      // modern_banner (default)
      generatedHeaderHtml = `
<div style="${bgCss} ${dividerCss} font-family: ${fontFamily}, sans-serif; color: ${textColorCss};">
  <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
    <div style="display: flex; align-items: center; gap: 14px;">
      ${effectiveLogo ? `<img src="${effectiveLogo}" alt="Logo" style="max-height: 60px; flex-shrink: 0;" />` : ''}
      <div>
        <h2 style="margin: 0; font-size: ${fontSizeHeader}px; font-weight: ${fontWeightCss}; font-style: ${fontStyleCss}; color: ${textColorCss};">${headerTitleAr}</h2>
        ${headerTitleEn ? `<h4 style="margin: 2px 0 0; font-size: ${Math.max(10, fontSizeHeader - 5)}px; font-weight: 600; color: ${subtextColorCss};">${headerTitleEn}</h4>` : ''}
        ${headerSubtitle ? `<p style="margin: 3px 0 0; font-size: ${Math.max(10, fontSizeBody - 2)}px; color: ${subtextColorCss};">${headerSubtitle}</p>` : ''}
      </div>
    </div>
    ${showTaxId || showCommercialReg ? `<div style="text-align:left; font-size:11px; color:${subtextColorCss};">${taxHtml}${regHtml}</div>` : ''}
  </div>
</div>`.trim();
    }

    const generatedFooterHtml = `
<div style="text-align: center; border-top: 1px solid #CBD5E1; padding-top: 15px; margin-top: 30px; font-size: ${fontSizeFooter}px; color: ${footerFontColor || '#64748B'}; font-style: ${footerStyleCss}; font-family: ${fontFamily}, sans-serif;">
  <p style="margin: 0; font-weight: 600; color: ${footerFontColor || fontColor};">${footerText}</p>
  ${footerDisclaimerText ? `<p style="margin: 4px 0 0; font-size: ${Math.max(8, fontSizeFooter - 1)}px; font-style: italic; opacity: 0.85;">${footerDisclaimerText}</p>` : ''}
  ${showPageNumbers ? `<p style="margin: 4px 0 0; font-size: ${Math.max(8, fontSizeFooter - 1)}px; opacity: 0.75;">صفحة 1 من 1 • مطبوع ومنجز عبر Septimus OS</p>` : ''}
</div>`.trim();

    const payload = {
      name,
      type,
      header_html: generatedHeaderHtml,
      footer_html: generatedFooterHtml,
      layout_config: {
        logo_url: logoUrl,
        logo_base64: logoBase64,
        show_qr: showQr,
        show_serial: showSerial,
        font_family: fontFamily,
        font_size_header: fontSizeHeader,
        font_size_body: fontSizeBody,
        font_size_footer: fontSizeFooter,
        font_weight: fontWeight,
        font_style: fontStyle,
        font_color: fontColor,
        header_layout_preset: headerLayoutPreset,
        footer_disclaimer_text: footerDisclaimerText,
        header_bg_type: headerBgType,
        header_bg_color: headerBgColor,
        header_bg_gradient_start: headerBgGradientStart,
        header_bg_gradient_end: headerBgGradientEnd,
        header_divider_style: headerDividerStyle,
        header_divider_thickness: headerDividerThickness,
        header_logo_align: headerLogoAlign,
        header_font_slant: headerFontSlant,
        footer_font_slant: footerFontSlant,
        footer_font_color: footerFontColor,
        show_tax_id: showTaxId,
        tax_id_value: taxIdValue,
        show_commercial_reg: showCommercialReg,
        commercial_reg_value: commercialRegValue,
        show_hijri_date: showHijriDate,
        show_gregorian_date: showGregorianDate,
        header_title_ar: headerTitleAr,
        header_title_en: headerTitleEn,
        header_subtitle: headerSubtitle,
        header_border: headerBorder,
        qr_position: qrPosition,
        qr_size_mm: qrSizeMm,
        show_hmac_checksum: showHmacChecksum,
        show_signature_box: showSignatureBox,
        signatory_title: signatoryTitle,
        footer_text: footerText,
        show_page_numbers: showPageNumbers,
      }
    };

    if (selectedId) {
      await updateTemplate(selectedId, payload);
      setSuccessMsg(isRtl ? 'تم تحديث القالب البصري بنجاح!' : 'Canvas Template updated successfully!');
    } else {
      await createTemplate(payload);
      setSuccessMsg(isRtl ? 'تم حفظ القالب المؤسسي الجديد بنجاح!' : 'Institutional Canvas Template created successfully!');
    }

    setTimeout(() => setSuccessMsg(''), 3500);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm(isRtl ? 'هل أنت متأكد من حذف هذا القالب؟' : 'Are you sure you want to delete this template?')) {
      await deleteTemplate(id);
      if (selectedId === id) handleCreateNew();
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full text-slate-900 dark:text-slate-100 animate-in fade-in duration-300">
      {/* LEFT / SIDEBAR: Templates List & Block Suppressor Toolbar */}
      <div className="w-full lg:w-96 shrink-0 flex flex-col gap-4">
        {/* Templates Selector Card */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-brand" />
              <span>{isRtl ? 'القوالب المحفوظة' : 'Saved Templates'}</span>
            </h3>
            <button
              onClick={handleCreateNew}
              className="px-3 py-1.5 rounded-xl bg-brand/10 hover:bg-brand/20 text-brand font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isRtl ? 'قالب جديد' : 'New Template'}</span>
            </button>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => handleSelect(tpl)}
                className={`p-2.5 rounded-xl text-xs font-semibold flex items-center justify-between cursor-pointer transition-all ${
                  selectedId === tpl.id
                    ? 'bg-brand text-white shadow-sm shadow-brand/20'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Layout className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{tpl.name}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(tpl.id);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {templates.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">{isRtl ? 'لا توجد قوالب محفوظة بعد' : 'No saved templates'}</p>
            )}
          </div>
        </div>

        {/* Canvas Block Editor Tabs Card */}
        <div className="flex-1 p-4 rounded-2xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm flex flex-col gap-4 overflow-y-auto max-h-[calc(100vh-280px)]">
          {/* Top Info */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              {isRtl ? 'اسم القالب المؤسسي' : 'Template Name'}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isRtl ? 'مثال: قالب مراسلات سيادية (بدون رقم ضريبي)' : 'e.g. Sovereign External Template'}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          {/* Designer Category Tabs */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-xs font-bold">
            <button
              onClick={() => setActiveTab('blocks')}
              className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'blocks' ? 'bg-white dark:bg-[#1a1d21] text-brand shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isRtl ? 'الحقول والإخفاء' : 'Blocks'}</span>
            </button>
            <button
              onClick={() => setActiveTab('styling')}
              className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'styling' ? 'bg-white dark:bg-[#1a1d21] text-brand shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Type className="w-3.5 h-3.5" />
              <span>{isRtl ? 'الترويسة والخط' : 'Header'}</span>
            </button>
            <button
              onClick={() => setActiveTab('seal')}
              className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'seal' ? 'bg-white dark:bg-[#1a1d21] text-brand shadow-sm' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isRtl ? 'الختم والـ QR' : 'QR Seal'}</span>
            </button>
          </div>

          {/* TAB 1: BLOCKS & SUPPRESSOR (Dynamic Visibility & Deletion Engine) */}
          {activeTab === 'blocks' && (
            <div className="space-y-3 pt-1">
              <div className="p-2.5 rounded-xl bg-brand/5 border border-brand/20 text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand shrink-0" />
                <span>{isRtl ? 'نظام الحذف والإخفاء الفوري: انقر على أيقونة العين أو الحذف لإلغاء الحقل من القالب وإعادة ضبط المسافات تلقائياً.' : 'Click eye/delete icon to instantly suppress any block and auto-reflow spacing.'}</span>
              </div>

              {/* Tax ID Block Suppressor */}
              <div className={`p-3 rounded-xl border transition-all ${showTaxId ? 'bg-white dark:bg-[#1a1d21] border-brand/40 shadow-sm' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-65'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-brand" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{isRtl ? 'الرقم الضريبي (Tax ID)' : 'Tax Number Block'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowTaxId(!showTaxId)}
                      className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${showTaxId ? 'bg-brand text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 hover:text-rose-500'}`}
                      title={showTaxId ? 'إخفاء الرقم الضريبي من هذا القالب' : 'إظهار الرقم الضريبي'}
                    >
                      {showTaxId ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      <span>{showTaxId ? (isRtl ? 'ظاهر' : 'Visible') : (isRtl ? 'محذوف/مخفي' : 'Hidden')}</span>
                    </button>
                  </div>
                </div>
                {showTaxId && (
                  <input
                    type="text"
                    value={taxIdValue}
                    onChange={(e) => setTaxIdValue(e.target.value)}
                    placeholder="مثال: 30918472910003"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                )}
              </div>

              {/* Commercial Registration Block */}
              <div className={`p-3 rounded-xl border transition-all ${showCommercialReg ? 'bg-white dark:bg-[#1a1d21] border-brand/40 shadow-sm' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-65'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-brand" />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{isRtl ? 'السجل التجاري / القيد (CR)' : 'Commercial Registration'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCommercialReg(!showCommercialReg)}
                    className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${showCommercialReg ? 'bg-brand text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 hover:text-rose-500'}`}
                  >
                    {showCommercialReg ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{showCommercialReg ? (isRtl ? 'ظاهر' : 'Visible') : (isRtl ? 'محذوف/مخفي' : 'Hidden')}</span>
                  </button>
                </div>
                {showCommercialReg && (
                  <input
                    type="text"
                    value={commercialRegValue}
                    onChange={(e) => setCommercialRegValue(e.target.value)}
                    placeholder="مثال: 48192-LY"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                )}
              </div>

              {/* Serial Number Toggle */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-[#1a1d21]/60">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand" />
                  <span>{isRtl ? 'رقم القيد والصادر/الوارد (Serial Number)' : 'Serial Number Block'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowSerial(!showSerial)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${showSerial ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}
                >
                  {showSerial ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{showSerial ? (isRtl ? 'مفعل' : 'Active') : (isRtl ? 'مخفي' : 'Hidden')}</span>
                </button>
              </div>

              {/* Dates Toggle */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-[#1a1d21]/60">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand" />
                  <span>{isRtl ? 'التاريخ الهجري والميلادي' : 'Hijri / Gregorian Dates'}</span>
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setShowHijriDate(!showHijriDate)}
                    className={`px-2 py-1 rounded text-[11px] font-bold ${showHijriDate ? 'bg-brand text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}
                  >
                    {isRtl ? 'هجري' : 'Hijri'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowGregorianDate(!showGregorianDate)}
                    className={`px-2 py-1 rounded text-[11px] font-bold ${showGregorianDate ? 'bg-brand text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}
                  >
                    {isRtl ? 'ميلادي' : 'Gregorian'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: HEADER & TYPOGRAPHY STUDIO */}
          {activeTab === 'styling' && (
            <div className="space-y-4 pt-1">
              {/* Logo Upload & Branding */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1d21]/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-brand" />
                    <span>{isRtl ? 'شعار المشروع (Sovereign Logo)' : 'Project Logo Upload'}</span>
                  </span>
                  {(logoBase64 || logoUrl) && (
                    <button
                      type="button"
                      onClick={() => { setLogoBase64(''); setLogoUrl(''); }}
                      className="text-[11px] text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isRtl ? 'إزالة الشعار' : 'Remove'}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                    <Upload className="w-4 h-4 text-brand shrink-0" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 truncate">
                      {logoBase64 ? (isRtl ? 'تم رفع الشعار المخصص ✓' : 'Custom Logo Uploaded ✓') : (isRtl ? 'اختر صورة أو شعار من جهازك' : 'Upload PNG / SVG Logo')}
                    </span>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{isRtl ? 'محاذاة الشعار' : 'Logo Alignment'}</span>
                  <div className="flex gap-1">
                    {[
                      { id: 'start', label: isRtl ? 'يمين' : 'Start' },
                      { id: 'center', label: isRtl ? 'وسط' : 'Center' },
                      { id: 'end', label: isRtl ? 'يسار' : 'End' },
                    ].map((align) => (
                      <button
                        key={align.id}
                        type="button"
                        onClick={() => setHeaderLogoAlign(align.id as 'start' | 'center' | 'end')}
                        className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                          headerLogoAlign === align.id ? 'bg-brand text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {align.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-[11px] text-slate-400">
                  {isRtl ? 'أو أدخل رابط الصورة مباشرة:' : 'Or enter direct URL:'}
                </div>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://.../emblem.png (اختياري)"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-mono"
                />
              </div>

              {/* Header Layout & Background Studio */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1d21]/60 space-y-3">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Layout className="w-4 h-4 text-brand" />
                  <span>{isRtl ? 'نمط وقالب الترويسة العليا' : 'Header Layout Style'}</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHeaderLayoutPreset('modern_banner')}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                      headerLayoutPreset === 'modern_banner'
                        ? 'bg-brand text-white border-brand shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{isRtl ? 'شريط مؤسسي' : 'Banner'}</span>
                    <span className={`text-[10px] ${headerLayoutPreset === 'modern_banner' ? 'text-brand-100' : 'text-slate-400'}`}>
                      {isRtl ? 'شعار يمين وعناوين متجانسة' : 'Left logo + clean align'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeaderLayoutPreset('split_classic')}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                      headerLayoutPreset === 'split_classic'
                        ? 'bg-brand text-white border-brand shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{isRtl ? 'مزدوج كلاسيكي' : 'Split Classic'}</span>
                    <span className={`text-[10px] ${headerLayoutPreset === 'split_classic' ? 'text-brand-100' : 'text-slate-400'}`}>
                      {isRtl ? 'عربي يمين و لاتيني يسار' : 'AR right + EN left'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeaderLayoutPreset('minimalist_emblem')}
                    className={`py-2 px-2 rounded-lg text-xs font-bold border flex flex-col items-center gap-1 transition-all ${
                      headerLayoutPreset === 'minimalist_emblem'
                        ? 'bg-brand text-white border-brand shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{isRtl ? 'شعار وسط' : 'Minimalist'}</span>
                    <span className={`text-[10px] ${headerLayoutPreset === 'minimalist_emblem' ? 'text-brand-100' : 'text-slate-400'}`}>
                      {isRtl ? 'ترويسة مركزية مبسطة' : 'Centered title & logo'}
                    </span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    {isRtl ? 'خلفية الترويسة (Header Background Style)' : 'Header Background Style'}
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'transparent', label: isRtl ? 'شفاف' : 'Clean' },
                      { id: 'solid', label: isRtl ? 'ملون صلب' : 'Solid' },
                      { id: 'gradient', label: isRtl ? 'تدرج ملكي' : 'Gradient' },
                      { id: 'boxed', label: isRtl ? 'بطاقة إطار' : 'Boxed' },
                    ].map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setHeaderBgType(bg.id as 'transparent' | 'solid' | 'gradient' | 'boxed')}
                        className={`py-1.5 px-2 rounded text-xs font-bold transition-all ${
                          headerBgType === bg.id
                            ? 'bg-brand text-white shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {bg.label}
                      </button>
                    ))}
                  </div>

                  {headerBgType === 'solid' && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-slate-600">{isRtl ? 'اختر لون الترويسة الصائب:' : 'Solid Color:'}</span>
                      <input
                        type="color"
                        value={headerBgColor}
                        onChange={(e) => setHeaderBgColor(e.target.value)}
                        className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                      />
                    </div>
                  )}

                  {headerBgType === 'gradient' && (
                    <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span>{isRtl ? 'بدء التدرج:' : 'Start Color:'}</span>
                        <input
                          type="color"
                          value={headerBgGradientStart}
                          onChange={(e) => setHeaderBgGradientStart(e.target.value)}
                          className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span>{isRtl ? 'نهاية التدرج:' : 'End Color:'}</span>
                        <input
                          type="color"
                          value={headerBgGradientEnd}
                          onChange={(e) => setHeaderBgGradientEnd(e.target.value)}
                          className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Divider & Border Customizer Studio */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1d21]/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-brand" />
                    <span>{isRtl ? 'الخط الفاصل للترويسة (Header Separator Studio)' : 'Header Divider Studio'}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={headerBorder}
                    onChange={(e) => setHeaderBorder(e.target.checked)}
                    className="w-4 h-4 text-brand rounded focus:ring-brand accent-brand cursor-pointer"
                  />
                </div>

                {headerBorder && (
                  <div className="space-y-2 pt-1 animate-in fade-in duration-200">
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: 'solid', label: isRtl ? 'متصل' : 'Solid' },
                        { id: 'double', label: isRtl ? 'مزدوج' : 'Double' },
                        { id: 'dashed', label: isRtl ? 'متقطع' : 'Dashed' },
                        { id: 'gradient', label: isRtl ? 'تدرج سيادي' : 'Gradient' },
                      ].map((divStyle) => (
                        <button
                          key={divStyle.id}
                          type="button"
                          onClick={() => setHeaderDividerStyle(divStyle.id as 'solid' | 'double' | 'dashed' | 'gradient')}
                          className={`py-1 rounded text-xs font-bold transition-colors ${
                            headerDividerStyle === divStyle.id
                              ? 'bg-brand text-white shadow-sm'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {divStyle.label}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">
                        {isRtl ? 'سُمك الخط الفاصل' : 'Divider Thickness'} ({headerDividerThickness}px)
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={6}
                        value={headerDividerThickness}
                        onChange={(e) => setHeaderDividerThickness(Number(e.target.value))}
                        className="w-full accent-brand cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Typography Studio (Family, Sizes, Weights, Colors) */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1d21]/60 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Type className="w-4 h-4 text-brand" />
                    <span>{isRtl ? 'استوديو الخطوط والألوان (Typography & Colors)' : 'Typography & Color Studio'}</span>
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {isRtl ? 'نوع الخط المؤسسي' : 'Font Family'}
                  </label>
                  <select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold focus:ring-2 focus:ring-brand"
                  >
                    <option value="Cairo">Cairo (كايرا السيادي المعاصر)</option>
                    <option value="Amiri">Amiri (الخط الأميري التراثي)</option>
                    <option value="Inter">Inter (الخط الهندسي الحديث)</option>
                    <option value="Tajawal">Tajawal (تجوال المؤسسي)</option>
                  </select>
                </div>

                {/* Font Sizes */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      {isRtl ? 'حجم العنوان' : 'Header Size'} ({fontSizeHeader}pt)
                    </label>
                    <input
                      type="range"
                      min={14}
                      max={28}
                      value={fontSizeHeader}
                      onChange={(e) => setFontSizeHeader(Number(e.target.value))}
                      className="w-full accent-brand cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      {isRtl ? 'حجم النص' : 'Body Size'} ({fontSizeBody}pt)
                    </label>
                    <input
                      type="range"
                      min={11}
                      max={18}
                      value={fontSizeBody}
                      onChange={(e) => setFontSizeBody(Number(e.target.value))}
                      className="w-full accent-brand cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      {isRtl ? 'حجم الفوتر' : 'Footer Size'} ({fontSizeFooter}pt)
                    </label>
                    <input
                      type="range"
                      min={8}
                      max={13}
                      value={fontSizeFooter}
                      onChange={(e) => setFontSizeFooter(Number(e.target.value))}
                      className="w-full accent-brand cursor-pointer"
                    />
                  </div>
                </div>

                {/* Font Weight, Slant & Color Swatches */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFontWeight(fontWeight === 'black' ? 'normal' : fontWeight === 'bold' ? 'black' : 'bold')}
                      className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border transition-all ${
                        fontWeight !== 'normal' ? 'bg-brand text-white border-brand' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700'
                      }`}
                      title="تبديل وزن الخط"
                    >
                      <Bold className="w-3.5 h-3.5" />
                      <span>{fontWeight === 'black' ? 'Black' : fontWeight === 'bold' ? 'Bold' : 'Normal'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newSlant = headerFontSlant === 'italic' ? 'normal' : 'italic';
                        setHeaderFontSlant(newSlant);
                        setFontStyle(newSlant);
                      }}
                      className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border transition-all ${
                        headerFontSlant === 'italic' || fontStyle === 'italic' ? 'bg-brand text-white border-brand' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700'
                      }`}
                      title="ميلول الخط (Italic Slant)"
                    >
                      <Italic className="w-3.5 h-3.5" />
                      <span>{isRtl ? 'مائل' : 'Slant'}</span>
                    </button>
                  </div>

                  {/* Official Institutional Colors */}
                  <div className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-slate-400" />
                    {[
                      { hex: '#1e293b', name: 'Slate' },
                      { hex: '#0f172a', name: 'Navy Black' },
                      { hex: '#1e3a8a', name: 'Royal Blue' },
                      { hex: '#14532d', name: 'Sovereign Green' },
                      { hex: '#7f1d1d', name: 'Crimson' },
                    ].map((col) => (
                      <button
                        key={col.hex}
                        type="button"
                        onClick={() => setFontColor(col.hex)}
                        style={{ backgroundColor: col.hex }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform ${
                          fontColor === col.hex ? 'border-brand scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                        }`}
                        title={col.name}
                      />
                    ))}
                    <input
                      type="color"
                      value={fontColor}
                      onChange={(e) => setFontColor(e.target.value)}
                      className="w-6 h-6 rounded border border-slate-300 dark:border-slate-700 bg-transparent cursor-pointer"
                      title="لون مخصص"
                    />
                  </div>
                </div>
              </div>

              {/* Header Text Details */}
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {isRtl ? 'الترويسة الرئيسية (عربي)' : 'Header Title (AR)'}
                  </label>
                  <input
                    type="text"
                    value={headerTitleAr}
                    onChange={(e) => setHeaderTitleAr(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {isRtl ? 'الترويسة الثانوية (إنجليزي/لاتيني)' : 'Header Title (EN)'}
                  </label>
                  <input
                    type="text"
                    value={headerTitleEn}
                    onChange={(e) => setHeaderTitleEn(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                    {isRtl ? 'العنوان الفرعي للمكتب أو الإدارة' : 'Sub-Directorate Title'}
                  </label>
                  <input
                    type="text"
                    value={headerSubtitle}
                    onChange={(e) => setHeaderSubtitle(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-300"
                  />
                </div>
              </div>

              {/* Footer & Disclaimer Studio */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1d21]/60 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-brand" />
                    <span>{isRtl ? 'تخصيص الفوتر وألوانه (Footer Studio)' : 'Footer Studio'}</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFooterFontSlant(footerFontSlant === 'italic' ? 'normal' : 'italic')}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                        footerFontSlant === 'italic' ? 'bg-brand text-white border-brand' : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      <Italic className="w-3 h-3 inline mr-0.5" />
                      <span>{isRtl ? 'ميلول' : 'Italic'}</span>
                    </button>
                    <input
                      type="color"
                      value={footerFontColor}
                      onChange={(e) => setFooterFontColor(e.target.value)}
                      className="w-6 h-6 rounded border border-slate-300 cursor-pointer"
                      title="لون خط الفوتر"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  placeholder="نظام Septimus OS • طرابلس، ليبيا..."
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold"
                />
                <textarea
                  value={footerDisclaimerText}
                  onChange={(e) => setFooterDisclaimerText(e.target.value)}
                  placeholder="عبارة السرية والحماية المعتمدة..."
                  rows={2}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-600 dark:text-slate-300 font-normal resize-none"
                />
              </div>
            </div>
          )}

          {/* TAB 3: QR SEAL & SIGNATURE BOX */}
          {activeTab === 'seal' && (
            <div className="space-y-3 pt-1">
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-[#1a1d21]/60">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-brand" />
                  <span>{isRtl ? 'رمز الختم الإلكتروني الخارجي (QR Code)' : 'External QR Checksum Seal'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowQr(!showQr)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors ${showQr ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}
                >
                  {showQr ? <Check className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  <span>{showQr ? (isRtl ? 'مفعل بالمحاذاة' : 'Enabled') : (isRtl ? 'محذوف' : 'Disabled')}</span>
                </button>
              </div>

              {showQr && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                      {isRtl ? 'موضع الختم على ورقة A4 (`QR Position`)' : 'QR Seal Position'}
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {(['bottom-left', 'bottom-center', 'bottom-right'] as const).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setQrPosition(pos)}
                          className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                            qrPosition === pos ? 'bg-brand text-white border-brand' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {pos === 'bottom-left' ? (isRtl ? 'أسفل يسار' : 'Bottom Left') : pos === 'bottom-center' ? (isRtl ? 'المنتصف' : 'Center') : (isRtl ? 'أسفل يمين' : 'Bottom Right')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                      <span>{isRtl ? 'حجم الختم بالملليمتر (Size in mm)' : 'QR Size (mm)'}</span>
                      <span className="font-mono text-brand">{qrSizeMm}mm × {qrSizeMm}mm</span>
                    </div>
                    <input
                      type="range"
                      min={18}
                      max={40}
                      value={qrSizeMm}
                      onChange={(e) => setQrSizeMm(Number(e.target.value))}
                      className="w-full accent-brand cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{isRtl ? 'إظهار بصمة التشفير HMAC256 بجوار الختم' : 'Show HMAC Cryptographic Checksum'}</span>
                    <input
                      type="checkbox"
                      checked={showHmacChecksum}
                      onChange={(e) => setShowHmacChecksum(e.target.checked)}
                      className="w-4 h-4 text-brand rounded focus:ring-brand accent-brand cursor-pointer"
                    />
                  </div>
                </>
              )}

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Stamp className="w-4 h-4 text-brand" />
                    <span>{isRtl ? 'مربع التوقيع المكتبي والختم اليدوي المعتمد' : 'Signature Box & Physical Stamp Area'}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={showSignatureBox}
                    onChange={(e) => setShowSignatureBox(e.target.checked)}
                    className="w-4 h-4 text-brand rounded focus:ring-brand accent-brand cursor-pointer"
                  />
                </div>
                {showSignatureBox && (
                  <input
                    type="text"
                    value={signatoryTitle}
                    onChange={(e) => setSignatoryTitle(e.target.value)}
                    placeholder="المسمى الوظيفي للموقع المعتمد"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-xs font-semibold"
                  />
                )}
              </div>
            </div>
          )}

          {/* Action Save Button */}
          <div className="mt-auto pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
            <button
              onClick={handleSave}
              className="flex-1 py-2.5 px-4 rounded-xl bg-brand hover:bg-brand/90 text-white font-bold text-xs shadow-md shadow-brand/20 flex items-center justify-center gap-2 transition-all"
            >
              <Save className="w-4 h-4" />
              <span>{isRtl ? 'حفظ وتعميد القالب' : 'Save Institutional Canvas'}</span>
            </button>
          </div>

          {successMsg && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold text-center animate-in fade-in">
              {successMsg}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT / CENTER: Live Millimeter A4 Sovereign Canvas Render Engine */}
      <div className="flex-1 flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-slate-800/80 shadow-sm text-xs font-bold">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <Layout className="w-4 h-4 text-brand" />
            <span>{isRtl ? 'المعاينة الحية الفورية (أبعاد A4 الحقيقية بالملليمتر: 210mm × 297mm)' : 'Live Millimeter Canvas (A4 Sovereign Proportion)'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold flex items-center gap-1">
              <Check className="w-3 h-3" /> Auto-Reflow Layout Active
            </span>
          </div>
        </div>

        {/* The Live A4 Sheet Container */}
        <div className="flex-1 overflow-y-auto p-6 rounded-2xl bg-slate-200/60 dark:bg-[#1a1d21]/80 border border-slate-300 dark:border-slate-800 flex items-start justify-center">
          <div
            style={{ fontFamily: fontFamily, color: fontColor }}
            className="w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 p-[20mm] shadow-2xl rounded border border-slate-300 flex flex-col justify-between relative overflow-hidden transition-all duration-300"
          >
            {/* TOP AREA: Header + Institutional Identifiers */}
            <div>
              {/* Sovereign Header Block based on Layout Preset */}
              <div
                style={{
                  background:
                    headerBgType === 'solid'
                      ? headerBgColor
                      : headerBgType === 'gradient'
                      ? `linear-gradient(135deg, ${headerBgGradientStart}, ${headerBgGradientEnd})`
                      : headerBgType === 'boxed'
                      ? '#f8fafc'
                      : 'transparent',
                  border: headerBgType === 'boxed' ? '1px solid #e2e8f0' : 'none',
                  borderRadius: headerBgType === 'boxed' || headerBgType === 'gradient' || headerBgType === 'solid' ? '12px' : '0px',
                  padding: headerBgType !== 'transparent' ? '16px 20px' : headerBorder ? '0 0 16px 0' : '0px',
                  marginBottom: '20px',
                  borderBottom: headerBorder
                    ? `${headerDividerThickness}px ${headerDividerStyle === 'double' ? 'double' : headerDividerStyle === 'dashed' ? 'dashed' : 'solid'} ${
                        headerDividerStyle === 'gradient' ? headerBgGradientStart : fontColor
                      }`
                    : 'none',
                  color: headerBgType === 'gradient' ? '#ffffff' : fontColor,
                  textAlign: headerLogoAlign === 'center' ? 'center' : headerLogoAlign === 'end' ? (isRtl ? 'left' : 'right') : (isRtl ? 'right' : 'left'),
                  fontStyle: headerFontSlant === 'italic' ? 'italic' : fontStyle
                }}
                className="hover:outline hover:outline-2 hover:outline-brand/40 hover:outline-dashed transition-all"
              >
                {headerLayoutPreset === 'split_classic' ? (
                  <div>
                    {(logoBase64 || logoUrl) && (
                      <img
                        src={logoBase64 || logoUrl}
                        alt="Logo"
                        className={`max-h-16 mb-3 object-contain block ${
                          headerLogoAlign === 'center' ? 'mx-auto' : headerLogoAlign === 'end' ? (isRtl ? 'mr-auto ml-0' : 'ml-auto mr-0') : (isRtl ? 'ml-auto mr-0' : 'mr-auto ml-0')
                        }`}
                      />
                    )}
                    <div className="flex justify-between items-center w-full gap-4">
                      <div className="text-right w-1/2">
                        <h1
                          style={{
                            fontSize: `${fontSizeHeader}px`,
                            fontWeight: fontWeight === 'black' ? 900 : fontWeight === 'bold' ? 700 : fontWeight === 'medium' ? 500 : 400,
                            fontStyle: headerFontSlant === 'italic' ? 'italic' : fontStyle,
                            color: headerBgType === 'gradient' ? '#ffffff' : fontColor
                          }}
                          className="leading-snug tracking-tight m-0"
                        >
                          {headerTitleAr}
                        </h1>
                        {headerSubtitle && (
                          <p
                            style={{
                              fontSize: `${Math.max(11, fontSizeBody - 2)}px`,
                              color: headerBgType === 'gradient' ? 'rgba(255,255,255,0.85)' : '#64748b'
                            }}
                            className="font-semibold mt-1"
                          >
                            {headerSubtitle}
                          </p>
                        )}
                      </div>
                      <div className="text-left w-1/2 ltr">
                        {headerTitleEn && (
                          <h3
                            style={{
                              fontSize: `${Math.max(10, fontSizeHeader - 4)}px`,
                              color: headerBgType === 'gradient' ? 'rgba(255,255,255,0.9)' : '#475569'
                            }}
                            className="font-extrabold uppercase tracking-wider m-0"
                          >
                            {headerTitleEn}
                          </h3>
                        )}
                      </div>
                    </div>
                  </div>
                ) : headerLayoutPreset === 'minimalist_emblem' ? (
                  <div className="text-center">
                    {(logoBase64 || logoUrl) && (
                      <img src={logoBase64 || logoUrl} alt="Logo" className="max-h-16 mx-auto mb-2 object-contain" />
                    )}
                    <h1
                      style={{
                        fontSize: `${fontSizeHeader}px`,
                        fontWeight: fontWeight === 'black' ? 900 : fontWeight === 'bold' ? 700 : fontWeight === 'medium' ? 500 : 400,
                        fontStyle: headerFontSlant === 'italic' ? 'italic' : fontStyle,
                        color: headerBgType === 'gradient' ? '#ffffff' : fontColor
                      }}
                      className="tracking-tight leading-snug m-0"
                    >
                      {headerTitleAr}
                    </h1>
                    {headerSubtitle && (
                      <p
                        style={{
                          fontSize: `${Math.max(11, fontSizeBody - 2)}px`,
                          color: headerBgType === 'gradient' ? 'rgba(255,255,255,0.85)' : '#64748b'
                        }}
                        className="font-semibold mt-1"
                      >
                        {headerSubtitle}
                      </p>
                    )}
                  </div>
                ) : (
                  /* modern_banner (default) */
                  <div className={`flex items-center gap-4 ${headerLogoAlign === 'center' ? 'flex-col text-center justify-center' : headerLogoAlign === 'end' ? 'flex-row-reverse text-end justify-between' : 'justify-between'}`}>
                    <div className={`flex items-center gap-3.5 ${headerLogoAlign === 'center' ? 'flex-col' : headerLogoAlign === 'end' ? 'flex-row-reverse' : ''}`}>
                      {(logoBase64 || logoUrl) && (
                        <img src={logoBase64 || logoUrl} alt="Logo" className="max-h-14 object-contain shrink-0" />
                      )}
                      <div>
                        <h1
                          style={{
                            fontSize: `${fontSizeHeader}px`,
                            fontWeight: fontWeight === 'black' ? 900 : fontWeight === 'bold' ? 700 : fontWeight === 'medium' ? 500 : 400,
                            fontStyle: headerFontSlant === 'italic' ? 'italic' : fontStyle,
                            color: headerBgType === 'gradient' ? '#ffffff' : fontColor
                          }}
                          className="tracking-tight leading-snug m-0"
                        >
                          {headerTitleAr}
                        </h1>
                        {headerTitleEn && (
                          <h3
                            style={{
                              fontSize: `${Math.max(10, fontSizeHeader - 5)}px`,
                              color: headerBgType === 'gradient' ? 'rgba(255,255,255,0.9)' : '#64748b'
                            }}
                            className="font-extrabold uppercase tracking-wider mt-0.5 m-0"
                          >
                            {headerTitleEn}
                          </h3>
                        )}
                        {headerSubtitle && (
                          <p
                            style={{
                              fontSize: `${Math.max(11, fontSizeBody - 2)}px`,
                              color: headerBgType === 'gradient' ? 'rgba(255,255,255,0.85)' : '#64748b'
                            }}
                            className="font-semibold mt-0.5"
                          >
                            {headerSubtitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic Suppressor Grid: Tax ID, Commercial Reg, Serial, Dates */}
              <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-700 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80 mb-6 hover:outline hover:outline-2 hover:outline-brand/40 hover:outline-dashed transition-all">
                {/* Column 1: Serial & Identifiers */}
                <div className="space-y-1.5 text-start">
                  {showSerial && (
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <span className="text-slate-500 font-normal">{isRtl ? 'الرقم الإشاري:' : 'Ref:'}</span>
                      <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">DIWAN/2026/8492</span>
                    </div>
                  )}
                  {showTaxId && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600 animate-in fade-in duration-200">
                      <span>{isRtl ? 'الرقم الضريبي:' : 'Tax ID:'}</span>
                      <strong className="font-mono text-slate-900">{taxIdValue || '30918472910003'}</strong>
                    </div>
                  )}
                  {showCommercialReg && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600 animate-in fade-in duration-200">
                      <span>{isRtl ? 'رقم القيد (CR):' : 'CR:'}</span>
                      <strong className="font-mono text-slate-900">{commercialRegValue || '48192-LY'}</strong>
                    </div>
                  )}
                </div>

                {/* Column 2: Dates & Badges */}
                <div className="space-y-1.5 text-end flex flex-col items-end justify-center">
                  {showHijriDate && (
                    <div className="text-[11px] text-slate-600">
                      <span>{isRtl ? 'التاريخ الهجري:' : 'Hijri:'}</span> <strong className="font-mono text-slate-900">28 محرم 1448 هـ</strong>
                    </div>
                  )}
                  {showGregorianDate && (
                    <div className="text-[11px] text-slate-600">
                      <span>{isRtl ? 'التاريخ الميلادي:' : 'Date:'}</span> <strong className="font-mono text-slate-900">13 / 07 / 2026 م</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Sample Subject & Body Text for Preview */}
              <div className="py-4 px-2 text-start space-y-4 hover:outline hover:outline-2 hover:outline-brand/40 hover:outline-dashed rounded transition-all">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{isRtl ? 'الموضوع:' : 'Subject:'}</span>
                  <h3
                    style={{
                      fontSize: `${Math.max(13, fontSizeBody)}px`,
                      fontWeight: fontWeight === 'black' ? 900 : fontWeight === 'bold' ? 700 : 600,
                      color: fontColor
                    }}
                    className="m-0"
                  >
                    {isRtl ? 'بخصوص اعتماد معايير الأرشفة السيادية والختم الإلكتروني المشفر للجهات التابعة' : 'Adoption of Sovereign Electronic Sealing and Archiving Standards'}
                  </h3>
                </div>

                <div
                  style={{
                    fontSize: `${fontSizeBody}px`,
                    fontWeight: fontWeight === 'medium' ? 500 : 400,
                    fontStyle: fontStyle
                  }}
                  className="text-slate-800 leading-relaxed space-y-3 pt-2"
                >
                  <p>
                    {isRtl
                      ? 'إشارة إلى الموضوع أعلاه، وفي إطار تحديث البنية التحتية للمراسلات الرسمية في ديوان رئاسة الوزراء وضمان أعلى درجات الموثوقية السيادية وحماية الوثائق من التزوير أو الانتحال.'
                      : 'Reference to the subject above, and as part of modernizing the official correspondence infrastructure across state directorates and ensuring peak sovereign verification against forgery.'}
                  </p>
                  <p>
                    {isRtl
                      ? 'عليه، تقرر اعتماد نظام الختم الخارجي عبر رموز الاستجابة السريعة (QR Checksum Seal) المشفرة بخوارزمية HMAC256، مع التنبيه على كافة الجهات التابعة بالالتزام الدقيق بالنموذج الموحد المرفق.'
                      : 'Therefore, it has been decided to adopt the external QR Checksum sealing system verified via HMAC256 cryptography across all outbound ministerial communications immediately.'}
                  </p>
                  <p style={{ fontWeight: 700, color: fontColor }} className="pt-2">
                    {isRtl ? 'وتفضلوا بقبول فائق الاحترام والتقدير،،،' : 'Please accept our highest assurances and consideration.'}
                  </p>
                </div>
              </div>
            </div>

            {/* BOTTOM AREA: Signatory Box + QR Seal Block + Footer */}
            <div className="mt-8 pt-6 border-t border-slate-200">
              <div className={`flex items-end justify-between gap-6 ${qrPosition === 'bottom-right' ? 'flex-row-reverse' : qrPosition === 'bottom-center' ? 'flex-col items-center text-center' : 'flex-row'}`}>
                {/* QR Seal Box */}
                {showQr && (
                  <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0 hover:outline hover:outline-2 hover:outline-brand/40 hover:outline-dashed transition-all">
                    <div
                      style={{ width: `${qrSizeMm}mm`, height: `${qrSizeMm}mm` }}
                      className="bg-white border border-slate-300 p-1 rounded flex items-center justify-center shrink-0 shadow-sm relative group"
                    >
                      <QrCode className="w-full h-full text-slate-900" />
                      <span className="absolute inset-0 bg-brand/90 text-white text-[9px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded">
                        {qrSizeMm}mm
                      </span>
                    </div>
                    {showHmacChecksum && (
                      <div className="text-[10px] text-slate-600 font-mono space-y-0.5 max-w-[130px]">
                        <div className="font-bold text-slate-900 flex items-center gap-1">
                          <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span>HMAC256 SEAL</span>
                        </div>
                        <div className="text-[8px] text-slate-400 break-all leading-tight">
                          SIG:9f83a21bc...e49a0
                        </div>
                        <div className="text-[9px] text-emerald-700 font-bold">
                          {isRtl ? 'موثق رسمياً' : 'Verified Diwan'}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Signature Box */}
                {showSignatureBox && (
                  <div className="text-center min-w-[160px] space-y-2 hover:outline hover:outline-2 hover:outline-brand/40 hover:outline-dashed p-2 rounded transition-all">
                    <p style={{ color: fontColor }} className="text-xs font-bold">{signatoryTitle}</p>
                    <div className="h-14 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center text-slate-400 text-[10px] italic">
                      {isRtl ? '[ مكان الختم والتوقيع المعتمد ]' : '[ Official Stamp & Signature ]'}
                    </div>
                  </div>
                )}
              </div>

              {/* Sovereign Footer */}
              <div
                style={{
                  fontSize: `${fontSizeFooter}px`,
                  fontStyle: footerFontSlant === 'italic' ? 'italic' : fontStyle,
                  color: footerFontColor
                }}
                className="mt-6 pt-4 border-t border-slate-200 text-center hover:outline hover:outline-2 hover:outline-brand/40 hover:outline-dashed rounded p-1 transition-all"
              >
                <p style={{ color: footerFontColor }} className="font-semibold m-0">{footerText}</p>
                {footerDisclaimerText && (
                  <p style={{ fontSize: `${Math.max(8, fontSizeFooter - 1)}px`, color: footerFontColor, opacity: 0.8 }} className="italic mt-1 m-0">
                    {footerDisclaimerText}
                  </p>
                )}
                {showPageNumbers && (
                  <p style={{ fontSize: `${Math.max(8, fontSizeFooter - 1)}px`, color: footerFontColor, opacity: 0.7 }} className="mt-1 font-mono m-0">
                    {isRtl ? 'صفحة 1 من 1 • مطبوع ومنجز عبر Septimus OS Sovereign Diwan' : 'Page 1 of 1 • Generated via Septimus OS Sovereign Diwan'}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
