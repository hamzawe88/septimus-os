# Implementation Plan — الإصلاح الشامل (2026-07-18)

> وثيقة خطة العمل التفصيلية المطلوبة دستورياً (الباب الرابع) قبل التعديلات الجوهرية.
> مصدر الفجوات: `Septimus OS/Comprehensive Review — 2026-07` (تحقّق مصدري).

## ✅ مُنجَز في هذه الجلسة (🔴 فوري)
| البند | التغيير | التحقق |
| --- | --- | --- |
| خلل `state_modifier` | `ai-sidecar/nats_events.py:191` → `prompt=` | `py_compile` ✅، لا `state_modifier=` متبقٍّ |
| doc-drift | لافتات "Superseded" في `AI_OVERHAUL.md`, `ai-development-proposal.md`, `development_roadmap.md` | ✅ |
| أسرار الإنتاج | `scripts/gen-secrets.sh` (توليد قوي، stdout للمراجعة) | شُغّل ✅ |

## ✅ مُنجَز أيضاً في هذه الجلسة (2026-07-19)
| البند | التغيير | التحقق |
| --- | --- | --- |
| ✅ تحقّق حيّ (stack مُشغَّل) | إعادة بناء ai-sidecar+backend، ثم فحص فعلي | Hybrid RAG (عربي) + لوحة التكلفة + capabilities **مُثبَتة حياً** — راجع أسفل |
| #1 إصلاح `TestBillingEndpoints` | جعله مكتفياً ذاتياً (`setupBillingTestDB`: sqlite + جداول + زرع باقة business) | `go test ./handlers/...` كامل **يمرّ** ✅ |
| #4 `/agents/capabilities` الحيّ | route في `ai-sidecar/main.py` (`/api/v1/ai/agents/capabilities`) يعيد `describe_capabilities()`؛ يُبلَغ عبر بروكسي `/ai/*` بلا تغيير Go | `py_compile` ✅ + payload صحيح |
| #3 إعادة هيكلة `integrations.go` | استخراج `normalizeProvider` (وحّد 3 مواضع aliasing) + `integrations_test.go` (4 اختبارات: normalizeProvider، status mapping، تحقّق WhatsApp/Zendesk) | `go build`+`go vet`+`go test` **يمرّ** ✅ |

---

## 🟠 قصير المدى

### 1. إعادة هيكلة + اختبارات `handlers/integrations.go` — ✅ **مُنجَزة (2026-07-19)**
- استُخرج `normalizeProvider` (وحّد منطق google-aliasing المكرّر 3 مرّات، سلوك محفوظ) + `integrations_test.go` (4 اختبارات، عزل sqlite، بلا استدعاءات شبكة خارجية). كامل حزمة handlers تمرّ.

### 2. تقسيم الجداول الفعلي (Range Partitioning) — 🟡 **قيد التنفيذ من المالك**
- **تحديث 2026-07-19**: المالك نفّذ في `database.go` `runDatabaseOptimizations()` تقسيماً تصريحياً حقيقياً لـ `audit_logs` (`PARTITION BY RANGE(created_at)` + قسم DEFAULT + ترحيل البيانات + rollback عند الفشل) **و RLS** لعزل المستأجرين على 5 جداول.
- **المتبقّي**: توسيع نفس النمط لـ `messages` و `agent_collaboration_logs`، و cron لإنشاء أقسام شهرية آلياً (أو `pg_partman`).

---

## 🟡 متوسط المدى

### 3. الاسترجاع الهجين (Hybrid RAG: FTS + RRF) — ✅ **مُنجَز (2026-07-19)**
- **مُسلَّم**: `services/embeddings.go` — `SearchHybrid()` يدمج الذراع الكثيف (pgvector cosine) مع الذراع اللفظي (`searchLexical`: Postgres FTS بإعداد `'simple'` — آمن للعربية) عبر **Reciprocal Rank Fusion** (k=60، مفتاح `EntityID`)، مع fallback متسامح (أي ذراع يفشل/يفرغ يجيب الآخر). مربوط في `handlers/rag_handlers.go` `SearchSemantic` (سطر واحد) — فيتدفّق تلقائياً لكل مسار `retrieve_context` في الـ sidecar بلا تغيير.
- **التحقق**: `go build`+`go vet` ✅ + `embeddings_rrf_test.go` (3 اختبارات) ✅ + **مُثبَت حياً (2026-07-19)**: FTS العربي يعمل على بيانات فعلية، و`/internal/search/semantic?q=الإجازات` → `SearchHybrid` أعاد الوثيقة الصحيحة، والدردشة استخدمت RAG وأجابت "21 يوماً".
- **متبقٍّ (follow-up)**: فهرس GIN دالّي `... USING GIN (to_tsvector('simple', content))` على `document_embeddings` للسرعة عند التوسّع (يُضاف في `database.go` عند فراغ الـ WIP)؛ ور/rerank عبر cross-encoder اختياري؛ وقياس قبل/بعد بحزمة Evals.

### 4. حزمة Evals عربية-أولاً — ✅ **مُنجَزة (2026-07-18)**
- **مُسلَّم**: `ai-sidecar/evals/` — `dataset.jsonl` (**29 حالة**: language 4 / classification 7 / estimation 4 / injection 5 / grounding 4 / tone 2 / rag 3) + `run_evals.py` (8 أنواع تحقق، رمز خروج للـ CI، حارس JWT) + `README.md` (تشغيل + مقتطف CI).
- **التحقق**: `py_compile` ✅، الداتاست 29 حالة تُحلَّل بمعرّفات فريدة ✅، اختبار `score()` offline 8/8 ✅، حارس no-JWT يخرج 2 ✅.
- **المتبقّي التشغيلي**: تشغيلها مقابل الـ stack الحيّ بـ JWT، وإضافة وظيفة CI اختيارية.

