import { translate, type Language } from "@/lib/i18n";
import type { FieldSchema, FieldType } from "./types";

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const localizedSchemaText = (language: Language, key: string) =>
  translate(language, key);

export const createDefaultField = (): FieldSchema => ({
  id: createId(),
  key: "title",
  label_ar: localizedSchemaText("ar", "schemaBuilder.defaults.titleField"),
  label_en: localizedSchemaText("en", "schemaBuilder.defaults.titleField"),
  type: "text",
  required: true,
  searchable: true,
  classification: "internal",
  lifecycle: "active",
  position: 0,
});

export const createField = (type: FieldType, position: number): FieldSchema => {
  const key = `field_${position + 1}`;
  return {
    id: createId(),
    key,
    label_ar: localizedSchemaText("ar", "schemaBuilder.defaults.newField"),
    label_en: localizedSchemaText("en", "schemaBuilder.defaults.newField"),
    type,
    required: false,
    searchable: false,
    lifecycle: "active",
    classification: type === "user" || type === "file" ? "confidential" : "internal",
    options: type === "list" ? [] : undefined,
    relation:
      type === "relation"
        ? { target_definition_key: "", cardinality: "one", on_delete: "restrict" }
        : undefined,
    formula:
      type === "formula"
        ? { expression: "0", result_type: "number" }
        : undefined,
    position,
  };
};

export const normalizeSchemaKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 63);

export const ensureFieldId = (field: FieldSchema, position: number): FieldSchema => ({
  ...field,
  id: field.id || createId(),
  classification: field.classification || "internal",
  lifecycle: field.lifecycle || "active",
  position,
});
