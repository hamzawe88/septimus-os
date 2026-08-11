import React from "react";
import { Filter, LayoutGrid, Plus, Search, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import { useLocalization } from "@/contexts/LocalizationContext";

interface User {
  id: string;
  email: string;
  avatar?: string;
}

interface BacklogHeaderProps {
  isLoading: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterPriority: number | null;
  setFilterPriority: (priority: number | null) => void;
  filterAssignee: string | null;
  setFilterAssignee: (assigneeId: string | null) => void;
  users: User[];
  priorities: { label: string; value: number; badge?: string }[];
  onAutoPlan: () => void;
  onCreateSprint: () => void;
}

const selectClassName =
  "h-8 rounded-[var(--radius-control)] border border-input bg-background px-2.5 text-xs font-medium text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";

export function BacklogHeader({
  isLoading,
  searchQuery,
  setSearchQuery,
  filterPriority,
  setFilterPriority,
  filterAssignee,
  setFilterAssignee,
  users,
  priorities,
  onAutoPlan,
  onCreateSprint,
}: BacklogHeaderProps) {
  const { t } = useLocalization();
  const hasFilters =
    Boolean(searchQuery) ||
    filterPriority !== null ||
    filterAssignee !== null;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterPriority(null);
    setFilterAssignee(null);
  };

  return (
    <header className="z-20 flex flex-col border-b border-border bg-background/90 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 lg:px-6">
        <div className="flex items-center gap-3">
          <div className="rounded-[var(--radius-control)] bg-brand-light p-2.5 text-brand">
            <LayoutGrid className="size-6" aria-hidden />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black tracking-tight">
                {t("pm.backlog.title")}
              </h2>
              <Tag tone="brand">{t("pm.backlog.hub")}</Tag>
            </div>
            <p className="text-xs font-medium text-muted-foreground">
              {t("pm.backlog.description")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={onAutoPlan}
            disabled={isLoading}
            title={t("pm.backlog.autoPlan")}
          >
            <Sparkles />
            {t("pm.backlog.autoPlan")}
          </Button>
          <Button
            onClick={onCreateSprint}
            disabled={isLoading}
            title={t("pm.backlog.newSprint")}
          >
            <Plus />
            {t("pm.backlog.newSprint")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-subtle px-6 py-2.5 text-xs">
        <div className="relative w-full max-w-md flex-1">
          <Search className="absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label={t("pm.backlog.search")}
            placeholder={t("pm.backlog.searchPlaceholder")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-8 ps-9 pe-9"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              title={t("pm.backlog.clearSearch")}
              aria-label={t("pm.backlog.clearSearch")}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 font-semibold text-muted-foreground">
            <Filter className="size-3.5" aria-hidden />
            {t("pm.backlog.filterBy")}
          </span>
          <select
            aria-label={t("pm.backlog.filterPriority")}
            value={filterPriority === null ? "" : filterPriority}
            onChange={(event) =>
              setFilterPriority(
                event.target.value === "" ? null : Number(event.target.value),
              )
            }
            className={selectClassName}
          >
            <option value="">{t("pm.backlog.allPriorities")}</option>
            {priorities.map((priority) => (
              <option key={priority.value} value={priority.value}>
                {priority.label}
              </option>
            ))}
          </select>
          <select
            aria-label={t("pm.backlog.filterAssignee")}
            value={filterAssignee || ""}
            onChange={(event) =>
              setFilterAssignee(
                event.target.value === "" ? null : event.target.value,
              )
            }
            className={selectClassName}
          >
            <option value="">{t("pm.backlog.allAssignees")}</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email.split("@")[0]}
              </option>
            ))}
          </select>
          {hasFilters ? (
            <Button type="button" variant="ghost" size="xs" onClick={clearFilters}>
              {t("pm.backlog.clearFilters")}
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
