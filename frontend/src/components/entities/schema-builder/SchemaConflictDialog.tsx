"use client";

import { AlertTriangle, CloudDownload, Loader2, Upload } from "lucide-react";

interface Props {
  open: boolean;
  busy: boolean;
  t: (key: string) => string;
  onReload: () => void;
  onKeepLocal: () => void;
}

export default function SchemaConflictDialog({
  open,
  busy,
  t,
  onReload,
  onKeepLocal,
}: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--color-ink)]/55 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="schema-conflict-title"
      aria-describedby="schema-conflict-description"
    >
      <div className="w-full max-w-lg rounded-2xl border border-warning/20 bg-[var(--bg-primary)] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 id="schema-conflict-title" className="text-lg font-bold">
              {t("schemaBuilder.conflict.title")}
            </h2>
            <p
              id="schema-conflict-description"
              className="mt-2 text-sm leading-6 text-[var(--text-secondary)]"
            >
              {t("schemaBuilder.conflict.description")}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onReload}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] px-4 py-3 text-sm font-semibold transition-all duration-200 hover:bg-[var(--bg-secondary)] disabled:opacity-50"
          >
            <CloudDownload className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t("schemaBuilder.conflict.useRemote")}</span>
          </button>
          <button
            type="button"
            onClick={onKeepLocal}
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-all duration-200 hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4 shrink-0" aria-hidden />
            )}
            <span className="truncate">{t("schemaBuilder.conflict.keepLocal")}</span>
          </button>
        </div>
        <p className="mt-3 text-xs text-warning">
          {t("schemaBuilder.conflict.keepLocalWarning")}
        </p>
      </div>
    </div>
  );
}
