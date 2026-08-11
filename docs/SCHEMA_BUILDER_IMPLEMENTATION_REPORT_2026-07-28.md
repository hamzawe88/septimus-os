# تقرير تنفيذ منشئ المخططات — المراحل 1 و2 و3

**المشروع:** Septimus OS  
**التاريخ:** 2026-07-30  
**المرجع:** `SCHEMA_BUILDER_EXECUTION_PLAN_2026-07-28.md`  
**الحالة:** المراحل 1 و2 و3 مكتملة ومتحقق منها تشغيليًا

## 1. نطاق الحزمة

نفذت هذه الحزمة الأساس الأمني والتشغيلي من المرحلة 0 والمرحلة 1:

- كتالوج علائقي ثابت لحقول كل إصدار منشور.
- checksum مرتبط بكل صف في الكتالوج لإثبات مطابقته للإصدار.
- تصنيف الحقول وسياسات القراءة والكتابة.
- تحقق مستأجري لحقول المستخدم والملف.
- حجب الحقول عن القراءة والأحداث وفهرسة AI.
- Audit diff ذري داخل معاملة السجل.
- توحيد كتابة وقراءة السجلات عبر `RecordService`.
- دمج حوكمة الحقول في واجهة المنشئ مع AR/EN وRTL والثيم الحالي.
- اختبار UI فعلي لمنشئ المخططات ضمن Playwright.
- إعادة بناء كاملة للحاويات والتحقق من الصحة وRLS وبيانات الكتالوج.

## 2. التنفيذ الخلفي

### 2.1 كتالوج الحقول المنشورة

أضيف جدول `entity_schema_fields` بالمفاتيح والقيود التالية:

- عزل مباشر بواسطة `workspace_id`.
- ارتباط مركب بالتعريف ومساحة العمل.
- ارتباط بإصدار المخطط.
- uniqueness على `(definition_id, schema_version, field_key)`.
- `schema_checksum` وبيانات النوع والترتيب والتصنيف والسياسات.
- فهارس لمسارات القراءة والحقول القابلة للبحث.
- RLS ضمن قائمة الجداول المستأجرية.
- Backfill لجميع الإصدارات السابقة من `ui_schema.fields`.

تتم materialization في نفس معاملة نشر الإصدار، قبل العلاقات والـOutbox، لذلك
لا يمكن ظهور إصدار منشور دون كتالوجه.

### 2.2 عقد الحقل والأمن

يدعم العقد الآن:

- `searchable` و`indexed`.
- `classification`: `public | internal | confidential | pii`.
- `read_roles` و`write_roles`.
- `include_in_ai` و`include_in_events` و`include_in_export`.

تطبّع الأدوار وتتحقق مفاتيحها في الخادم. لا يسمح بجعل حقل indexed غير قابل
للبحث، ولا يسمح بتصنيف غير معروف. القيم السرية وPII لا تدخل أحداث realtime
أو AI حتى عند محاولة إرسال override غير آمن.

### 2.3 المراجع والسجلات

- حقل `user` يقبل عضوًا موجودًا في مساحة العمل نفسها فقط.
- حقل `file` يقبل ملف Drive جاهزًا وناجح الفحص، أو WorkDoc خاصًا بالمستأجر،
  أو FileRecord لا ينشأ إلا بعد نجاح الفحص.
- تحديث السجل أصبح PATCH merge حقيقيًا مع القفل التفاؤلي.
- يعاد حساب المعادلات والتحقق من المخطط والمراجع داخل المعاملة.
- Query AST لا يستطيع التصفية بحقل غير مقروء للمستخدم.
- create/update/delete وعمليات nullify تكتب Audit diff وOutbox ذريًا.
- بيانات الأحداث تحذف الحقول الحساسة، وتحفظ `changed_fields`.

### 2.4 التكاملات

- فهرسة AI تستخدم إصدار المخطط المنشور نفسه، لا المسودة.
- حقول AI المستبعدة أو الحساسة لا تدخل النص المفهرس.
- أحداث السجلات تبقى على عقود `data.record.*` وقناة
  `workspace_<uuid>` مع `definition_key`.
- مسارات الواجهة وAPI والمصادر الداخلية تستخدم principal واضحًا
  (`authenticated`, `api_key`, `internal`, `system`).

## 3. التنفيذ الأمامي

- استخراج الأنواع وعقود API ومصنع الحقول ومدخلات السجلات وسياسة الحقل إلى
  وحدات مستقلة تحت `components/entities/schema-builder`.
- إضافة لوحة حوكمة لكل حقل:
  - التصنيف.
  - قابلية البحث.
  - أدوار القراءة.
  - أدوار الكتابة.
