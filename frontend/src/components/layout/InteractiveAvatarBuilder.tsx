/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState } from "react";
import { X, Sparkles, Check, RefreshCw, Palette, User, Shirt, Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateAvatarSvgDataUrl, AvatarConfig } from "@/lib/avatarEngine";

interface InteractiveAvatarBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (avatarUrl: string) => void;
  isRtl: boolean;
}

const SKIN_COLORS = [
  { id: "light", hex: "f8d25c", label: "بشرة فاتحة", labelEn: "Light Complexion" },
  { id: "wheat", hex: "edb98a", label: "بشرة قمحية", labelEn: "Wheat Complexion" },
  { id: "tanned", hex: "d08b5b", label: "بشرة دافئة", labelEn: "Tanned Complexion" },
  { id: "brown", hex: "ae5d29", label: "بشرة حنطية", labelEn: "Brown Complexion" },
  { id: "ebony", hex: "614335", label: "بشرة داكنة", labelEn: "Ebony Complexion" },
];

const HAIR_STYLES = [
  { id: "shortHair", label: "قصير كلاسيكي", labelEn: "Short Classic" },
  { id: "shortHairWavy", label: "مموج أنيق", labelEn: "Wavy Elegant" },
  { id: "bob", label: "قصير بوب", labelEn: "Bob Cut" },
  { id: "longHair", label: "طويل انسيابي", labelEn: "Flowing Long" },
  { id: "bun", label: "كعكة مهنية", labelEn: "Executive Bun" },
  { id: "hijab", label: "حجاب مهني أنيق", labelEn: "Professional Hijab" },
  { id: "noHair", label: "صلع قيادي", labelEn: "Executive Bald" },
];

const HAIR_COLORS = [
  { id: "2c1b18", label: "أسود ليلي", labelEn: "Midnight Black", bgStyle: "#2c1b18" },
  { id: "4a312c", label: "بني كستنائي", labelEn: "Chestnut Brown", bgStyle: "#4a312c" },
  { id: "b58143", label: "أشقر ذهبي", labelEn: "Golden Blonde", bgStyle: "#b58143" },
  { id: "94a3b8", label: "رمادي وقور", labelEn: "Silver Gray", bgStyle: "#94a3b8" },
  { id: "b91c1c", label: "أصهب نحاسي", labelEn: "Copper Red", bgStyle: "#b91c1c" },
];

const HIJAB_COLORS = [
  { id: "8d4592", label: "بنفسجي ملكي", labelEn: "Royal Purple", bgStyle: "#8d4592" },
  { id: "1e3a8a", label: "أزرق ياقوتي", labelEn: "Sapphire Blue", bgStyle: "#1e3a8a" },
  { id: "0f766e", label: "فيروزي أنيق", labelEn: "Elegant Teal", bgStyle: "#0f766e" },
  { id: "e2e8f0", label: "أبيض لؤلؤي", labelEn: "Pearl White", bgStyle: "#e2e8f0" },
  { id: "334155", label: "رمادي كحلي", labelEn: "Slate Indigo", bgStyle: "#334155" },
];

const EXPRESSIONS = [
  { id: "happy", label: "ابتسامة واثقة", labelEn: "Confident Smile" },
  { id: "serious", label: "تركيز إداري جاد", labelEn: "Serious Focus" },
  { id: "wink", label: "غمزة ودودة", labelEn: "Friendly Wink" },
  { id: "glasses", label: "نظارة طبية", labelEn: "Prescription Glasses" },
  { id: "sunglasses", label: "نظارة شمسية", labelEn: "Modern Sunglasses" },
];

const CLOTHING_STYLES = [
  { id: "blazerAndShirt", label: "بدلة رسمية كلاسيكية", labelEn: "Classic Suit Blazer" },
  { id: "blazerAndSweater", label: "سترة إدارية أنيقة", labelEn: "Blazer & Sweater" },
  { id: "collarAndSweater", label: "قميص كلاسيكي وسترة", labelEn: "Collared & Sweater" },
  { id: "graphicShirt", label: "بولو أو هودي تقني", labelEn: "Tech Polo / Hoodie" },
];