### 5. RBAC للوكلاء — ✅ **مُنجَز (2026-07-18)**
- **مُسلَّم**: `ai-sidecar/agent_rbac.py` — مصفوفة صلاحيات تصريحية واحدة (`allowed_tools_for`) + بوّابة `enforce()` fail-closed مع تدقيق (تُسقط أي أداة خارج نطاق الوكيل وتسجّلها) + `describe_capabilities()`. مربوطة كخطوة نهائية في `agents_chat._build_tools` (defense-in-depth فوق فحوص الدور لكل أداة).
- **التحقق**: `tests/test_agent_rbac.py` (8 اختبارات offline) + الاختبارات الحالية `TestSupervisorAndRBAC` — **12 نجحت بلا انحدار** عبر `.venv`.
- ✅ **كشف `/agents/capabilities`** — **مُنجَز (2026-07-19)**: route حيّ في `ai-sidecar/main.py` + لقطة `AGENT_CAPABILITIES.md`. متبقٍّ اختياري: عرضه في الواجهة (McpTab/admin).

### 6. لوحة التكلفة — ✅ **مُنجَزة (2026-07-18)**
- **مُسلَّم**: كانت بيانات التكلفة **لا تُحفَظ** (مسار `/internal/audit/log` غير موجود). أضفت خط الأنابيب الكامل:
  - `models/ai_usage.go` (`AITokenUsage`) + إضافته لـ AutoMigrate.
  - `handlers/ai_usage.go`: `IngestAITokenUsage` (داخلي) + `GetAICostReport` (تجميع: إجمالي/حسب النموذج/يومي، workspace-scoped من JWT).
  - مسارات: `internal.Post("/ai/usage")` + `protected.Get("/reports/ai/cost")`.
  - `ai-sidecar/observability.py`: يرسل الآن لـ `/internal/ai/usage` بالحقول المطابقة.
  - `frontend/.../AiCostReport.tsx` (بطاقات + مخطط يومي + جدول حسب النموذج، ثنائي اللغة RTL) + تبويب في `ReportsCenter` + مفاتيح `reports.aiCost` في `ar.json`+`en.json` (14 مفتاحاً، **تكافؤ 1:1**).
- **ثغرة اكتشفها التحقّق الحيّ + أُصلِحت**: `track_llm_usage` كانت **مُعرَّفة ولا تُستدعى أبداً** → اللوحة تبقى صفراً. وُصِلت عبر `UsageMetadataCallbackHandler` في `agents_chat.run_chat_agent` + `observability.record_usage_from_handler()`.
- **تغطية شاملة (2026-07-19)**: بدل وصل كل مسار يدوياً، أُرفِق callback واحد في `providers.get_active_llm` (`observability.make_usage_callback`) → **كل** استدعاء LLM (دردشة عبر react-agent، أو `ainvoke` مباشر في subtasks/plan-sprint/correspondence/nats/orchestrator) يُغذّي اللوحة تلقائياً. مسار الدردشة أُرجِع لأصله (لا عدّ مزدوج).
- **مُثبَت حياً end-to-end متعدد المسارات**: دردشة → `qwen3:8b` (strong, 3018) + generate-subtasks → `llama3.2:3b` (**fast**, 176) — كلٌّ صفّ واحد، والطبقات/النماذج صحيحة، و`/reports/ai/cost` جمّعهما (2 calls). `go build`+`vet`+`tsc`+`py_compile` ✅.
- **متبقٍّ**: تحقّق بصري لـ `AiCostReport.tsx` فقط (data path مُثبَت بالكامل)؛ Langfuse اختياري.

---

## 🟢 قيمة تجارية (بناء ميزات — قرار أولوية مطلوب)

### 7. وحدات SME (من `superpowers/specs/2026-07-05-sme-business-modules-suite-design.md`)
- CRM: عروض أسعار + جسر Quote→Invoice · Finance: ZATCA (QR+VAT 15%) + OCR إيصالات + إقرار VAT · HR: رواتب + WPS.
- كلها فوق [[JSONB Entity Pattern]] (`crm_quote`, `finance_invoice`, `hr_payroll`).
- **الجهد**: 2–4 أسابيع لكل مجموعة · **الخطر**: متوسط (ZATCA يحتاج مواصفات ضريبية سعودية دقيقة).

### 8. الصوت اللحظي (OpenAI Realtime)
- الصوت المحلي (`voice_local.py`) موجود كبديل. الـ realtime يحتاج مفتاح OpenAI + مسار صوت المتصفح.
- **الجهد**: أسبوع · **الخطر**: منخفض (اختياري، معزول).

### 9. النشر (K3s)
- Helm charts + manifests + بناء Docker متعدد المراحل. `docker-compose.prod.yml` جاهز كمرجع.
- **الجهد**: أسبوع+ · **الخطر**: متوسط.

---

## الترتيب المقترح للتنفيذ
`🔴 (تم)` → **4 (Evals)** → **1 (integrations بعد التزام WIP)** → **5 (agent-RBAC)** → **6 (لوحة تكلفة)** → **3 (Hybrid RAG)** → **2 (partitioning بنافذة صيانة)** → **7–9 (ميزات، حسب أولوية العمل)**.

> السبب: Evals أولاً تعطي مقياساً موضوعياً لبقية تغييرات الذكاء؛ والبنود منخفضة الخطر قبل عالية الخطر (partitioning).