- إخفاء الحقول غير المقروءة من Grid وإظهار الحقول القابلة للكتابة فقط في
  نموذج التحرير، مع إبقاء المعادلات المقروءة بوضع readonly.
- عدم عرض رسالة Backend الخام عند منع كتابة حقل.
- تطابق كامل لمفاتيح العربية والإنجليزية: `1897 / 1897`.
- استخدام CSS logical وCSS variables الحالية.
- تعطيل ترويسة `X-Powered-By` وتتبع Next.js أثناء بناء Docker.
- تثبيت البناء الإنتاجي على webpack لأن Turbopack ظل معلقًا في هذه البيئة،
  بينما نجح webpack وTypeScript وبناء Docker بصورة مستقرة.

## 4. نتائج التحقق

| الفحص | النتيجة |
|---|---|
| Go tests — backend-core | نجح `go test ./...` |
| Go vet — backend-core | نجح |
| Go tests — Septimus Drive | نجح |
| Python AI sidecar | `177 passed` |
| Yjs authentication | `3 passed` |
| TypeScript | نجح `tsc --noEmit` |
| ESLint | نجح بلا أخطاء أو تحذيرات |
| Next.js production build | نجح |
| Playwright E2E | `4 passed` |
| Docker Compose config | صالح |
| Docker full rebuild | نجح مع `--build --force-recreate` |
| Container health | الخدمات ذات healthcheck سليمة |
| Migration `2026072801` | مطبقة |
| Catalog checksum | `0` اختلاف |
| Catalog field count | `0` إصدار غير مطابق |
| RLS direct role test | `0` صف عابر للمستأجر |
| npm production audit | `0` ثغرات |

## 5. ملاحظات غير حاجبة

- أضيفت حاوية `n8n-task-runners` الرسمية والمطابقة لإصدار n8n لتشغيل عقد
  JavaScript وPython خارج الحاوية الرئيسية. يتصل الطرفان عبر Broker داخلي
  وToken مستقل، ولا يملك Runner منافذ أو مجلدات من الجهاز المضيف.
- يوجد تحذير deprecation واحد في مكتبة اختبار Starlette بشأن الانتقال
  المستقبلي من `httpx` إلى `httpx2`؛ الاختبارات كلها ناجحة.
- `npm audit --omit=dev` نظيف. التحذيرات التسعة في التدقيق الكامل محصورة في
  شجرة ESLint/`minimatch` التطويرية، والإصلاح المقترح حاليًا يتطلب تغييرًا
  رئيسيًا أو downgrade غير آمن لـ`eslint-config-next`، لذلك لم يطبق قسرًا.
- `experimental.proxyTimeout` يبقى مقصودًا لطلبات AI الطويلة ويولّد تنبيه
  Next.js بأن الخيار تجريبي.

## 6. الانتقال بعد المرحلة 2

بعد اكتمال المرحلة 2 انتقل التنفيذ إلى Schema Studio. اكتملت هذه المرحلة
أيضًا كما هو موثق في القسم 8، وأصبحت Forms/Views المحفوظة هي المرحلة التالية.

## 7. تنفيذ المرحلة 2 — Diff وImpact والترحيلات

### 7.1 محرك المقارنة والأثر

- يقارن المسودة بآخر إصدار ثابت ويصنف كل تغيير:
  `safe | conditional | breaking`.
- يفحص إضافة/حذف الحقول، required/default، الأنواع، خيارات القوائم،
  العلاقات، المعادلات، الأمن الحقلي ودورة الحياة.
- يفرض دورة الحذف:
  `active → deprecated → hidden → cleanup`.
- يمنع required دون default عندما توجد سجلات متأثرة.
- يمنع تحويل النص إلى رقم عند وجود قيمة غير قابلة للتحويل.
- يفحص السجلات عبر `FindInBatches` بحجم 500، دون تحميل كامل الجدول في الذاكرة.
- يحصي علاقات المخطط وWorkflows المرتبطة بعد فك عقدها المشفرة داخل الخادم،
  دون كشف محتواها للعميل.
- يرفض إنشاء إصدار مطابق checksum للإصدار الحالي.

### 7.2 بوابة الموافقة والنشر

- Endpoint: `POST /schema-definitions/:id/impact`.
- تقرير الأثر محفوظ وغير قابل للتبديل داخل `entity_schema_change_jobs`.
- مفتاح idempotency مشتق من المستأجر والتعريف والمراجعة والـchecksum.
- النشر بعد الإصدار الأول يرفض التقرير القديم أو المخالف للمراجعة أو checksum.
- التغيير conditional/breaking يحتاج مستخدمًا يملك `schemas.publish`.
- التغيير المحجوب لا يمكن تجاوزه بالموافقة.
- `change_set` في الإصدار الجديد يحفظ تقرير الأثر ومعرفات impact/migration.

