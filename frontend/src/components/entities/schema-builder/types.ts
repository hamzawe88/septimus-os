export type FieldType =
  | "text"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "datetime"
  | "list"
  | "user"
  | "file"
  | "relation"
  | "formula";

export type FieldClassification = "public" | "internal" | "confidential" | "pii";
export type FieldLifecycle = "active" | "deprecated" | "hidden";

export interface DynamicFieldSchema {
  id: string;
  key: string;
  label_ar: string;
  label_en: string;
  type: FieldType;
  required: boolean;
  default?: unknown;
  lifecycle?: FieldLifecycle;
  options?: string[];
  relation?: {
    target_definition_key: string;
    cardinality: "one" | "many";
    on_delete: "restrict" | "nullify" | "cascade";
  };
  formula?: {
    expression: string;
    result_type: "number";
  };
  searchable?: boolean;
  indexed?: boolean;
  classification?: FieldClassification;
  read_roles?: string[];
  write_roles?: string[];
  include_in_ai?: boolean;
  include_in_events?: boolean;
  include_in_export?: boolean;
}

export interface FieldSchema extends DynamicFieldSchema {
  position: number;
  description?: string;
}

export interface EntityDefinition {
  id: string;
  key: string;
  label_ar: string;
  label_en: string;
  description_ar: string;
  description_en: string;
  status: "draft" | "published" | "archived";
  current_version: number;
  draft_revision: number;
  title_field_key: string;
  updated_at: string;
}

export interface DefinitionResponse {
  definition: EntityDefinition;
  fields: FieldSchema[];
  migration_job?: SchemaChangeJob;
}

export interface DefinitionListResponse {
  data: EntityDefinition[];
  total: number;
}

export interface ValidationResponse {
  valid: boolean;
  field_count: number;
  checksum: string;
}

export type SchemaChangeSeverity = "safe" | "conditional" | "breaking";

export interface SchemaChange {
  kind: string;
  field_key?: string;
  severity: SchemaChangeSeverity;
  message_code: string;
  before?: unknown;
  after?: unknown;
  affected_records: number;
}

export interface SchemaImpactReport {
  definition_id: string;
  source_version: number;
  draft_revision: number;
  source_checksum?: string;
  target_checksum: string;
  severity: SchemaChangeSeverity;
  can_approve: boolean;
  requires_migration: boolean;
  record_count: number;
  affected_records: number;
  changes: SchemaChange[];
  blocking_reasons: string[];
  dependencies: {
    relations: number;
    workflows: number;
    forms: number;
    views: number;
  };
}

export interface SchemaChangeJob {
  id: string;
  job_type: "impact" | "migration";
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  severity: SchemaChangeSeverity;
  progress_total: number;
  progress_processed: number;
  progress_failed: number;
  approved_at?: string;
}

export interface EntitySchemaVersion {
  id: string;
  version: number;
  checksum: string;
  published_at: string;
  ui_schema: {
    fields?: FieldSchema[];
  };
  change_set?: {
    impact?: SchemaImpactReport;
  };
}

export interface SchemaVersionsResponse {
  data: EntitySchemaVersion[];
}

export interface SchemaChangeJobsResponse {
  data: SchemaChangeJob[];
}

export interface SchemaActivityItem {
  id: string;
  user_id?: string;
  action: string;
  details?: Record<string, unknown>;
  created_at: string;
}

export interface SchemaActivityResponse {
  data: SchemaActivityItem[];
}

export interface SchemaImpactResponse {
  job: SchemaChangeJob;
  report: SchemaImpactReport;
}

export interface FormulaPreviewResponse {
  result: number;
  dependencies: string[];
}

export interface ApiErrorPayload {
  error?: string;
  code?: string;
  details?: string[];
}

export type NoticeTone = "success" | "error" | "info";

export interface Notice {
  tone: NoticeTone;
  message: string;
}

export interface DynamicRecord {
  id: string;
  data: Record<string, unknown>;
  display_value?: string;
  record_version: number;
  created_at: string;
}

export interface QueryResponse {
  data: DynamicRecord[];
  next_cursor?: string;
}

export interface RecordFilter {
  and?: RecordFilter[];
  or?: RecordFilter[];
  field?: string;
  op?: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "starts_with" | "in" | "is_null";
  value?: unknown;
}

export interface SchemaFormSection {
  id: string;
  label_ar: string;
  label_en: string;
  columns: number;
  fields: string[];
}

export interface EntityForm {
  id: string;
  name_ar: string;
  name_en: string;
  mode: "create" | "edit" | "readonly";
  status: "active" | "archived";
  layout: { sections: SchemaFormSection[] };
  visibility_rules: Array<{
    field: string;
    operator: "eq" | "neq" | "is_empty" | "not_empty";
    value?: unknown;
    target_field: string;
  }>;
  revision: number;
  is_default: boolean;
  updated_at: string;
}

export interface EntityView {
  id: string;
  name_ar: string;
  name_en: string;
  view_type: "table" | "kanban" | "calendar" | "gallery";
  sharing: "private" | "workspace";
  query: { filter?: RecordFilter; limit?: number };
  config: {
    columns: string[];
    group_field?: string;
    calendar_field?: string;
    cover_field?: string;
  };
  revision: number;
  is_default: boolean;
  updated_at: string;
}

export interface SchemaResourceList<T> {
  data: T[];
}
