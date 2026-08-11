# Agent Capability Matrix — Audit Snapshot

> Auto-generated 2026-07-23. Do not edit by hand — regenerate.

## أدوات وكلاء الدردشة (fail-closed RBAC)

### hr
- get_attendance_summary
- get_hr_policy
- list_institutional_facts
- search_knowledge

### crm
- create_crm_deal
- get_crm_deals
- list_institutional_facts
- search_knowledge

### tasks
- create_task
- get_tasks
- list_institutional_facts
- search_knowledge

### correspondence
- audit_correspondence
- list_institutional_facts
- rewrite_correspondence
- search_knowledge

### supervisor
- delegate_to_correspondence_specialist
- delegate_to_crm_specialist
- delegate_to_hr_specialist
- delegate_to_tasks_specialist
- delete_institutional_fact
- list_institutional_facts
- save_institutional_fact
- search_knowledge

### monolithic
- audit_correspondence
- create_crm_deal
- create_task
- delete_institutional_fact
- get_attendance_summary
- get_crm_deals
- get_hr_policy
- get_tasks
- list_institutional_facts
- rewrite_correspondence
- save_institutional_fact
- search_knowledge

## شخصيات الموزّع (skills_catalog) — حسب المجال

مُحمَّلة في skills_registry؛ الموزّع يوجّه إليها. كل مجال يُخدَم بوكيل متخصص، والتسويق نظام-واسع.

| المجال | العدد | الوكيل المتخصص |
| --- | --- | --- |
| finance | 5 | finance |
| marketing | 30 | (نظام-واسع) |
| pm | 6 | tasks |
| sales | 8 | crm |
| sovereign | 4 | supervisor |