### 7.3 وظائف الترحيل

- Migration `2026072901` تنشئ `entity_schema_change_jobs` مع FK مستأجري مركب،
  RLS وفهارس claim/status.
- Worker يطالب job واحدة عبر `FOR UPDATE SKIP LOCKED`.
- التنفيذ بدفعات 100 سجل، وكل دفعة معاملة ذرية.
- الاستئناف آمن لأن الشرط هو `schema_version < target_version`.
- العمليات المدعومة:
  default backfill، تحويل text/number/integer، تنظيف الحقل المخفي،
  تحويل relation one→many، وإعادة حساب المعادلات.
- Pause/Resume/Failure/Completion حالات مرئية، وكل انتقال مهم له Audit وOutbox.
- كل سجل مرحّل يمر مجددًا عبر validation والمراجع والمعادلات والعلاقات
  وAudit وOutbox.

### 7.4 التكاملات والواجهة

- كل `events.data.schema.>` يصل إلى Workflow وn8n actions وCentrifugo على
  `workspace_<uuid>`.
- `data.record.migrated` يعيد فهرسة AI ويحدث واجهات السجلات الفعلية.
- أضيفت Triggers للترحيل واكتمال ترحيل المخطط في Workflow Builder.
- حوار Impact Review ثنائي اللغة يعرض الخطورة والسجلات والعلاقات والـWorkflows
  والعوائق وخطة الترحيل.
- أضيف default value وfield lifecycle إلى لوحة الحوكمة.
- الحقل hidden لا يظهر في API أو Query أو Event أو AI أو Grid.
- شاشة الإصدارات تقارن الحقول بين إصدارين، تعرض تقدم jobs، وتتيح استعادة
  snapshot إلى مسودة جديدة.
- Archive/Restore لا يعدل الإصدارات القديمة، ويمنع الأرشفة أثناء job فعالة.

### 7.5 اختبارات المرحلة 2

- Unit tests لمنع required دون default.
- Unit tests لخطة backfill وتكرارها الآمن.
- Unit tests لدورة deprecate/hide/cleanup.
- Unit tests لتحويل النص الرقمي والقيم غير الصالحة.
- اختبار Migration contract وRLS.
- E2E ينشر الإصدار الأول، ينشئ سجلًا، يثبت منع تغيير كاسر، ثم يعتمد default
  وينشر الإصدار الثاني وينتظر ترحيل السجل فعليًا إلى `schema_version = 2`.

### 7.6 نتيجة التحقق النهائي — 2026-07-29

| الفحص | النتيجة |
|---|---|
| backend-core Go tests + vet | ناجح |
| Schema impact/migration unit tests | ناجح |
| Septimus Drive Go tests | ناجح |
| AI Sidecar Python 3.12 | `177 passed` |
| Yjs tests | `3 passed` |
| TypeScript + ESLint | ناجح |
| Next.js production build | ناجح |
| Playwright على Docker | `4 passed` |
| Docker full rebuild | ناجح لكل الصور مع `--force-recreate` |
| Container health | جميع الخدمات ذات healthcheck سليمة |
| Migration `2026072901` | مطبقة |
| RLS على change jobs | مفعلة وسياسة مستأجرية واحدة |
| E2E impact jobs | تقريران مكتملان |
| E2E migration jobs | مهمة واحدة مكتملة؛ `0` pending/running |
| Cross-tenant change jobs | `0` |
| Catalog count/checksum mismatch | `0 / 0` |
| Schema Audit/Outbox | start/complete/impact/approval/publish موجودة، وكل Outbox منشور |

التحذير التشغيلي الوحيد غير الحاجب هو تحذير n8n المعروف بشأن عدم تشغيل
Python task runner داخليًا؛ JS runner مسجل والحاوية صحية. إذا احتاج المنتج
Python Code nodes، فيجب نشر external runner معزول وفق إعدادات n8n الإنتاجية.

## 8. تنفيذ المرحلة 3 — Schema Studio

### 8.1 تجربة التحرير

- أصبح الاستوديو مقسمًا إلى تبويبات معيارية للحقول والعلاقات والبيانات
  والإصدارات والنشاط؛ وتظهر Forms وViews بوضوح كمرحلة تالية غير مفعلة.
- تعرض هوية المخطط الاسمين العربي والإنجليزي في الوقت نفسه، إضافة إلى المفتاح
  التقني وحقل عنوان السجل.
- أضيف حفظ تلقائي متأخر `debounced autosave` للمخططات الموجودة، مع مؤشرات
  حالة واضحة للحفظ والتغييرات المحلية والخطأ والتعارض.
