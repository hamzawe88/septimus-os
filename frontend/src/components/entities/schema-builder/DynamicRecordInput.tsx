import type { DynamicFieldSchema } from "./types";

export interface RecordInputOption {
  id: string;
  display_value: string;
}

interface Props {
  field: DynamicFieldSchema;
  value: unknown;
  options: RecordInputOption[];
  language: string;
  t: (key: string) => string;
  onChange: (value: string | boolean | string[]) => void;
}

export default function DynamicRecordInput({
  field,
  value,
  options,
  language,
  t,
  onChange,
}: Props) {
  const label = language === "ar" ? field.label_ar : field.label_en;
  const classes =
    "w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm outline-none focus:border-primary";

  if (field.type === "formula") {
    return (
      <label className="space-y-1.5">
        <span className="text-sm font-semibold">{label}</span>
        <input
          disabled
          value={String(value ?? t("schemaBuilder.records.computed"))}
          className={`${classes} opacity-60`}
        />
      </label>
    );
  }
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-3 rounded-lg border border-[var(--border-color)] p-3">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="text-sm font-semibold">{label}</span>
      </label>
    );
  }
  if (field.type === "relation" || field.type === "user" || field.type === "file") {
    const multiple = field.relation?.cardinality === "many";
    const selected = multiple
      ? Array.isArray(value)
        ? value.map(String)
        : []
      : String(value ?? "");
    return (
      <label className="space-y-1.5">
        <span className="text-sm font-semibold">
          {label}
          {field.required && <span className="text-destructive"> *</span>}
        </span>
        <select
          multiple={multiple}
          required={field.required}
          value={selected}
          onChange={(event) =>
            onChange(
              multiple
                ? Array.from(event.target.selectedOptions, (option) => option.value)
                : event.target.value,
            )
          }
          className={classes}
        >
          {!multiple && <option value="">{t("schemaBuilder.records.select")}</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.display_value || option.id}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (field.type === "list") {
    return (
      <label className="space-y-1.5">
        <span className="text-sm font-semibold">{label}</span>
        <select
          required={field.required}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
          className={classes}
        >
          <option value="">{t("schemaBuilder.records.select")}</option>
          {(field.options || []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  const inputType =
    field.type === "number" || field.type === "integer"
      ? "number"
      : field.type === "date"
        ? "date"
        : field.type === "datetime"
          ? "datetime-local"
          : "text";
  const inputValue =
    field.type === "datetime" && typeof value === "string"
      ? value.slice(0, 16)
      : String(value ?? "");
  return (
    <label className="space-y-1.5">
      <span className="text-sm font-semibold">
        {label}
        {field.required && <span className="text-destructive"> *</span>}
      </span>
      <input
        type={inputType}
        step={
          field.type === "integer" ? "1" : field.type === "number" ? "any" : undefined
        }
        required={field.required}
        value={inputValue}
        onChange={(event) => onChange(event.target.value)}
        className={classes}
      />
    </label>
  );
}
