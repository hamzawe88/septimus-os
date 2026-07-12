export interface AvatarConfig {
  skinColor: string; // e.g. "edb98a"
  hairStyle: string; // "shortHair" | "shortHairWavy" | "bob" | "longHair" | "bun" | "hijab" | "noHair"
  hairColor: string; // e.g. "2c1b18"
  expression: string; // "happy" | "serious" | "wink" | "glasses" | "sunglasses"
  clothing: string; // "blazerAndShirt" | "blazerAndSweater" | "collarAndSweater" | "graphicShirt"
  clothingColor: string; // e.g. "1e3a8a"
  backgroundColor: string; // e.g. "1e3a8a"
  hijabColor?: string; // e.g. "8d4592"
}

export interface AvatarPreset {
  id: string;
  name: string;
  nameEn: string;
  config: AvatarConfig;
  url: string; // generated data URI
}

// Generate an instant, self-contained SVG Data URI with zero network dependencies
export function generateAvatarSvgDataUrl(config: AvatarConfig): string {
  const bg = `#${config.backgroundColor || "1e3a8a"}`;
  const skin = `#${config.skinColor || "edb98a"}`;
  const hairColor = `#${config.hairColor || "2c1b18"}`;
  const clothColor = `#${config.clothingColor || "1e3a8a"}`;
  const hijabColor = `#${config.hijabColor || "8d4592"}`;

  // Helper colors
  const skinShadow = adjustHexBrightness(skin, -18);
  const skinHighlight = adjustHexBrightness(skin, 15);
  const clothDark = adjustHexBrightness(clothColor, -20);
  const hairDark = adjustHexBrightness(hairColor, -18);

  // Clothing SVG block
  let clothingSvg = "";
  if (config.clothing === "blazerAndShirt") {
    clothingSvg = `
      <path d="M15 160 Q50 135 85 145 L115 145 Q150 135 185 160 L200 200 L0 200 Z" fill="${clothDark}" />
      <path d="M30 165 L85 145 L85 200 L15 200 Z" fill="${clothColor}" />
      <path d="M170 165 L115 145 L115 200 L185 200 Z" fill="${clothColor}" />
      <path d="M85 145 L100 175 L115 145 Z" fill="#f8fafc" />
      <path d="M96 160 L104 160 L103 200 L97 200 Z" fill="#3b82f6" />
    `;
  } else if (config.clothing === "blazerAndSweater") {
    clothingSvg = `
      <path d="M10 160 Q50 138 80 148 L120 148 Q150 138 190 160 L200 200 L0 200 Z" fill="${clothDark}" />
      <path d="M25 165 L80 148 L80 200 L10 200 Z" fill="${clothColor}" />
      <path d="M175 165 L120 148 L120 200 L190 200 Z" fill="${clothColor}" />
      <path d="M80 148 Q100 165 120 148 L120 200 L80 200 Z" fill="#e2e8f0" />
    `;
  } else if (config.clothing === "collarAndSweater") {
    clothingSvg = `
      <path d="M15 158 Q50 136 100 148 Q150 136 185 158 L200 200 L0 200 Z" fill="${clothColor}" />
      <path d="M75 144 L100 168 L125 144 L115 142 L100 155 L85 142 Z" fill="#ffffff" />
      <path d="M85 160 Q100 172 115 160 L115 200 L85 200 Z" fill="${clothDark}" />
    `;
  } else {
    // graphicShirt / Tech Polo / Hoodie
    clothingSvg = `
      <path d="M12 158 Q50 138 100 148 Q150 138 188 158 L200 200 L0 200 Z" fill="${clothColor}" />
      <path d="M82 146 Q100 162 118 146 L118 200 L82 200 Z" fill="${clothDark}" />
      <circle cx="100" cy="178" r="8" fill="#ffffff" opacity="0.25" />
    `;
  }

  // Neck & Face block
  const neckAndFaceSvg = `
    <!-- Neck -->
    <path d="M82 120 L82 152 Q100 158 118 152 L118 120 Z" fill="${skinShadow}" />
    <path d="M84 120 L84 148 Q100 154 116 148 L116 120 Z" fill="${skin}" />

    <!-- Ears -->
    <circle cx="56" cy="98" r="12" fill="${skinShadow}" />
    <circle cx="56" cy="98" r="10" fill="${skin}" />
    <circle cx="144" cy="98" r="12" fill="${skinShadow}" />
    <circle cx="144" cy="98" r="10" fill="${skin}" />

    <!-- Head Shape -->
    <rect x="60" y="52" width="80" height="86" rx="40" fill="${skin}" />
    <path d="M60 95 Q60 138 100 138 Q140 138 140 95 Z" fill="${skin}" />
    <!-- 3D Studio Face Highlight & Glow -->
    <ellipse cx="100" cy="78" rx="24" ry="14" fill="${skinHighlight}" opacity="0.35" />
    <circle cx="75" cy="106" r="6.5" fill="${skinHighlight}" opacity="0.45" />
    <circle cx="125" cy="106" r="6.5" fill="${skinHighlight}" opacity="0.45" />
  `;

  // Eyes & Facial Expression block
  let faceFeaturesSvg = "";
  if (config.expression === "serious") {
    faceFeaturesSvg = `
      <!-- Eyebrows (Serious/Focused) -->
      <path d="M72 82 Q82 80 90 84" stroke="${hairDark}" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <path d="M110 84 Q118 80 128 82" stroke="${hairDark}" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <!-- Eyes -->
      <circle cx="82" cy="94" r="4.5" fill="#1e293b" />
      <circle cx="81" cy="92.5" r="1.5" fill="#ffffff" />
      <circle cx="118" cy="94" r="4.5" fill="#1e293b" />
      <circle cx="117" cy="92.5" r="1.5" fill="#ffffff" />
      <!-- Nose -->
      <path d="M100 92 L97 106 Q100 108 103 106" stroke="${skinShadow}" stroke-width="2.5" stroke-linecap="round" fill="none" />
      <!-- Mouth (Serious executive line) -->
      <path d="M88 120 Q100 121 112 120" stroke="#475569" stroke-width="3" stroke-linecap="round" fill="none" />
    `;
  } else if (config.expression === "wink") {
    faceFeaturesSvg = `
      <!-- Eyebrows (Wink/Up) -->
      <path d="M72 80 Q82 76 92 81" stroke="${hairDark}" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <path d="M108 81 Q118 76 128 80" stroke="${hairDark}" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <!-- Left Eye Open -->
      <circle cx="82" cy="94" r="4.5" fill="#1e293b" />
      <circle cx="81" cy="92.5" r="1.5" fill="#ffffff" />
      <!-- Right Eye Winking Arc -->
      <path d="M113 95 Q118 90 123 95" stroke="#1e293b" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <!-- Nose -->
      <path d="M100 92 L97 106 Q100 108 103 106" stroke="${skinShadow}" stroke-width="2.5" stroke-linecap="round" fill="none" />
      <!-- Mouth (Confident Twinkle Smile) -->
      <path d="M86 118 Q100 130 114 118" stroke="#1e293b" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <path d="M88 119 Q100 127 112 119 Z" fill="#ffffff" opacity="0.9" />
    `;
  } else if (config.expression === "glasses") {
    faceFeaturesSvg = `
      <!-- Eyebrows -->
      <path d="M72 80 Q82 77 92 81" stroke="${hairDark}" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <path d="M108 81 Q118 77 128 80" stroke="${hairDark}" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <!-- Eyes -->
      <circle cx="82" cy="94" r="4.5" fill="#1e293b" />
      <circle cx="81" cy="92.5" r="1.5" fill="#ffffff" />
      <circle cx="118" cy="94" r="4.5" fill="#1e293b" />
      <circle cx="117" cy="92.5" r="1.5" fill="#ffffff" />
      <!-- Nose -->
      <path d="M100 92 L97 106 Q100 108 103 106" stroke="${skinShadow}" stroke-width="2.5" stroke-linecap="round" fill="none" />
      <!-- Mouth (Confident Smile) -->
      <path d="M86 118 Q100 128 114 118" stroke="#1e293b" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <path d="M89 119 Q100 125 111 119 Z" fill="#ffffff" opacity="0.9" />
      <!-- Tech Glasses Frames -->
      <rect x="68" y="84" width="28" height="20" rx="6" stroke="#8d4592" stroke-width="3" fill="#ffffff" fill-opacity="0.15" />
      <rect x="104" y="84" width="28" height="20" rx="6" stroke="#8d4592" stroke-width="3" fill="#ffffff" fill-opacity="0.15" />
      <path d="M96 92 L104 92" stroke="#8d4592" stroke-width="3" />
      <path d="M60 90 L68 90" stroke="#8d4592" stroke-width="2.5" />
      <path d="M132 90 L140 90" stroke="#8d4592" stroke-width="2.5" />
    `;
  } else if (config.expression === "sunglasses") {
    faceFeaturesSvg = `
      <!-- Eyebrows -->
      <path d="M72 80 Q82 77 92 81" stroke="${hairDark}" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <path d="M108 81 Q118 77 128 80" stroke="${hairDark}" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <!-- Nose -->
      <path d="M100 92 L97 106 Q100 108 103 106" stroke="${skinShadow}" stroke-width="2.5" stroke-linecap="round" fill="none" />
      <!-- Mouth (Confident Smile) -->
      <path d="M86 118 Q100 128 114 118" stroke="#1e293b" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <path d="M89 119 Q100 125 111 119 Z" fill="#ffffff" opacity="0.9" />
      <!-- Sleek Sunglasses Frames -->
      <path d="M66 84 C66 84, 96 84, 98 94 C98 104, 88 108, 76 106 C66 104, 64 94, 66 84 Z" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />
      <path d="M102 94 C104 84, 134 84, 134 84 C136 94, 134 104, 124 106 C112 108, 102 104, 102 94 Z" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" />
      <path d="M96 88 L104 88" stroke="#1e293b" stroke-width="3.5" />
      <path d="M72 88 L86 92" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.4" />
      <path d="M108 88 L122 92" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.4" />
    `;
  } else {
    // happy / default confident smile
    faceFeaturesSvg = `
      <!-- Eyebrows (Happy/Natural) -->
      <path d="M72 80 Q82 76 92 81" stroke="${hairDark}" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <path d="M108 81 Q118 76 128 80" stroke="${hairDark}" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <!-- Eyes -->
      <circle cx="82" cy="94" r="4.5" fill="#1e293b" />
      <circle cx="81" cy="92.5" r="1.5" fill="#ffffff" />
      <circle cx="118" cy="94" r="4.5" fill="#1e293b" />
      <circle cx="117" cy="92.5" r="1.5" fill="#ffffff" />
      <!-- Nose -->
      <path d="M100 92 L97 106 Q100 108 103 106" stroke="${skinShadow}" stroke-width="2.5" stroke-linecap="round" fill="none" />
      <!-- Mouth (Confident Smile Arc) -->
      <path d="M86 118 Q100 130 114 118" stroke="#1e293b" stroke-width="3.5" stroke-linecap="round" fill="none" />
      <path d="M88 119 Q100 127 112 119 Z" fill="#ffffff" opacity="0.9" />
    `;
  }

  // Hair Style or Hijab block
  let hairAndHeadwearSvg = "";
  if (config.hairStyle === "shortHair") {
    hairAndHeadwearSvg = `
      <path d="M58 84 Q56 50 100 46 Q144 50 142 84 Q138 64 100 66 Q62 64 58 84 Z" fill="${hairColor}" />
      <path d="M57 76 Q60 62 76 56" stroke="${hairDark}" stroke-width="3" fill="none" opacity="0.5" />
    `;
  } else if (config.hairStyle === "shortHairWavy") {
    hairAndHeadwearSvg = `
      <path d="M56 86 Q54 48 100 44 Q146 48 144 86 Q136 62 120 68 Q106 58 92 68 Q78 58 56 86 Z" fill="${hairColor}" />
      <circle cx="80" cy="54" r="10" fill="${hairColor}" />
      <circle cx="118" cy="54" r="10" fill="${hairColor}" />
    `;
  } else if (config.hairStyle === "bob") {
    hairAndHeadwearSvg = `
      <path d="M54 115 L56 70 Q58 44 100 44 Q142 44 144 70 L146 115 Q136 122 136 100 L136 78 Q130 64 100 64 Q70 64 64 78 L64 100 Q64 122 54 115 Z" fill="${hairColor}" />
    `;
  } else if (config.hairStyle === "longHair") {
    hairAndHeadwearSvg = `
      <!-- Back hair -->
      <path d="M50 80 Q48 160 58 175 L142 175 Q152 160 150 80 Q144 44 100 44 Q56 44 50 80 Z" fill="${hairColor}" />
      <!-- Front bangs -->
      <path d="M56 80 Q64 58 100 60 Q136 58 144 80 Q138 68 100 68 Q62 68 56 80 Z" fill="${hairDark}" />
    `;
  } else if (config.hairStyle === "bun") {
    hairAndHeadwearSvg = `
      <!-- Top Bun -->
      <circle cx="100" cy="38" r="22" fill="${hairDark}" />
      <!-- Main Hair -->
      <path d="M56 82 Q56 48 100 46 Q144 48 144 82 Q136 66 100 66 Q64 66 56 82 Z" fill="${hairColor}" />
    `;
  } else if (config.hairStyle === "hijab") {
    hairAndHeadwearSvg = `
      <!-- Hijab Wrap (Crown and Sides) -->
      <path d="M48 170 Q46 120 48 88 Q52 38 100 38 Q148 38 152 88 Q154 120 152 170 L142 170 L142 110 Q140 82 128 66 Q116 54 100 54 Q84 54 72 66 Q60 82 58 110 L58 170 Z" fill="${hijabColor}" />
      <!-- Hijab Under-cap Accent -->
      <path d="M68 68 Q100 56 132 68 Q124 60 100 60 Q76 60 68 68 Z" fill="#ffffff" opacity="0.3" />
      <!-- Hijab Fold folds -->
      <path d="M54 140 Q75 165 100 165 Q125 165 146 140 L152 170 L48 170 Z" fill="${adjustHexBrightness(hijabColor, -15)}" />
    `;
  } else {
    // noHair / Executive Bald
    hairAndHeadwearSvg = `
      <path d="M66 66 Q100 60 134 66" stroke="${skinShadow}" stroke-width="1.5" fill="none" opacity="0.4" />
    `;
  }

  const svgContent = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${bg}" />
          <stop offset="100%" stop-color="${adjustHexBrightness(bg, -22)}" />
        </linearGradient>
      </defs>
      <!-- Background Circle/Square -->
      <rect width="200" height="200" rx="36" fill="url(#bgGrad)" />
      
      <!-- Avatar Layers -->
      ${clothingSvg}
      ${neckAndFaceSvg}
      ${faceFeaturesSvg}
      ${hairAndHeadwearSvg}
    </svg>
  `.replace(/\s+/g, " ").trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
}

// Helper to adjust brightness of hex code for natural shading
function adjustHexBrightness(hex: string, percent: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  let r = parseInt(h.substring(0, 2), 16);
  let g = parseInt(h.substring(2, 4), 16);
  let b = parseInt(h.substring(4, 6), 16);

  r = Math.min(255, Math.max(0, r + Math.floor((255 * percent) / 100)));
  g = Math.min(255, Math.max(0, g + Math.floor((255 * percent) / 100)));
  b = Math.min(255, Math.max(0, b + Math.floor((255 * percent) / 100)));

  const rr = r.toString(16).padStart(2, "0");
  const gg = g.toString(16).padStart(2, "0");
  const bb = b.toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
}

// 16 Pre-configured Sovereign Corporate Characters with 100% Instant Local Render
export const LOCAL_EXECUTIVE_PRESETS: AvatarPreset[] = [
  {
    id: "ceo",
    name: "الرئيس التنفيذي",
    nameEn: "Executive CEO",
    config: { skinColor: "edb98a", hairStyle: "shortHair", hairColor: "2c1b18", expression: "happy", clothing: "blazerAndShirt", clothingColor: "1e3a8a", backgroundColor: "1e3a8a" },
    url: "",
  },
  {
    id: "ai_lead",
    name: "مهندسة الذكاء الاصطناعي",
    nameEn: "AI Architect Lead",
    config: { skinColor: "f8d25c", hairStyle: "longHair", hairColor: "4a312c", expression: "glasses", clothing: "blazerAndSweater", clothingColor: "5b21b6", backgroundColor: "5b21b6" },
    url: "",
  },
  {
    id: "sales_crm",
    name: "مدير العلاقات والمبيعات",
    nameEn: "Sales & CRM Lead",
    config: { skinColor: "d08b5b", hairStyle: "shortHairWavy", hairColor: "2c1b18", expression: "wink", clothing: "blazerAndShirt", clothingColor: "047857", backgroundColor: "047857" },
    url: "",
  },
  {
    id: "finance",
    name: "المديرة المالية والتحليلات",
    nameEn: "Financial Analyst",
    config: { skinColor: "edb98a", hairStyle: "bob", hairColor: "b58143", expression: "happy", clothing: "blazerAndSweater", clothingColor: "0f766e", backgroundColor: "0f766e" },
    url: "",
  },
  {
    id: "ops",
    name: "مدير العمليات واللوجستيات",
    nameEn: "Operations Lead",
    config: { skinColor: "ae5d29", hairStyle: "shortHair", hairColor: "2c1b18", expression: "happy", clothing: "blazerAndShirt", clothingColor: "1e40af", backgroundColor: "1e40af" },
    url: "",
  },
  {
    id: "hr",
    name: "مديرة الموارد البشرية",
    nameEn: "HR & People Lead",
    config: { skinColor: "edb98a", hairStyle: "hijab", hairColor: "2c1b18", expression: "happy", clothing: "blazerAndShirt", clothingColor: "be185d", backgroundColor: "be185d", hijabColor: "8d4592" },
    url: "",
  },
  {
    id: "legal",
    name: "المستشار القانوني",
    nameEn: "Legal Counsel",
    config: { skinColor: "edb98a", hairStyle: "shortHair", hairColor: "94a3b8", expression: "serious", clothing: "blazerAndShirt", clothingColor: "475569", backgroundColor: "475569" },
    url: "",
  },
  {
    id: "creative",
    name: "المصمم والمبتكر التقني",
    nameEn: "Creative Director",
    config: { skinColor: "d08b5b", hairStyle: "shortHairWavy", hairColor: "b91c1c", expression: "wink", clothing: "graphicShirt", clothingColor: "b45309", backgroundColor: "b45309" },
    url: "",
  },
  {
    id: "cto",
    name: "المدير التقني التنفيذي",
    nameEn: "Chief Technology Officer",
    config: { skinColor: "ae5d29", hairStyle: "shortHair", hairColor: "2c1b18", expression: "sunglasses", clothing: "blazerAndShirt", clothingColor: "4c1d95", backgroundColor: "4c1d95" },
    url: "",
  },
  {
    id: "product",
    name: "مديرة المنتجات الرقمية",
    nameEn: "Product Director",
    config: { skinColor: "f8d25c", hairStyle: "bun", hairColor: "4a312c", expression: "happy", clothing: "blazerAndSweater", clothingColor: "0284c7", backgroundColor: "0284c7" },
    url: "",
  },
  {
    id: "cyber",
    name: "مدير أمن المعلومات",
    nameEn: "Cybersecurity Lead",
    config: { skinColor: "614335", hairStyle: "shortHair", hairColor: "2c1b18", expression: "serious", clothing: "graphicShirt", clothingColor: "3b82f6", backgroundColor: "1e3a8a" },
    url: "",
  },
  {
    id: "data",
    name: "عالمة البيانات والإحصاء",
    nameEn: "Data Scientist Lead",
    config: { skinColor: "edb98a", hairStyle: "longHair", hairColor: "2c1b18", expression: "glasses", clothing: "blazerAndShirt", clothingColor: "0d9488", backgroundColor: "0d9488" },
    url: "",
  },
  {
    id: "marketing",
    name: "نائب رئيس التسويق",
    nameEn: "Marketing VP",
    config: { skinColor: "d08b5b", hairStyle: "shortHair", hairColor: "b58143", expression: "wink", clothing: "blazerAndShirt", clothingColor: "e11d48", backgroundColor: "e11d48" },
    url: "",
  },
  {
    id: "cs",
    name: "مديرة نجاح العملاء",
    nameEn: "Customer Success Lead",
    config: { skinColor: "f8d25c", hairStyle: "hijab", hairColor: "4a312c", expression: "happy", clothing: "blazerAndSweater", clothingColor: "059669", backgroundColor: "059669", hijabColor: "0f766e" },
    url: "",
  },
  {
    id: "devops",
    name: "كبير مهندسي السحابة",
    nameEn: "Senior DevOps Engineer",
    config: { skinColor: "edb98a", hairStyle: "shortHairWavy", hairColor: "4a312c", expression: "happy", clothing: "collarAndSweater", clothingColor: "2563eb", backgroundColor: "2563eb" },
    url: "",
  },
  {
    id: "strategy",
    name: "مدير الاستراتيجية العالمية",
    nameEn: "Global Strategy Lead",
    config: { skinColor: "d08b5b", hairStyle: "shortHair", hairColor: "94a3b8", expression: "happy", clothing: "blazerAndShirt", clothingColor: "7c3aed", backgroundColor: "7c3aed" },
    url: "",
  },
];

// Pre-calculate instant data URLs for all 16 presets so zero lag occurs
LOCAL_EXECUTIVE_PRESETS.forEach((preset) => {
  preset.url = generateAvatarSvgDataUrl(preset.config);
});

export function getAvatarForUser(nameOrId?: string | null, customUrl?: string | null): string {
  if (customUrl && typeof customUrl === "string" && customUrl.trim() !== "" && !customUrl.includes("pravatar") && !customUrl.includes("placeholder")) {
    return customUrl;
  }
  if (!nameOrId || nameOrId.trim() === "") {
    return LOCAL_EXECUTIVE_PRESETS[0].url || generateAvatarSvgDataUrl(LOCAL_EXECUTIVE_PRESETS[0].config);
  }
  let hash = 0;
  for (let i = 0; i < nameOrId.length; i++) {
    hash = nameOrId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % LOCAL_EXECUTIVE_PRESETS.length;
  return LOCAL_EXECUTIVE_PRESETS[index].url || generateAvatarSvgDataUrl(LOCAL_EXECUTIVE_PRESETS[index].config);
}