const CLOTHING_COLORS = [
  { id: "1e3a8a", label: "أزرق ملكي", labelEn: "Royal Blue", bgStyle: "#1e3a8a" },
  { id: "5b21b6", label: "بنفسجي سيادي", labelEn: "Sovereign Purple", bgStyle: "#5b21b6" },
  { id: "047857", label: "زمردي مؤسسي", labelEn: "Corporate Emerald", bgStyle: "#047857" },
  { id: "0f766e", label: "فيروزي تقني", labelEn: "Tech Teal", bgStyle: "#0f766e" },
  { id: "1e40af", label: "كحلي عميق", labelEn: "Deep Indigo", bgStyle: "#1e40af" },
  { id: "b45309", label: "ذهبي دافئ", labelEn: "Warm Amber", bgStyle: "#b45309" },
  { id: "be185d", label: "وردي مؤسسي", labelEn: "Corporate Pink", bgStyle: "#be185d" },
  { id: "475569", label: "رمادي إداري", labelEn: "Slate Gray", bgStyle: "#475569" },
];

const BACKGROUNDS = [
  { id: "1e3a8a", label: "أزرق ملكي", labelEn: "Royal Blue", bgStyle: "#1e3a8a" },
  { id: "5b21b6", label: "بنفسجي ملكي", labelEn: "Sovereign Purple", bgStyle: "#5b21b6" },
  { id: "0f766e", label: "فيروزي تقني", labelEn: "Tech Teal", bgStyle: "#0f766e" },
  { id: "047857", label: "زمردي مؤسسي", labelEn: "Corporate Emerald", bgStyle: "#047857" },
  { id: "1e40af", label: "كحلي عميق", labelEn: "Deep Indigo", bgStyle: "#1e40af" },
  { id: "b45309", label: "ذهبي دافئ", labelEn: "Warm Amber", bgStyle: "#b45309" },
  { id: "be185d", label: "وردي مؤسسي", labelEn: "Corporate Pink", bgStyle: "#be185d" },
  { id: "475569", label: "رمادي إداري", labelEn: "Slate Gray", bgStyle: "#475569" },
];

