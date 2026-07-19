"use client";

import React, { useRef, useState } from "react";
import { useThemeStore, THEME_PRESETS, ThemePreset } from "@/store/useThemeStore";
import { useToastStore } from "@/store/useToastStore";
import { useLocalization } from "@/contexts/LocalizationContext";
import { Settings, Image as ImageIcon, CheckCircle2, Sun, Moon, Monitor, Palette, MonitorSmartphone, UploadCloud, PaintBucket } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ColorInput = ({ label, value, onChange, placeholder }: { label: string, value: string, onChange: (v: string) => void, placeholder?: string }) => (
  <div className="group relative">
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{label}</label>
    <div className="relative flex items-center bg-white/50 dark:bg-[#1a1d21]/50 border border-slate-200/60 dark:border-slate-700/60 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm transition-all focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand/50">
      <div className="relative w-12 h-12 shrink-0 border-r border-slate-200/60 dark:border-slate-700/60 bg-slate-50 dark:bg-[#222529]">
        <input 
          type="color" 
          value={value.startsWith('#') ? value.slice(0, 7) : '#ffffff'} 
          onChange={(e) => onChange(e.target.value)} 
          className="absolute inset-[-10px] w-[200%] h-[200%] cursor-pointer opacity-0"
        />
        <div className="absolute inset-2 rounded-lg shadow-inner pointer-events-none" style={{ backgroundColor: value }} />
      </div>
      <input 
        type="text" 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        placeholder={placeholder}
        className="w-full bg-transparent border-none px-4 py-3 text-slate-900 dark:text-white font-mono text-sm focus:outline-none" 
        dir="ltr"
      />
    </div>
  </div>
);

