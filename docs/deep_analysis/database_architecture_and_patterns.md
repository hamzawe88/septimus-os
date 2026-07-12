# التحليل المعمق والبنيوي لقاعدة البيانات (Database Architecture & Patterns Analysis)

يقدم هذا المستند تحليلاً شاملاً وتفصيلياً للبنية التحتية لقاعدة البيانات في نظام **Septimus OS**، مع دراسة توافقها الكامل مع متطلبات المشروع (`JSONB Entity Pattern` + الهيكلية الموزعة والذكاء الاصطناعي)، وتقييم مواطن القوة ونقاط التحسين الهندسية.

---

## 1. الهيكل الهجين لقاعدة البيانات (Hybrid Database Architecture)

يعتمد **Septimus OS** على محرك **PostgreSQL** (عبر صورة `ankane/pgvector:v0.5.0`) مستفيداً من أحدث الامتدادات والتقنيات لتوفير بنية هجينة تجمع بين الصرامة العلائقية (`Relational Integrity`) والمرونة غير العلائقية (`NoSQL / JSONB Flexibility`).

```mermaid
graph TD
    subgraph "Relational Core (Structured SQL Tables)"
        WS[Workspace] --> U[User]
        WS --> P[Project]
        WS --> C[Channel]
        WS --> D[Department]
        WS --> R[Role]
        U --> T[Task]
        C --> M[Message]
        U --> AL[AttendanceLog]
    end

    subgraph "Dynamic JSONB Engine (Entities & AI Payloads)"
        E[Entity Table<br/>id, workspace_id, entity_type] -->|JSONB Payload| DATA[{"name": "...", "amount": 1500, "stage": "qualified"}]
        M -->|JSONB Proposal| AIP[AIProposal Card Payload]
        W[Workflow Table] -->|JSONB DAG| NODES[Nodes & Edges Schema]
    end

    subgraph "PostgreSQL Advanced Extensions"
        LTREE[ltree: Hierarchical Task Paths]
        PGVEC[pgvector: 768-dim RAG Embeddings]
        TSV[tsvector: GIN Full-Text Search]
    end

    T -.-> LTREE
    DE[DocumentEmbedding] -.-> PGVEC
    M -.-> TSV
```

---

## 2. دراسة الجداول والكيانات المصدرية (`Models Breakdown`)

يتم تعريف جداول قاعدة البيانات عبر مكتبة **GORM** داخل الملفات التالية في `backend-core/models/`:

### أ. النواة والتعددية المؤسسية (`Identity & Multi-Tenancy Core`)
* **`Workspace` (`workspaces`)**:
  - `id (uuid, PK, default: gen_random_uuid())`, `name (varchar 255)`, `industry (varchar 100)`.
  - يمثل المظلة العليا لعزل البيانات بين الحسابات والشركات.
* **`WorkspaceSetting` (`workspace_settings`)**:
  - يحتوي على `key (uniqueIndex with workspace_id)` و `value (jsonb)` لحفظ إعدادات المساحة بمرونة.
* **`WorkspaceIntegration` (`workspace_integrations`)**:
  - يحفظ المفاتيح الخارجية مثل Google و Slack و Odoo (`provider`, `access_token`, `metadata as jsonb`).
* **`User` (`users`)**:
  - يحتوي على ربط أجنبي بـ `WorkspaceID` (مع فهرس)، وبيانات المصادقة (`email`, `password_hash`).
  - يرتبط بنظام الـ RBAC عبر `role_id` و `department_id` ورمز الموظف `employee_id` (تمت معالجة الفهرس الفريد ليسمح بقيم `NULL` بدلاً من السلاسل الفارغة لضمان عدم تعارض الحسابات الجديدة).

### ب. نظام إدارة الصلاحيات والهيكل التنظيمي (`RBAC & Org Domain`)
* **`Department` (`departments`)**:
  - دعم الهيكل الشجري للأقسام عبر `parent_id (uuid FK to departments)` و `manager_id`.
* **`Role` & `Permission` & `RolePermission` (`roles`, `permissions`, `role_permissions`)**:
  - فصل كامل بين اسم الدور (`Admin`, `Manager`, `Member`) وجداول الصلاحيات التفصيلية (`tasks.create`, `sprints.manage`, `attendance.manage`) مما يتيح تخصيصاً ديناميكياً دقيقاً.