- أضيف تاريخ محلي محدود للمسودة يدعم Undo/Redo من الأزرار ومن لوحة المفاتيح،
  دون اعتراض الاختصارات داخل المدخلات النصية.
- عند تعارض `draft_revision` لا تُفقد المسودة المحلية ولا تُكتب فوق تعديل
  أحدث بصمت؛ يظهر حوار يتيح تحميل النسخة البعيدة أو إعادة تطبيق المحلية بعد
  موافقة صريحة.

### 8.2 المعاينة والمعادلات

- أضيف تبديل فعلي بين معاينة Desktop وMobile داخل مساحة العمل.
- أصبحت السجلات الفعلية متاحة من تبويب البيانات على الشاشات الأصغر، بدل
  حصرها في لوحة المعاينة المكتبية.
- أضيف محرر معادلات يعرض الحقول الرقمية المتاحة وقيم عينات.
- Endpoint جديد:
  `POST /schema-definitions/:id/formula-preview`.
- المعاينة تستخدم Parser وAST الآمنين في الخادم، وتتحقق من أن التبعيات حقول
  رقمية موجودة في عقد المسودة؛ ولا تستخدم `eval` أو JavaScript أو SQL.

### 8.3 العلاقات والنشاط

- أضيف Relation Studio يلخص الهدف وCardinality وسياسة الحذف ويعيد المستخدم
  إلى إضافة حقل علاقة من العقد الحالي.
- أضيف Endpoint مستأجري:
  `GET /schema-definitions/:id/activity`.
- سجل النشاط معزول بـ`workspace_id` و`definition_id`، ويعرض أحداث النشر
  والأثر والموافقة والترحيل والأرشفة والاستعادة.

### 8.4 نتيجة التحقق — 2026-07-30

| الفحص | النتيجة |
|---|---|
| backend-core Go tests + vet | ناجح |
| اختبار Formula Preview وعزل Schema Activity | ناجح |
| Septimus Drive Go tests | ناجح |
| Python AI sidecar على Python 3.12 | `177 passed` |
| Yjs authentication | `3 passed` |
| تطابق مفاتيح AR/EN | `2034 / 2034` |
| TypeScript + ESLint | ناجح |
| Next.js production build | ناجح |
| Docker full rebuild | نجح مع `--build --force-recreate` |
| صحة الحاويات | جميع الخدمات ذات healthcheck سليمة |
| Playwright على الصور الجديدة | `4 passed` |
| E2E Autosave/Undo/Redo/Conflict/Activity | ناجح |

لا توجد أخطاء تشغيلية حاجبة في السجلات بعد الاختبار. حالات `401/403/409/412`
الظاهرة أثناء Playwright متوقعة ومقصودة لاختبار المصادقة والصلاحيات والتعارض
وبوابة أثر التغيير.

## 9. الخطوة التالية

الخطوة التالية بعد حزمة Forms وViews هي المرحلة 5: ERD تفاعلي،
Lookup/Rollup، Dependency graph وإعادة الحساب عبر Outbox، ثم الاستيراد
والتصدير في المرحلة 6.

## 10. تنفيذ حزمة Forms وViews

- أضيفت Migration `2026073001` لجداول `entity_forms` و`entity_views` مع
  مفاتيح FK مركبة حسب مساحة العمل، فهارس، Default جزئي، Soft delete وRLS.
- كل Form وView يحمل `revision` ويستخدم قفلًا تفاؤليًا في التحديث والحذف.
- كل إنشاء أو تعديل أو حذف يكتب حدث Audit خاصًا بالمخطط.
- يتحقق الخادم من مفاتيح الحقول، عدم التكرار، حدود الأقسام، قواعد الظهور
  المسموحة، أنواع العرض والمشاركة، وQuery AST المحفوظة.
- أصبح Impact Review يحصي Forms وViews المرتبطة فعليًا.
- فُعّلت تبويبات النماذج وطرق العرض بدل الحالة المعطلة.
- يدعم Form Builder الأقسام، 1–3 أعمدة، ترتيب الحقول، أوضاع
  create/edit/readonly والنموذج الافتراضي.
- يدعم View Builder Table وKanban وCalendar وGallery، الأعمدة، فلترًا محفوظًا،
  المشاركة الخاصة/مساحة العمل، وحقول التجميع والتقويم والغلاف.
- تطبق نافذة السجل النموذج الافتراضي فعليًا، وتستخدم حقول user/file قوائم
  آمنة من أعضاء المستأجر وملفات Drive بدل إدخال UUID خام.
- تطبق شاشة البيانات طريقة العرض الافتراضية وأعمدتها وفلترها ونوعها، وتدعم
  تحميل الصفحات التالية عبر `next_cursor`.
