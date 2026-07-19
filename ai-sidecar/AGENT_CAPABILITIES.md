# Agent Capability Matrix — Audit Snapshot

> Auto-generated from ai-sidecar/agent_rbac.py on 2026-07-18. Do not edit by hand — regenerate.

كل وكيل والأدوات المسموح له بها (fail-closed: أي أداة خارج القائمة تُسقَط وتُسجَّل).

## hr
- delete_institutional_fact
- get_attendance_summary
- get_hr_policy
- list_institutional_facts
- save_institutional_fact
- search_knowledge

## crm
- create_crm_deal
- delete_institutional_fact
- get_crm_deals
- list_institutional_facts
- save_institutional_fact
- search_knowledge

## tasks
- create_task
- delete_institutional_fact
- get_tasks
- list_institutional_facts
- save_institutional_fact
- search_knowledge

## correspondence
- audit_correspondence
- delete_institutional_fact
- list_institutional_facts
- rewrite_correspondence
- save_institutional_fact
- search_knowledge

## supervisor
- delegate_to_correspondence_specialist
- delegate_to_crm_specialist
- delegate_to_hr_specialist
- delegate_to_tasks_specialist
- delete_institutional_fact
- list_institutional_facts
- save_institutional_fact
- search_knowledge

## monolithic
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