### ج. إدارة المشاريع والهياكل الشجرية (`Agile PM Domain`)
* **`Project` (`projects`)**:
  - يحفظ إعدادات السكروم واللَّوحات داخل `settings (jsonb)` مع ربط بمجلدات Google Drive.
* **`Task` (`tasks`)**:
  - **ميزة متقدمة (`ltree extension`):** يستخدم حقل `path (type: ltree, gist index)` لتمثيل التسلسل الهرمي للمهام والمهام الفرعية بسرعة فائقة استعلامياً دون الحاجة لـ Recursive Joins بطيئة.
  - يحفظ تفاصيل التقدير (`story_points`) والبيانات الإضافية في `metadata (jsonb)`.
* **`Sprint` & `TaskHistory` & `WorkDoc`**:
  - تتبع دورات العمل السريعة (`planning`, `active`, `completed`) وسجل تغيرات المهام والمستندات الحية.

### د. المحادثات والتعاون اللحظي (`Chat & Real-time Domain`)
* **`Channel` & `ChannelMember` (`channels`, `channel_members`)**:
  - غرف المحادثة وأنواعها (`PUBLIC`, `PRIVATE`) وسجل الأعضاء وكتم الإشعارات (`is_muted`).
* **`Message` (`messages`)**:
  - **ميزة متقدمة (`Full-Text Search tsvector`):** يحتوي على عمود `tsv` مُدار بواسطة Trigger التلقائي في PostgreSQL (`to_tsvector('english', content)`) ومفهرس عبر `GIN(tsv)` للبحث الفوري بين ملايين الرسائل.
  - يدعم سلاسل الردود الشجرية (`parent_id`) وبطاقات اقتراحات الذكاء الاصطناعي (`ai_proposal as jsonb`).

### هـ. الحضور والنطاق الجغرافي (`Attendance & Geofencing Domain`)
* **`OfficeLocation` (`office_locations`)**:
  - يحفظ الإحداثيات الدقيقة للمكاتب (`latitude decimal(10,8)`, `longitude decimal(11,8)`) ونصف القطر بالمتر (`radius_meters`).
* **`AttendanceLog` (`attendance_logs`)**:
  - يسجل حركات الدخول والخروج (`check_in_time`, `check_out_time`) مع إحداثيات الـ GPS عند كل حركة لضمان التحقق الجغرافي وحساب المسافة بدقة باستخدام معادلات الـ Haversine.

### و. الأتمتة والمراقبة والذكاء الاصطناعي (`Automations, Observability & AI RAG`)
* **`Workflow` & `WorkflowRun` (`workflows`, `workflow_runs`)**:
  - يخزن المخطط البياني للأتمتة (`Nodes` و `Edges`) كـ JSONB، ويسجل نتائج وسياق كل تنفيذ.
* **`DocumentEmbedding` (`document_embeddings`)**:
  - **ميزة متقدمة (`vector extension`):** يخزن المتجهات الدلالية للبيانات (`embedding vector(768)`) لتمكين محرك البحث الذكي (RAG) وبحث التشابه الدلالي السريع.
* **`AIConfig` & `AgentState` & `AgentCollaborationLog` & `PendingApproval`**:
  - إدارة حالة الوكلاء المتعددين (`status`, `config jsonb`) وسجل الجلسات وطلبات الموافقة البشرية قبل تنفيذ المهام الحساسة.

---

## 3. تحليل نمط الكيانات المرنة (`JSONB Entity Pattern`)

### كيف يعمل النمط في Septimus OS؟
بدلاً من إنشاء جداول جديدة أو تشغيل `ALTER TABLE` مع كل وحدة جديدة (`CRM Deal`, `Invoice`, `Expense`, `POS Terminal`, `HR Leave Request`)، يتم استخدام جدول **`entities`**:
```sql
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL INDEX,
    project_id UUID INDEX,
    entity_type VARCHAR(100) NOT NULL INDEX,
    data JSONB NOT NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```
ويتم إدارة الأنواع المسموح بها برمجياً في `backend-core/handlers/entities.go` عبر قائمة `allowedEntityTypes` التلقائية (أو النماذج الديناميكية `schema`).

### هل هذا النمط متماشٍ ومناسب للمشروع؟ (Evaluation & Architectural Alignment)
**الإجابة قاطعة: نعم، وهو الخيار المعماري الأمثل لنظام Septimus OS**، وذلك للأسباب التالية:

