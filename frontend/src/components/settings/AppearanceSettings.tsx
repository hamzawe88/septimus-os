"use client";

import React, { useRef, useState } from "react";
import { useThemeStore, THEME_PRESETS, ThemePreset } from "@/store/useThemeStore";
import { useToastStore } from "@/store/useToastStore";
import { Settings, Image as ImageIcon, CheckCircle2, Sun, Moon, Monitor } from "lucide-react";


export default function AppearanceSettings() {
  const { mode, setMode, theme, setTheme, primaryColor, setPrimaryColor, fontFamily, setFontFamily, logoUrl, setLogoUrl,
    isAdvancedMode, setIsAdvancedMode,
    customTopbarBg, setCustomTopbarBg,
    customSidebarBg, setCustomSidebarBg,
    customSidebarText, setCustomSidebarText,
    customAppBg, setCustomAppBg
  } = useThemeStore();
  const { toast } = useToastStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setLogoUrl(base64String);
        setUploading(false);
        toast.success('تم حفظ الشعار بنجاح!');
      };
      reader.onerror = () => {
        console.error("Failed to read file");
        toast.error('فشل تحميل الشعار. يرجى المحاولة مجدداً.');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Failed to process logo", err);
      setUploading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-[#1a1d21] overflow-y-auto transition-colors">
      <div className="h-[56px] border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121016] flex items-center px-8 flex-shrink-0 shadow-sm transition-colors">
        <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <Settings className="w-6 h-6 text-brand" />
          إعدادات المظهر وتوحيد الألوان (Appearance & Theme)
        </h1>
      </div>

      <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
        
        {/* Mode Selection (Light / Dark / System) */}
        <section className="bg-white dark:bg-[#222529] p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800/80 transition-colors">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">نمط الرؤية والإضاءة (Theme Mode)</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">اختر بين الوضع المضيء الخالص، الوضع الداكن المريح للعين، أو التزامن التلقائي مع نظامك.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setMode('light')}
              className={`p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${mode === 'light' ? 'border-brand bg-brand/5 dark:bg-brand/10 shadow-md ring-2 ring-brand/20' : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#1a1d21]'}`}
            >
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                <Sun className="w-6 h-6" />
              </div>
              <div className="text-start rtl:text-end flex-1">
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between">
                  <span>الوضع المضيء (Light)</span>
                  {mode === 'light' && <CheckCircle2 className="w-4 h-4 text-brand" />}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">ساطع ونقي ومناسب للعمل النهار</div>
              </div>
            </button>

            <button
              onClick={() => setMode('dark')}
              className={`p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${mode === 'dark' ? 'border-brand bg-brand/5 dark:bg-brand/10 shadow-md ring-2 ring-brand/20' : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#1a1d21]'}`}
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                <Moon className="w-6 h-6" />
              </div>
              <div className="text-start rtl:text-end flex-1">
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between">
                  <span>الوضع الداكن (Dark)</span>
                  {mode === 'dark' && <CheckCircle2 className="w-4 h-4 text-brand" />}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">مريح للعين ومثالي للبيئات الهادئة</div>
              </div>
            </button>

            <button
              onClick={() => setMode('system')}
              className={`p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${mode === 'system' ? 'border-brand bg-brand/5 dark:bg-brand/10 shadow-md ring-2 ring-brand/20' : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#1a1d21]'}`}
            >
              <div className="w-12 h-12 rounded-xl bg-slate-500/10 dark:bg-slate-500/20 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
                <Monitor className="w-6 h-6" />
              </div>
              <div className="text-start rtl:text-end flex-1">
                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center justify-between">
                  <span>تلقائي (System)</span>
                  {mode === 'system' && <CheckCircle2 className="w-4 h-4 text-brand" />}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">يتزامن تلقائياً مع نظام التشغيل</div>
              </div>
            </button>
          </div>
        </section>

        {/* Theme Presets */}
        <section className="bg-white dark:bg-[#222529] p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800/80 transition-colors">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">الثيمات المسبقة الموحدة (Preset Themes)</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">اختر الهوية اللونية المؤسسية المفضلة لمساحة العمل الخاصة بك.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(Object.keys(THEME_PRESETS) as ThemePreset[]).map((preset) => {
              const presetData = THEME_PRESETS[preset];
              const isActive = theme === preset;
              return (
                <button
                  key={preset}
                  onClick={() => setTheme(preset)}
                  className={`relative overflow-hidden p-4 rounded-xl border-2 text-start transition-all flex flex-col gap-3 ${isActive ? 'border-brand bg-brand/5 dark:bg-brand/10 shadow-md ring-2 ring-brand/20' : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#1a1d21] hover:shadow-sm'}`}
                >
                  {isActive && <CheckCircle2 className="absolute top-3 end-3 w-5 h-5 text-brand" />}
                  <div className="flex gap-2">
                    <div className="h-4 w-full bg-blue-500 rounded-full shadow-inner" />
                    <div className="h-4 w-3/4 bg-blue-500/50 rounded-full mt-2" />
                    <style dangerouslySetInnerHTML={{ __html: `
                      .preset-color-dot-${preset} { background-color: ${presetData.primaryColor}; }
                    `}} />
                    <div
                      className={`w-6 h-6 rounded-full preset-color-dot-${preset} shadow-sm border border-white dark:border-slate-800`}
                      title={`Primary: ${presetData.primaryColor}`}
                    />
                  </div>
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-200 capitalize mt-1">{preset.replace('theme-', '')}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Primary Color Customization */}
        <section className="bg-white dark:bg-[#222529] p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800/80 transition-colors">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">تخصيص الألوان المتقدم (Advanced Customization)</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">تفعيل هذا الخيار يلغي الثيمات المسبقة ويتيح لك تحكماً كاملاً بألوان النظام.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" title="Toggle Advanced Mode" checked={isAdvancedMode} onChange={(e) => setIsAdvancedMode(e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand"></div>
            </label>
          </div>

          {!isAdvancedMode ? (
            <>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 mt-4">اللون الأساسي (Primary Color) فقط</h3>
              <div className="flex items-center gap-4">
                <input 
                  type="color" 
                  title="Primary Color"
                  value={primaryColor} 
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-14 h-14 rounded-xl cursor-pointer border border-slate-200 dark:border-slate-700 p-1 shadow-sm bg-transparent"
                />
                <div className="flex-1 flex items-center gap-2 px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-[#1a1d21] font-mono text-sm font-bold text-slate-700 dark:text-slate-200">
                  <span>{primaryColor.toUpperCase()}</span>
                </div>
                <button 
                  onClick={() => setPrimaryColor(THEME_PRESETS[theme].primaryColor)}
                  className="px-5 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white rounded-xl transition-all"
                >
                  إعادة الضبط
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-6 mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Primary Color */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">اللون الأساسي (Primary Color)</label>
                  <div className="flex items-center gap-2">
                    <input type="color" title="Primary Color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0 shrink-0 bg-transparent" />
                    <input type="text" title="Primary Color Hex" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-[#1a1d21] text-slate-900 dark:text-white text-sm font-mono font-bold" dir="ltr" />
                  </div>
                </div>

                {/* Topbar BG */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">خلفية الشريط العلوي (Topbar)</label>
                  <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                    {[
                      { name: 'Pure White', value: '#ffffff' },
                      { name: 'Light Slate', value: '#f8fafc' },
                      { name: 'Dark Slate', value: '#121016' },
                      { name: 'Ocean Gradient', value: 'linear-gradient(90deg, #0284c7, #2563eb)' },
                      { name: 'Sunset Gradient', value: 'linear-gradient(90deg, #f97316, #e11d48)' },
                      { name: 'Midnight Gradient', value: 'linear-gradient(90deg, #312e81, #1e1b4b)' }
                    ].map(preset => (
                      <button 
                        key={preset.name}
                        onClick={() => setCustomTopbarBg(preset.value)}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-full border border-slate-200 dark:border-slate-700 hover:border-brand transition-colors whitespace-nowrap shadow-sm"
                        style={{ background: preset.value, color: preset.value === '#ffffff' || preset.value === '#f8fafc' ? '#1e293b' : 'white' }}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="color" title="Topbar Background Color" value={customTopbarBg.startsWith('#') ? customTopbarBg : '#ffffff'} onChange={(e) => setCustomTopbarBg(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0 shrink-0 bg-transparent" />
                    <input type="text" title="Topbar Background Text" value={customTopbarBg} onChange={(e) => setCustomTopbarBg(e.target.value)} placeholder="مثال: #ffffff أو #121016" className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-[#1a1d21] text-slate-900 dark:text-white text-sm text-start font-mono" dir="ltr" />
                  </div>
                </div>

                {/* Sidebar BG */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">خلفية الشريط الجانبي (Sidebar)</label>
                  <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                    {[
                      { name: 'Pure White', value: '#ffffff' },
                      { name: 'Light Gray', value: '#f1f5f9' },
                      { name: 'Dark Slate', value: '#19171D' },
                      { name: 'Navy Accent', value: 'linear-gradient(180deg, #1e3a8a, #172554)' },
                      { name: 'Purple Accent', value: 'linear-gradient(180deg, #581c87, #3b0764)' }
                    ].map(preset => (
                      <button 
                        key={preset.name}
                        onClick={() => setCustomSidebarBg(preset.value)}
                        className="px-3.5 py-1.5 text-xs font-bold rounded-full border border-slate-200 dark:border-slate-700 hover:border-brand transition-colors whitespace-nowrap shadow-sm"
                        style={{ background: preset.value, color: preset.value === '#ffffff' || preset.value === '#f1f5f9' ? '#1e293b' : 'white' }}
                      >
                        {preset.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="color" title="Sidebar Background Color" value={customSidebarBg.startsWith('#') ? customSidebarBg : '#ffffff'} onChange={(e) => setCustomSidebarBg(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0 shrink-0 bg-transparent" />
                    <input type="text" title="Sidebar Background Text" value={customSidebarBg} onChange={(e) => setCustomSidebarBg(e.target.value)} placeholder="مثال: #ffffff أو #19171D" className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-[#1a1d21] text-slate-900 dark:text-white text-sm text-start font-mono" dir="ltr" />
                  </div>
                </div>

                {/* Sidebar Text */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">لون نصوص الشريط الجانبي</label>
                  <div className="flex items-center gap-2">
                    <input type="color" title="Sidebar Text Color" value={customSidebarText} onChange={(e) => setCustomSidebarText(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0 shrink-0 bg-transparent" />
                    <input type="text" title="Sidebar Text Color Hex" value={customSidebarText} onChange={(e) => setCustomSidebarText(e.target.value)} className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-[#1a1d21] text-slate-900 dark:text-white text-sm text-start font-mono font-bold" dir="ltr" />
                  </div>
                </div>

                {/* App Background */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">لون خلفية النظام (App Background)</label>
                  <div className="flex items-center gap-2">
                    <input type="color" title="App Background Color" value={customAppBg.startsWith('#') ? customAppBg : '#f8fafc'} onChange={(e) => setCustomAppBg(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0 shrink-0 bg-transparent" />
                    <input type="text" title="App Background Text" value={customAppBg} onChange={(e) => setCustomAppBg(e.target.value)} placeholder="#f8fafc أو #1A1D21" className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-[#1a1d21] text-slate-900 dark:text-white text-sm text-start font-mono font-bold" dir="ltr" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Font Family */}
        <section className="bg-white dark:bg-[#222529] p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800/80 transition-colors">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-4">خطوط النظام (Typography)</h2>
          <div className="flex gap-4">
            <button 
              onClick={() => setFontFamily('cairo')}
              className={`font-cairo flex-1 py-5 flex flex-col items-center justify-center gap-2 rounded-xl border-2 transition-all ${fontFamily === 'cairo' ? 'border-brand bg-brand/5 dark:bg-brand/10 shadow-sm ring-2 ring-brand/20' : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#1a1d21] hover:shadow-sm'}`}
            >
              <span className="text-2xl font-black text-slate-900 dark:text-white">خط كايرو</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">عربي مؤسسي متطور وجميل</span>
            </button>
            <button 
              onClick={() => setFontFamily('inter')}
              className={`font-inter flex-1 py-5 flex flex-col items-center justify-center gap-2 rounded-xl border-2 transition-all ${fontFamily === 'inter' ? 'border-brand bg-brand/5 dark:bg-brand/10 shadow-sm ring-2 ring-brand/20' : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-[#1a1d21] hover:shadow-sm'}`}
            >
              <span className="text-2xl font-black text-slate-900 dark:text-white">Inter Font</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Standard clean English typography</span>
            </button>
          </div>
        </section>

        {/* Logo Upload */}
        <section className="bg-white dark:bg-[#222529] p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800/80 transition-colors">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">شعار مساحة العمل (Workspace Logo)</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">قم برفع شعار مؤسستك ليظهر في الزاوية العلوية للنظام.</p>
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-slate-50 dark:bg-[#1a1d21] rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-inner">
              {logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logoUrl} alt="Workspace Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <ImageIcon className="w-8 h-8 text-slate-400 dark:text-slate-500" />
              )}
            </div>
            <div className="flex-1 space-y-3">
              <input 
                type="file" 
                title="Upload Logo"
                ref={fileInputRef} 
                onChange={handleLogoUpload} 
                accept="image/*" 
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="px-5 py-2.5 bg-brand text-white text-sm font-bold rounded-xl hover:bg-brand/90 transition-all disabled:opacity-50 shadow-sm"
              >
                {uploading ? "جاري الرفع..." : "اختر صورة (Upload File)"}
              </button>
              <p className="text-xs text-slate-500 dark:text-slate-400">ينصح باستخدام صور مربعة بخلفية شفافة (PNG أو SVG).</p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