export default function InteractiveAvatarBuilder({
  isOpen,
  onClose,
  onApply,
  isRtl,
}: InteractiveAvatarBuilderProps) {
  const [skinColor, setSkinColor] = useState("edb98a");
  const [hairStyle, setHairStyle] = useState("shortHair");
  const [hairColor, setHairColor] = useState("2c1b18");
  const [hijabColor, setHijabColor] = useState("8d4592");
  const [expression, setExpression] = useState("happy");
  const [clothing, setClothing] = useState("blazerAndShirt");
  const [clothingColor, setClothingColor] = useState("1e3a8a");
  const [backgroundColor, setBackgroundColor] = useState("1e3a8a");

  if (!isOpen) return null;

  // Build the live AvatarConfig
  const currentConfig: AvatarConfig = {
    skinColor,
    hairStyle,
    hairColor,
    hijabColor,
    expression,
    clothing,
    clothingColor,
    backgroundColor,
  };

  // Generate 100% local, offline, instantaneous SVG data URL
  const liveAvatarUrl = generateAvatarSvgDataUrl(currentConfig);

  const handleRandomize = () => {
    const randomSkin = SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)].hex;
    const randomHairStyle = HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)].id;
    const randomHairColor = HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)].id;
    const randomHijabColor = HIJAB_COLORS[Math.floor(Math.random() * HIJAB_COLORS.length)].id;
    const randomExpression = EXPRESSIONS[Math.floor(Math.random() * EXPRESSIONS.length)].id;
    const randomClothing = CLOTHING_STYLES[Math.floor(Math.random() * CLOTHING_STYLES.length)].id;
    const randomClothingColor = CLOTHING_COLORS[Math.floor(Math.random() * CLOTHING_COLORS.length)].id;
    const randomBg = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)].id;

    setSkinColor(randomSkin);
    setHairStyle(randomHairStyle);
    setHairColor(randomHairColor);
    setHijabColor(randomHijabColor);
    setExpression(randomExpression);
    setClothing(randomClothing);
    setClothingColor(randomClothingColor);
    setBackgroundColor(randomBg);
  };

  const handleApply = () => {
    onApply(liveAvatarUrl);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 dark:bg-purple-950/40 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="bg-white dark:bg-slate-800 border border-brand/30 dark:border-primary/30 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Strictly Isolated by Language */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent border-b border-slate-200 dark:border-slate-700/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-brand/15 flex items-center justify-center text-brand">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                {isRtl ? "استوديو صانع الأفتار المؤسسي السيادي ✨" : "Sovereign Corporate Avatar Studio ✨"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRtl
                  ? "رسومات متجهات محلية فائقة الدقة متوافقة بالكامل مع دستور الألوان المؤسسية."
                  : "100% local high-precision vector rendering fully aligned with corporate brand constitution."}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 overflow-y-auto flex-1">
          {/* Controls Column (8 Cols) */}
          <div className="md:col-span-7 space-y-6 pr-1">
            {/* 1. Skin Complexion */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <User className="w-4 h-4 text-brand" />
                <span>{isRtl ? "1. لون البشرة الطبيعية:" : "1. Skin Complexion:"}</span>
              </label>
              <div className="flex flex-wrap gap-2.5">
                {SKIN_COLORS.map((skin) => (
                  <button
                    key={skin.id}
                    type="button"
                    onClick={() => setSkinColor(skin.hex)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      skinColor === skin.hex
                        ? "border-brand bg-brand/15 text-brand shadow-sm scale-105"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shadow-inner"
                      style={{ backgroundColor: `#${skin.hex}` }}
                    />
                    <span>{isRtl ? skin.label : skin.labelEn}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Hair & Headwear */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <User className="w-4 h-4 text-brand" />
                <span>{isRtl ? "2. تسريحة الشعر أو الحجاب المهني:" : "2. Hairstyle & Headwear:"}</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {HAIR_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setHairStyle(style.id)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      hairStyle === style.id
                        ? "border-brand bg-brand/15 text-brand shadow-sm scale-105"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    {isRtl ? style.label : style.labelEn}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Hair Color or Hijab Color */}
            {hairStyle === "hijab" ? (
              <div className="space-y-2.5 bg-brand/5 p-3 rounded-2xl border border-brand/20">
                <label className="flex items-center gap-2 text-xs font-bold text-brand">
                  <Palette className="w-4 h-4" />
                  <span>{isRtl ? "3. لون الحجاب المؤسسي الأنيق:" : "3. Professional Hijab Color:"}</span>
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {HIJAB_COLORS.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setHijabColor(color.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                        hijabColor === color.id
                          ? "border-brand bg-brand/15 text-brand shadow-sm scale-105"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shadow-inner"
                        style={{ backgroundColor: color.bgStyle }}
                      />
                      <span>{isRtl ? color.label : color.labelEn}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : hairStyle !== "noHair" ? (
              <div className="space-y-2.5">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <Palette className="w-4 h-4 text-brand" />
                  <span>{isRtl ? "3. لون الشعر:" : "3. Hair Color:"}</span>
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {HAIR_COLORS.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setHairColor(color.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                        hairColor === color.id
                          ? "border-brand bg-brand/15 text-brand shadow-sm scale-105"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shadow-inner"
                        style={{ backgroundColor: color.bgStyle }}
                      />
                      <span>{isRtl ? color.label : color.labelEn}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* 4. Expression & Accessories */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Smile className="w-4 h-4 text-brand" />
                <span>{isRtl ? "4. التعبير الوجهي والنظارات:" : "4. Expression & Accessories:"}</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXPRESSIONS.map((exp) => (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => setExpression(exp.id)}
                    className={`flex items-center justify-between px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      expression === exp.id
                        ? "border-brand bg-brand/15 text-brand shadow-sm"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    <span>{isRtl ? exp.label : exp.labelEn}</span>
                    {expression === exp.id && <Check className="w-4 h-4 text-brand" />}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Professional Outfit */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Shirt className="w-4 h-4 text-brand" />
                <span>{isRtl ? "5. الملابس الإدارية الرسمية:" : "5. Professional Attire:"}</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CLOTHING_STYLES.map((cloth) => (
                  <button
                    key={cloth.id}
                    type="button"
                    onClick={() => setClothing(cloth.id)}
                    className={`flex items-center justify-between px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      clothing === cloth.id
                        ? "border-brand bg-brand/15 text-brand shadow-sm"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    <span>{isRtl ? cloth.label : cloth.labelEn}</span>
                    {clothing === cloth.id && <Check className="w-4 h-4 text-brand" />}
                  </button>
                ))}
              </div>
            </div>

            {/* 6. Outfit Color */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Palette className="w-4 h-4 text-brand" />
                <span>{isRtl ? "6. لون الملابس الإدارية:" : "6. Attire Color:"}</span>
              </label>
              <div className="flex flex-wrap gap-2.5">
                {CLOTHING_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => setClothingColor(color.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      clothingColor === color.id
                        ? "border-brand bg-brand/15 text-brand shadow-sm scale-105"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shadow-inner"
                      style={{ backgroundColor: color.bgStyle }}
                    />
                    <span>{isRtl ? color.label : color.labelEn}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 7. Background Color */}
            <div className="space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                <Palette className="w-4 h-4 text-brand" />
                <span>{isRtl ? "7. تدرج خلفية الأفتار المتوافق مع الهوية:" : "7. Sovereign Brand Background:"}</span>
              </label>
              <div className="flex flex-wrap gap-2.5">
                {BACKGROUNDS.map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setBackgroundColor(bg.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      backgroundColor === bg.id
                        ? "border-brand bg-brand/15 text-brand shadow-sm scale-105"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-slate-300 dark:border-slate-600 shadow-inner"
                      style={{ backgroundColor: bg.bgStyle }}
                    />
                    <span>{isRtl ? bg.label : bg.labelEn}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live Preview Column (5 Cols) */}
          <div className="md:col-span-5 flex flex-col items-center justify-between bg-gradient-to-b from-brand/5 via-transparent to-brand/5 rounded-2xl p-6 border border-brand/20">
            <div className="w-full text-center space-y-1">
              <span className="text-[11px] font-bold text-brand uppercase tracking-wider bg-brand/10 px-3 py-1 rounded-full">
                {isRtl ? "المعاينة اللحظية الحية (INSTANT VECTOR)" : "INSTANT LIVE VECTOR PREVIEW"}
              </span>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRtl
                  ? "يتم رسم المتجه مباشرة في المتصفح بـ 0 مللي ثانية بدون أي اتصال بخوادم خارجية"
                  : "Rendered locally in browser in 0ms without external servers"}
              </p>
            </div>

            {/* Avatar Circle Display */}
            <div className="relative my-6 group">
              <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-3xl overflow-hidden shadow-2xl border-4 border-white dark:border-slate-700 bg-white flex items-center justify-center relative transition-transform duration-300 group-hover:scale-[1.02]">
                <img
                  src={liveAvatarUrl}
                  alt="Live Custom Sovereign Avatar"
                  className="w-full h-full object-cover select-none"
                />
                <div className="absolute bottom-3.5 right-3.5 w-5 h-5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-800 shadow-sm animate-pulse" title={isRtl ? "متصل ومحلي بالكامل" : "100% Local & Connected"} />
              </div>
            </div>

            {/* Actions Panel */}
            <div className="w-full space-y-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleRandomize}
                className="w-full border-brand/30 hover:bg-brand/10 text-brand font-bold text-xs h-10 rounded-xl flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{isRtl ? "توليد تصميم عشوائي متناسق 🎲" : "Randomize Style 🎲"}</span>
              </Button>

              <Button
                type="button"
                onClick={handleApply}
                className="w-full bg-brand hover:bg-brand-dark text-white font-bold text-sm h-12 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
              >
                <Check className="w-5 h-5" />
                <span>{isRtl ? "✨ اعتماد وحفظ أفتاري المخصص فوراً" : "✨ Save & Apply Custom Avatar"}</span>
              </Button>

              <button
                type="button"
                onClick={onClose}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 py-1 font-medium"
              >
                {isRtl ? "إلغاء والعودة للإعدادات" : "Cancel & Return to Settings"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
