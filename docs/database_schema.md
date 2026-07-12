# Septimus Company OS - Database Schema & Architecture

يعتمد نظام **Septimus OS** على محرك **PostgreSQL** (عبر `ankane/pgvector:v0.5.0`) ببنية هجينة متقدمة تجمع بين الجداول العلائقية المُطبعة (`Normalized Relational Tables`) ونمط الكيانات المرنة (`JSONB Entity Pattern`).

> [!IMPORTANT]
> للاطلاع على التحليل المعمق التفصيلي وتقييم التوافق الكامل وخطة تطوير الأداء وقواعد الفهرسة (`GIN/ltree/vector`)، يرجى مراجعة المستند المخصص:  
> **[database_architecture_and_patterns.md](file:///Users/hamzwe/Desktop/LPC-BRAIN%20CORE/septimus-os/docs/deep_analysis/database_architecture_and_patterns.md)**

---

## 1. جداول النواة والتعددية المؤسسية (`Identity & Core Relational Tables`)

* **`workspaces`**: معرف المساحة (`uuid PK`)، الاسم (`name`)، الصناعة (`industry`).
* **`workspace_settings`**: الإعدادات والتخصيصات العالمية (`key uniqueIndex`, `value jsonb`).
* **`workspace_integrations`**: تكاملات الأنظمة الخارجية (`provider`, `access_token`, `metadata jsonb`).
* **`users`**: حسابات المستخدمين ومصادقتهم ومناصبهم (`workspace_id FK`, `email`, `role_id`, `department_id`, `employee_id`).

---

## 2. نظام الصلاحيات والهيكل التنظيمي (`Org Chart & RBAC Tables`)

* **`departments`**: الهيكل الإداري والشجري (`parent_id`, `manager_id`).
* **`roles`**: الأدوار المُعرفة (`name uniqueIndex`, `is_system_role`).
* **`permissions`**: الصلاحيات الدقيقة (`name uniqueIndex`, `module`).
* **`role_permissions`**: جدول الربط العلائقي المتعدد (`role_id`, `permission_id`).

---

## 3. مشاريع الأجايل والتسلسل الهرمي للمهام (`Agile & PM Tables`)

* **`projects`**: إعدادات المشاريع ولوحات كانبان (`settings jsonb`, `drive_folder_link`).
* **`tasks`**: المهام وتتبع الحالات (`status`, `priority`, `assignee_id`).  
  * **الامتداد المستخدم:** `ltree extension` عبر حقل `path` لفهرسة شجرة المهام الفرعية بسرعة فائقة.
* **`task_histories`**: سجل التدقيق لتغيرات حالات المهام (`previous_status`, `new_status`).
* **`sprints`**: دورات عمل الأجايل السريعة (`goal`, `status`, `start_date`, `end_date`).
* **`work_docs`**: المستندات التفاعلية المرتبطة بالمشاريع (`template_type`, `content`).

---

## 4. المحادثات والتعاون اللحظي (`Chat & Messaging Tables`)

* **`channels` & `channel_members`**: الغرف والنطاقات الخاصة والعامة وسجل الأعضاء وكتم الصوت (`is_muted`).
* **`messages`**: الرسائل وسلاسل الردود الشجرية (`parent_id`) وبطاقات مقترحات الذكاء الاصطناعي (`ai_proposal jsonb`).  
  * **الامتداد المستخدم:** `GIN tsvector index` للبحث الدلالي والنصي السريع في محتوى المحادثات.

---

## 5. الحضور والنطاق الجغرافي (`HR Attendance & Geofencing Tables`)

* **`office_locations`**: تحديد المواقع المعتمدة للعمل (`latitude decimal(10,8)`, `longitude decimal(11,8)`, `radius_meters`).
* **`attendance_logs`**: حركات تسجيل الدخول والخروج مع التقاط إحداثيات الـ GPS عند كل عملية فحص (`check_in_lat`, `check_in_lng`).

---

## 6. الأتمتة والذكاء الاصطناعي والبحث الدلالي (`Automations, AI & RAG Tables`)

* **`workflows` & `workflow_runs`**: مخططات سير العمل المؤسسي (`nodes jsonb`, `edges jsonb`) وسجلات تشغيلها التلقائية.
* **`webhook_subscriptions`**: الاشتراكات الخارجية ومحفزات الأحداث عبر النطاقات (`events jsonb`, `target_url`).
* **`document_embeddings`**: المتجهات الدلالية لمحرك البحث الذكي (RAG).  
  * **الامتداد المستخدم:** `pgvector extension` عبر حقل `embedding vector(768)` لحساب التشابه الدلالي لبيانات Gemini.
* **`ai_configs`**: إعدادات مزودي الذكاء الاصطناعي ومفاتيحهم (`provider`, `model`).
* **`agent_states` & `agent_collaboration_logs`**: مراقبة الوكلاء الإبداعيين المتعددين وحالات تشغيلهم وحلقات تعاونهم (`status`, `loop_count`).
* **`pending_approvals`**: حماية العمليات الحساسة بطلب موافقة بشرية مسبقة قبل التنفيذ (`status`, `payload jsonb`).
* **`audit_logs` & `notifications`**: السجلات الرقابية الشاملة لكافة عمليات النظام وتنبيهات المستخدمين.

---

## 7. جدول الكيانات الديناميكية (`Entities - The Dynamic Core`)

* **`id`** (`UUID PK`)
* **`workspace_id`** (`UUID FK, Indexed`)
* **`project_id`** (`UUID FK, Indexed`)
* **`entity_type`** (`VARCHAR(100), Indexed`) — مثل: `crm_deal`, `invoice`, `ticket`, `hr_employee`, `hr_leave_request`, `pos_terminal`
* **`data`** (`JSONB, Not Null`) — يحمل كامل البيانات البرمجية أو المخصصة للكيان بدون الحاجة لـ `ALTER TABLE`.
