# Septimus OS — الدستور التقني الشامل لمطوري ووكلاء الذكاء الاصطناعي
# (System Constitution & Architectural Guide)

> **إشعار هام لجميع وكلاء الذكاء الاصطناعي (AI Agents) والمطورين البشر**:
> هذا الملف يُعد **الدستور الأسمى والمستند المرجعي الملزم (Source of Truth & Constitution)** لأي عمل يتم على نظام **Septimus OS**. يجب قراءة وفهم وتطبيق جميع الأحكام والسياسات المذكورة هنا قبل إجراء أي تعديل أو كتابة أي كود جديد.

---

## الباب الأول: دستور التكافؤ اللغوي المزدوج والتناظر البصري (Bilingual & RTL/LTR Parity)

### 1. قاعدة التطابق الحرفي بين العربية والإنجليزية (1:1 Parity Rule)
- نظام Septimus OS صُمم ليعمل بثنائية لغوية مطلقة ومتكافئة. أي مفتاح أو نص يتم إضافته أو تعديله في القاموس العربي `ar.json` يجب **إلزامياً وبشكل فوري** إضافته وتعديله في القاموس الإنجليزي `en.json`.
- يُمنع تماماً وجود نصوص يتيمة (Orphan Strings) في لغة دون الأخرى. كلاهما يجب أن يحملا نفس المفاتيح وبنفس الهيكل الترابطي.

### 2. منع النصوص البرمجية المباشرة (Zero Hardcoded Strings Policy)
- يُمنع كليّاً كتابة أي نصوص ثابتة (Hardcoded Strings) عربية أو إنجليزية داخل ملفات الـ `TSX/TS` أو الـ `Go/Python`.
- يجب الاعتماد حصراً على خطاف التوطين:
  ```tsx
  const { t, isRtl } = useLocalization();
  ```
  واستدعاء النصوص عبر `t("section.key")` مع توفير الترجمة في الملفين `ar.json` و `en.json`.

### 3. التناظر البصري وتخطيط الشاشات (RTL/LTR Layout Symmetry)
- يجب تصميم جميع الواجهات لتعمل بكفاءة وتناظر تام في الوضعين العربي (RTL) والإنجليزي (LTR) عبر تبني قواعد Tailwind CSS المنطقية:
  - استخدام `start-0` / `end-0` بدلاً من `left-0` / `right-0`.
  - استخدام `me-2` / `ms-2` بدلاً من `mr-2` / `ml-2`.
  - حماية الأزرار والقوائم الجانبية من اختفاء النصوص أو تداخلها عند تحويل الاتجاه عبر استخدام `shrink-0`، `truncate`، و `gap-2.5`.

---

## الباب الثاني: دستور الهوية البصرية والتفضيلات (Brand Identity & Theme Architecture)

### 1. المخزن الموحد للهوية (Zustand `useThemeStore`)
- جميع بيانات الهوية المؤسسية (اسم المؤسسة `companyName`، رابط الشعار `logoUrl`، اللون الأساسي `primaryColor`، والخطوط `fontFamily`) تدار وتُحفظ حصراً داخل المخزن المركزي في:
  [useThemeStore.ts](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/store/useThemeStore.ts)
- يجب ربط أي مكون يستعرض الهوية أو الشعار (مثل الترويسة العليا [TopBar.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/layout/TopBar.tsx) أو القائمة الجانبية) بهذا المخزن لقراءة الحالة مباشرة.

### 2. التزامن الفوري على مستوى النافذة (Live Event Broadcast)
- عند النقر على "حفظ هوية الشركة" من نافذة التفضيلات [SettingsModal.tsx](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/components/layout/SettingsModal.tsx)، يقوم النظام بخطوتين متزامنتين:
  1. حفظ البيانات في `localStorage` تحت المفتاحين `septimus-theme-storage` و `septimus_brand`.
  2. إطلاق حدث حي على مستوى المتصفح:
     ```ts
     window.dispatchEvent(new Event("septimus_brand_updated"));
     ```
