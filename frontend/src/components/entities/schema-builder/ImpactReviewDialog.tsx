"use client";

import { AlertTriangle, CheckCircle2, Database, GitBranch, Loader2, ShieldAlert, X } from "lucide-react";
import type { SchemaImpactReport } from "./types";

interface Props {
  report: SchemaImpactReport | null;
  busy: boolean;
  t: (key: string) => string;
  onClose: () => void;
  onConfirm: () => void;
}

const severityClasses = {
  safe: "border-success/20 bg-success/10 text-success",
  conditional: "border-warning/20 bg-warning/10 text-warning",
  breaking: "border-destructive/20 bg-destructive/10 text-destructive",
};

export default function ImpactReviewDialog({ report, busy, t, onClose, onConfirm }: Props) {
  if (!report) return null;
  const SeverityIcon =
    report.severity === "safe"
      ? CheckCircle2
      : report.severity === "conditional"
        ? AlertTriangle
        : ShieldAlert;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--color-ink)]/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schema-impact-title"
    >
      <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--border-color)] p-5">
          <div>
            <h2 id="schema-impact-title" className="text-lg font-bold">
              {t("schemaBuilder.impact.title")}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {t("schemaBuilder.impact.subtitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex size-9 items-center justify-center rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
            aria-label={t("schemaBuilder.impact.close")}
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className={`flex items-center gap-3 rounded-xl border p-4 ${severityClasses[report.severity]}`}>
            <SeverityIcon className="size-5 shrink-0" aria-hidden />
            <div>
              <p className="font-bold">
                {t(`schemaBuilder.impact.severity.${report.severity}`)}
              </p>
              <p className="text-xs opacity-80">
                {report.requires_migration
                  ? t("schemaBuilder.impact.migrationRequired")
                  : t("schemaBuilder.impact.noMigration")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { key: "records", value: report.record_count, Icon: Database },
              { key: "affected", value: report.affected_records, Icon: AlertTriangle },
              { key: "workflows", value: report.dependencies.workflows, Icon: GitBranch },
              { key: "relations", value: report.dependencies.relations, Icon: GitBranch },
            ].map(({ key, value, Icon }) => (
              <div key={key} className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
                <Icon className="size-4 text-primary" aria-hidden />
                <p className="mt-2 text-xl font-bold">{value}</p>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {t(`schemaBuilder.impact.metrics.${key}`)}
                </p>
              </div>
            ))}
          </div>

          {report.blocking_reasons.length > 0 && (
            <section className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-destructive">
              <h3 className="text-sm font-bold">{t("schemaBuilder.impact.blockers")}</h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                {report.blocking_reasons.map((reason) => (
                  <li key={reason} dir="ltr">{reason}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-bold">{t("schemaBuilder.impact.changes")}</h3>
            {report.changes.length === 0 ? (
              <p className="rounded-xl border border-[var(--border-color)] p-4 text-sm text-[var(--text-secondary)]">
                {t("schemaBuilder.impact.noChanges")}
              </p>
            ) : (
              <div className="space-y-2">
                {report.changes.map((change, index) => (
                  <div key={`${change.field_key || "schema"}-${change.kind}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border-color)] p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold" dir="auto">
                        {change.field_key || t("schemaBuilder.impact.schemaLevel")}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        {t(`schemaBuilder.impact.changeCodes.${change.message_code}`)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${severityClasses[change.severity]}`}>
                      {t(`schemaBuilder.impact.severity.${change.severity}`)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-[var(--border-color)] p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-[var(--border-color)] px-4 py-2 text-sm font-semibold hover:bg-[var(--bg-secondary)] disabled:opacity-50"
          >
            {t("schemaBuilder.impact.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || !report.can_approve}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {report.severity === "safe"
              ? t("schemaBuilder.impact.publish")
              : t("schemaBuilder.impact.approveAndPublish")}
          </button>
        </footer>
      </div>
    </div>
  );
}
