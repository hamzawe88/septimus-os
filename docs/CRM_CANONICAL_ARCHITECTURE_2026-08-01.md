# Canonical CRM Architecture and Operations

## Source of truth

CRM reads and writes only published Schema Builder records:

| Definition | Responsibility |
|---|---|
| `crm_account` | Customer company or organization |
| `crm_contact` | Person, consent, and customer contact details |
| `crm_opportunity` | Sales pipeline, value, owner, probability, and follow-up |
| `crm_activity` | Calls, meetings, messages, tasks, and notes for Customer 360 |
| `crm_quote` | Versioned commercial header and invoice link |
| `crm_quote_line` | Quote items and server-computed line total |
| `crm_ticket` | Assignment, priority, SLA, resolution, and escalation state |
| `crm_ticket_message` | Independent auditable ticket conversation rows |

System definitions are immutable from the no-code UI. Contract upgrades are
published by backend code as new schema versions and retain old versions for
audit and record compatibility.

## Legacy migration

Startup runs the migration after system contracts are available. Sources are
processed in dependency order: `lead`, `ticket`, then `crm_quote`.

- A lead becomes account, optional contact, and opportunity.
- Embedded ticket messages become independent `crm_ticket_message` records.
- Quotes reuse the migrated lead opportunity when possible and create quote
  lines independently.
- `crm_legacy_record_links` records every source-to-target edge. Its tenant,
  source, and target constraints prevent cross-workspace links; its unique key
  makes retries and multi-replica startup idempotent.
- Source rows are retained for rollback evidence but are not application read
  sources after migration.

Schema migrations `2026080101` through `2026080207` add quote conversion
idempotency, the migration ledger/indexes, canonical opportunity naming,
external ticket identity, request fingerprints, and workspace-unique quote and
invoice numbers.

## Domain boundaries

- Opportunity creation atomically creates its account and optional contact and
  always enters at `new`; later stages require the pipeline command.
- Account creation is a separate command and may atomically create its primary
  contact without fabricating a zero-value opportunity.
- Stage movement uses an allowlisted transition graph and record-version CAS.
- Quote conversion calculates money server-side and atomically creates quote,
  lines, finance invoice, opportunity update, audit, idempotency row, and
  outbox events.
- Customer 360 resolves account/contact relations and returns activities,
  tickets, and quotes from tenant-scoped definitions.
- Ticket messages never live inside ticket JSON. Ticket updates require an
  expected record version and an allowlisted status transition. Unchanged
  priorities do not restart the SLA clock.
- SLA deadlines are derived from priority: urgent 4h, high 8h, medium 24h,
  low 48h. The worker marks due-soon/breached records and increments escalation
  only on the transition into breach.
- Dashboard metrics are database aggregates over the selected period/source;
  revenue is calculated for one explicit ISO currency and never sums unlike
  currencies. Opportunity relations are batch-loaded and list navigation uses
  opaque cursors.

## Security boundaries

- Generic Record API, API-key, and no-code writes cannot change CRM lifecycle,
  financial, SLA, assignment, message-identity, or delete operations. These
  fields are command-only and return `SYSTEM_RECORD_COMMAND_REQUIRED`.
- Zendesk ingress requires an API key with `webhooks:zendesk`, a tenant-owned
  HMAC secret, a fresh timestamp, and a single-use delivery id. It upserts by
  `(workspace, external_provider, external_ticket_id)` in one transaction and
  writes canonical ticket/message audit and outbox rows.
- Quote conversion accepts only `proposal` or `negotiation`, binds every
  idempotency key to a SHA-256 request fingerprint, requires explicit currency,
  tax, and validity terms, and rejects duplicate quote numbers.
- Browser AI context is reference-only. Backend Core reloads the referenced
  record under the JWT tenant, applies read policy and `IncludeInAI`, removes
  PII/confidential/relation/file/user fields, and attaches source provenance.
  The AI sidecar's CRM list tool uses the same AI-only projection endpoint.

## Events and integrations

Every record mutation emits the canonical `data.record.*` event and a parallel
CRM domain event such as `crm.opportunity.created`, `crm.activity.created`, or
`crm.ticket.message.created`. The transactional outbox delivers at least once.
Backend subscribers:

1. trigger internal Workflow definitions by exact event type;
2. invoke signed/allowlisted n8n actions configured in those workflows;
3. publish to the authorized `workspace_<uuid>` Centrifugo channel; and
4. queue the record for AI indexing using the generic event.

Consumers must be idempotent because outbox delivery is at least once.

## Deployment verification

Before rebuilding containers, run Go, TypeScript/lint, Python, and Yjs tests.
After rebuilding and recreating the complete Compose stack:

1. confirm all configured health checks and one-shot initializers;
2. confirm migration versions and zero failed/pending migration jobs;
3. run Playwright CRM lifecycle, Customer 360, ticket message/SLA, tenant
   boundary, Arabic/English, and mobile snapshots;
4. inspect backend/outbox/NATS/Centrifugo/n8n logs for errors; and
5. verify one idempotent quote retry creates exactly one finance invoice.

## Verified closure — 2026-08-01

The canonical cutover was verified against a clean, no-cache build and a
force-recreated Compose stack including the optional n8n overlay:

- all eight CRM contracts were published at version 2 in every workspace;
- migrations `2026080101`–`2026080103` were applied successfully;
- the legacy ledger contained no cross-workspace source or target links;
- all observed outbox rows were published and none were failed;
- Go packages, TypeScript, ESLint/design constitution, Yjs, and the AI Python
  suite passed (`180` tests plus `7` subtests for Python);
- Playwright passed the canonical opportunity/quote/Customer 360/ticket/SLA
  lifecycle and the complete application smoke suite; and
- Arabic and English CRM pipeline/ticket baselines passed on desktop and a
  `390 × 844` mobile viewport.

The optional n8n overlay includes the official, version-matched
`n8n-task-runners` sidecar. JavaScript and native Python Code nodes therefore
execute outside the main n8n container through a private authenticated broker;
the runner has no host ports, host mounts, or Linux capabilities.

## Verified closure — 2026-08-02

The lifecycle, ingress, AI, reporting, and deployment hardening was verified
again after a complete no-cache image build and two force-recreated full-stack
boots (the second boot validated the corrected Centrifugo startup dependency):

- all 1,008 CRM definitions across 126 development workspaces are published at
  version 4, including AI PII classifications and external ticket identity;
- migrations `2026080206` and `2026080207` are recorded, all 3,296 observed
  outbox rows are published, and all 96 schema jobs are complete with zero
  failed records;
- the dashboard uses independent GORM statements for each aggregate, preventing
  `ORDER BY`/`LIMIT` clauses from leaking into PostgreSQL grouped queries;
- Centrifugo reaches health before backend schema/bootstrap events are emitted;
  after readiness, Workflow, n8n, and workspace-channel delivery share the
  canonical CRM event family;
- n8n 2.27.4 registered both the isolated native Python and JavaScript runners;
- the Python 3.12 image passed 182 tests and 7 subtests, all Go packages passed,
  Yjs passed 3 tests, and ESLint, TypeScript, and the 12/12 design constitution
  check passed; and
- Playwright passed all 6 application E2E scenarios, including the canonical
  CRM opportunity/quote/invoice lifecycle, Customer 360, ticket messages/SLA,
  dashboard aggregates, PM, Drive onboarding, and no-code formula publication.

Health endpoints returned HTTP 200 for Backend Core, Frontend, Centrifugo,
Septimus Drive, and n8n. One-shot storage and bucket initializers exited with
status 0; every long-running service with a configured health check was healthy.