- المكونات الرئيسية (مثل `TopBar`) تمتلك مستمعاً لهذا الحدث (`addEventListener("septimus_brand_updated", ...)`) لتقوم بتحديث الشعار واسم الشركة والألوان لحظياً دون إعادة تحميل الصفحة.

### 3. قانون ضغط وحماية الشعار برمجياً (Image Compression & `localStorage` Protection)
- يمتلك المتصفح حداً أقصى لسعة `localStorage` لا يتجاوز `5MB`. إذا قام المدير برفع صورة خام عالية الدقة (مثل `3MB JPEG` أو `PNG` بترميز Base64) وحاول حفظها، سيفشل المتصفح بصمت ويتعطل حفظ الهوية.
- **القانون الإلزامي**: يُمنع حفظ الصور الخام في `localStorage`. يجب تمرير أي صورة يتم اختيارها عبر دالة الضغط ومعالجة الصور برمجياً (`processAndCompressLogo` في `SettingsModal.tsx`):
  - تحويل الصورة برمجياً عبر `HTMLCanvasElement`.
  - ضبط الحد الأقصى للأبعاد على `320px × 320px` مع الحفاظ على نسبة العرض إلى الارتفاع (`AspectRatio`).
  - تصدير الصورة بصيغة `image/webp` عالية الكفاءة وبجودة `0.85` (أو `JPEG` كبديل احتياطي)، مما يخفض الحجم من ميجابايتات إلى أقل من `20KB`.

### 4. قاعدة التباين الفائق لأيقونات الترويسة (TopBar Icons Contrast Rule)
- الترويسة العليا (`TopBar`) تعتمد على خلفيات داكنة بطبيعتها (مثل ثيم Slack Aubergine `#3F0E40` أو `#0f172a`).
- يُمنع استخدام ألوان شفافة سوداء (`rgba(0,0,0,0.6)`) لأيقونات الترويسة في [globals.css](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/frontend/src/app/globals.css). يجب دائماً الاعتماد على متغير التباين:
  ```css
  color: var(--tb-text, #ffffff);
  ```
  مع تأثير تمرير (`hover`) يرفع السطوع ويوفر تباينًا مريحاً للعين.

---

## الباب الثالث: دستور إعادة بناء وتشغيل الحاويات (Docker Pipeline Mandate)

### 1. إجبارية البناء بعد كل تعديل (Mandatory Rebuild Rule)
- لا يُعتد بأي تعديل يتم إجراؤه على ملفات البرمجيات (سواء في الواجهة الأمامية `frontend/src/...` أو خادم النواة `backend-core/...`) ما لم ينعكس فعلياً داخل حاويات Docker المشغلة للنظام.
- يجب على الذكاء الاصطناعي أو المطور بعد إتمام التعديل البرمجي تشغيل أمر إعادة البناء مباشرة:
  ```bash
  docker-compose up -d --build frontend
  ```
  (أو `backend-core` حسب الخدمة المعدلة).

### 2. الفحص والتحقق الصارم (Verification Checklist)
- بعد انتهاء أمر البناء، يجب التحقق من:
  1. خلو عملية تجميع Next.js من أي أخطاء (`Compiled successfully`).
  2. عمل الحاوية واستقرارها عبر فحص السجلات (`docker logs septimus-os-frontend-1 --tail 15`).

---

## الباب الرابع: دستور سير العمل والرقابة من قبل العميل (Workflow & Approval Constitution)

- **موافقة العميل شرط أساسي قبل التعديل**: يُمنع اتخاذ قرارات تقنية أو معمارية كبرى أو تعديل ملفات جوهريّة في المشروع قبل دراسة المتطلبات، إعداد وثيقة خطة عمل تفصيلية (`implementation_plan.md`)، وعرضها على العميل والحصول على موافقته الصريحة بالبدء.
- **التوثيق الدائم**: أي إضافة لتحديثات أو إصلاحات معمارية يجب أن تضاف فوراً إلى هذا الدستور المرجعي وإلى قائمة التحديثات الشاملة في [AI_OVERHAUL.md](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/docs/AI_OVERHAUL.md) لضمان استمرارية المشروع بوضوح تام لأي مطور أو ذكاء اصطناعي قادم.