export default function AppearanceSettings() {
  const { isRtl } = useLocalization();
  const { 
    mode, setMode, theme, setTheme, primaryColor, setPrimaryColor, fontFamily, setFontFamily, logoUrl, setLogoUrl,
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
        toast.success(isRtl ? 'تم حفظ الشعار بنجاح!' : 'Logo saved successfully!');
      };
      reader.onerror = () => {
        console.error("Failed to read file");
        toast.error(isRtl ? 'فشل تحميل الشعار. يرجى المحاولة مجدداً.' : 'Failed to upload logo. Please try again.');
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Failed to process logo", err);
      setUploading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50/50 dark:bg-[#0f0e13] overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl bg-white/80 dark:bg-[#121016]/80 border-b border-slate-200/60 dark:border-slate-800/60 px-8 py-5 flex items-center justify-between shadow-sm">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
          <div className="p-2.5 bg-brand/10 dark:bg-brand/20 rounded-xl">
            <Palette className="w-6 h-6 text-brand" />
          </div>
          {isRtl ? "تخصيص المظهر والهوية" : "Appearance & Theme"}
        </h1>
      </div>

      <div className="p-8 max-w-5xl mx-auto w-full space-y-8">

        {/* Section: Mode & Typography */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <motion.section 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white/70 dark:bg-[#1a1d21]/70 backdrop-blur-xl p-8 rounded-[2rem] shadow-sm border border-slate-200/60 dark:border-slate-800/60"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-amber-500/10 rounded-lg"><MonitorSmartphone className="w-5 h-5 text-amber-500" /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{isRtl ? "نمط الإضاءة" : "Theme Mode"}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{isRtl ? "اختر النمط المناسب لعينيك" : "Choose your preferred viewing mode"}</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-3">
              {[
                { id: 'light', icon: Sun, label: isRtl ? "الوضع المضيء" : "Light Mode", desc: isRtl ? "مشرق ونقي" : "Bright and clean", color: "text-amber-500", bg: "bg-amber-500/10" },
                { id: 'dark', icon: Moon, label: isRtl ? "الوضع الداكن" : "Dark Mode", desc: isRtl ? "مريح للعينين" : "Easy on the eyes", color: "text-indigo-400", bg: "bg-indigo-500/10" },
                { id: 'system', icon: Monitor, label: isRtl ? "تلقائي" : "System", desc: isRtl ? "حسب النظام" : "Follows system", color: "text-slate-500", bg: "bg-slate-500/10" }
              ].map(m => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id as any)}
                  className={`relative p-4 rounded-2xl border transition-all flex items-center gap-4 group ${
                    mode === m.id 
                      ? 'border-brand bg-brand/5 dark:bg-brand/10 shadow-md ring-1 ring-brand/20' 
                      : 'border-slate-200/60 dark:border-slate-700/60 hover:border-brand/30 hover:bg-slate-50/50 dark:hover:bg-[#222529]/50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${m.bg} ${m.color}`}>
                    <m.icon className="w-6 h-6" />
                  </div>
                  <div className="text-start flex-1">
                    <div className="font-bold text-slate-900 dark:text-white text-base">{m.label}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">{m.desc}</div>
                  </div>
                  {mode === m.id && <CheckCircle2 className="w-5 h-5 text-brand" />}
                </button>
              ))}
            </div>
          </motion.section>

          <motion.section 
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white/70 dark:bg-[#1a1d21]/70 backdrop-blur-xl p-8 rounded-[2rem] shadow-sm border border-slate-200/60 dark:border-slate-800/60 flex flex-col"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-emerald-500/10 rounded-lg"><Settings className="w-5 h-5 text-emerald-500" /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{isRtl ? "الخطوط والهوية" : "Typography & Logo"}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{isRtl ? "تخصيص الخط والشعار" : "Customize font and branding"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <button
                onClick={() => setFontFamily('cairo')}
                className={`font-cairo p-4 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 ${
                  fontFamily === 'cairo' ? 'border-brand bg-brand/5 shadow-md' : 'border-slate-200/60 dark:border-slate-700/60 hover:border-brand/30'
                }`}
              >
                <span className="text-3xl font-black text-slate-900 dark:text-white">Ag</span>
                <span className="font-bold text-sm text-slate-700 dark:text-slate-300">Cairo (Arabic)</span>
              </button>
              <button
                onClick={() => setFontFamily('inter')}
                className={`font-inter p-4 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 ${
                  fontFamily === 'inter' ? 'border-brand bg-brand/5 shadow-md' : 'border-slate-200/60 dark:border-slate-700/60 hover:border-brand/30'
                }`}
              >
                <span className="text-3xl font-black text-slate-900 dark:text-white">Ag</span>
                <span className="font-bold text-sm text-slate-700 dark:text-slate-300">Inter (English)</span>
              </button>
            </div>

            <div className="flex-1 flex flex-col justify-end">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{isRtl ? "شعار مساحة العمل" : "Workspace Logo"}</label>
              <div className="flex items-center gap-5 p-4 bg-slate-50 dark:bg-[#222529] rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                <div className="w-16 h-16 bg-white dark:bg-[#121016] rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                  {logoUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div className="flex-1">
                  <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#1a1d21] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-sm font-bold rounded-lg hover:border-brand hover:text-brand transition-all disabled:opacity-50"
                  >
                    <UploadCloud className="w-4 h-4" />
                    {uploading ? (isRtl ? "جاري الرفع..." : "Uploading...") : (isRtl ? "تغيير الشعار" : "Change Logo")}
                  </button>
                </div>
              </div>
            </div>
          </motion.section>
        </div>

        {/* Section: Themes & Colors */}
        <motion.section 
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white/70 dark:bg-[#1a1d21]/70 backdrop-blur-xl p-8 rounded-[2rem] shadow-sm border border-slate-200/60 dark:border-slate-800/60"
        >
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg"><PaintBucket className="w-5 h-5 text-purple-500" /></div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{isRtl ? "الهوية اللونية" : "Color Identity"}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">{isRtl ? "تحكم كامل بألوان النظام" : "Full control over system colors"}</p>
              </div>
            </div>
            <label className="flex items-center gap-3 cursor-pointer group">
              <span className="text-sm font-bold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                {isRtl ? "وضع التخصيص المتقدم" : "Advanced Mode"}
              </span>
              <div className="relative inline-flex items-center">
                <input type="checkbox" checked={isAdvancedMode} onChange={(e) => setIsAdvancedMode(e.target.checked)} className="sr-only peer" />
                <div className="w-12 h-6 bg-slate-200 dark:bg-slate-700 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 dark:after:border-slate-600 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand shadow-inner"></div>
              </div>
            </label>
          </div>

          <AnimatePresence mode="wait">
            {!isAdvancedMode ? (
              <motion.div key="presets" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {(Object.keys(THEME_PRESETS) as ThemePreset[]).map((preset) => {
                    const presetData = THEME_PRESETS[preset];
                    const isActive = theme === preset;
                    return (
                      <button
                        key={preset}
                        onClick={() => setTheme(preset)}
                        className={`relative p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-3 group ${
                          isActive 
                            ? 'border-brand bg-brand/5 shadow-md scale-[1.02]' 
                            : 'border-slate-200/60 dark:border-slate-700/60 hover:border-brand/30 hover:bg-slate-50 dark:hover:bg-[#222529]'
                        }`}
                      >
                        <style dangerouslySetInnerHTML={{ __html: `.preset-color-${preset} { background-color: ${presetData.primaryColor}; }`}} />
                        <div className={`w-12 h-12 rounded-full preset-color-${preset} shadow-lg ring-4 ${isActive ? 'ring-brand/20' : 'ring-transparent group-hover:ring-brand/10'} transition-all`} />
                        <span className={`font-bold text-sm capitalize ${isActive ? 'text-brand' : 'text-slate-700 dark:text-slate-300'}`}>
                          {preset.replace('theme-', '')}
                        </span>
                        {isActive && <CheckCircle2 className="absolute top-2 end-2 w-4 h-4 text-brand" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            ) : (
              <motion.div key="advanced" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 p-6 bg-slate-50 dark:bg-[#121016]/50 rounded-[1.5rem] border border-slate-200/60 dark:border-slate-700/60">
                  <ColorInput label={isRtl ? "اللون الأساسي" : "Primary Color"} value={primaryColor} onChange={setPrimaryColor} />
                  <ColorInput label={isRtl ? "الشريط العلوي" : "Topbar Background"} value={customTopbarBg} onChange={setCustomTopbarBg} placeholder="#ffffff" />
                  <ColorInput label={isRtl ? "الشريط الجانبي" : "Sidebar Background"} value={customSidebarBg} onChange={setCustomSidebarBg} placeholder="#19171D" />
                  <ColorInput label={isRtl ? "نص الشريط الجانبي" : "Sidebar Text"} value={customSidebarText} onChange={setCustomSidebarText} placeholder="#ffffff" />
                  
                  <div className="xl:col-span-4 mt-2">
                    <ColorInput label={isRtl ? "خلفية النظام" : "App Background"} value={customAppBg} onChange={setCustomAppBg} placeholder="#f8fafc" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

      </div>
    </div>
  );
}

