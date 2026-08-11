"use client";

import {
  Activity,
  Database,
  Eye,
  FileInput,
  GitBranch,
  History,
  ListTree,
} from "lucide-react";

export type SchemaStudioTab = "fields" | "relations" | "forms" | "views" | "data";

interface Props {
  active: SchemaStudioTab;
  t: (key: string) => string;
  onChange: (tab: SchemaStudioTab) => void;
  onOpenHistory: () => void;
}

export default function SchemaStudioTabs({ active, t, onChange, onOpenHistory }: Props) {
  const tabs = [
    { key: "fields" as const, Icon: ListTree },
    { key: "relations" as const, Icon: GitBranch },
    { key: "forms" as const, Icon: FileInput },
    { key: "views" as const, Icon: Eye },
    { key: "data" as const, Icon: Database },
  ];

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2"
      aria-label={t("schemaBuilder.studio.navigation")}
    >
      {tabs.map(({ key, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-current={active === key ? "page" : undefined}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 ${
            active === key
              ? "bg-[var(--bg-primary)] text-brand shadow-sm"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]"
          }`}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{t(`schemaBuilder.studio.tabs.${key}`)}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onOpenHistory}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-all duration-200 hover:bg-[var(--bg-primary)]"
      >
        <History className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{t("schemaBuilder.studio.tabs.versions")}</span>
      </button>
      <button
        type="button"
        onClick={onOpenHistory}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-all duration-200 hover:bg-[var(--bg-primary)]"
      >
        <Activity className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{t("schemaBuilder.studio.tabs.activity")}</span>
      </button>
    </nav>
  );
}