| المعيار | في الجداول العلائقية التقليدية (`Rigid SQL Tables`) | في نمط `JSONB Entity Pattern` المُطوَّر في Septimus OS |
| :--- | :--- | :--- |
| **سرعة إضافة الوحدات (Time to Market)** | تتطلب كتابة Migrations وتغيير كود الـ ORM وإعادة فحص قواعد الفهرسة في كل مرة. | **فورية (Zero Migrations):** يتم حفظ أي هيكل بيانات جديد فور إرساله عبر الـ API بدون توقف. |
| **التكامل مع الذكاء الاصطناعي (`LangGraph AI Sidecar`)** | الوكلاء يحتاجون لترجمة النماذج باستمرار وكتابة استعلامات مخصصة لكل جدول. | **تكامل مثالي:** الوكلاء الإبداعيون في بايثون يستهلكون ويزودون حزم `JSONB` مباشرة بسلاسة فائقة. |
| **دعم القوالب الديناميكية للمستخدمين** | مستحيل أو يتطلب جداول بطيئة بنمط `EAV (Entity-Attribute-Value)`. | **دعم كامل:** يمكن للشركات إنشاء جداول وقوالب مخصصة (`schema`) وتخزين سجلاتها مباشرة في `entities`. |
| **الأداء والفهرسة (`Performance & Indexing`)** | ممتاز للاستعلامات العلائقية البسيطة، ولكن معقد في الجداول المتشعبة. | **ممتاز مع التمحيص:** يعتمد حالياً على فهرس `workspace_id + entity_type` سريع، ويمكن ترقيته بفهرس `GIN(data)` للاستعلام داخل الحقول الداخلية. |

---

## 4. الفجوات ونقاط التمكين المطلوبة (Identified Gaps & Optimization Roadmap)

على الرغم من قوة التصميم الحالي، كشف التحليل الهندسي العميق عن **4 نقاط تطوير استراتيجية** يجب تنفيذها لضمان الأداء الفائق عند التوسع لعشرات الآلاف من المستخدمين:

### 1. إضافة فهرس `GIN Index` على عمود `entities.data`
- **الوضع الحالي:** البحث يتم بفهرس `workspace_id + entity_type`. عند البحث عن فاتورة برقم معين أو صفقة CRM بحالة معينة داخل البيانات المدمجة (`data->>'stage' = 'won'`)، يقوم المحرك بمسح تسلسلي لسجلات ذلك النوع (`Sequential Scan`).
- **التطوير المطلوب:** إنشاء فهرس GIN شامل وفهارس تعبيرية للحقول الشائعة:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_entities_data_gin ON entities USING GIN (data);
  CREATE INDEX IF NOT EXISTS idx_entities_crm_stage ON entities ((data->>'stage')) WHERE entity_type = 'crm_deal';
  ```

### 2. محرك فحص القوالب (`JSON Schema Validation Engine`)
- **الوضع الحالي:** عند إدخال كيان بنوع ديناميكي (`entity_type = 'custom_xyz'`)، يتم التأكد فقط من وجود تعريف للـ schema في قاعدة البيانات (`schemaCount > 0`)، لكن لا يتم التحقق من صحة حقول الـ payload المرسل مقارنة بـ `JSON Schema` المعرّف.
- **التطوير المطلوب:** دمج مكتبة فحص سريعة (`gojsonschema`) في دالة `createEntityRecord` لرفض أي بيانات مخالفة للقالب المعتمد قبل حفظها في الـ `JSONB`.

### 3. دعم الحذف الآمن والتدقيق (`Soft Deletes for Entities`)
- **الوضع الحالي:** نموذج `Entity` الحالي يفتقر لعمود `DeletedAt`. دالة `DeleteEntity` تقوم بحذف السجل فيزيائياً (`database.DB.Delete(&entity)`).
- **التطوير المطلوب:** إضافة `DeletedAt gorm.DeletedAt` لجدول `entities` للحفاظ على السجل التاريخي لأغراض التدقيق وسجل نشاط الذكاء الاصطناعي (`Audit Log & AI Reports`).

### 4. تقسيم الجداول المتنامية بسرعة (`Table Partitioning / Time-Series Archiving`)
- **الوضع الحالي:** جداول `messages` و `audit_logs` و `agent_collaboration_logs` تنمو أضعافاً مضاعفة يومياً.
- **التطوير المطلوب:** إعداد `PostgreSQL Range Partitioning` (تقسيم شهري أو ربع سنوي) لهذه الجداول لمنع تضخم حجم جداول المؤشرات (`Index Bloat`) وضمان سرعة الاستعلامات اللحظية.
