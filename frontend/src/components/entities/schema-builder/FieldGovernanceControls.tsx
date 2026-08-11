import type { FieldClassification, FieldLifecycle, FieldSchema } from "./types";

interface Props {
  field: FieldSchema;
  t: (key: string) => string;
  onChange: (updates: Partial<FieldSchema>) => void;
}

const parseRoles = (value: string) =>
  Array.from(
    new Set(
      value
        .split(",")
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean),
    ),
  );

export default function FieldGovernanceControls({ field, t, onChange }: Props) {
  const classification = field.classification || "internal";
  return (
    <fieldset className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 sm:grid-cols-2">
      <legend className="px-1 text-[11px] font-bold text-[var(--text-secondary)]">
        {t("schemaBuilder.governance.title")}
      </legend>

      <label className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
          {t("schemaBuilder.governance.classification")}
        </span>
        <select
          value={classification}
          onChange={(event) =>
            onChange({ classification: event.target.value as FieldClassification })
          }
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 text-xs outline-none focus:border-primary"
        >
          {(["public", "internal", "confidential", "pii"] as const).map((value) => (
            <option key={value} value={value}>
              {t(`schemaBuilder.governance.classifications.${value}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
          {t("schemaBuilder.governance.lifecycle")}
        </span>
        <select
          value={field.lifecycle || "active"}
          onChange={(event) =>
            onChange({ lifecycle: event.target.value as FieldLifecycle })
          }
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 text-xs outline-none focus:border-primary"
        >
          {(["active", "deprecated", "hidden"] as const).map((value) => (
            <option key={value} value={value}>
              {t(`schemaBuilder.governance.lifecycleValues.${value}`)}
            </option>
          ))}
        </select>
      </label>

      {field.type !== "formula" && field.type !== "relation" && field.type !== "file" && field.type !== "user" && (
        <label className="space-y-1">
          <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
            {t("schemaBuilder.governance.defaultValue")}
          </span>
          {field.type === "boolean" ? (
            <select
              value={field.default === undefined ? "" : String(field.default)}
              onChange={(event) =>
                onChange({
                  default:
                    event.target.value === ""
                      ? undefined
                      : event.target.value === "true",
                })
              }
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 text-xs outline-none focus:border-primary"
            >
              <option value="">{t("schemaBuilder.governance.noDefault")}</option>
              <option value="true">{t("schemaBuilder.records.yes")}</option>
              <option value="false">{t("schemaBuilder.records.no")}</option>
            </select>
          ) : field.type === "list" ? (
            <select
              value={typeof field.default === "string" ? field.default : ""}
              onChange={(event) =>
                onChange({ default: event.target.value || undefined })
              }
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 text-xs outline-none focus:border-primary"
            >
              <option value="">{t("schemaBuilder.governance.noDefault")}</option>
              {(field.options || []).map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          ) : (
            <input
              type={
                field.type === "number" || field.type === "integer"
                  ? "number"
                  : field.type === "date"
                    ? "date"
                    : "text"
              }
              step={field.type === "integer" ? "1" : field.type === "number" ? "any" : undefined}
              value={field.default === undefined ? "" : String(field.default)}
              onChange={(event) => {
                const value = event.target.value;
                onChange({
                  default:
                    value === ""
                      ? undefined
                      : field.type === "number" || field.type === "integer"
                        ? Number(value)
                        : value,
                });
              }}
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-xs outline-none focus:border-primary"
              placeholder={t("schemaBuilder.governance.noDefault")}
            />
          )}
        </label>
      )}

      <label className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2">
        <input
          type="checkbox"
          checked={Boolean(field.searchable)}
          onChange={(event) =>
            onChange({
              searchable: event.target.checked,
              indexed: event.target.checked ? field.indexed : false,
            })
          }
          className="size-4 rounded border-[var(--border-color)] text-primary"
        />
        <span className="text-xs font-semibold">{t("schemaBuilder.governance.searchable")}</span>
      </label>

      <label className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
          {t("schemaBuilder.governance.readRoles")}
        </span>
        <input
          dir="ltr"
          value={(field.read_roles || []).join(", ")}
          onChange={(event) => onChange({ read_roles: parseRoles(event.target.value) })}
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs outline-none focus:border-primary"
          placeholder={t("schemaBuilder.governance.rolesPlaceholder")}
        />
      </label>

      <label className="space-y-1">
        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
          {t("schemaBuilder.governance.writeRoles")}
        </span>
        <input
          dir="ltr"
          value={(field.write_roles || []).join(", ")}
          onChange={(event) => onChange({ write_roles: parseRoles(event.target.value) })}
          className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs outline-none focus:border-primary"
          placeholder={t("schemaBuilder.governance.rolesPlaceholder")}
        />
      </label>

      {(classification === "confidential" || classification === "pii") && (
        <p className="sm:col-span-2 text-[11px] leading-5 text-warning">
          {t("schemaBuilder.governance.sensitiveHint")}
        </p>
      )}
    </fieldset>
  );
}
