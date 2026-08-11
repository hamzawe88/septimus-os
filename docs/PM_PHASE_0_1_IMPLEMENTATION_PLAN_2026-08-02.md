# PM Phase 0–1 Implementation Plan — 2026-08-02

## Decision

The relational `projects`, `tasks`, `task_histories`, and `sprints` tables are
the canonical source for project-management scheduling. Generic JSONB records
may extend PM with governed custom modules, but they must not become a parallel
task store.

## Frozen HTTP contract

- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `PUT /api/v1/projects/:id`
- `DELETE /api/v1/projects/:id`
- `GET /api/v1/tasks?project_id=<uuid>&page=<n>&limit=<n>`
- `POST /api/v1/tasks` with `project_id` in the body
- `PUT /api/v1/tasks/:id` for non-status fields only
- `POST /api/v1/tasks/:id/transition` for every status change
- `GET /api/v1/sprints?project_id=<uuid>`
- `POST /api/v1/sprints`
- `PUT /api/v1/sprints/:id`
- `DELETE /api/v1/sprints/:id`
- `PUT /api/v1/sprints/:id/start`
- `PUT /api/v1/sprints/:id/complete`
- `GET /api/v1/pm/dashboard?project_id=<optional uuid>`

Compatibility aliases that would preserve a second task-creation contract are
deliberately not added. All first-party clients are migrated to the canonical
contract in the same change.

## P0 controls

1. Gate every PM mutation with granular RBAC.
2. Validate project, task, sprint, user, parent, and cross-project references.
3. Execute status changes, task history, and outbox writes in one transaction.
4. Reject direct status writes through the generic task update endpoint.
5. Enforce one active sprint per project at both application and database level.
6. Validate and bound pagination before calculating offsets or page counts.
7. Replace fabricated dashboard values with database aggregates.
8. Establish one persistent project context in the PM interface; read failures
   never create data.

## Acceptance checks

- Go PM tests cover validation, atomic transitions, cross-project references,
  pagination bounds, and sprint lifecycle constraints.
- Frontend TypeScript, ESLint, and the design-constitution check pass.
- Arabic and English dictionaries retain identical key sets.
- PM E2E creates a project, sprint, and task through the frozen contract and
  exercises a valid status transition.
- Backend and frontend containers are rebuilt, then the stack health and PM
  functional paths are verified.

## Phase 2 completion — canonical migration

- Migration `2026080204` adds a tenant-scoped `pm_legacy_record_links` ledger,
  a unique system-project key, and hierarchy indexes.
- Startup migrates generic `task` and `sub_task` JSONB records into relational
  tasks in dependency order. Sources are retained unchanged for audit; retries
  cannot duplicate tasks, history, or events.
- Missing project references are routed only through the explicit, unique
  `PM Inbox` system project. Cross-workspace project, parent, and assignee
  references are discarded rather than trusted.
- Subtasks are relational children (`ParentID` + `ltree`) and use the same
  status state machine, history, optimistic version, and outbox as root tasks.
- AI chat tools, meeting action-item approvals, MCP approvals, the project
  auditor, story-point estimation, proactive briefs, and the global quick-create
  UI now read/write only through the canonical PM contract.
- Generic entity reads, creates, updates, and deletes for `task/sub_task` fail
  closed with `PM_CANONICAL_TASK_REQUIRED`. Channel pins and Orbit tasks remain
  separate collaboration/personal-productivity domains by design.

## Deferred intentionally

Gantt, portfolio planning, advanced capacity forecasting, and AI sprint
planning belong to Phase 3. None may introduce another PM source of truth.
